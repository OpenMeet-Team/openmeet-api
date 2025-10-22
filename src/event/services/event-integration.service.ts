import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ExternalEventDto } from '../dto/external-event.dto';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { Repository } from 'typeorm';
import { ShadowAccountService } from '../../shadow-account/shadow-account.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { EventSourceType } from '../../core/constants/source-type.constant';
import {
  EventStatus,
  EventVisibility,
  EventAttendeeRole,
  EventAttendeeStatus,
} from '../../core/constants/constant';
import { EventQueryService } from './event-query.service';
import { AuthProvidersEnum } from '../../auth/auth-providers.enum';
import { Trace } from '../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import { BlueskyIdService } from '../../bluesky/bluesky-id.service';
import { FileEntity } from '../../file/infrastructure/persistence/relational/entities/file.entity';
import { FileService } from '../../file/file.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventRoleService } from '../../event-role/event-role.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios from 'axios';

@Injectable()
export class EventIntegrationService {
  private readonly logger = new Logger(EventIntegrationService.name);
  private readonly tracer = trace.getTracer('event-integration-service');
  private lastGeocodingRequest = 0;
  private readonly geocodingDelayMs = 1100; // Nominatim rate limit: 1 req/sec, so wait 1.1s to be safe

  constructor(
    private readonly tenantService: TenantConnectionService,
    private readonly shadowAccountService: ShadowAccountService,
    private readonly eventQueryService: EventQueryService,
    private readonly blueskyIdService: BlueskyIdService,
    private readonly fileService: FileService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly eventRoleService: EventRoleService,
    private readonly eventEmitter: EventEmitter2,
    @InjectMetric('event_integration_processed_total')
    private readonly processedCounter: Counter<string>,
    @InjectMetric('event_integration_deduplication_matches_total')
    private readonly deduplicationCounter: Counter<string>,
    @InjectMetric('event_integration_deduplication_failures_total')
    private readonly deduplicationFailuresCounter: Counter<string>,
    @InjectMetric('event_integration_processing_duration_seconds')
    private readonly processingDuration: Histogram<string>,
  ) {}

  /**
   * Process an external event and create or update it in the system
   * @param eventData External event data
   * @param tenantId Tenant ID where this event should be stored
   * @returns The created or updated event
   */
  @Trace('event-integration.processExternalEvent')
  async processExternalEvent(
    eventData: ExternalEventDto,
    tenantId: string,
  ): Promise<EventEntity> {
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    this.logger.debug(`Processing external event for tenant ${tenantId}`);

    // Start measuring duration
    const timer = this.processingDuration.startTimer({
      tenant: tenantId,
      source_type: eventData.source.type,
      operation: 'process',
      is_duplicate: 'unknown',
    });

    try {
      // Get the tenant connection
      const tenantConnection =
        await this.tenantService.getTenantConnection(tenantId);
      const eventRepository = tenantConnection.getRepository(EventEntity);

      // Check if this event already exists using enhanced criteria matching
      const existingEvent = await this.findExistingEventWithMultipleCriteria(
        eventData,
        tenantId,
      );

      // Increment the processed counter
      this.processedCounter.inc({
        tenant: tenantId,
        source_type: eventData.source.type,
        operation: existingEvent ? 'update' : 'create',
      });

      if (existingEvent) {
        this.logger.debug(
          `Found existing event with ID ${existingEvent.id}, updating it`,
        );

        // Stop the timer with is_duplicate = true
        timer({ is_duplicate: 'true' });

        return this.updateExistingEvent(
          existingEvent,
          eventData,
          eventRepository,
          tenantId,
        );
      }

      // No existing event, create a new one
      this.logger.debug('No existing event found, creating a new one');

      // Stop the timer with is_duplicate = false
      timer({ is_duplicate: 'false' });

      return this.createNewEvent(eventData, eventRepository, tenantId);
    } catch (error) {
      // Record the error
      this.deduplicationFailuresCounter.inc({
        tenant: tenantId,
        source_type: eventData.source.type,
        error: error.message || 'unknown',
      });

      // Stop the timer for error case
      timer({ is_duplicate: 'error' });

      throw error;
    }
  }

  /**
   * Enhanced method to find an existing event using multiple criteria
   * This improves event deduplication by checking various identifiers
   */
  @Trace('event-integration.findExistingEventWithMultipleCriteria')
  private async findExistingEventWithMultipleCriteria(
    eventData: ExternalEventDto,
    tenantId: string,
  ): Promise<EventEntity | null> {
    try {
      // Primary method: Check by source ID and type (most reliable)
      this.logger.debug(
        `Checking for existing event by sourceId: ${eventData.source.id} and sourceType: ${eventData.source.type}`,
      );

      // this is all events for a user's did
      const existingEvents =
        await this.eventQueryService.findBySourceAttributes(
          eventData.source.id,
          eventData.source.type,
          tenantId,
        );

      if (existingEvents.length > 0) {
        this.logger.debug(
          `Found existing event by sourceId and sourceType: ${existingEvents[0].id}`,
        );

        // Record the deduplication method used
        this.deduplicationCounter.inc({
          tenant: tenantId,
          source_type: eventData.source.type,
          method: 'primary',
        });

        return existingEvents[0];
      }

      // Secondary method: Check by source URL if available
      if (eventData.source.url) {
        this.logger.debug(
          `Checking for existing event by sourceUrl: ${eventData.source.url}`,
        );

        const tenantConnection =
          await this.tenantService.getTenantConnection(tenantId);
        const eventRepository = tenantConnection.getRepository(EventEntity);

        const eventsByUrl = await eventRepository.find({
          where: {
            sourceUrl: eventData.source.url,
            sourceType: eventData.source.type,
          },
        });

        if (eventsByUrl.length > 0) {
          this.logger.debug(
            `Found existing event by sourceUrl: ${eventsByUrl[0].id}`,
          );

          // Record the deduplication method used
          this.deduplicationCounter.inc({
            tenant: tenantId,
            source_type: eventData.source.type,
            method: 'secondary',
          });

          return eventsByUrl[0];
        }

        // Check uris array for OpenMeet URLs which contain the slug
        if (eventData.source.metadata?.uris) {
          const uris = eventData.source.metadata.uris as Array<{
            uri: string;
            name: string;
          }>;

          // Look for OpenMeet Event URIs
          const openmeetUris = uris.filter(
            (uri) =>
              uri.name === 'OpenMeet Event' &&
              uri.uri &&
              uri.uri.includes('/events/'),
          );

          if (openmeetUris.length > 0) {
            // Extract slug from URI - typically the last part of the path
            for (const openmeetUri of openmeetUris) {
              const uriParts = openmeetUri.uri.split('/');
              const potentialSlug = uriParts[uriParts.length - 1];

              if (potentialSlug) {
                this.logger.debug(
                  `Looking for event with slug: ${potentialSlug}`,
                );

                const eventBySlug = await eventRepository.findOne({
                  where: { slug: potentialSlug },
                });

                if (eventBySlug) {
                  this.logger.debug(
                    `Found existing event by embedded slug in URI: ${eventBySlug.id}`,
                  );

                  // Record the deduplication method used
                  this.deduplicationCounter.inc({
                    tenant: tenantId,
                    source_type: eventData.source.type,
                    method: 'secondary_uri_slug',
                  });

                  return eventBySlug;
                }
              }
            }
          }
        }
      }

      // Tertiary method: For Bluesky events, check by CID/rkey in metadata
      if (
        eventData.source.type === EventSourceType.BLUESKY &&
        eventData.source.metadata
      ) {
        const { rkey, cid } = eventData.source.metadata as {
          rkey?: string;
          cid?: string;
        };

        if (rkey) {
          this.logger.debug(`Checking for existing event by rkey: ${rkey}`);

          const tenantConnection =
            await this.tenantService.getTenantConnection(tenantId);
          const eventRepository = tenantConnection.getRepository(EventEntity);

          const queryBuilder = eventRepository.createQueryBuilder('event');

          // Use "sourceData" with quotes to ensure proper column case
          const eventsByRkey = await queryBuilder
            .where('event.sourceType = :sourceType', {
              sourceType: EventSourceType.BLUESKY,
            })
            .andWhere(`event."sourceData"->>'rkey' = :rkey`, { rkey })
            .getMany();

          if (eventsByRkey.length > 0) {
            this.logger.debug(
              `Found existing event by rkey: ${eventsByRkey[0].id}`,
            );

            // Record the deduplication method used
            this.deduplicationCounter.inc({
              tenant: tenantId,
              source_type: eventData.source.type,
              method: 'tertiary_rkey',
            });

            return eventsByRkey[0];
          }
        }

        if (cid) {
          this.logger.debug(`Checking for existing event by cid: ${cid}`);

          const tenantConnection =
            await this.tenantService.getTenantConnection(tenantId);
          const eventRepository = tenantConnection.getRepository(EventEntity);

          const queryBuilder = eventRepository.createQueryBuilder('event');

          // Use "sourceData" with quotes to ensure proper column case
          const eventsByCid = await queryBuilder
            .where('event.sourceType = :sourceType', {
              sourceType: EventSourceType.BLUESKY,
            })
            .andWhere(`event."sourceData"->>'cid' = :cid`, { cid })
            .getMany();

          if (eventsByCid.length > 0) {
            this.logger.debug(
              `Found existing event by cid: ${eventsByCid[0].id}`,
            );

            // Record the deduplication method used
            this.deduplicationCounter.inc({
              tenant: tenantId,
              source_type: eventData.source.type,
              method: 'tertiary_cid',
            });

            return eventsByCid[0];
          }
        }
      }

      this.logger.debug('No existing event found with any criteria');
      return null;
    } catch (error) {
      this.logger.error(
        `Error finding existing event: ${error.message}`,
        error.stack,
      );

      // Record the deduplication failure
      this.deduplicationFailuresCounter.inc({
        tenant: tenantId,
        source_type: eventData.source.type || 'unknown',
        error: 'find_existing',
      });

      return null;
    }
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use findExistingEventWithMultipleCriteria instead
   */
  private async findExistingEvent(
    sourceId: string,
    sourceType: EventSourceType,
    tenantId: string,
  ): Promise<EventEntity | null> {
    try {
      const existingEvents =
        await this.eventQueryService.findBySourceAttributes(
          sourceId,
          sourceType,
          tenantId,
        );

      return existingEvents.length > 0 ? existingEvents[0] : null;
    } catch (error) {
      this.logger.error(
        `Error finding existing event: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Geocode an address string to lat/lon coordinates using Nominatim
   * If geocoding fails, progressively removes text before commas and retries
   * Rate limited to respect Nominatim's 1 request per second policy
   */
  private async geocodeAddress(
    address: string,
  ): Promise<{ lat: number; lon: number } | null> {
    let currentAddress = address.trim();

    while (currentAddress) {
      try {
        // Rate limiting: ensure we wait at least geocodingDelayMs between requests
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastGeocodingRequest;
        if (timeSinceLastRequest < this.geocodingDelayMs) {
          const waitTime = this.geocodingDelayMs - timeSinceLastRequest;
          this.logger.debug(
            `Rate limiting: waiting ${waitTime}ms before geocoding request`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }

        this.logger.debug(`Attempting to geocode: ${currentAddress}`);
        this.lastGeocodingRequest = Date.now();

        const response = await axios.get(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(currentAddress)}&format=json&limit=1`,
          {
            headers: {
              'User-Agent': 'OpenMeet/1.0 (https://openmeet.net)',
            },
          },
        );

        if (response.data && response.data.length > 0) {
          const result = {
            lat: parseFloat(response.data[0].lat),
            lon: parseFloat(response.data[0].lon),
          };
          this.logger.debug(
            `Successfully geocoded "${currentAddress}" to lat: ${result.lat}, lon: ${result.lon}`,
          );
          return result;
        }

        // No results found, try with shorter address
        const commaIndex = currentAddress.indexOf(',');
        if (commaIndex === -1) {
          // No more commas to try
          this.logger.debug(
            `No geocoding results found for any variation of address: ${address}`,
          );
          return null;
        }

        // Remove text up to and including the first comma, trim whitespace
        currentAddress = currentAddress.substring(commaIndex + 1).trim();
        this.logger.debug(
          `Geocoding failed, retrying with shorter address: ${currentAddress}`,
        );
      } catch (error) {
        this.logger.warn(
          `Error geocoding "${currentAddress}": ${error.message}`,
        );

        // On error, also try with shorter address
        const commaIndex = currentAddress.indexOf(',');
        if (commaIndex === -1) {
          // No more commas to try
          return null;
        }

        currentAddress = currentAddress.substring(commaIndex + 1).trim();
      }
    }

    return null;
  }

  /**
   * Create a new event from external data
   */
  private async createNewEvent(
    eventData: ExternalEventDto,
    eventRepository: Repository<EventEntity>,
    tenantId: string,
  ): Promise<EventEntity> {
    // Get or create a shadow account for the event creator if needed
    const user = await this.handleEventCreator(eventData, tenantId);

    // Map external event to our event entity
    const newEvent = new EventEntity();
    newEvent.name = eventData.name;
    newEvent.description = eventData.description;
    newEvent.startDate = new Date(eventData.startDate);

    // Fix the null assignment to Date type
    if (eventData.endDate) {
      newEvent.endDate = new Date(eventData.endDate);
    }

    newEvent.type = eventData.type;
    newEvent.status = eventData.status || EventStatus.Published;
    newEvent.visibility = eventData.visibility || EventVisibility.Public;

    // Handle location
    if (eventData.location) {
      if (eventData.location.description) {
        newEvent.location = eventData.location.description;
      }
      if (eventData.location.lat && eventData.location.lon) {
        newEvent.lat = eventData.location.lat;
        newEvent.lon = eventData.location.lon;
      } else if (eventData.location.description) {
        // Try to geocode the address if we have a description but no coordinates
        const coords = await this.geocodeAddress(
          eventData.location.description,
        );
        if (coords) {
          newEvent.lat = coords.lat;
          newEvent.lon = coords.lon;
        }
      }
      if (eventData.location.url) {
        newEvent.locationOnline = eventData.location.url;
      }
    }

    // Set source information
    newEvent.sourceType = eventData.source.type;
    newEvent.sourceId = eventData.source.id;
    newEvent.sourceUrl = eventData.source.url || null;
    newEvent.sourceData = eventData.source.metadata || {};

    // Handle image if provided
    if (eventData.image?.id) {
      this.logger.debug(`Looking up image with ID ${eventData.image.id}`);
      this.logger.debug(
        `Image data structure: ${JSON.stringify(eventData.image)}`,
      );
      // Create a reference object with just the ID
      newEvent.image = { id: eventData.image.id } as FileEntity;
      this.logger.debug(
        `Set image reference to: ${JSON.stringify(newEvent.image)}`,
      );
    }

    // If it's a Bluesky event, store the handle
    if (
      eventData.source.type === EventSourceType.BLUESKY &&
      eventData.source.handle
    ) {
      newEvent.sourceData = {
        ...newEvent.sourceData,
        handle: eventData.source.handle,
      };
    }

    newEvent.lastSyncedAt = new Date();

    // Set the user (shadow account or real account)
    newEvent.user = user;

    // Generate ULID and slug
    newEvent.generateUlid();
    newEvent.generateSlug();

    // Remove recurrenceRule reference as it doesn't exist on EventEntity
    if (eventData.isRecurring && eventData.recurrenceRule) {
      // Store in series relation when implemented
    }

    // Save the event
    this.logger.debug(
      `Saving new event with data: ${JSON.stringify({
        id: newEvent.id,
        name: newEvent.name,
        hasImage: !!newEvent.image,
        imageId: newEvent.image?.id,
      })}`,
    );
    const savedEvent = await eventRepository.save(newEvent);
    this.logger.debug(
      `Created new event with ID ${savedEvent.id} for tenant ${tenantId}, image: ${savedEvent.image ? savedEvent.image.id : 'none'}`,
    );

    // Emit event.created for activity feed and other listeners
    this.eventEmitter.emit('event.created', {
      eventId: savedEvent.id,
      slug: savedEvent.slug,
      userId: user.id,
      tenantId: tenantId,
    });

    this.logger.debug(
      `Emitted event.created for ingested event ${savedEvent.slug}`,
    );

    // Add the event creator as a host attendee
    try {
      const hostRole = await this.eventRoleService.getRoleByName(
        EventAttendeeRole.Host,
      );

      await this.eventAttendeeService.create({
        role: hostRole,
        status: EventAttendeeStatus.Confirmed,
        user,
        event: savedEvent,
        skipBlueskySync: true, // Skip RSVP sync for shadow accounts
      });

      this.logger.debug(
        `Added creator as host attendee for event ${savedEvent.id}`,
      );
    } catch (error) {
      // Log error but don't fail the event creation
      this.logger.error(
        `Failed to add creator as attendee for event ${savedEvent.id}: ${error.message}`,
        error.stack,
      );
    }

    return savedEvent;
  }

  /**
   * Update an existing event with new external data
   * @param existingEvent The existing event to update
   * @param eventData New data to update the event with
   * @param eventRepository Repository to save the event
   * @param tenantId Tenant ID for the event
   * @returns The updated event
   */
  private async updateExistingEvent(
    existingEvent: EventEntity,
    eventData: ExternalEventDto,
    eventRepository: Repository<EventEntity>,
    tenantId: string,
  ): Promise<EventEntity> {
    this.logger.debug(
      `Updating event ${existingEvent.id} for tenant ${tenantId}`,
    );

    // Update basic fields
    existingEvent.name = eventData.name;
    existingEvent.description = eventData.description;
    existingEvent.startDate = new Date(eventData.startDate);

    // Fix the null assignment to Date type
    if (eventData.endDate) {
      existingEvent.endDate = new Date(eventData.endDate);
    }

    existingEvent.type = eventData.type;
    existingEvent.status = eventData.status || existingEvent.status;
    existingEvent.visibility = eventData.visibility || existingEvent.visibility;

    // Handle location
    if (eventData.location) {
      if (eventData.location.description) {
        existingEvent.location = eventData.location.description;
      }
      if (eventData.location.lat && eventData.location.lon) {
        existingEvent.lat = eventData.location.lat;
        existingEvent.lon = eventData.location.lon;
      } else if (eventData.location.description) {
        // Try to geocode the address if we have a description but no coordinates
        const coords = await this.geocodeAddress(
          eventData.location.description,
        );
        if (coords) {
          existingEvent.lat = coords.lat;
          existingEvent.lon = coords.lon;
        }
      }
      if (eventData.location.url) {
        existingEvent.locationOnline = eventData.location.url;
      }
    }

    // Update source information if metadata changed
    if (eventData.source.metadata) {
      existingEvent.sourceData = {
        ...existingEvent.sourceData,
        ...eventData.source.metadata,
      };
    }

    // Handle image if provided
    if (eventData.image?.id) {
      this.logger.debug(
        `Setting image with ID ${eventData.image.id} directly for event update`,
      );
      this.logger.debug(
        `Image data structure: ${JSON.stringify(eventData.image)}`,
      );
      // Create a reference object with just the ID
      existingEvent.image = { id: eventData.image.id } as FileEntity;
      this.logger.debug(
        `Set image reference to: ${JSON.stringify(existingEvent.image)}`,
      );
    }

    // Update the URL if provided
    if (eventData.source.url) {
      existingEvent.sourceUrl = eventData.source.url;
    }

    // Update last synced timestamp
    existingEvent.lastSyncedAt = new Date();

    // Remove recurrenceRule reference as it doesn't exist on EventEntity
    if (eventData.isRecurring && eventData.recurrenceRule) {
      // Store in series relation when implemented
    }

    // Save the updated event
    this.logger.debug(
      `Saving updated event with data: ${JSON.stringify({
        id: existingEvent.id,
        name: existingEvent.name,
        hasImage: !!existingEvent.image,
        imageId: existingEvent.image?.id,
      })}`,
    );
    const updatedEvent = await eventRepository.save(existingEvent);
    this.logger.debug(
      `Updated event with ID ${updatedEvent.id} for tenant ${tenantId}, image: ${updatedEvent.image ? updatedEvent.image.id : 'none'}`,
    );

    // Emit event.updated for activity feed and other listeners
    this.eventEmitter.emit('event.updated', {
      eventId: updatedEvent.id,
      slug: updatedEvent.slug,
      userId: updatedEvent.user?.id,
      tenantId: tenantId,
    });

    this.logger.debug(
      `Emitted event.updated for ingested event ${updatedEvent.slug}`,
    );

    return updatedEvent;
  }

  /**
   * Handle event creator - create shadow account if needed for external sources
   * @param eventData External event data
   * @param tenantId Tenant ID
   * @returns User entity
   */
  private async handleEventCreator(
    eventData: ExternalEventDto,
    tenantId: string,
  ) {
    if (!eventData.source || !eventData.source.type || !eventData.source.id) {
      throw new Error('Event source information is required');
    }

    // For Bluesky events, create shadow accounts if needed
    if (
      eventData.source.type === EventSourceType.BLUESKY &&
      eventData.source.id
    ) {
      // The sourceId should be the full AT Protocol URI (at://{did}/{collection}/{rkey})
      // but we need to extract just the DID for shadow account creation
      let did = eventData.source.id;

      // Check if sourceId is a full URI
      if (eventData.source.id.startsWith('at://')) {
        try {
          // Use our BlueskyIdService to parse the URI
          const parsed = this.blueskyIdService.parseUri(eventData.source.id);
          did = parsed.did;

          this.logger.debug(
            `Extracted DID ${did} from URI ${eventData.source.id}`,
          );
        } catch (e) {
          this.logger.error(
            `Error parsing sourceId as AT Protocol URI: ${eventData.source.id}`,
            e.stack,
          );
          this.logger.warn(
            `Failed to parse sourceId as AT Protocol URI: ${eventData.source.id}, using it as is`,
          );
          // If we can't parse it, just use the whole thing
        }
      }

      // If metadata also contains the DID directly, use that as a fallback
      if (!did.startsWith('did:') && eventData.source.metadata?.did) {
        did = eventData.source.metadata.did as string;
      }

      // Handle is optional - per ATProtocol spec, we should store DIDs as canonical identifiers
      // and resolve to handles at display time. Use DID as fallback display name if handle not provided.
      const handle = eventData.source.handle || did;

      this.logger.debug(
        `Creating shadow account for Bluesky user with DID ${did} and handle ${handle} for tenant ${tenantId}`,
      );

      return this.shadowAccountService.findOrCreateShadowAccount(
        did, // Use the extracted DID - permanent identifier
        handle, // Display name (can be DID if handle not provided)
        AuthProvidersEnum.bluesky,
        tenantId,
        {
          bluesky: {
            did: did, // Use the extracted DID
            handle: eventData.source.handle || did, // Store actual handle if available
            connected: false,
          },
        },
      );
    } else if (eventData.source.type === EventSourceType.WEB) {
      // Extract domain from source metadata or URL
      let domain = 'unknown.source';
      if (eventData.source.metadata?.domain) {
        domain = eventData.source.metadata.domain as string;
      } else if (eventData.source.url) {
        try {
          const url = new URL(eventData.source.url);
          domain = url.hostname;
        } catch (e) {
          this.logger.error(
            `Error parsing URL: ${eventData.source.url}`,
            e.stack,
          );
        }
      }

      // Create a unique identifier for the web source - use only domain for shadow user
      const sourceIdentifier = `web:${domain}`;

      // Create a display name for the source
      const displayName = eventData.source.metadata?.siteName
        ? eventData.source.metadata.siteName
        : domain.charAt(0).toUpperCase() +
          domain.slice(1).replace(/\.(com|org|net|io)$/, '');

      this.logger.debug(
        `Creating shadow account for Web source domain ${domain} for tenant ${tenantId}`,
      );

      return this.shadowAccountService.findOrCreateShadowAccount(
        sourceIdentifier,
        displayName,
        AuthProvidersEnum.email,
        tenantId,
        {
          web: {
            domain: domain,
            sourceId: eventData.source.id,
            url: eventData.source.url,
          },
        },
      );
    }

    // For other types, we can extend this method with additional providers
    throw new Error(
      `Unsupported source type for event creator: ${eventData.source.type}`,
    );
  }

  /**
   * Delete an external event by its source ID and type
   * @param sourceId Source ID of the event to delete
   * @param sourceType Source type of the event
   * @param tenantId Tenant ID where the event is stored
   * @returns Result of the deletion operation
   */
  @Trace('event-integration.deleteExternalEvent')
  async deleteExternalEvent(
    sourceId: string,
    sourceType: string,
    tenantId: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    this.logger.debug(
      `Deleting external event by sourceId: ${sourceId} and sourceType: ${sourceType} for tenant ${tenantId}`,
    );

    // Start measuring duration
    const timer = this.processingDuration.startTimer({
      tenant: tenantId,
      source_type: sourceType,
      operation: 'delete',
      is_duplicate: 'n/a',
    });

    try {
      // Get the tenant connection
      const tenantConnection =
        await this.tenantService.getTenantConnection(tenantId);
      const eventRepository = tenantConnection.getRepository(EventEntity);

      // Find events matching the source criteria
      const events = await this.eventQueryService.findBySourceAttributes(
        sourceId,
        sourceType,
        tenantId,
      );

      if (events.length === 0) {
        this.logger.warn(
          `No events found with the specified source information`,
        );

        // Record the delete operation
        this.processedCounter.inc({
          tenant: tenantId,
          source_type: sourceType,
          operation: 'delete_notfound',
        });

        // End the timing
        timer();

        return {
          success: false,
          message: 'No events found matching the source criteria',
        };
      }

      this.logger.debug(`Found ${events.length} events to delete`);

      // Delete all matching events (usually should be just one)
      let deletedCount = 0;
      for (const event of events) {
        try {
          await eventRepository.remove(event);
          deletedCount++;
          this.logger.debug(`Deleted event with ID ${event.id}`);
        } catch (error) {
          this.logger.error(
            `Error deleting event ${event.id}: ${error.message}`,
            error.stack,
          );

          // Record the delete failure
          this.deduplicationFailuresCounter.inc({
            tenant: tenantId,
            source_type: sourceType,
            error: 'delete_error',
          });
        }
      }

      // Record the successful delete operation
      this.processedCounter.inc({
        tenant: tenantId,
        source_type: sourceType,
        operation: 'delete_success',
      });

      // End the timing
      timer();

      return {
        success: true,
        message: `Successfully deleted ${deletedCount} event(s)`,
      };
    } catch (error) {
      // Record the delete failure
      this.deduplicationFailuresCounter.inc({
        tenant: tenantId,
        source_type: sourceType,
        error: 'delete_exception',
      });

      // End the timing
      timer();

      throw error;
    }
  }
}

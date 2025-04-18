import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ExternalEventDto } from '../dto/external-event.dto';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { Repository } from 'typeorm';
import { ShadowAccountService } from '../../shadow-account/shadow-account.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { EventSourceType } from '../../core/constants/source-type.constant';
import { EventStatus, EventVisibility } from '../../core/constants/constant';
import { EventQueryService } from './event-query.service';
import { AuthProvidersEnum } from '../../auth/auth-providers.enum';

@Injectable()
export class EventIntegrationService {
  private readonly logger = new Logger(EventIntegrationService.name);

  constructor(
    private readonly tenantService: TenantConnectionService,
    private readonly shadowAccountService: ShadowAccountService,
    private readonly eventQueryService: EventQueryService,
  ) {}

  /**
   * Process an external event and create or update it in the system
   * @param eventData External event data
   * @param tenantId Tenant ID where this event should be stored
   * @returns The created or updated event
   */
  async processExternalEvent(
    eventData: ExternalEventDto,
    tenantId: string,
  ): Promise<EventEntity> {
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    this.logger.debug(`Processing external event for tenant ${tenantId}`);

    // Get the tenant connection
    const tenantConnection =
      await this.tenantService.getTenantConnection(tenantId);
    const eventRepository = tenantConnection.getRepository(EventEntity);

    // Check if this event already exists (to avoid duplicates)
    const existingEvent = await this.findExistingEvent(
      eventData.source.id,
      eventData.source.type,
      tenantId,
    );

    if (existingEvent) {
      this.logger.debug(
        `Found existing event with ID ${existingEvent.id}, updating it`,
      );
      return this.updateExistingEvent(
        existingEvent,
        eventData,
        eventRepository,
        tenantId,
      );
    }

    // No existing event, create a new one
    this.logger.debug('No existing event found, creating a new one');
    return this.createNewEvent(eventData, eventRepository, tenantId);
  }

  /**
   * Find an existing event based on source ID and type
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
    const savedEvent = await eventRepository.save(newEvent);
    this.logger.debug(
      `Created new event with ID ${savedEvent.id} for tenant ${tenantId}`,
    );

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
    const updatedEvent = await eventRepository.save(existingEvent);
    this.logger.debug(
      `Updated event with ID ${updatedEvent.id} for tenant ${tenantId}`,
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
      eventData.source.id &&
      eventData.source.handle
    ) {
      // The sourceId for Bluesky contains the DID
      this.logger.debug(
        `Creating shadow account for Bluesky user with DID ${eventData.source.id} and handle ${eventData.source.handle} for tenant ${tenantId}`,
      );

      return this.shadowAccountService.findOrCreateShadowAccount(
        eventData.source.id,
        eventData.source.handle,
        AuthProvidersEnum.bluesky,
        tenantId,
        {
          bluesky: {
            did: eventData.source.id,
            handle: eventData.source.handle,
            connected: false,
          },
        },
      );
    }

    // For other types, we can extend this method with additional providers
    throw new Error(
      `Unsupported source type for event creator: ${eventData.source.type}`,
    );
  }
}

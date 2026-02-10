import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { createHash } from 'crypto';
import { Agent } from '@atproto/api';
import { BlueskyService } from './bluesky.service';
import { BlueskyIdService } from './bluesky-id.service';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { EventSourceType } from '../core/constants/source-type.constant';
import { Trace } from '../utils/trace.decorator';
import {
  BLUESKY_COLLECTIONS,
  RSVP_STATUS,
  RsvpStatusShort,
} from './BlueskyTypes';
import { AtprotoLexiconService } from './atproto-lexicon.service';

/**
 * Service for managing RSVPs in the ATProtocol ecosystem
 * Handles creating, deleting, and listing RSVPs in a user's Personal Data Server (PDS)
 */
@Injectable()
export class BlueskyRsvpService {
  private readonly logger = new Logger(BlueskyRsvpService.name);

  /**
   * Generate a deterministic rkey for an RSVP based on the event URI.
   * This ensures the same event always produces the same rkey, making updates idempotent.
   * Uses a hash-based approach similar to Smoke Signal's implementation.
   */
  private generateRsvpRkey(eventUri: string): string {
    return createHash('sha256').update(eventUri).digest('hex').substring(0, 13);
  }

  constructor(
    @Inject(forwardRef(() => BlueskyService))
    private readonly blueskyService: BlueskyService,
    private readonly blueskyIdService: BlueskyIdService,
    @InjectMetric('bluesky_rsvp_operations_total')
    private readonly rsvpOperationsCounter: Counter<string>,
    @InjectMetric('bluesky_rsvp_processing_duration_seconds')
    private readonly processingDuration: Histogram<string>,
    private readonly atprotoLexiconService: AtprotoLexiconService,
  ) {}

  /**
   * Creates or updates an RSVP in the user's Bluesky PDS
   * @param event The event to RSVP to
   * @param status The RSVP status (going, interested, or notgoing)
   * @param did The user's Bluesky DID
   * @param tenantId The tenant ID
   */
  @Trace('bluesky-rsvp.createRsvp')
  async createRsvp(
    event: EventEntity,
    status: RsvpStatusShort,
    did: string,
    tenantId: string,
    providedAgent?: Agent,
  ): Promise<{ success: boolean; rsvpUri: string; rsvpCid?: string }> {
    // Start measuring duration
    const timer = this.processingDuration.startTimer({
      tenant: tenantId,
      operation: 'create',
      status,
    });

    try {
      this.logger.debug(
        `Starting Bluesky RSVP creation for user ${did} to event ${event.id}`,
        {
          eventId: event.id,
          eventName: event.name,
          eventSourceType: event.sourceType,
          eventSourceData: event.sourceData,
          userDid: did,
          tenantId,
          status,
        },
      );

      // Get the event's AT Protocol URI
      // Support both legacy sourceType=bluesky and new atprotoUri publishing
      let eventUri: string;
      let eventCid: string | undefined;

      if (event.atprotoUri && event.atprotoRkey) {
        // New style: event was published via AtprotoPublisherService
        eventUri = event.atprotoUri;
        // CID is not currently stored for atproto-published events
        eventCid = undefined;
        this.logger.debug(`Using atprotoUri for RSVP: ${eventUri}`);
      } else if (
        event.sourceData?.rkey &&
        event.sourceType === EventSourceType.BLUESKY
      ) {
        // Legacy style: event was imported from Bluesky
        const eventCreatorDid = event.sourceData.did as string;
        if (!eventCreatorDid) {
          this.logger.warn(
            `Cannot create RSVP: Event source data is missing creator DID`,
            {
              eventId: event.id,
              eventSourceData: event.sourceData,
            },
          );
          throw new Error('Event source data is missing creator DID');
        }
        const standardEventCollection = BLUESKY_COLLECTIONS.EVENT;
        eventUri = this.blueskyIdService.createUri(
          eventCreatorDid,
          standardEventCollection,
          event.sourceData.rkey as string,
        );
        eventCid = event.sourceData.cid as string | undefined;
      } else {
        this.logger.warn(
          `Cannot create RSVP: Event does not have valid AT Protocol source information`,
          {
            eventId: event.id,
            eventSourceType: event.sourceType,
            eventSourceData: event.sourceData,
            atprotoUri: event.atprotoUri,
          },
        );
        throw new Error('Event does not have AT Protocol source information');
      }

      if (!eventCid) {
        this.logger.debug(
          `Event does not have CID - RSVP will use uri-only reference`,
          {
            eventId: event.id,
          },
        );
      }

      // Get agent for the user
      // Use provided agent (from PdsSessionService for custodial users)
      // or fall back to OAuth session (for Bluesky OAuth users)
      let agent: Agent;
      if (providedAgent) {
        agent = providedAgent;
        this.logger.debug(`Using provided agent for user ${did}`);
      } else {
        this.logger.debug(`Creating Bluesky OAuth session for user`, {
          userDid: did,
          tenantId,
        });
        const resumedAgent = await this.blueskyService.resumeSession(
          tenantId,
          did,
        );
        if (!resumedAgent) {
          this.logger.warn(`Failed to create Bluesky session for user`, {
            userDid: did,
            tenantId,
          });
          throw new Error(`Failed to create Bluesky session for user ${did}`);
        }
        agent = resumedAgent;
      }

      // Create the RSVP record using StrongRef format per community.lexicon.calendar.rsvp spec
      const recordData: Record<string, unknown> = {
        $type: BLUESKY_COLLECTIONS.RSVP,
        subject: {
          uri: eventUri,
          ...(eventCid && { cid: eventCid }), // Include CID if available
        },
        status: RSVP_STATUS[status], // Use full NSID-prefixed status
        createdAt: new Date().toISOString(),
      };

      // Generate a deterministic rkey for the RSVP based on event URI
      // This ensures the same event always produces the same rkey, making updates idempotent
      const rkey = this.generateRsvpRkey(eventUri);

      this.logger.debug(`Sending RSVP record to Bluesky PDS`, {
        userDid: did,
        rkey,
        eventUri,
        recordData,
      });

      // Validate record against AT Protocol lexicon schema
      const validation = this.atprotoLexiconService.validate(
        BLUESKY_COLLECTIONS.RSVP,
        recordData,
      );
      if (!validation.success) {
        this.logger.error('RSVP record failed lexicon validation', {
          eventId: event.id,
          errors: validation.error.message,
        });
        throw new Error(
          `AT Protocol record validation failed: ${validation.error.message}`,
        );
      }

      // Use standard collection name without suffix
      const standardRsvpCollection = BLUESKY_COLLECTIONS.RSVP;

      // Create the RSVP record in the user's PDS
      const result = await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: standardRsvpCollection,
        rkey,
        record: recordData,
      });

      // Generate the full RSVP URI - use standard collection name
      const rsvpUri = this.blueskyIdService.createUri(
        did,
        standardRsvpCollection,
        rkey,
      );

      // Increment metrics
      this.rsvpOperationsCounter.inc({
        tenant: tenantId,
        operation: 'create',
        status,
      });

      this.logger.debug(
        `Successfully created RSVP for event ${event.name} with status ${status}`,
        {
          eventUri,
          eventCid,
          did,
          rkey,
          rsvpCid: result.data.cid,
          rsvpUri,
        },
      );

      // Stop the timer
      timer();

      return {
        success: true,
        rsvpUri,
        rsvpCid: result.data.cid,
      };
    } catch (error) {
      // Stop the timer for error case
      timer();

      this.logger.error(`Failed to create Bluesky RSVP: ${error.message}`, {
        error: error.stack,
        eventId: event.id,
        eventName: event.name,
        eventSourceType: event.sourceType,
        eventSourceData: event.sourceData,
        userDid: did,
        tenantId,
        status,
      });
      throw new Error(`Failed to create Bluesky RSVP: ${error.message}`);
    }
  }

  /**
   * Deletes an RSVP from the user's Bluesky PDS
   * @param rsvpUri The URI of the RSVP to delete
   * @param did The user's Bluesky DID
   * @param tenantId The tenant ID
   */
  @Trace('bluesky-rsvp.deleteRsvp')
  async deleteRsvp(
    rsvpUri: string,
    did: string,
    tenantId: string,
  ): Promise<{ success: boolean }> {
    // Start measuring duration
    const timer = this.processingDuration.startTimer({
      tenant: tenantId,
      operation: 'delete',
    });

    try {
      // Parse the RSVP URI
      const parsedUri = this.blueskyIdService.parseUri(rsvpUri);

      // Verify the DID in the URI matches the provided DID
      if (parsedUri.did !== did) {
        throw new Error(
          `RSVP URI DID (${parsedUri.did}) does not match provided DID (${did})`,
        );
      }

      // Get Bluesky agent for the user
      const agent = await this.blueskyService.resumeSession(tenantId, did);

      // Use standard collection name for RSVPs
      const standardRsvpCollection = BLUESKY_COLLECTIONS.RSVP;

      // Delete the RSVP record
      await agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: standardRsvpCollection,
        rkey: parsedUri.rkey,
      });

      // Increment metrics
      this.rsvpOperationsCounter.inc({
        tenant: tenantId,
        operation: 'delete',
      });

      this.logger.debug(`Deleted RSVP ${rsvpUri}`, {
        did,
        rkey: parsedUri.rkey,
      });

      // Stop the timer
      timer();

      return { success: true };
    } catch (error) {
      // Stop the timer for error case
      timer();

      this.logger.error(
        `Failed to delete Bluesky RSVP: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to delete Bluesky RSVP: ${error.message}`);
    }
  }

  /**
   * Lists all RSVPs by a user in their Bluesky PDS
   * @param did The user's Bluesky DID
   * @param tenantId The tenant ID
   */
  @Trace('bluesky-rsvp.listRsvps')
  async listRsvps(did: string, tenantId: string): Promise<any[]> {
    // Start measuring duration
    const timer = this.processingDuration.startTimer({
      tenant: tenantId,
      operation: 'list',
    });

    try {
      // Get Bluesky agent for the user
      const agent = await this.blueskyService.resumeSession(tenantId, did);

      // Use standard collection name for RSVPs
      const standardRsvpCollection = BLUESKY_COLLECTIONS.RSVP;

      // List RSVP records
      const response = await agent.com.atproto.repo.listRecords({
        repo: did,
        collection: standardRsvpCollection,
      });

      // Map raw records to a more usable format
      const rsvps = response.data.records.map((record) => {
        // Safely type the record value for TypeScript
        const value = record.value as {
          status?: string;
          subject?: { uri?: string; cid?: string };
          createdAt?: string;
        };

        // Strip NSID prefix from status if present (e.g., "community.lexicon.calendar.rsvp#going" -> "going")
        let status = value.status;
        if (status && status.includes('#')) {
          status = status.split('#').pop();
        }

        return {
          uri: this.blueskyIdService.createUri(
            did,
            standardRsvpCollection,
            record.rkey as string,
          ),
          cid: record.cid,
          rkey: record.rkey,
          status,
          eventUri: value.subject?.uri,
          eventCid: value.subject?.cid,
          createdAt: value.createdAt,
        };
      });

      // Increment metrics
      this.rsvpOperationsCounter.inc({
        tenant: tenantId,
        operation: 'list',
      });

      // Stop the timer
      timer();

      return rsvps;
    } catch (error) {
      // Stop the timer for error case
      timer();

      this.logger.error(
        `Failed to list Bluesky RSVPs: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to list Bluesky RSVPs: ${error.message}`);
    }
  }

  /**
   * Checks if a user has an existing RSVP for an event
   * @param eventUri The event URI to check
   * @param did The user's Bluesky DID
   * @param tenantId The tenant ID
   */
  @Trace('bluesky-rsvp.findRsvpForEvent')
  async findRsvpForEvent(
    eventUri: string,
    did: string,
    tenantId: string,
  ): Promise<{ exists: boolean; rsvp?: any }> {
    try {
      // Get all RSVPs
      const rsvps = await this.listRsvps(did, tenantId);

      // Find any RSVP that matches the event URI
      const matchingRsvp = rsvps.find((rsvp) => rsvp.eventUri === eventUri);

      if (matchingRsvp) {
        return {
          exists: true,
          rsvp: matchingRsvp,
        };
      }

      return { exists: false };
    } catch (error) {
      this.logger.error(
        `Failed to find RSVP for event: ${error.message}`,
        error.stack,
      );
      // Don't throw, just return not found
      return { exists: false };
    }
  }
}

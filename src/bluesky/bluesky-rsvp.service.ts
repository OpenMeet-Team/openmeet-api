import { Injectable, Logger } from '@nestjs/common';
import { BlueskyService } from './bluesky.service';
import { BlueskyIdService } from './bluesky-id.service';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { EventSourceType } from '../core/constants/source-type.constant';
import { Trace } from '../utils/trace.decorator';

/**
 * Service for managing RSVPs in the ATProtocol ecosystem
 * Handles creating, deleting, and listing RSVPs in a user's Personal Data Server (PDS)
 */
@Injectable()
export class BlueskyRsvpService {
  private readonly logger = new Logger(BlueskyRsvpService.name);

  constructor(
    private readonly blueskyService: BlueskyService,
    private readonly blueskyIdService: BlueskyIdService,
    @InjectMetric('bluesky_rsvp_operations_total')
    private readonly rsvpOperationsCounter: Counter<string>,
    @InjectMetric('bluesky_rsvp_processing_duration_seconds')
    private readonly processingDuration: Histogram<string>,
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
    status: 'going' | 'interested' | 'notgoing',
    did: string,
    tenantId: string,
  ): Promise<{ success: boolean; rsvpUri: string }> {
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

      // Get the event's Bluesky URI
      if (
        !event.sourceData?.rkey ||
        event.sourceType !== EventSourceType.BLUESKY
      ) {
        this.logger.warn(
          `Cannot create RSVP: Event does not have valid Bluesky source information`,
          {
            eventId: event.id,
            eventSourceType: event.sourceType,
            eventSourceData: event.sourceData,
          },
        );
        throw new Error('Event does not have Bluesky source information');
      }

      // Extract event creator DID from sourceData
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

      // Create AT Protocol URI for the event
      const eventUri = this.blueskyIdService.createUri(
        eventCreatorDid,
        'community.lexicon.calendar.event',
        event.sourceData.rkey as string,
      );

      // Get Bluesky agent for the user
      this.logger.debug(`Creating Bluesky session for user`, {
        userDid: did,
        tenantId,
      });
      const agent = await this.blueskyService.resumeSession(tenantId, did);
      if (!agent) {
        this.logger.warn(`Failed to create Bluesky session for user`, {
          userDid: did,
          tenantId,
        });
        throw new Error(`Failed to create Bluesky session for user ${did}`);
      }

      // Create the RSVP record
      const recordData = {
        $type: 'community.lexicon.calendar.rsvp',
        subject: {
          $type: 'community.lexicon.calendar.event',
          uri: eventUri,
        },
        status,
        createdAt: new Date().toISOString(),
      };

      // Generate an rkey for the RSVP
      const rkey = `${event.sourceData.rkey}-rsvp-${Date.now()}`;

      this.logger.debug(`Sending RSVP record to Bluesky PDS`, {
        userDid: did,
        rkey,
        eventUri,
        recordData,
      });

      // Create the RSVP record in the user's PDS
      const result = await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: 'community.lexicon.calendar.rsvp',
        rkey,
        record: recordData,
      });

      // Generate the full RSVP URI
      const rsvpUri = this.blueskyIdService.createUri(
        did,
        'community.lexicon.calendar.rsvp',
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
          did,
          rkey,
          cid: result.data.cid,
          rsvpUri,
        },
      );

      // Stop the timer
      timer();

      return {
        success: true,
        rsvpUri,
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

      // Delete the RSVP record
      await agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: 'community.lexicon.calendar.rsvp',
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

      // List RSVP records
      const response = await agent.com.atproto.repo.listRecords({
        repo: did,
        collection: 'community.lexicon.calendar.rsvp',
      });

      // Map raw records to a more usable format
      const rsvps = response.data.records.map((record) => {
        // Safely type the record value for TypeScript
        const value = record.value as {
          status?: string;
          subject?: { uri?: string };
          createdAt?: string;
        };

        return {
          uri: this.blueskyIdService.createUri(
            did,
            'community.lexicon.calendar.rsvp',
            record.rkey as string,
          ),
          cid: record.cid,
          rkey: record.rkey,
          status: value.status,
          eventUri: value.subject?.uri,
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

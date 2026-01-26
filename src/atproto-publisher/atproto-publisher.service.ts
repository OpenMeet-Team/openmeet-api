import { Injectable, Logger } from '@nestjs/common';
import { PdsSessionService } from '../pds/pds-session.service';
import { BlueskyService } from '../bluesky/bluesky.service';
import { BlueskyRsvpService } from '../bluesky/bluesky-rsvp.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import {
  EventStatus,
  EventVisibility,
  EventAttendeeStatus,
} from '../core/constants/constant';
import { PublishResult } from './interfaces/publish-result.interface';

// AT Protocol RSVP status mapping
type RsvpStatusShort = 'going' | 'interested' | 'notgoing';

// Map OpenMeet attendee status to AT Protocol RSVP status
const ATTENDEE_STATUS_TO_RSVP: Partial<
  Record<EventAttendeeStatus, RsvpStatusShort>
> = {
  [EventAttendeeStatus.Confirmed]: 'going',
  [EventAttendeeStatus.Attended]: 'going',
  [EventAttendeeStatus.Maybe]: 'interested',
  [EventAttendeeStatus.Cancelled]: 'notgoing',
};

// Statuses that should be published to AT Protocol
const PUBLISHABLE_ATTENDEE_STATUSES = new Set([
  EventAttendeeStatus.Confirmed,
  EventAttendeeStatus.Attended,
  EventAttendeeStatus.Maybe,
  EventAttendeeStatus.Cancelled,
]);

// Event statuses that should be published (Published and Cancelled are both valid)
const PUBLISHABLE_EVENT_STATUSES = new Set([
  EventStatus.Published,
  EventStatus.Cancelled,
]);

const BLUESKY_EVENT_COLLECTION = 'community.lexicon.calendar.event';

/**
 * Service for publishing events and RSVPs to AT Protocol (user's PDS).
 *
 * This service is "PDS first" - it publishes to AT Protocol and returns results.
 * The calling service is responsible for saving to the local database.
 *
 * If PDS is unavailable, this service throws an error (fail fast).
 * There is no buffering or retry logic - AT Protocol is the source of truth.
 */
@Injectable()
export class AtprotoPublisherService {
  private readonly logger = new Logger(AtprotoPublisherService.name);

  constructor(
    private readonly pdsSessionService: PdsSessionService,
    private readonly blueskyService: BlueskyService,
    private readonly blueskyRsvpService: BlueskyRsvpService,
  ) {}

  /**
   * Check if an event should be published to AT Protocol.
   *
   * Criteria:
   * - Public visibility
   * - Published or Cancelled status (both are valid AT Protocol statuses)
   * - User-created (not imported from external source)
   */
  private shouldPublishEvent(event: EventEntity): boolean {
    if (event.visibility !== EventVisibility.Public) {
      return false;
    }

    if (!PUBLISHABLE_EVENT_STATUSES.has(event.status)) {
      return false;
    }

    if (event.sourceType !== null) {
      return false;
    }

    return true;
  }

  /**
   * Check if an RSVP should be published to AT Protocol.
   *
   * Criteria:
   * - Event must be published to AT Protocol (has atprotoUri)
   * - Event must be public
   * - Attendee status must map to AT Protocol (Confirmed, Maybe, Cancelled)
   */
  private shouldPublishRsvp(
    attendee: EventAttendeesEntity,
    event: EventEntity,
  ): boolean {
    if (!event.atprotoUri) {
      return false;
    }

    if (event.visibility !== EventVisibility.Public) {
      return false;
    }

    if (!PUBLISHABLE_ATTENDEE_STATUSES.has(attendee.status)) {
      return false;
    }

    return true;
  }

  /**
   * Check if an event needs to be republished.
   *
   * Returns true if:
   * - Never published (no atprotoUri)
   * - Updated since last sync (updatedAt > atprotoSyncedAt)
   */
  private needsRepublish(event: EventEntity): boolean {
    if (!event.atprotoUri) {
      return true;
    }

    if (!event.atprotoSyncedAt) {
      return true;
    }

    return event.updatedAt > event.atprotoSyncedAt;
  }

  /**
   * Publish an event to the organizer's PDS.
   *
   * Returns synchronously with 'skipped' if the event shouldn't be published.
   * Otherwise, publishes to PDS and returns the result (or throws on failure).
   *
   * The caller is responsible for saving atprotoUri/atprotoRkey/atprotoSyncedAt
   * to the database after a successful publish.
   *
   * @param event - The event to publish
   * @param tenantId - The tenant ID
   * @returns PublishResult with atprotoUri and atprotoRkey on success
   * @throws Error if PDS is unavailable or publish fails
   */
  publishEvent(
    event: EventEntity,
    tenantId: string,
  ): PublishResult | Promise<PublishResult> {
    // Synchronous eligibility checks - return immediately if not eligible
    if (!this.shouldPublishEvent(event)) {
      this.logger.debug(
        `Skipping publish for event ${event.slug}: not eligible`,
      );
      return { action: 'skipped' };
    }

    if (!this.needsRepublish(event)) {
      this.logger.debug(
        `Skipping publish for event ${event.slug}: already synced`,
      );
      return { action: 'skipped' };
    }

    // Async publish to PDS
    return this.doPublishEvent(event, tenantId);
  }

  /**
   * Internal async method to publish event to PDS.
   */
  private async doPublishEvent(
    event: EventEntity,
    tenantId: string,
  ): Promise<PublishResult> {
    const isUpdate = !!event.atprotoUri;

    const userUlid = event.user?.ulid;
    if (!userUlid) {
      throw new Error(`Event ${event.slug} has no organizer`);
    }

    const session = await this.pdsSessionService.getSessionForUser(
      tenantId,
      userUlid,
    );

    if (!session) {
      throw new Error(
        `No session available for organizer of event ${event.slug}`,
      );
    }

    const { rkey } = await this.blueskyService.createEventRecord(
      event,
      session.did,
      session.did, // Use DID as handle fallback
      tenantId,
    );

    const atprotoUri = `at://${session.did}/${BLUESKY_EVENT_COLLECTION}/${rkey}`;

    this.logger.debug(
      `Successfully ${isUpdate ? 'updated' : 'published'} event ${event.slug} to ${atprotoUri}`,
    );

    return {
      action: isUpdate ? 'updated' : 'published',
      atprotoUri,
      atprotoRkey: rkey,
    };
  }

  /**
   * Delete an event from the organizer's PDS.
   *
   * Returns synchronously with 'skipped' if the event was never published.
   * Otherwise, deletes from PDS and returns the result (or throws on failure).
   *
   * @param event - The event to delete
   * @param tenantId - The tenant ID
   * @returns PublishResult indicating success
   * @throws Error if PDS is unavailable or delete fails
   */
  deleteEvent(
    event: EventEntity,
    tenantId: string,
  ): PublishResult | Promise<PublishResult> {
    // Nothing to delete if never published
    if (!event.atprotoUri || !event.atprotoRkey) {
      this.logger.debug(
        `Skipping delete for event ${event.slug}: not published`,
      );
      return { action: 'skipped' };
    }

    return this.doDeleteEvent(event, tenantId);
  }

  /**
   * Internal async method to delete event from PDS.
   */
  private async doDeleteEvent(
    event: EventEntity,
    tenantId: string,
  ): Promise<PublishResult> {
    const userUlid = event.user?.ulid;
    if (!userUlid) {
      throw new Error(`Event ${event.slug} has no organizer`);
    }

    const session = await this.pdsSessionService.getSessionForUser(
      tenantId,
      userUlid,
    );

    if (!session) {
      throw new Error(
        `No session available for organizer of event ${event.slug}`,
      );
    }

    await this.blueskyService.deleteEventRecord(event, session.did, tenantId);

    this.logger.debug(`Successfully deleted event ${event.slug} from PDS`);

    return { action: 'deleted' };
  }

  /**
   * Publish an RSVP to the attendee's PDS.
   *
   * Returns synchronously with 'skipped' if the RSVP shouldn't be published.
   * Otherwise, publishes to PDS and returns the result (or throws on failure).
   *
   * The caller is responsible for saving atprotoUri/atprotoRkey/atprotoSyncedAt
   * to the database after a successful publish.
   *
   * @param attendee - The attendee/RSVP to publish
   * @param tenantId - The tenant ID
   * @returns PublishResult with atprotoUri and atprotoRkey on success
   * @throws Error if PDS is unavailable or publish fails
   */
  publishRsvp(
    attendee: EventAttendeesEntity,
    tenantId: string,
  ): PublishResult | Promise<PublishResult> {
    const event = attendee.event;

    // Validate event relation is loaded
    if (!event) {
      this.logger.debug(
        `Skipping publish for RSVP ${attendee.id}: event relation not loaded`,
      );
      return { action: 'skipped' };
    }

    if (!this.shouldPublishRsvp(attendee, event)) {
      this.logger.debug(
        `Skipping publish for RSVP ${attendee.id}: not eligible`,
      );
      return { action: 'skipped' };
    }

    return this.doPublishRsvp(attendee, tenantId);
  }

  /**
   * Internal async method to publish RSVP to PDS.
   */
  private async doPublishRsvp(
    attendee: EventAttendeesEntity,
    tenantId: string,
  ): Promise<PublishResult> {
    const event = attendee.event;

    const rsvpStatus = ATTENDEE_STATUS_TO_RSVP[attendee.status];
    if (!rsvpStatus) {
      throw new Error(
        `No AT Protocol mapping for attendee status ${attendee.status}`,
      );
    }

    const userUlid = attendee.user?.ulid;
    if (!userUlid) {
      throw new Error(`RSVP ${attendee.id} has no user`);
    }

    const session = await this.pdsSessionService.getSessionForUser(
      tenantId,
      userUlid,
    );

    if (!session) {
      throw new Error(
        `No session available for attendee of RSVP ${attendee.id}`,
      );
    }

    const result = await this.blueskyRsvpService.createRsvp(
      event,
      rsvpStatus,
      session.did,
      tenantId,
    );

    if (!result.success) {
      throw new Error(`RSVP creation failed for attendee ${attendee.id}`);
    }

    // Extract rkey from URI (format: at://did:plc:xxx/collection/rkey)
    const rkey = result.rsvpUri?.split('/').pop();
    if (!rkey) {
      throw new Error(
        `Could not extract rkey from RSVP URI: ${result.rsvpUri}`,
      );
    }

    this.logger.debug(
      `Successfully published RSVP ${attendee.id} to ${result.rsvpUri}`,
    );

    return {
      action: 'published',
      atprotoUri: result.rsvpUri,
      atprotoRkey: rkey,
    };
  }
}

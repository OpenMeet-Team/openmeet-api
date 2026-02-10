import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PdsSessionService } from '../pds/pds-session.service';
import { BlueskyService } from '../bluesky/bluesky.service';
import { BlueskyRsvpService } from '../bluesky/bluesky-rsvp.service';
import { AtprotoIdentityService } from '../atproto-identity/atproto-identity.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import {
  EventStatus,
  EventVisibility,
  EventAttendeeStatus,
} from '../core/constants/constant';
import { PublishResult } from './interfaces/publish-result.interface';
import { SessionUnavailableError } from '../pds/pds.errors';

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
    @Inject(forwardRef(() => BlueskyService))
    private readonly blueskyService: BlueskyService,
    @Inject(forwardRef(() => BlueskyRsvpService))
    private readonly blueskyRsvpService: BlueskyRsvpService,
    private readonly atprotoIdentityService: AtprotoIdentityService,
  ) {}

  /**
   * Pre-flight check to ensure a user can publish to AT Protocol.
   *
   * This method:
   * 1. Attempts lazy identity creation if user doesn't have one
   * 2. Verifies we can get a session for the identity
   *
   * Returns { did, required: true } if user has identity and can publish.
   * Returns { did, required: true } and throws if user HAS identity but can't get session (PDS down).
   * Returns null if user has no identity and creation failed (not required - user can still create events).
   *
   * The "required" flag indicates whether the user already had an AT Protocol identity,
   * meaning they've opted into AT Protocol publishing and failures should be fatal.
   *
   * @param tenantId - The tenant ID
   * @param user - User data (ulid, slug, email)
   * @returns The identity with required flag, or null if user has no identity
   */
  async ensurePublishingCapability(
    tenantId: string,
    user: { ulid: string; slug: string; email?: string | null },
  ): Promise<{ did: string; required: boolean } | null> {
    try {
      // Step 1: Try to ensure user has AT Protocol identity (may create lazily)
      const identity = await this.atprotoIdentityService.ensureIdentityForUser(
        tenantId,
        user,
      );

      if (!identity) {
        // User has no identity and we couldn't create one
        // This is fine - they can still create events, just won't publish to AT Protocol
        this.logger.debug(
          `Pre-flight check: No AT Protocol identity for user ${user.ulid} - events will not be published`,
        );
        return null;
      }

      // Step 2: Verify we can get a session
      const session = await this.pdsSessionService.getSessionForUser(
        tenantId,
        user.ulid,
      );

      if (!session) {
        this.logger.warn(
          `Pre-flight check failed: Could not get AT Protocol session for user ${user.ulid} (DID: ${identity.did})`,
        );
        return null;
      }

      this.logger.debug(
        `Pre-flight check passed: User ${user.ulid} can publish to AT Protocol (DID: ${identity.did})`,
      );

      return { did: identity.did, required: true };
    } catch (error) {
      // Don't let pre-flight check failures block event creation
      this.logger.warn(
        `Pre-flight check error for user ${user.ulid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

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
      this.logger.debug(
        `[shouldPublishEvent] ${event.slug}: NOT eligible - visibility=${event.visibility} (need public)`,
      );
      return false;
    }

    if (!PUBLISHABLE_EVENT_STATUSES.has(event.status)) {
      this.logger.debug(
        `[shouldPublishEvent] ${event.slug}: NOT eligible - status=${event.status} (need published/cancelled)`,
      );
      return false;
    }

    if (event.sourceType !== null) {
      this.logger.debug(
        `[shouldPublishEvent] ${event.slug}: NOT eligible - sourceType=${event.sourceType} (need null)`,
      );
      return false;
    }

    this.logger.debug(
      `[shouldPublishEvent] ${event.slug}: ELIGIBLE for publishing`,
    );
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
    options?: { force?: boolean },
  ): PublishResult | Promise<PublishResult> {
    // Synchronous eligibility checks - return immediately if not eligible
    if (!this.shouldPublishEvent(event)) {
      this.logger.debug(
        `Skipping publish for event ${event.slug}: not eligible`,
      );
      return { action: 'skipped' };
    }

    if (!options?.force && !this.needsRepublish(event)) {
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
   *
   * Lazy identity creation: If the user has no AT Protocol identity,
   * we create a custodial one before attempting to publish.
   */
  private async doPublishEvent(
    event: EventEntity,
    tenantId: string,
  ): Promise<PublishResult> {
    const isUpdate = !!event.atprotoUri;

    const user = event.user;
    const userUlid = user?.ulid;
    if (!userUlid) {
      throw new Error(`Event ${event.slug} has no organizer`);
    }

    // Lazy identity creation: ensure user has AT Protocol identity
    const identity = await this.atprotoIdentityService.ensureIdentityForUser(
      tenantId,
      {
        ulid: userUlid,
        slug: user.slug,
        email: user.email,
      },
    );

    if (!identity) {
      this.logger.debug(
        `Skipping publish for event ${event.slug}: could not ensure AT Protocol identity for user ${userUlid}`,
      );
      return { action: 'skipped' };
    }

    let session;
    try {
      session = await this.pdsSessionService.getSessionForUser(
        tenantId,
        userUlid,
      );
    } catch (error) {
      if (error instanceof SessionUnavailableError) {
        this.logger.warn(
          `Session unavailable for event ${event.slug}: ${error.message}`,
        );
        return {
          action: 'error',
          error:
            'Link your AT Protocol account to publish events. Go to Settings > Connected Accounts to connect.',
          needsOAuthLink: error.needsOAuthLink,
        };
      }
      throw error;
    }

    if (!session) {
      this.logger.debug(
        `Skipping publish for event ${event.slug}: no session available for organizer`,
      );
      return { action: 'skipped' };
    }

    let rkey: string;
    try {
      const result = await this.blueskyService.createEventRecord(
        event,
        session.did,
        session.did, // Use DID as handle fallback
        tenantId,
        session.agent, // Pass the agent from PdsSessionService
      );
      rkey = result.rkey;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message?.startsWith('AT Protocol record validation failed:')
      ) {
        this.logger.warn(
          `Validation error publishing event ${event.slug}: ${error.message}`,
        );
        return {
          action: 'error',
          error: error.message,
          validationError: error.message,
        };
      }
      throw error; // Re-throw non-validation errors
    }

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

    await this.blueskyService.deleteEventRecord(
      event,
      session.did,
      tenantId,
      session.agent, // Use PDS session agent instead of legacy Bluesky OAuth
    );

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

    let session;
    try {
      session = await this.pdsSessionService.getSessionForUser(
        tenantId,
        userUlid,
      );
    } catch (error) {
      if (error instanceof SessionUnavailableError) {
        this.logger.warn(
          `Session unavailable for RSVP ${attendee.id}: ${error.message}`,
        );
        return {
          action: 'error',
          error:
            'Link your AT Protocol account to publish RSVPs. Go to Settings > Connected Accounts to connect.',
          needsOAuthLink: error.needsOAuthLink,
        };
      }
      throw error;
    }

    if (!session) {
      this.logger.debug(
        `Skipping publish for RSVP ${attendee.id}: no session available for attendee`,
      );
      return { action: 'skipped' };
    }

    const result = await this.blueskyRsvpService.createRsvp(
      event,
      rsvpStatus,
      session.did,
      tenantId,
      session.agent, // Pass the agent from PdsSessionService
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

import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ExternalRsvpDto } from '../dto/external-rsvp.dto';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { ShadowAccountService } from '../../shadow-account/shadow-account.service';
import { EventQueryService } from './event-query.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventRoleService } from '../../event-role/event-role.service';
import { UserService } from '../../user/user.service';
import { AuthProvidersEnum } from '../../auth/auth-providers.enum';
import {
  EventAttendeeStatus,
  EventAttendeeRole,
  GroupRole,
} from '../../core/constants/constant';
import { Trace } from '../../utils/trace.decorator';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import { BlueskyIdService } from '../../bluesky/bluesky-id.service';
import { GroupMemberQueryService } from '../../group-member/group-member-query.service';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';

@Injectable()
export class RsvpIntegrationService {
  private readonly logger = new Logger(RsvpIntegrationService.name);

  constructor(
    private readonly tenantService: TenantConnectionService,
    private readonly shadowAccountService: ShadowAccountService,
    private readonly eventQueryService: EventQueryService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly eventRoleService: EventRoleService,
    private readonly userService: UserService,
    private readonly blueskyIdService: BlueskyIdService,
    @Inject(forwardRef(() => GroupMemberQueryService))
    private readonly groupMemberQueryService: GroupMemberQueryService,
    @InjectMetric('rsvp_integration_processed_total')
    private readonly processedCounter: Counter<string>,
    @InjectMetric('rsvp_integration_processing_duration_seconds')
    private readonly processingDuration: Histogram<string>,
  ) {}

  /**
   * Enforce the same access gate the interactive RSVP path applies
   * (EventManagementService.attendEvent). The ingestion path (firehose /
   * contrail sink -> POST /api/integration/rsvps) otherwise reaches
   * createFromIngestion with no membership/approval check, so an external
   * non-member could land a Confirmed RSVP on a members-only event.
   *
   * A service-key intake can't return a 403 to the remote RSVP-er, so instead
   * of throwing (as the web path does) we SOFT-HOLD: a blocked or approval-
   * gated RSVP is persisted as Pending (mirrors requireApproval) for an
   * organizer to resolve. Only affirmative attendance (going -> Confirmed) is
   * gated; Maybe / Cancelled / unknown never grant access and pass through
   * unchanged.
   *
   * IDEMPOTENCE — ingestion re-fires the same RSVP on every resync / metadata
   * update / retry, so `existingStatus` (the attendee's current stored status)
   * lets the gate stay stable across replays. The two checks handle a replay
   * DIFFERENTLY by design — do not collapse them into one rule:
   *
   *  - Membership is a LIVE eligibility check, re-evaluated every ingest. A
   *    Confirmed attendee who currently fails it is re-held; that is the whole
   *    point of this gate — a member who has since been removed from the group
   *    must not stay Confirmed on a members-only event — and it matches the web
   *    path re-denying a non-member on re-RSVP. So it deliberately ignores
   *    `existingStatus`. (A non-member can only ever be Confirmed here via an
   *    organizer's explicit override; the correct way to admit them permanently
   *    is to add them to the group, after which this recheck passes.)
   *
   *  - Approval is a ONE-TIME organizer decision. Its Pending means "awaiting a
   *    human"; once approved (Confirmed) a replay must not re-open that decision.
   *    So the approval hold is skipped when `existingStatus` is already Confirmed
   *    — mirroring the web path, which returns an already-active attendee
   *    unchanged instead of re-holding it.
   *
   * NOTE: this relies on the event being loaded WITH its `group` relation —
   * see EventQueryService.findBySourceAttributes / findByAtprotoUri.
   */
  private async gateIngestionAttendanceStatus(
    event: EventEntity,
    userId: number,
    status: EventAttendeeStatus,
    tenantId: string,
    existingStatus?: EventAttendeeStatus,
  ): Promise<EventAttendeeStatus> {
    if (status !== EventAttendeeStatus.Confirmed) {
      return status;
    }

    // Members-only event: hold a non-member or guest instead of confirming.
    // Rechecked on every ingest (including resyncs) so a previously confirmed
    // attendee who has since lost eligibility is held, matching the web path.
    if (event.requireGroupMembership && event.group) {
      const groupMember =
        await this.groupMemberQueryService.findGroupMemberByUserId(
          event.group.id,
          userId,
          tenantId,
        );

      if (!groupMember || groupMember.groupRole?.name === GroupRole.Guest) {
        this.logger.warn(
          `Holding ingested RSVP as Pending: user ${userId} is not an eligible member of group ${event.group.id} for members-only event ${event.id}`,
        );
        return EventAttendeeStatus.Pending;
      }
    }

    // Approval-required event: hold a new RSVP for organizer review, but never
    // revoke an approval already granted. A replay / resync of an unchanged
    // `going` record must not flip an organizer-approved (Confirmed) attendee
    // back to Pending.
    if (
      event.requireApproval &&
      existingStatus !== EventAttendeeStatus.Confirmed
    ) {
      return EventAttendeeStatus.Pending;
    }

    return EventAttendeeStatus.Confirmed;
  }

  /**
   * Process an external RSVP and create or update attendance record
   * @param rsvpData External RSVP data
   * @param tenantId Tenant ID where the attendance record should be stored
   */
  @Trace('rsvp-integration.processExternalRsvp')
  async processExternalRsvp(rsvpData: ExternalRsvpDto, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    this.logger.debug(`Processing external RSVP for tenant ${tenantId}`);

    // Start measuring duration
    const timer = this.processingDuration.startTimer({
      tenant: tenantId,
      source_type: rsvpData.eventSourceType,
      operation: 'process',
    });

    try {
      // Get the tenant connection - needed for shadow account service
      await this.tenantService.getTenantConnection(tenantId);

      // Validate the AT Protocol URI format
      if (!rsvpData.eventSourceId.startsWith('at://')) {
        throw new BadRequestException(
          'Event source ID must be a valid AT Protocol URI',
        );
      }

      // Find the event by source attributes using the full AT Protocol URI (imported events)
      let events = await this.eventQueryService.findBySourceAttributes(
        rsvpData.eventSourceId,
        rsvpData.eventSourceType,
        tenantId,
      );

      // If not found, try native events by atprotoUri
      if (!events.length && rsvpData.eventSourceId.startsWith('at://')) {
        this.logger.debug(
          `Event not found by sourceId, trying atprotoUri: ${rsvpData.eventSourceId}`,
        );
        events = await this.eventQueryService.findByAtprotoUri(
          rsvpData.eventSourceId,
          tenantId,
        );
      }

      if (!events.length) {
        throw new Error(
          `Event with source ID ${rsvpData.eventSourceId} not found`,
        );
      }

      const event = events[0];

      // Create or find shadow account for the user
      const user = await this.shadowAccountService.findOrCreateShadowAccount(
        rsvpData.userDid,
        rsvpData.userHandle,
        AuthProvidersEnum.bluesky,
        tenantId,
        {
          bluesky: {
            did: rsvpData.userDid,
            handle: rsvpData.userHandle,
          },
        },
      );

      // Map Bluesky status to OpenMeet status
      const statusMap = {
        interested: EventAttendeeStatus.Maybe,
        going: EventAttendeeStatus.Confirmed,
        notgoing: EventAttendeeStatus.Cancelled,
      };

      const mappedStatus =
        statusMap[rsvpData.status] || EventAttendeeStatus.Pending;

      // Find existing attendee record (loaded before gating so the gate can
      // see a prior organizer decision and stay idempotent across resyncs).
      const existingAttendee =
        await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          user.id,
        );

      // Gate the ingested RSVP through the same membership/approval rules the
      // web path enforces. Without this an external non-member bypasses access
      // control on a members-only event. Applied before both the create and
      // update branches so a re-synced non-member is held too — but the current
      // stored status is passed so a replay never revokes an approval already
      // granted (see gateIngestionAttendanceStatus).
      const status = await this.gateIngestionAttendanceStatus(
        event,
        user.id,
        mappedStatus,
        tenantId,
        existingAttendee?.status,
      );

      // Get participant role
      const participantRole = await this.eventRoleService.getRoleByName(
        EventAttendeeRole.Participant,
      );

      // Increment the processed counter
      this.processedCounter.inc({
        tenant: tenantId,
        source_type: rsvpData.eventSourceType,
        operation: existingAttendee ? 'update' : 'create',
      });

      if (existingAttendee) {
        this.logger.debug(
          `Found existing attendance record with ID ${existingAttendee.id}, updating it`,
        );

        // Update existing record with status and role
        await this.eventAttendeeService.updateEventAttendee(
          existingAttendee.id,
          {
            status,
            role: existingAttendee.role.name,
          },
        );

        // Now update the source fields separately
        const attendeeToUpdate = await this.eventAttendeeService.findOne({
          where: { id: existingAttendee.id },
        });

        if (attendeeToUpdate) {
          // Update the source fields
          // For entity fields, we use null (not undefined) since they're defined as nullable in the entity
          attendeeToUpdate.sourceId = rsvpData.sourceId || null;
          attendeeToUpdate.sourceType = rsvpData.eventSourceType || null;
          attendeeToUpdate.lastSyncedAt = new Date();

          // Update metadata - preserve originalCreatedAt from existing record
          if (rsvpData.metadata) {
            const existingSourceData =
              (attendeeToUpdate.sourceData as Record<string, unknown>) || {};
            attendeeToUpdate.sourceData = {
              ...existingSourceData,
              rsvpCid: rsvpData.metadata.cid,
              eventCid: rsvpData.metadata.eventCid,
              rkey: rsvpData.metadata.rkey,
              // Preserve original createdAt if it exists
              originalCreatedAt:
                existingSourceData.originalCreatedAt || rsvpData.timestamp,
            };
          }

          // Save the updated entity
          await this.eventAttendeeService.save(attendeeToUpdate);
        }

        // Get the updated record
        const updatedAttendee = await this.eventAttendeeService.findOne({
          where: { id: existingAttendee.id },
        });

        timer();
        return updatedAttendee;
      }

      this.logger.debug(
        'No existing attendance record found, creating a new one',
      );

      // Create new attendee record
      const attendeeData = {
        event,
        user,
        status,
        role: participantRole,
        // Store the source fields to track the relationship with the external RSVP
        sourceId: rsvpData.sourceId,
        sourceType: rsvpData.eventSourceType,
        lastSyncedAt: new Date(),
        // Store metadata including eventCid for version tracking
        sourceData: rsvpData.metadata
          ? {
              rsvpCid: rsvpData.metadata.cid,
              eventCid: rsvpData.metadata.eventCid,
              rkey: rsvpData.metadata.rkey,
              originalCreatedAt: rsvpData.timestamp,
            }
          : undefined,
      };

      const newAttendee =
        await this.eventAttendeeService.createFromIngestion(attendeeData);

      timer();
      return newAttendee;
    } catch (error) {
      // Stop the timer for error case
      timer();

      this.logger.error(
        `Error processing external RSVP: ${error.message}`,
        error.stack,
      );

      throw error;
    }
  }

  /**
   * Delete an external RSVP
   * @param sourceId Source ID of the RSVP to delete
   * @param sourceType Source type of the RSVP
   * @param tenantId Tenant ID where the RSVP is stored
   * @returns Result of the operation
   */
  @Trace('rsvp-integration.deleteExternalRsvp')
  async deleteExternalRsvp(
    sourceId: string,
    sourceType: string,
    tenantId: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    this.logger.debug(
      `Deleting external RSVP for tenant ${tenantId}: sourceId=${sourceId}, sourceType=${sourceType}`,
    );

    // Start measuring duration
    const timer = this.processingDuration.startTimer({
      tenant: tenantId,
      source_type: sourceType,
      operation: 'delete',
    });

    try {
      // Get the tenant connection - needed for EventAttendeeService queries
      await this.tenantService.getTenantConnection(tenantId);

      // First approach: Try to find attendees by sourceId
      if (sourceId.startsWith('at://')) {
        try {
          // If we have a full AT Protocol URI, try to find attendees by sourceId
          const attendees =
            await this.eventAttendeeService.findBySourceId(sourceId);

          if (attendees && attendees.length > 0) {
            this.logger.debug(
              `Found ${attendees.length} attendees with blueskyRsvpUri = ${sourceId}`,
            );

            // Mark each attendee as cancelled
            let cancelledCount = 0;
            for (const attendee of attendees) {
              // Skip already cancelled attendees
              if (attendee.status === EventAttendeeStatus.Cancelled) {
                continue;
              }

              // Update the attendee status to cancelled
              await this.eventAttendeeService.updateEventAttendee(attendee.id, {
                status: EventAttendeeStatus.Cancelled,
                role: attendee.role.name,
              });
              cancelledCount++;

              this.logger.debug(
                `Cancelled attendance record ${attendee.id} for user ${attendee.user.slug} on event ${attendee.event.slug}`,
              );
            }

            // If we successfully cancelled at least one attendee, return success
            if (cancelledCount > 0) {
              // Increment the processed counter
              this.processedCounter.inc({
                tenant: tenantId,
                source_type: sourceType,
                operation: 'delete',
              });

              timer();
              return {
                success: true,
                message: `Successfully cancelled ${cancelledCount} attendance record(s) using RSVP URI`,
              };
            }
          }

          // If we didn't find any attendees by RSVP URI or couldn't cancel any, try by user DID
          const parsedUri = this.blueskyIdService.parseUri(sourceId);
          const userDid = parsedUri.did;
          this.logger.debug(
            `Extracted DID ${userDid} from URI ${sourceId}, trying user lookup`,
          );

          // Try to find the user by DID
          const user = await this.userService.findByExternalId(
            userDid,
            tenantId,
          );

          if (!user) {
            this.logger.warn(`No user found with DID ${userDid}`);
            return {
              success: false,
              message: `No user found with DID ${userDid}`,
            };
          }

          // Find attendees by user
          const userAttendees = await this.eventAttendeeService.findByUserSlug(
            user.slug,
          );

          if (!userAttendees || userAttendees.length === 0) {
            this.logger.warn(
              `No attendee records found for user ${user.slug} (DID: ${userDid})`,
            );
            return {
              success: false,
              message: `No attendee records found for the given user`,
            };
          }

          // Mark each attendee as cancelled
          let cancelledCount = 0;
          for (const attendee of userAttendees) {
            // Skip already cancelled attendees
            if (attendee.status === EventAttendeeStatus.Cancelled) {
              continue;
            }

            // Verify this is for a Bluesky event
            const event = attendee.event;
            if (event && event.sourceType === sourceType) {
              // Update the attendee status to cancelled
              await this.eventAttendeeService.updateEventAttendee(attendee.id, {
                status: EventAttendeeStatus.Cancelled,
                role: attendee.role.name,
              });
              cancelledCount++;

              this.logger.debug(
                `Cancelled attendance record ${attendee.id} for user ${user.slug} on event ${event.slug}`,
              );
            }
          }

          // Increment the processed counter
          this.processedCounter.inc({
            tenant: tenantId,
            source_type: sourceType,
            operation: 'delete',
          });

          timer();

          if (cancelledCount > 0) {
            return {
              success: true,
              message: `Successfully cancelled ${cancelledCount} attendance record(s) by user DID`,
            };
          } else {
            return {
              success: false,
              message: 'No relevant attendance records found to cancel',
            };
          }
        } catch (error) {
          this.logger.warn(
            `Failed while processing URI ${sourceId}: ${error.message}`,
            error.stack,
          );
          // If URI processing fails, fall back to the original approach
        }
      }

      // Fallback approach: Try to find the user by sourceId as DID
      const userDid = sourceId.startsWith('at://') ? sourceId : sourceId;
      const user = await this.userService.findByExternalId(userDid, tenantId);

      if (!user) {
        this.logger.warn(`No user found with identifier ${userDid}`);
        return {
          success: false,
          message: `No user found with identifier ${userDid}`,
        };
      }

      // Find attendees by user
      const attendees = await this.eventAttendeeService.findByUserSlug(
        user.slug,
      );

      if (!attendees || attendees.length === 0) {
        this.logger.warn(`No attendee records found for user ${user.slug}`);
        return {
          success: false,
          message: `No attendee records found for the given user`,
        };
      }

      // Mark each attendee as cancelled
      let cancelledCount = 0;
      for (const attendee of attendees) {
        // Skip already cancelled attendees
        if (attendee.status === EventAttendeeStatus.Cancelled) {
          continue;
        }

        // Verify this is for a Bluesky event
        const event = attendee.event;
        if (event && event.sourceType === sourceType) {
          // Update the attendee status to cancelled
          await this.eventAttendeeService.updateEventAttendee(attendee.id, {
            status: EventAttendeeStatus.Cancelled,
            role: attendee.role.name,
          });
          cancelledCount++;

          this.logger.debug(
            `Cancelled attendance record ${attendee.id} for user ${user.slug} on event ${event.slug}`,
          );
        }
      }

      // Increment the processed counter
      this.processedCounter.inc({
        tenant: tenantId,
        source_type: sourceType,
        operation: 'delete',
      });

      timer();

      if (cancelledCount > 0) {
        return {
          success: true,
          message: `Successfully cancelled ${cancelledCount} attendance record(s)`,
        };
      } else {
        return {
          success: false,
          message: 'No relevant attendance records found to cancel',
        };
      }
    } catch (error) {
      // Stop the timer for error case
      timer();

      this.logger.error(`Error deleting RSVP: ${error.message}`, error.stack);

      // If not found, don't treat as an error
      if (error instanceof NotFoundException) {
        return {
          success: true,
          message: 'RSVP not found for deletion - ignoring',
        };
      }

      throw error;
    }
  }
}

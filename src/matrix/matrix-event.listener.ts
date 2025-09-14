import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
// import { HttpService } from '@nestjs/axios'; // Currently not used
import { MatrixRoomService } from './services/matrix-room.service';
import { RoomAliasUtils } from './utils/room-alias.utils';
import { UserService } from '../user/user.service';
import { EventQueryService } from '../event/services/event-query.service';
import { GroupService } from '../group/group.service';
import { GlobalMatrixValidationService } from './services/global-matrix-validation.service';
import { EventAttendeeQueryService } from '../event-attendee/event-attendee-query.service';
import { EventAttendeeStatus } from '../core/constants/constant';
import { getTenantConfig } from '../utils/tenant-config';

interface ChatMemberEvent {
  eventSlug?: string;
  groupSlug?: string;
  userSlug: string;
  userRole?: string; // Group role for role-based permissions
  tenantId: string;
}

interface MatrixSyncEvent {
  eventSlug: string;
  tenantId: string;
}

interface AttendeeStatusChangedEvent {
  eventId: number;
  eventSlug: string;
  userId: number;
  userSlug: string;
  oldStatus: EventAttendeeStatus;
  newStatus: EventAttendeeStatus;
  tenantId: string;
}

@Injectable()
export class MatrixEventListener {
  private readonly logger = new Logger(MatrixEventListener.name);

  constructor(
    @Inject(forwardRef(() => MatrixRoomService))
    private readonly matrixRoomService: MatrixRoomService,
    private readonly roomAliasUtils: RoomAliasUtils,
    private readonly userService: UserService,
    private readonly eventQueryService: EventQueryService,
    private readonly groupService: GroupService,
    private readonly globalMatrixValidationService: GlobalMatrixValidationService,
    private readonly eventAttendeeQueryService: EventAttendeeQueryService,
  ) {
    this.logger.log(
      '🔥 MatrixEventListener initialized and ready to handle events',
    );
  }

  @OnEvent('chat.event.member.add')
  async handleEventMemberAdd(payload: any) {
    try {
      this.logger.log(
        `Handling chat.event.member.add for user ${payload.userSlug} in event ${payload.eventSlug}`,
      );

      // Validate required fields
      if (!payload.eventSlug || !payload.userSlug || !payload.tenantId) {
        this.logger.warn(
          'Missing required fields in chat.event.member.add payload',
          payload,
        );
        return;
      }

      // Get user details
      const user = await this.userService.findBySlug(
        payload.userSlug,
        payload.tenantId,
      );
      if (!user) {
        this.logger.warn(
          `User not found: ${payload.userSlug} in tenant ${payload.tenantId}`,
        );
        return;
      }

      // Get user's Matrix handle
      const matrixHandleRegistration =
        await this.globalMatrixValidationService.getMatrixHandleForUser(
          user.id,
          payload.tenantId,
        );
      if (!matrixHandleRegistration) {
        this.logger.warn(
          `User ${payload.userSlug} has no Matrix handle, skipping room add`,
        );
        return;
      }

      // Generate room alias for the event
      const roomAlias = this.roomAliasUtils.generateEventRoomAlias(
        payload.eventSlug,
        payload.tenantId,
      );

      // Get user's Matrix ID from their handle
      const serverName = this.getMatrixServerName(payload.tenantId);

      // Debug: Check what type of data we're getting for the handle
      this.logger.debug(`Matrix handle registration debug:`, {
        type: typeof matrixHandleRegistration.handle,
        value: matrixHandleRegistration.handle,
        stringified: JSON.stringify(matrixHandleRegistration.handle),
        registration: matrixHandleRegistration,
      });

      // Validate handle is a string
      if (typeof matrixHandleRegistration.handle !== 'string') {
        this.logger.error(
          `Invalid Matrix handle data type for user ${payload.userSlug}: expected string, got ${typeof matrixHandleRegistration.handle}`,
          {
            handle: matrixHandleRegistration.handle,
            registration: matrixHandleRegistration,
          },
        );
        return;
      }

      const userMatrixId = `@${matrixHandleRegistration.handle}:${serverName}`;

      this.logger.log(`Adding user ${userMatrixId} to event room ${roomAlias}`);

      // Get event details and ensure the Matrix room exists before trying to invite users
      const event = await this.eventQueryService.showEventBySlugWithTenant(
        payload.eventSlug,
        payload.tenantId,
      );
      if (event) {
        await this.ensureRoomExists(event, roomAlias, payload.tenantId);
      }

      // Add user to the Matrix room
      await this.matrixRoomService.inviteUser(roomAlias, userMatrixId);

      this.logger.log(
        `Successfully added user ${userMatrixId} to event room ${roomAlias}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add user to event room: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('chat.event.member.remove')
  async handleEventMemberRemove(payload: any) {
    try {
      this.logger.log(
        `Handling chat.event.member.remove for user ${payload.userSlug} in event ${payload.eventSlug}`,
      );

      // Validate required fields
      if (!payload.eventSlug || !payload.userSlug || !payload.tenantId) {
        this.logger.warn(
          'Missing required fields in chat.event.member.remove payload',
          payload,
        );
        return;
      }

      // Get user details
      const user = await this.userService.findBySlug(
        payload.userSlug,
        payload.tenantId,
      );
      if (!user) {
        this.logger.warn(
          `User not found: ${payload.userSlug} in tenant ${payload.tenantId}`,
        );
        return;
      }

      // Get user's Matrix handle
      const matrixHandleRegistration =
        await this.globalMatrixValidationService.getMatrixHandleForUser(
          user.id,
          payload.tenantId,
        );
      if (!matrixHandleRegistration) {
        this.logger.warn(
          `User ${payload.userSlug} has no Matrix handle, skipping room remove`,
        );
        return;
      }

      // Generate room alias for the event
      const roomAlias = this.roomAliasUtils.generateEventRoomAlias(
        payload.eventSlug,
        payload.tenantId,
      );

      // Get user's Matrix ID from their handle
      const serverName = this.getMatrixServerName(payload.tenantId);
      const userMatrixId = `@${matrixHandleRegistration.handle}:${serverName}`;

      this.logger.log(
        `Removing user ${userMatrixId} from event room ${roomAlias}`,
      );

      // Remove user from the Matrix room
      await this.matrixRoomService.removeUserFromRoom(roomAlias, userMatrixId);

      this.logger.log(
        `Successfully removed user ${userMatrixId} from event room ${roomAlias}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove user from event room: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('chat.group.member.add')
  async handleGroupMemberAdd(payload: ChatMemberEvent) {
    try {
      this.logger.log(
        `Handling chat.group.member.add for user ${payload.userSlug} in group ${payload.groupSlug} with role ${payload.userRole}`,
      );

      // Validate required fields
      if (!payload.groupSlug || !payload.userSlug || !payload.tenantId) {
        this.logger.warn(
          'Missing required fields in chat.group.member.add payload',
          payload,
        );
        return;
      }

      // Get user details
      const user = await this.userService.findBySlug(
        payload.userSlug,
        payload.tenantId,
      );
      if (!user) {
        this.logger.warn(
          `User not found: ${payload.userSlug} in tenant ${payload.tenantId}`,
        );
        return;
      }

      // Get user's Matrix handle
      const matrixHandleRegistration =
        await this.globalMatrixValidationService.getMatrixHandleForUser(
          user.id,
          payload.tenantId,
        );
      if (!matrixHandleRegistration) {
        this.logger.warn(
          `User ${payload.userSlug} has no Matrix handle, skipping room add`,
        );
        return;
      }

      // Generate room alias for the group
      const roomAlias = this.roomAliasUtils.generateGroupRoomAlias(
        payload.groupSlug,
        payload.tenantId,
      );

      // Get user's Matrix ID from their handle
      const serverName = this.getMatrixServerName(payload.tenantId);
      const userMatrixId = `@${matrixHandleRegistration.handle}:${serverName}`;

      this.logger.log(
        `Adding user ${userMatrixId} to group room ${roomAlias} with role ${payload.userRole}`,
      );

      // Get group details and ensure the Matrix room exists before trying to invite users
      const group = await this.groupService.findGroupBySlug(payload.groupSlug);
      if (group) {
        await this.ensureGroupRoomExists(group, roomAlias, payload.tenantId);
      }

      // Add user to the Matrix room with appropriate permissions based on role
      await this.matrixRoomService.inviteUser(roomAlias, userMatrixId);

      // TODO: Phase 2 - Set Matrix room permissions based on group role
      // For now, all invited users get default participant permissions
      // Future implementation will set power levels based on payload.userRole

      this.logger.log(
        `Successfully added user ${userMatrixId} to group room ${roomAlias} with role ${payload.userRole}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add user to group room: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('chat.group.member.remove')
  async handleGroupMemberRemove(payload: ChatMemberEvent) {
    try {
      this.logger.log(
        `Handling chat.group.member.remove for user ${payload.userSlug} in group ${payload.groupSlug}`,
      );

      // Validate required fields
      if (!payload.groupSlug || !payload.userSlug || !payload.tenantId) {
        this.logger.warn(
          'Missing required fields in chat.group.member.remove payload',
          payload,
        );
        return;
      }

      // Get user details
      const user = await this.userService.findBySlug(
        payload.userSlug,
        payload.tenantId,
      );
      if (!user) {
        this.logger.warn(
          `User not found: ${payload.userSlug} in tenant ${payload.tenantId}`,
        );
        return;
      }

      // Get user's Matrix handle
      const matrixHandleRegistration =
        await this.globalMatrixValidationService.getMatrixHandleForUser(
          user.id,
          payload.tenantId,
        );
      if (!matrixHandleRegistration) {
        this.logger.warn(
          `User ${payload.userSlug} has no Matrix handle, skipping room remove`,
        );
        return;
      }

      // Generate room alias for the group
      const roomAlias = this.roomAliasUtils.generateGroupRoomAlias(
        payload.groupSlug,
        payload.tenantId,
      );

      // Get user's Matrix ID from their handle
      const serverName = this.getMatrixServerName(payload.tenantId);
      const userMatrixId = `@${matrixHandleRegistration.handle}:${serverName}`;

      this.logger.log(
        `Removing user ${userMatrixId} from group room ${roomAlias}`,
      );

      // Remove user from the Matrix room
      await this.matrixRoomService.removeUserFromRoom(roomAlias, userMatrixId);

      this.logger.log(
        `Successfully removed user ${userMatrixId} from group room ${roomAlias}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove user from group room: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('chat.group.member.role.update')
  async handleGroupMemberRoleUpdate(payload: {
    groupSlug: string;
    userSlug: string;
    oldRole: string;
    newRole: string;
    tenantId: string;
  }) {
    try {
      this.logger.log(
        `Handling chat.group.member.role.update for user ${payload.userSlug} in group ${payload.groupSlug} from ${payload.oldRole} to ${payload.newRole}`,
      );

      const confirmedRoles = ['owner', 'admin', 'moderator', 'member'];
      const oldRoleIsConfirmed = confirmedRoles.includes(payload.oldRole);
      const newRoleIsConfirmed = confirmedRoles.includes(payload.newRole);
      const newRoleIsGuest = payload.newRole === 'guest';

      // Case 1: Demotion to guest role - remove from Matrix room
      if (oldRoleIsConfirmed && newRoleIsGuest) {
        this.logger.log(
          `User ${payload.userSlug} demoted from ${payload.oldRole} to guest - removing from Matrix room`,
        );

        await this.handleGroupMemberRemove({
          groupSlug: payload.groupSlug,
          userSlug: payload.userSlug,
          tenantId: payload.tenantId,
        });
      }
      // Case 2: Promotion to confirmed role - add to Matrix room
      else if (!oldRoleIsConfirmed && newRoleIsConfirmed) {
        this.logger.log(
          `User ${payload.userSlug} promoted from ${payload.oldRole} to ${payload.newRole} - sending Matrix invitation`,
        );

        await this.handleGroupMemberAdd({
          groupSlug: payload.groupSlug,
          userSlug: payload.userSlug,
          userRole: payload.newRole,
          tenantId: payload.tenantId,
        });
      }
      // Case 3: Role change between confirmed roles - no Matrix action needed (user already in room)
      else if (oldRoleIsConfirmed && newRoleIsConfirmed) {
        this.logger.debug(
          `Role change from ${payload.oldRole} to ${payload.newRole} - user already has Matrix access, no invitation needed`,
        );
        // TODO: Future enhancement - update Matrix room power levels based on new role
      }
      // Case 4: Other transitions (guest to guest, etc.) - no Matrix action needed
      else {
        this.logger.debug(
          `Role change from ${payload.oldRole} to ${payload.newRole} does not require Matrix room changes`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle group member role update: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('matrix.sync.event.attendees')
  async handleSyncEventAttendees(payload: MatrixSyncEvent) {
    try {
      this.logger.log(
        `Handling matrix.sync.event.attendees for event ${payload.eventSlug}`,
      );

      // Validate required fields
      if (!payload.eventSlug || !payload.tenantId) {
        this.logger.warn(
          'Missing required fields in matrix.sync.event.attendees payload',
          payload,
        );
        return;
      }

      // Get the event details
      const event = await this.eventQueryService.showEventBySlugWithTenant(
        payload.eventSlug,
        payload.tenantId,
      );
      if (!event) {
        this.logger.warn(
          `Event not found: ${payload.eventSlug} in tenant ${payload.tenantId}`,
        );
        return;
      }

      // Get all confirmed attendees for this event
      const confirmedAttendees =
        await this.eventAttendeeQueryService.showConfirmedEventAttendeesByEventId(
          event.id,
          payload.tenantId,
        );

      this.logger.log(
        `Found ${confirmedAttendees.length} confirmed attendees for event ${payload.eventSlug}`,
      );

      // Generate room alias for the event
      const roomAlias = this.roomAliasUtils.generateEventRoomAlias(
        payload.eventSlug,
        payload.tenantId,
      );

      let successCount = 0;
      let errorCount = 0;

      // Add each confirmed attendee to the Matrix room
      for (const attendee of confirmedAttendees) {
        try {
          // Get user's Matrix handle
          const matrixHandleRegistration =
            await this.globalMatrixValidationService.getMatrixHandleForUser(
              attendee.user.id,
              payload.tenantId,
            );
          if (!matrixHandleRegistration) {
            this.logger.warn(
              `User ${attendee.user.slug} has no Matrix handle, skipping`,
            );
            continue;
          }

          // Get user's Matrix ID from their handle
          const serverName = this.getMatrixServerName(payload.tenantId);

          // Validate handle is a string
          if (typeof matrixHandleRegistration.handle !== 'string') {
            this.logger.error(
              `Invalid Matrix handle data type for user ${attendee.user.slug}: expected string, got ${typeof matrixHandleRegistration.handle}`,
              {
                handle: matrixHandleRegistration.handle,
                registration: matrixHandleRegistration,
              },
            );
            errorCount++;
            continue;
          }

          const userMatrixId = `@${matrixHandleRegistration.handle}:${serverName}`;

          this.logger.debug(
            `Adding confirmed attendee ${userMatrixId} to event room ${roomAlias}`,
          );

          // Add user to the Matrix room
          await this.matrixRoomService.inviteUser(roomAlias, userMatrixId);
          successCount++;

          this.logger.debug(
            `Successfully added attendee ${userMatrixId} to event room ${roomAlias}`,
          );
        } catch (error) {
          errorCount++;
          this.logger.error(
            `Failed to add attendee ${attendee.user.slug} to Matrix room: ${error.message}`,
            error.stack,
          );
        }
      }

      this.logger.log(
        `Matrix sync completed for event ${payload.eventSlug}: ${successCount} users added, ${errorCount} errors`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to sync event attendees to Matrix: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('event.attendee.status.changed')
  async handleAttendeeStatusChanged(payload: AttendeeStatusChangedEvent) {
    try {
      this.logger.log(
        `Handling event.attendee.status.changed for user ${payload.userSlug} in event ${payload.eventSlug}: ${payload.oldStatus} → ${payload.newStatus}`,
      );

      // Check if the new status allows chatting (confirmed, cancelled, or rejected)
      const allowedChatStatuses = [
        EventAttendeeStatus.Confirmed,
        EventAttendeeStatus.Cancelled,
        EventAttendeeStatus.Rejected,
      ];

      if (!allowedChatStatuses.includes(payload.newStatus)) {
        this.logger.debug(
          `New status ${payload.newStatus} does not allow chat access, skipping invitation`,
        );
        return;
      }

      // Check if the user already had chat access with the old status
      const hadChatAccess = allowedChatStatuses.includes(payload.oldStatus);
      if (hadChatAccess) {
        this.logger.debug(
          `User ${payload.userSlug} already had chat access with status ${payload.oldStatus}, no invitation needed`,
        );
        return;
      }

      // User now has chat access and didn't before - send proactive invitation
      this.logger.log(
        `User ${payload.userSlug} gained chat access, sending proactive invitation`,
      );

      // Get user's Matrix handle
      const matrixHandleRegistration =
        await this.globalMatrixValidationService.getMatrixHandleForUser(
          payload.userId,
          payload.tenantId,
        );
      if (!matrixHandleRegistration) {
        this.logger.warn(
          `User ${payload.userSlug} has no Matrix handle, skipping proactive invitation`,
        );
        return;
      }

      // Validate handle is a string
      if (typeof matrixHandleRegistration.handle !== 'string') {
        this.logger.error(
          `Invalid Matrix handle data type for user ${payload.userSlug}: expected string, got ${typeof matrixHandleRegistration.handle}`,
        );
        return;
      }

      // Generate room alias for the event
      const roomAlias = this.roomAliasUtils.generateEventRoomAlias(
        payload.eventSlug,
        payload.tenantId,
      );

      // Get user's Matrix ID from their handle
      const serverName = this.getMatrixServerName(payload.tenantId);
      const userMatrixId = `@${matrixHandleRegistration.handle}:${serverName}`;

      this.logger.log(
        `Proactively inviting user ${userMatrixId} to event room ${roomAlias}`,
      );

      // Get event details and ensure the Matrix room exists before trying to invite users
      const event = await this.eventQueryService.showEventBySlugWithTenant(
        payload.eventSlug,
        payload.tenantId,
      );
      if (event) {
        await this.ensureRoomExists(event, roomAlias, payload.tenantId);
      }

      // Send invitation via MatrixRoomService
      await this.matrixRoomService.inviteUser(roomAlias, userMatrixId);

      this.logger.log(
        `Successfully sent proactive invitation to ${userMatrixId} for event room ${roomAlias}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle attendee status change for Matrix invitation: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Manually trigger Matrix room sync for existing attendees with detailed reporting
   * This can be called when a user visits an event page and needs to be added to the Matrix room
   */
  async syncEventAttendeesToMatrix(
    eventSlug: string,
    tenantId: string,
  ): Promise<{
    eventSlug: string;
    tenantId: string;
    attendeesFound: number;
    usersAdded: number;
    errors: string[];
    success: boolean;
  }> {
    try {
      this.logger.log(
        `Manual sync requested for event ${eventSlug} attendees to Matrix`,
      );

      // Get the event details
      const event = await this.eventQueryService.showEventBySlugWithTenant(
        eventSlug,
        tenantId,
      );
      if (!event) {
        this.logger.warn(`Event not found: ${eventSlug} in tenant ${tenantId}`);
        return {
          eventSlug,
          tenantId,
          attendeesFound: 0,
          usersAdded: 0,
          errors: [`Event not found: ${eventSlug}`],
          success: false,
        };
      }

      // Get all confirmed attendees for this event
      const confirmedAttendees =
        await this.eventAttendeeQueryService.showConfirmedEventAttendeesByEventId(
          event.id,
          tenantId,
        );

      this.logger.log(
        `Found ${confirmedAttendees.length} confirmed attendees for manual sync of event ${eventSlug}`,
      );

      // Generate room alias for the event
      const roomAlias = this.roomAliasUtils.generateEventRoomAlias(
        eventSlug,
        tenantId,
      );

      let successCount = 0;
      const errors: string[] = [];

      // Add each confirmed attendee to the Matrix room
      for (const attendee of confirmedAttendees) {
        try {
          // Get user's Matrix handle
          const matrixHandleRegistration =
            await this.globalMatrixValidationService.getMatrixHandleForUser(
              attendee.user.id,
              tenantId,
            );
          if (!matrixHandleRegistration) {
            this.logger.debug(
              `User ${attendee.user.slug} has no Matrix handle, skipping manual sync`,
            );
            continue;
          }

          // Get user's Matrix ID from their handle
          const serverName = this.getMatrixServerName(tenantId);

          // Validate handle is a string
          if (typeof matrixHandleRegistration.handle !== 'string') {
            this.logger.error(
              `Invalid Matrix handle data type for user ${attendee.user.slug}: expected string, got ${typeof matrixHandleRegistration.handle}`,
              {
                handle: matrixHandleRegistration.handle,
                registration: matrixHandleRegistration,
              },
            );
            continue;
          }

          const userMatrixId = `@${matrixHandleRegistration.handle}:${serverName}`;

          this.logger.debug(
            `Adding confirmed attendee ${userMatrixId} to event room ${roomAlias} via manual sync`,
          );

          // Room should already exist via AppService room creation flow
          // Add user to the Matrix room (this will be idempotent if they're already in the room)
          await this.matrixRoomService.inviteUser(roomAlias, userMatrixId);
          successCount++;

          this.logger.debug(
            `Successfully added attendee ${userMatrixId} to event room ${roomAlias} via manual sync`,
          );
        } catch (error) {
          const errorMsg = `Failed to add attendee ${attendee.user.slug}: ${error.message}`;
          errors.push(errorMsg);
          this.logger.error(
            `Failed to add attendee ${attendee.user.slug} to Matrix room via manual sync: ${error.message}`,
            error.stack,
          );
        }
      }

      this.logger.log(
        `Manual Matrix sync completed for event ${eventSlug}: ${successCount} users added, ${errors.length} errors`,
      );

      return {
        eventSlug,
        tenantId,
        attendeesFound: confirmedAttendees.length,
        usersAdded: successCount,
        errors,
        success: errors.length === 0,
      };
    } catch (error) {
      this.logger.error(
        `Failed to manually sync event attendees to Matrix: ${error.message}`,
        error.stack,
      );
      return {
        eventSlug,
        tenantId,
        attendeesFound: 0,
        usersAdded: 0,
        errors: [error.message],
        success: false,
      };
    }
  }

  /**
   * Get the Matrix server name for a tenant from configuration
   */
  private getMatrixServerName(tenantId: string): string {
    try {
      const tenantConfig = getTenantConfig(tenantId);
      const serverName = tenantConfig?.matrixConfig?.serverName;
      if (!serverName) {
        throw new Error(
          `Matrix server name not configured for tenant: ${tenantId}`,
        );
      }
      return serverName;
    } catch (error) {
      this.logger.error(
        `Failed to get Matrix server name for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Ensure the Matrix room exists for an event, creating it if necessary
   */
  private async ensureRoomExists(
    event: { id: number; slug: string; name: string },
    roomAlias: string,
    tenantId: string,
  ): Promise<void> {
    try {
      // Check if the room already exists by trying to get its info
      // The Application Service should have already created the room when first accessed,
      // but in case it wasn't, we'll create it manually
      this.logger.debug(
        `Ensuring room exists for event ${event.slug}: ${roomAlias}`,
      );

      // Extract the local part from the room alias for room creation
      const localpart = roomAlias.substring(1).split(':')[0]; // Remove # and get part before :

      // Create the room using the same format as the Application Service
      const roomOptions = {
        room_alias_name: localpart, // Use localpart for room alias
        name: `${event.name} Chat`,
        topic: `Chat room for ${event.name}`,
        isPublic: true, // This gets converted to visibility and preset internally
      };

      await this.matrixRoomService.createRoom(roomOptions, tenantId);

      this.logger.debug(`Room ensured for event ${event.slug}: ${roomAlias}`);
    } catch (error) {
      // Handle "Room alias already taken" as success - room exists (same as Application Service)
      if (
        error.message &&
        (error.message.includes('Room alias already taken') ||
          error.message.includes('already exists') ||
          error.message.includes('MatrixError: [409]') ||
          error.message.includes('MatrixError: [400]') ||
          error.message.includes('alias already taken'))
      ) {
        this.logger.debug(
          `Room ${roomAlias} already exists for event ${event.slug}`,
        );
        return;
      }

      // For other errors, log but don't fail the entire sync
      this.logger.warn(
        `Failed to ensure room exists for ${roomAlias}: ${error.message}`,
      );
      // Don't throw - we'll try the invite anyway in case the room does exist
    }
  }

  /**
   * Ensure the Matrix room exists for a group, creating it if necessary
   */
  private async ensureGroupRoomExists(
    group: { id: number; slug: string; name: string },
    roomAlias: string,
    tenantId: string,
  ): Promise<void> {
    try {
      // Check if the room already exists by trying to get its info
      // The Application Service should have already created the room when first accessed,
      // but in case it wasn't, we'll create it manually
      this.logger.debug(
        `Ensuring room exists for group ${group.slug}: ${roomAlias}`,
      );

      // Extract the local part from the room alias for room creation
      const localpart = this.matrixRoomService.extractLocalpart(roomAlias);

      // Create the room using shared configuration logic
      await this.matrixRoomService.createEntityRoom(
        {
          name: group.name,
          slug: group.slug,
          visibility: 'private',
        },
        localpart,
        tenantId,
        'group',
      );

      this.logger.debug(`Room ensured for group ${group.slug}: ${roomAlias}`);
    } catch (error) {
      // Handle "Room alias already taken" as success - room exists (same as Application Service)
      if (
        error.message &&
        (error.message.includes('Room alias already taken') ||
          error.message.includes('already exists') ||
          error.message.includes('MatrixError: [409]') ||
          error.message.includes('MatrixError: [400]') ||
          error.message.includes('alias already taken'))
      ) {
        this.logger.debug(
          `Room ${roomAlias} already exists for group ${group.slug}`,
        );
        return;
      }

      // For other errors, log but don't fail the entire sync
      this.logger.warn(
        `Failed to ensure room exists for ${roomAlias}: ${error.message}`,
      );
      // Don't throw - we'll try the invite anyway in case the room does exist
    }
  }
}

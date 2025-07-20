import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HttpService } from '@nestjs/axios';
import { MatrixRoomService } from './services/matrix-room.service';
import { RoomAliasUtils } from './utils/room-alias.utils';
import { UserService } from '../user/user.service';
import { EventQueryService } from '../event/services/event-query.service';
import { GroupService } from '../group/group.service';
import { GlobalMatrixValidationService } from './services/global-matrix-validation.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventAttendeeStatus } from '../core/constants/constant';
import { getTenantConfig } from '../utils/tenant-config';

interface ChatMemberEvent {
  eventSlug?: string;
  groupSlug?: string;
  userSlug: string;
  tenantId: string;
}

interface MatrixSyncEvent {
  eventSlug: string;
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
    private readonly eventAttendeeService: EventAttendeeService,
  ) {
    this.logger.log('🔥 MatrixEventListener initialized and ready to handle events');
  }

  @OnEvent('chat.event.member.add')
  async handleEventMemberAdd(payload: any) {
    try {
      this.logger.log(
        `Handling chat.event.member.add for user ${payload.userSlug} in event ${payload.eventSlug}`,
      );

      // Validate required fields  
      if (!payload.eventSlug || !payload.userSlug || !payload.tenantId) {
        this.logger.warn('Missing required fields in chat.event.member.add payload', payload);
        return;
      }

      // Get user details
      const user = await this.userService.findBySlug(payload.userSlug, payload.tenantId);
      if (!user) {
        this.logger.warn(`User not found: ${payload.userSlug} in tenant ${payload.tenantId}`);
        return;
      }

      // Get user's Matrix handle
      const matrixHandleRegistration = await this.globalMatrixValidationService.getMatrixHandleForUser(user.id, payload.tenantId);
      if (!matrixHandleRegistration) {
        this.logger.warn(`User ${payload.userSlug} has no Matrix handle, skipping room add`);
        return;
      }

      // Generate room alias for the event
      const roomAlias = this.roomAliasUtils.generateEventRoomAlias(payload.eventSlug, payload.tenantId);

      // Get user's Matrix ID from their handle
      const serverName = this.getMatrixServerName(payload.tenantId);
      
      // Debug: Check what type of data we're getting for the handle
      this.logger.debug(`Matrix handle registration debug:`, {
        type: typeof matrixHandleRegistration.handle,
        value: matrixHandleRegistration.handle,
        stringified: JSON.stringify(matrixHandleRegistration.handle),
        registration: matrixHandleRegistration
      });
      
      // Validate handle is a string
      if (typeof matrixHandleRegistration.handle !== 'string') {
        this.logger.error(`Invalid Matrix handle data type for user ${payload.userSlug}: expected string, got ${typeof matrixHandleRegistration.handle}`, {
          handle: matrixHandleRegistration.handle,
          registration: matrixHandleRegistration
        });
        return;
      }
        
      const userMatrixId = `@${matrixHandleRegistration.handle}:${serverName}`;

      this.logger.log(
        `Adding user ${userMatrixId} to event room ${roomAlias}`,
      );

      // Get event details and ensure the Matrix room exists before trying to invite users
      const event = await this.eventQueryService.showEventBySlugWithTenant(payload.eventSlug, payload.tenantId);
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
        this.logger.warn('Missing required fields in chat.event.member.remove payload', payload);
        return;
      }

      // Get user details
      const user = await this.userService.findBySlug(payload.userSlug, payload.tenantId);
      if (!user) {
        this.logger.warn(`User not found: ${payload.userSlug} in tenant ${payload.tenantId}`);
        return;
      }

      // Get user's Matrix handle
      const matrixHandleRegistration = await this.globalMatrixValidationService.getMatrixHandleForUser(user.id, payload.tenantId);
      if (!matrixHandleRegistration) {
        this.logger.warn(`User ${payload.userSlug} has no Matrix handle, skipping room remove`);
        return;
      }

      // Generate room alias for the event
      const roomAlias = this.roomAliasUtils.generateEventRoomAlias(payload.eventSlug, payload.tenantId);

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
        `Handling chat.group.member.add for user ${payload.userSlug} in group ${payload.groupSlug}`,
      );

      // Validate required fields
      if (!payload.groupSlug || !payload.userSlug || !payload.tenantId) {
        this.logger.warn('Missing required fields in chat.group.member.add payload', payload);
        return;
      }

      // Get user details
      const user = await this.userService.findBySlug(payload.userSlug, payload.tenantId);
      if (!user) {
        this.logger.warn(`User not found: ${payload.userSlug} in tenant ${payload.tenantId}`);
        return;
      }

      // Get user's Matrix handle
      const matrixHandleRegistration = await this.globalMatrixValidationService.getMatrixHandleForUser(user.id, payload.tenantId);
      if (!matrixHandleRegistration) {
        this.logger.warn(`User ${payload.userSlug} has no Matrix handle, skipping room add`);
        return;
      }

      // Generate room alias for the group
      const roomAlias = this.roomAliasUtils.generateGroupRoomAlias(payload.groupSlug, payload.tenantId);

      // Get user's Matrix ID from their handle
      const serverName = this.getMatrixServerName(payload.tenantId);
      const userMatrixId = `@${matrixHandleRegistration.handle}:${serverName}`;

      this.logger.log(
        `Adding user ${userMatrixId} to group room ${roomAlias}`,
      );

      // Add user to the Matrix room
      await this.matrixRoomService.inviteUser(roomAlias, userMatrixId);

      this.logger.log(
        `Successfully added user ${userMatrixId} to group room ${roomAlias}`,
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
        this.logger.warn('Missing required fields in chat.group.member.remove payload', payload);
        return;
      }

      // Get user details
      const user = await this.userService.findBySlug(payload.userSlug, payload.tenantId);
      if (!user) {
        this.logger.warn(`User not found: ${payload.userSlug} in tenant ${payload.tenantId}`);
        return;
      }

      // Get user's Matrix handle
      const matrixHandleRegistration = await this.globalMatrixValidationService.getMatrixHandleForUser(user.id, payload.tenantId);
      if (!matrixHandleRegistration) {
        this.logger.warn(`User ${payload.userSlug} has no Matrix handle, skipping room remove`);
        return;
      }

      // Generate room alias for the group
      const roomAlias = this.roomAliasUtils.generateGroupRoomAlias(payload.groupSlug, payload.tenantId);

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

  @OnEvent('matrix.sync.event.attendees')
  async handleSyncEventAttendees(payload: MatrixSyncEvent) {
    try {
      this.logger.log(
        `Handling matrix.sync.event.attendees for event ${payload.eventSlug}`,
      );

      // Validate required fields
      if (!payload.eventSlug || !payload.tenantId) {
        this.logger.warn('Missing required fields in matrix.sync.event.attendees payload', payload);
        return;
      }

      // Get the event details
      const event = await this.eventQueryService.showEventBySlugWithTenant(payload.eventSlug, payload.tenantId);
      if (!event) {
        this.logger.warn(`Event not found: ${payload.eventSlug} in tenant ${payload.tenantId}`);
        return;
      }

      // Get all confirmed attendees for this event
      const confirmedAttendees = await this.eventAttendeeService.showConfirmedEventAttendeesByEventId(event.id);
      
      this.logger.log(
        `Found ${confirmedAttendees.length} confirmed attendees for event ${payload.eventSlug}`,
      );

      // Generate room alias for the event
      const roomAlias = this.roomAliasUtils.generateEventRoomAlias(payload.eventSlug, payload.tenantId);

      let successCount = 0;
      let errorCount = 0;

      // Add each confirmed attendee to the Matrix room
      for (const attendee of confirmedAttendees) {
        try {
          // Get user's Matrix handle
          const matrixHandleRegistration = await this.globalMatrixValidationService.getMatrixHandleForUser(attendee.user.id, payload.tenantId);
          if (!matrixHandleRegistration) {
            this.logger.warn(`User ${attendee.user.slug} has no Matrix handle, skipping`);
            continue;
          }

          // Get user's Matrix ID from their handle
          const serverName = this.getMatrixServerName(payload.tenantId);
          
          // Validate handle is a string
          if (typeof matrixHandleRegistration.handle !== 'string') {
            this.logger.error(`Invalid Matrix handle data type for user ${attendee.user.slug}: expected string, got ${typeof matrixHandleRegistration.handle}`, {
              handle: matrixHandleRegistration.handle,
              registration: matrixHandleRegistration
            });
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

  /**
   * Manually trigger Matrix room sync for existing attendees with detailed reporting
   * This can be called when a user visits an event page and needs to be added to the Matrix room
   */
  async syncEventAttendeesToMatrix(eventSlug: string, tenantId: string): Promise<{
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
      const event = await this.eventQueryService.showEventBySlugWithTenant(eventSlug, tenantId);
      if (!event) {
        this.logger.warn(`Event not found: ${eventSlug} in tenant ${tenantId}`);
        return {
          eventSlug,
          tenantId,
          attendeesFound: 0,
          usersAdded: 0,
          errors: [`Event not found: ${eventSlug}`],
          success: false
        };
      }

      // Get all confirmed attendees for this event
      const confirmedAttendees = await this.eventAttendeeService.showConfirmedEventAttendeesByEventId(event.id);
      
      this.logger.log(
        `Found ${confirmedAttendees.length} confirmed attendees for manual sync of event ${eventSlug}`,
      );

      // Generate room alias for the event
      const roomAlias = this.roomAliasUtils.generateEventRoomAlias(eventSlug, tenantId);

      let successCount = 0;
      const errors: string[] = [];

      // Add each confirmed attendee to the Matrix room
      for (const attendee of confirmedAttendees) {
        try {
          // Get user's Matrix handle
          const matrixHandleRegistration = await this.globalMatrixValidationService.getMatrixHandleForUser(attendee.user.id, tenantId);
          if (!matrixHandleRegistration) {
            this.logger.debug(`User ${attendee.user.slug} has no Matrix handle, skipping manual sync`);
            continue;
          }

          // Get user's Matrix ID from their handle
          const serverName = this.getMatrixServerName(tenantId);
          
          // Validate handle is a string
          if (typeof matrixHandleRegistration.handle !== 'string') {
            this.logger.error(`Invalid Matrix handle data type for user ${attendee.user.slug}: expected string, got ${typeof matrixHandleRegistration.handle}`, {
              handle: matrixHandleRegistration.handle,
              registration: matrixHandleRegistration
            });
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
        success: errors.length === 0
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
        success: false
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
        throw new Error(`Matrix server name not configured for tenant: ${tenantId}`);
      }
      return serverName;
    } catch (error) {
      this.logger.error(`Failed to get Matrix server name for tenant ${tenantId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ensure the Matrix room exists for an event, creating it if necessary
   */
  private async ensureRoomExists(event: { id: number; slug: string; name: string }, roomAlias: string, tenantId: string): Promise<void> {
    try {
      // Check if the room already exists by trying to get its info
      // The Application Service should have already created the room when first accessed,
      // but in case it wasn't, we'll create it manually
      this.logger.debug(`Ensuring room exists for event ${event.slug}: ${roomAlias}`);
      
      // Extract the local part from the room alias for room creation
      const localpart = roomAlias.substring(1).split(':')[0]; // Remove # and get part before :
      
      // Create the room using the same format as the Application Service
      const roomOptions = {
        room_alias_name: localpart, // Use localpart for room alias
        name: `${event.name} Chat`,
        topic: `Chat room for ${event.name}`,
        visibility: 'public',
        preset: 'public_chat',
      };

      await this.matrixRoomService.createRoom(roomOptions, tenantId);
      
      this.logger.debug(`Room ensured for event ${event.slug}: ${roomAlias}`);
    } catch (error) {
      // Handle "Room alias already taken" as success - room exists (same as Application Service)
      if (error.message && 
          (error.message.includes('Room alias already taken') ||
           error.message.includes('already exists') ||
           error.message.includes('MatrixError: [409]') ||
           error.message.includes('MatrixError: [400]') ||
           error.message.includes('alias already taken'))) {
        this.logger.debug(`Room ${roomAlias} already exists for event ${event.slug}`);
        return;
      }
      
      // For other errors, log but don't fail the entire sync
      this.logger.warn(`Failed to ensure room exists for ${roomAlias}: ${error.message}`);
      // Don't throw - we'll try the invite anyway in case the room does exist
    }
  }
}
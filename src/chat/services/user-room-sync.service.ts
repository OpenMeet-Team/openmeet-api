import { Injectable, Logger, Inject } from '@nestjs/common';
import { ChatRoomManagerInterface } from '../interfaces/chat-room-manager.interface';
import { UserService } from '../../user/user.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { GlobalMatrixValidationService } from '../../matrix/services/global-matrix-validation.service';
import { Trace } from '../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';

/**
 * Service responsible for automatically syncing user room memberships
 * when they authenticate with Matrix. This replaces manual room joining
 * with automatic invitation based on user's application memberships.
 */
@Injectable()
export class UserRoomSyncService {
  private readonly logger = new Logger(UserRoomSyncService.name);
  private readonly tracer = trace.getTracer('user-room-sync');

  constructor(
    @Inject('ChatRoomManagerInterface')
    private readonly chatRoomManager: ChatRoomManagerInterface,
    private readonly userService: UserService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly groupMemberService: GroupMemberService,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly globalMatrixValidationService: GlobalMatrixValidationService,
  ) {
    this.logger.log('UserRoomSyncService initialized');
  }

  /**
   * Main entry point for syncing user room memberships based on Matrix user ID.
   * Called when Application Service receives a user join event.
   */
  @Trace('user-room-sync.syncUserRoomMemberships')
  async syncUserRoomMemberships(matrixUserId: string): Promise<void> {
    const span = this.tracer.startSpan('syncUserRoomMemberships');

    try {
      this.logger.log(`Starting room sync for Matrix user: ${matrixUserId}`);

      // Validate Matrix user ID format
      if (!this.isValidMatrixUserId(matrixUserId)) {
        this.logger.warn(`Invalid Matrix user ID format: ${matrixUserId}`);
        return;
      }

      span.setAttributes({ 'matrix.user_id': matrixUserId });

      // Find user across all tenants using existing UserService method
      const userTenantPairs = await this.findUserAcrossAllTenants(matrixUserId);

      if (userTenantPairs.length === 0) {
        this.logger.log(
          `No OpenMeet user found for Matrix user: ${matrixUserId}`,
        );
        return;
      }

      // Process room sync for each tenant where user exists
      let totalRoomsProcessed = 0;
      for (const { user, tenantId } of userTenantPairs) {
        try {
          const roomsProcessed = await this.syncUserRoomsInTenant(
            user,
            tenantId,
          );
          totalRoomsProcessed += roomsProcessed;
        } catch (error) {
          this.logger.error(
            `Failed to sync rooms for user ${user.slug} in tenant ${tenantId}: ${error.message}`,
            error.stack,
          );
        }
      }

      span.setAttributes({ 'rooms.processed': totalRoomsProcessed });
      this.logger.log(
        `Room sync completed for ${matrixUserId}: ${totalRoomsProcessed} rooms processed across ${userTenantPairs.length} tenants`,
      );
    } catch (error) {
      span.recordException(error);
      this.logger.error(
        `Error syncing room memberships for ${matrixUserId}: ${error.message}`,
        error.stack,
      );
    } finally {
      span.end();
    }
  }

  /**
   * Find user across all tenants using existing UserService method with cross-tenant lookup
   */
  @Trace('user-room-sync.findUserAcrossAllTenants')
  private async findUserAcrossAllTenants(matrixUserId: string): Promise<
    Array<{
      user: any;
      tenantId: string;
    }>
  > {
    const span = this.tracer.startSpan('findUserAcrossAllTenants');
    const userTenantPairs: Array<{ user: any; tenantId: string }> = [];

    try {
      // Extract Matrix handle from user ID (@handle:domain)
      const handleMatch = matrixUserId.match(/^@([^:]+):/);
      if (!handleMatch) {
        this.logger.warn(
          `Cannot extract handle from Matrix user ID: ${matrixUserId}`,
        );
        return [];
      }

      const handle = handleMatch[1];
      span.setAttributes({ 'matrix.handle': handle });

      // Get all tenant IDs and search across them
      const allTenantIds = await this.tenantConnectionService.getAllTenantIds();

      for (const tenantId of allTenantIds) {
        try {
          // Use UserService's findByMatrixHandle method for each tenant
          const user = await this.userService.findByMatrixHandle(
            handle,
            tenantId,
          );

          if (user) {
            userTenantPairs.push({ user, tenantId });
            this.logger.debug(`Found user ${user.slug} in tenant ${tenantId}`);
          }
        } catch (error) {
          this.logger.debug(
            `No user found for handle ${handle} in tenant ${tenantId}: ${error.message}`,
          );
        }
      }

      span.setAttributes({
        'tenants.searched': allTenantIds.length,
        'users.found': userTenantPairs.length,
      });

      return userTenantPairs;
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Sync all rooms for a user within a specific tenant
   */
  @Trace('user-room-sync.syncUserRoomsInTenant')
  private async syncUserRoomsInTenant(
    user: any,
    tenantId: string,
  ): Promise<number> {
    const span = this.tracer.startSpan('syncUserRoomsInTenant');
    let roomsProcessed = 0;

    try {
      span.setAttributes({
        'user.id': user.id,
        'user.slug': user.slug,
        'tenant.id': tenantId,
      });

      this.logger.log(
        `Syncing rooms for user ${user.slug} in tenant ${tenantId}`,
      );

      // Get user's event memberships
      const eventRooms = await this.syncEventRoomsForUser(user, tenantId);
      roomsProcessed += eventRooms;

      // Get user's group memberships
      const groupRooms = await this.syncGroupRoomsForUser(user, tenantId);
      roomsProcessed += groupRooms;

      span.setAttributes({
        'rooms.events': eventRooms,
        'rooms.groups': groupRooms,
        'rooms.total': roomsProcessed,
      });

      this.logger.log(
        `Completed room sync for ${user.slug}: ${eventRooms} event rooms, ${groupRooms} group rooms`,
      );

      return roomsProcessed;
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Sync event rooms for a user using EventAttendeeService
   */
  @Trace('user-room-sync.syncEventRoomsForUser')
  private async syncEventRoomsForUser(
    user: any,
    tenantId: string,
  ): Promise<number> {
    const span = this.tracer.startSpan('syncEventRoomsForUser');
    let roomsProcessed = 0;

    try {
      // Use EventAttendeeService to get all active event attendances for this user
      const attendances = await this.eventAttendeeService.findByUserSlug(
        user.slug,
      );

      // Filter for active attendances only
      const activeAttendances = attendances.filter((attendance) =>
        ['confirmed', 'pending', 'maybe'].includes(attendance.status),
      );

      span.setAttributes({
        'attendances.total': attendances.length,
        'attendances.active': activeAttendances.length,
      });

      for (const attendance of activeAttendances) {
        try {
          const event = attendance.event;
          if (!event || !event.slug) {
            this.logger.warn(
              `Invalid event data for attendance ${attendance.id}`,
            );
            continue;
          }

          // Use ChatRoomManager to ensure event has a Matrix room and invite user
          await this.chatRoomManager.addUserToEventChatRoom(
            event.slug,
            user.slug,
            tenantId,
          );

          roomsProcessed++;
          this.logger.debug(
            `Added user ${user.slug} to event room: ${event.slug}`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to add user ${user.slug} to event ${attendance.event?.slug}: ${error.message}`,
          );
        }
      }

      return roomsProcessed;
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Sync group rooms for a user - find groups by querying each group for membership
   * Since there's no direct "find all groups for user" method, we need a different approach
   */
  @Trace('user-room-sync.syncGroupRoomsForUser')
  private async syncGroupRoomsForUser(
    user: any,
    tenantId: string,
  ): Promise<number> {
    const span = this.tracer.startSpan('syncGroupRoomsForUser');
    const roomsProcessed = 0;

    try {
      // TODO: This is a limitation - GroupMemberService doesn't have a "findGroupsByUser" method
      // For now, we'll skip group room sync and add it when the proper service method exists
      // Alternatively, we could add this method to GroupMemberService

      this.logger.debug(
        `Group room sync skipped for user ${user.slug} - awaiting proper service method`,
      );

      // When GroupMemberService gets a findGroupsByUserSlug method, use it like this:
      // const groupMemberships = await this.groupMemberService.findGroupsByUserSlug(user.slug);
      //
      // for (const membership of groupMemberships) {
      //   try {
      //     await this.chatRoomManager.addUserToGroupChatRoom(
      //       membership.group.slug,
      //       user.slug,
      //       tenantId
      //     );
      //     roomsProcessed++;
      //   } catch (error) {
      //     this.logger.warn(`Failed to add user to group room: ${error.message}`);
      //   }
      // }

      span.setAttributes({
        'group_memberships.processed': roomsProcessed,
      });

      return roomsProcessed;
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Handle Matrix room member events - entry point from Application Service
   * Detects user login events and triggers automatic room sync
   */
  @Trace('user-room-sync.handleMemberEvent')
  async handleMemberEvent(event: any): Promise<void> {
    const span = this.tracer.startSpan('handleMemberEvent');

    try {
      const membership = event.content?.membership;
      const userId = event.sender;
      const stateKey = event.state_key;

      this.logger.debug(
        `Member event: ${membership} for user ${stateKey} from ${userId}`,
      );

      // Detect when a user joins Matrix (first time or re-authentication)
      // Only process when user is joining themselves (sender === state_key)
      if (membership === 'join' && userId === stateKey) {
        this.logger.log(`User joined Matrix: ${userId} - triggering room sync`);

        span.setAttributes({
          'event.type': 'user_login',
          'matrix.user_id': userId,
          membership: membership,
        });

        // Trigger automatic room sync
        await this.queueRoomSync(userId);
      }
    } catch (error) {
      span.recordException(error);
      this.logger.error(
        `Error handling member event: ${error.message}`,
        error.stack,
      );
    } finally {
      span.end();
    }
  }

  /**
   * Process room sync in background for better performance
   * This method can be called from queue workers for heavy workloads
   */
  @Trace('user-room-sync.queueRoomSync')
  async queueRoomSync(matrixUserId: string): Promise<void> {
    // For now, process immediately - could be enhanced with queue integration
    await this.syncUserRoomMemberships(matrixUserId);
  }

  /**
   * Validate if a Matrix user ID looks valid before processing
   */
  private isValidMatrixUserId(matrixUserId: string): boolean {
    // Matrix user ID format: @localpart:domain
    return /^@[a-zA-Z0-9._=/-]+:[a-zA-Z0-9.-]+$/.test(matrixUserId);
  }
}

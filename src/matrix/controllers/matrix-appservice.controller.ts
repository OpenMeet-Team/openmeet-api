import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Headers,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { AllConfigType } from '../../config/config.type';
import { TenantPublic } from '../../tenant/tenant-public.decorator';
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupService } from '../../group/group.service';
import { MatrixRoomService } from '../services/matrix-room.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { GroupEntity } from '../../group/infrastructure/persistence/relational/entities/group.entity';
import { EventAttendeeQueryService } from '../../event-attendee/event-attendee-query.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { GlobalMatrixValidationService } from '../services/global-matrix-validation.service';
import { GroupMemberQueryService } from '../../group-member/group-member-query.service';
import { GroupRoleService } from '../../group-role/group-role.service';
import { GroupRole } from '../../core/constants/constant';
import { getTenantConfig, fetchTenants } from '../../utils/tenant-config';

@ApiTags('Matrix Application Service')
@TenantPublic()
@Controller('matrix/appservice')
export class MatrixAppServiceController {
  private readonly logger = new Logger(MatrixAppServiceController.name);

  private readonly appServiceToken: string;
  private readonly homeserverToken: string;

  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly eventQueryService: EventQueryService,
    private readonly groupService: GroupService,
    private readonly matrixRoomService: MatrixRoomService,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly eventAttendeeQueryService: EventAttendeeQueryService,
    private readonly eventManagementService: EventManagementService,
    private readonly globalMatrixValidationService: GlobalMatrixValidationService,
    private readonly groupMemberQueryService: GroupMemberQueryService,
    private readonly groupRoleService: GroupRoleService,
  ) {
    const matrixConfig = this.configService.get('matrix', { infer: true })!;

    this.appServiceToken = matrixConfig.appservice.token;
    this.homeserverToken = matrixConfig.appservice.hsToken;

    this.logger.log('Matrix Application Service configured successfully');
  }

  @Get('users/:userId')
  queryUser(
    @Param('userId') userId: string,
    @Headers('authorization') authHeader: string,
  ) {
    this.logger.log(`🚪 USER QUERY: Matrix is asking about user: ${userId}`);
    this.logger.log(
      `🚪 USER QUERY: Authorization header: ${authHeader?.substring(0, 20)}...`,
    );

    // Validate authorization token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        `❌ USER QUERY: Invalid authorization header format for user query: ${userId}`,
      );
      return { error: 'Invalid token' };
    }

    const token = authHeader.replace('Bearer ', '');
    if (token !== this.homeserverToken) {
      this.logger.warn(
        `❌ USER QUERY: Invalid token for user query: ${userId}`,
      );
      return { error: 'Invalid token' };
    }

    // Accept all users - anyone can chat in our rooms
    this.logger.log(`✅ USER QUERY: Accepting user: ${userId}`);
    return {}; // Empty response = success
  }

  @Get('rooms/:roomAlias')
  async queryRoom(
    @Param('roomAlias') roomAlias: string,
    @Headers('authorization') authHeader: string,
  ) {
    this.logger.log(`🏠 ROOM QUERY: Request for room alias: ${roomAlias}`);
    return this.handleRoomQueryWithAuth(roomAlias, authHeader);
  }

  // Matrix standard App Services API path
  @Get('_matrix/app/v1/rooms/:roomAlias')
  async queryRoomStandard(
    @Param('roomAlias') roomAlias: string,
    @Headers('authorization') authHeader: string,
  ) {
    this.logger.log(
      `🏠 ROOM QUERY (standard): Request for room alias: ${roomAlias}`,
    );
    return this.handleRoomQueryWithAuth(roomAlias, authHeader);
  }

  private async handleRoomQueryWithAuth(roomAlias: string, authHeader: string) {
    this.logger.log(`🔍 ROOM QUERY AUTH: Processing query for: ${roomAlias}`);

    // Validate authorization token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        `Invalid authorization header format for room query: ${roomAlias}`,
      );
      return { error: 'Invalid token' };
    }

    const token = authHeader.replace('Bearer ', '');
    if (token !== this.homeserverToken) {
      this.logger.warn(`Invalid token for room query: ${roomAlias}`);
      return { error: 'Invalid token' };
    }

    // Handle Matrix-native room creation based on room alias pattern
    return await this.handleRoomQuery(roomAlias);
  }

  @Put('_matrix/app/v1/transactions/:txnId')
  async handleTransaction(
    @Param('txnId') txnId: string,
    @Body() body: { events: any[] },
    @Headers('authorization') authHeader: string,
  ) {
    const events = body.events || [];
    this.logger.log(`🔄 TRANSACTION: ${txnId} with ${events.length} events`);

    // Validate authorization token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        `❌ TRANSACTION: Invalid authorization header format for transaction: ${txnId}`,
      );
      return { error: 'Invalid token' };
    }

    const token = authHeader.replace('Bearer ', '');
    if (token !== this.homeserverToken) {
      this.logger.warn(
        `❌ TRANSACTION: Invalid token for transaction: ${txnId}`,
      );
      return { error: 'Invalid token' };
    }

    // Process events
    for (const event of events) {
      this.logger.log(
        `🔄 TRANSACTION: Processing event: ${event.type} from ${event.sender} in room ${event.room_id}`,
      );

      // Handle different event types
      switch (event.type) {
        case 'm.room.message':
          this.logger.debug(`Message event: ${event.content?.body}`);
          // Sync power levels when users are active in Matrix rooms
          await this.handleUserActivity(event);
          break;
        case 'm.room.member':
          this.logger.log(
            `🔍 MEMBER EVENT: membership=${event.content?.membership}, sender=${event.sender}, state_key=${event.state_key}, room=${event.room_id}`,
          );
          if (
            event.content?.membership === 'join' &&
            event.sender === event.state_key
          ) {
            // User attempting to join - check if they need invitation
            this.logger.log(
              `🚪 PROCESSING JOIN: User ${event.sender} joining room ${event.room_id}`,
            );
            await this.handleJoinAttempt(event);
          } else if (event.content?.membership === 'leave') {
            this.logger.log(
              `🚪 LEAVE EVENT: User ${event.sender} leaving room ${event.room_id} (state_key: ${event.state_key})`,
            );
          } else if (event.content?.membership === 'invite') {
            this.logger.log(
              `🚪 INVITE EVENT: User ${event.sender} inviting ${event.state_key} to room ${event.room_id}`,
            );
          } else {
            this.logger.log(
              `🚪 OTHER MEMBERSHIP: ${event.content?.membership} from ${event.sender} for ${event.state_key}`,
            );
          }
          break;
        case 'm.room.create':
          this.logger.debug(`Room create event for room ${event.room_id}`);
          await this.handleRoomCreateEvent(event);
          break;
        case 'm.room.name':
          this.logger.debug(`Room name event: ${event.content?.name}`);
          break;
        case 'm.room.topic':
          this.logger.debug(`Room topic event: ${event.content?.topic}`);
          break;
        case 'm.room.canonical_alias':
          this.logger.debug(`Room alias event: ${event.content?.alias}`);
          await this.handleRoomAliasEvent(event);
          break;
        case 'm.room.power_levels':
        case 'm.room.join_rules':
        case 'm.room.guest_access':
        case 'm.room.history_visibility':
          this.logger.debug(`Room configuration event: ${event.type}`);
          break;
        default:
          this.logger.debug(`Unknown event type: ${event.type}`);
      }
    }

    return {}; // Empty response = success
  }

  @Get('_matrix/app/v1/thirdparty/protocol/:protocol')
  getProtocol(@Param('protocol') protocol: string) {
    this.logger.debug(`Protocol query for: ${protocol}`);
    return {}; // No third-party protocols supported
  }

  @Get('_matrix/app/v1/thirdparty/location/:alias')
  getLocation(@Param('alias') alias: string) {
    this.logger.debug(`Location query for: ${alias}`);
    return []; // No third-party locations supported
  }

  @Get('_matrix/app/v1/thirdparty/user/:userid')
  getThirdPartyUser(@Param('userid') userid: string) {
    this.logger.debug(`Third-party user query for: ${userid}`);
    return []; // No third-party users supported
  }

  // Debug endpoint to test appservice connectivity
  @Get('health')
  healthCheck() {
    this.logger.log('🩺 HEALTH CHECK: Appservice is reachable');
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: 'OpenMeet Matrix AppService is running',
    };
  }

  /**
   * Handle Matrix-native room queries and create rooms on-demand
   * This implements the Application Service room provisioning pattern
   */
  private async handleRoomQuery(roomAlias: string): Promise<any> {
    this.logger.log(
      `🏗️ ROOM QUERY: Processing Matrix-native room query: ${roomAlias}`,
    );

    try {
      // Parse room alias to determine entity type and identifier
      // Expected formats:
      // - #event-{slug}-{tenantId}:matrix.openmeet.net
      // - #group-{slug}-{tenantId}:matrix.openmeet.net
      const aliasWithoutHash = roomAlias.startsWith('#')
        ? roomAlias.substring(1)
        : roomAlias;
      const [localpart] = aliasWithoutHash.split(':');

      this.logger.debug(`Parsing room alias localpart: ${localpart}`);

      // Parse the localpart to extract entity information
      if (localpart.startsWith('event-')) {
        return await this.handleEventRoomQuery(localpart);
      } else if (localpart.startsWith('group-')) {
        return await this.handleGroupRoomQuery(localpart);
      } else if (localpart.startsWith('dm-')) {
        return await this.handleDMRoomQuery(localpart);
      } else {
        this.logger.warn(`Unknown room alias pattern: ${roomAlias}`);
        return { error: 'Room not found' };
      }
    } catch (error) {
      this.logger.error(
        `Error handling room query for ${roomAlias}: ${error.message}`,
      );
      return { error: 'Room not found' };
    }
  }

  /**
   * Handle event room queries and create room if event exists
   */
  private async handleEventRoomQuery(localpart: string): Promise<any> {
    try {
      // Parse: event-{slug}-{tenantId}
      const parts = localpart.split('-');
      if (parts.length < 3 || parts[0] !== 'event') {
        this.logger.warn(`Invalid event room alias format: ${localpart}`);
        return { error: 'Room not found' };
      }

      // Extract tenant ID (last part) and event slug (everything between event- and -{tenantId})
      const tenantId = parts[parts.length - 1];
      const eventSlug = parts.slice(1, -1).join('-');

      this.logger.log(
        `Checking if event exists: ${eventSlug} in tenant ${tenantId}`,
      );

      // Check if event exists in the business logic using tenant-aware method
      const event = await this.eventQueryService.showEventBySlugWithTenant(
        eventSlug,
        tenantId,
      );
      if (!event) {
        this.logger.log(`Event not found: ${eventSlug} in tenant ${tenantId}`);
        return { error: 'Room not found' };
      }

      this.logger.log(
        `Event exists: ${eventSlug} (ID: ${event.id}), creating room`,
      );

      // Generate the room alias for this event
      const roomAlias = `#${localpart}:${this.configService.get('matrix', { infer: true })?.serverName || 'matrix.openmeet.net'}`;

      // Create the Matrix room before responding
      try {
        const roomResult = await this.matrixRoomService.createEntityRoom(
          {
            name: event.name,
            slug: event.slug,
            visibility: event.visibility === 'public' ? 'public' : 'private',
          },
          localpart,
          tenantId,
          'event',
        );

        // Configure the newly created room and invite attendees
        try {
          await this.configureEventRoom(
            roomResult.roomId,
            eventSlug,
            tenantId,
            roomAlias,
          );
        } catch (configError) {
          this.logger.warn(
            `Failed to configure new room ${roomAlias}: ${configError.message}`,
          );
        }

        // Return empty object as per Matrix spec - indicates room alias exists
        return {};
      } catch (roomError) {
        // Handle "Room alias already taken" as success - room exists
        if (
          roomError.message &&
          (roomError.message.includes('Room alias already taken') ||
            roomError.message.includes('already exists') ||
            roomError.message.includes('MatrixError: [409]') ||
            roomError.message.includes('MatrixError: [400]') ||
            roomError.message.includes('alias already taken'))
        ) {
          this.logger.log(
            `Matrix room already exists for alias ${roomAlias} - ensuring attendees are invited`,
          );

          // Room exists, but we should ensure confirmed attendees are invited
          try {
            await this.configureEventRoom(null, eventSlug, tenantId, roomAlias);
          } catch (configError) {
            this.logger.warn(
              `Failed to configure existing room ${roomAlias}: ${configError.message}`,
            );
          }

          return {};
        }
        this.logger.error(`Failed to create Matrix room: ${roomError.message}`);
        return { error: 'Room not found' };
      }
    } catch (error) {
      this.logger.error(`Error creating event room: ${error.message}`);
      return { error: 'Room not found' };
    }
  }

  /**
   * Helper method to get a group by slug using tenant database connection
   * Bypasses REQUEST-scoped GroupService to avoid context issues
   */
  private async getGroupBySlugWithTenant(
    groupSlug: string,
    tenantId: string,
  ): Promise<GroupEntity | null> {
    this.logger.debug(
      `Looking for group with slug: ${groupSlug} in tenant: ${tenantId}`,
    );
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const groupRepository = dataSource.getRepository(GroupEntity);
    const group = await groupRepository.findOne({
      where: { slug: groupSlug },
    });
    this.logger.debug(
      `Group query result: ${group ? `Found group ID ${group.id}` : 'No group found'}`,
    );
    return group;
  }

  /**
   * Handle group room queries and create room if group exists
   */
  private async handleGroupRoomQuery(localpart: string): Promise<any> {
    try {
      this.logger.log(
        `👥 GROUP ROOM QUERY: Processing group room query for: ${localpart}`,
      );

      // Parse: group-{slug}-{tenantId}
      const parts = localpart.split('-');
      if (parts.length < 3 || parts[0] !== 'group') {
        this.logger.warn(
          `❌ GROUP ROOM QUERY: Invalid group room alias format: ${localpart}`,
        );
        return { error: 'Room not found' };
      }

      // Extract tenant ID (last part) and group slug (everything between group- and -{tenantId})
      const tenantId = parts[parts.length - 1];
      const groupSlug = parts.slice(1, -1).join('-');

      this.logger.log(
        `👥 GROUP ROOM QUERY: Checking if group exists: ${groupSlug} in tenant ${tenantId}`,
      );

      // Check if group exists in the business logic using tenant-aware method
      this.logger.log(
        `Calling getGroupBySlugWithTenant for slug: ${groupSlug}, tenant: ${tenantId}`,
      );
      let group;
      try {
        group = await this.getGroupBySlugWithTenant(groupSlug, tenantId);
        this.logger.log(
          `Group query result: ${group ? `Found group ID ${group.id}` : 'No group found'}`,
        );
      } catch (error) {
        this.logger.error(
          `Error in getGroupBySlugWithTenant: ${error.message}`,
        );
        throw error;
      }
      if (!group) {
        this.logger.log(`Group not found: ${groupSlug} in tenant ${tenantId}`);
        return { error: 'Room not found' };
      }

      this.logger.log(
        `Group exists: ${groupSlug} (ID: ${group.id}), creating room`,
      );

      // Generate the room alias for this group
      const roomAlias = `#${localpart}:${this.configService.get('matrix', { infer: true })?.serverName || 'matrix.openmeet.net'}`;

      // Create the Matrix room before responding
      try {
        const roomResult = await this.matrixRoomService.createEntityRoom(
          {
            name: group.name,
            slug: group.slug,
            visibility: group.visibility === 'public' ? 'public' : 'private',
          },
          localpart,
          tenantId,
          'group',
        );

        // Configure the newly created room and invite members
        try {
          await this.configureGroupRoom(
            roomResult.roomId,
            groupSlug,
            tenantId,
            roomAlias,
          );
        } catch (configError) {
          this.logger.warn(
            `Failed to configure new group room ${roomAlias}: ${configError.message}`,
          );
        }

        // Return empty object as per Matrix spec - indicates room alias exists
        return {};
      } catch (roomError) {
        // Handle "Room alias already taken" as success - room exists
        if (
          roomError.message &&
          (roomError.message.includes('Room alias already taken') ||
            roomError.message.includes('already exists') ||
            roomError.message.includes('MatrixError: [409]') ||
            roomError.message.includes('MatrixError: [400]') ||
            roomError.message.includes('alias already taken'))
        ) {
          this.logger.log(
            `Matrix room already exists for alias ${roomAlias} - ensuring group members are invited`,
          );

          // Room exists, but we should ensure confirmed group members are invited
          try {
            await this.configureGroupRoom('', groupSlug, tenantId, roomAlias);
          } catch (configError) {
            this.logger.warn(
              `Failed to configure existing group room ${roomAlias}: ${configError.message}`,
            );
          }

          return {};
        }
        this.logger.error(`Failed to create Matrix room: ${roomError.message}`);
        return { error: 'Room not found' };
      }
    } catch (error) {
      this.logger.error(`Error creating group room: ${error.message}`);
      return { error: 'Room not found' };
    }
  }

  /**
   * Handle DM room queries and create room if both users exist
   */
  private async handleDMRoomQuery(localpart: string): Promise<any> {
    try {
      // Parse: dm-{user1Handle}-{user2Handle}-{tenantId}
      // Users handles are sorted alphabetically to ensure consistent room aliases
      const parts = localpart.split('-');
      if (parts.length < 4 || parts[0] !== 'dm') {
        this.logger.warn(`Invalid DM room alias format: ${localpart}`);
        return { error: 'Room not found' };
      }

      // Extract tenant ID (last part) and user handles (everything between dm- and -{tenantId})
      const tenantId = parts[parts.length - 1];
      const userHandles = parts.slice(1, -1);

      if (userHandles.length !== 2) {
        this.logger.warn(`DM room must have exactly 2 users: ${localpart}`);
        return { error: 'Room not found' };
      }

      const [user1Handle, user2Handle] = userHandles;

      this.logger.log(
        `Checking if DM users exist: ${user1Handle} and ${user2Handle} in tenant ${tenantId}`,
      );

      // Validate both users exist and have Matrix handles
      const user1Registration =
        await this.globalMatrixValidationService.getUserByMatrixHandle(
          user1Handle,
          tenantId,
        );
      const user2Registration =
        await this.globalMatrixValidationService.getUserByMatrixHandle(
          user2Handle,
          tenantId,
        );

      if (!user1Registration || !user2Registration) {
        this.logger.log(
          `One or both DM users not found: ${user1Handle} (${!!user1Registration}), ${user2Handle} (${!!user2Registration}) in tenant ${tenantId}`,
        );
        return { error: 'Room not found' };
      }

      this.logger.log(
        `Both DM users exist: ${user1Handle} and ${user2Handle}, creating room`,
      );

      // Generate the room alias for this DM
      const roomAlias = `#${localpart}:${this.configService.get('matrix', { infer: true })?.serverName || 'matrix.openmeet.net'}`;

      // Get Matrix server name from tenant config
      const tenantConfig = getTenantConfig(tenantId);
      const serverName = tenantConfig?.matrixConfig?.serverName;
      if (!serverName) {
        this.logger.error(
          `Matrix server name not configured for tenant: ${tenantId}`,
        );
        return { error: 'Room not found' };
      }

      // Generate Matrix IDs for both users
      const user1MatrixId = `@${user1Handle}:${serverName}`;
      const user2MatrixId = `@${user2Handle}:${serverName}`;

      // Create the Matrix DM room
      try {
        const roomResult = await this.matrixRoomService.createDirectMessageRoom(
          {
            user1Handle,
            user2Handle,
            user1MatrixId,
            user2MatrixId,
          },
          tenantId,
        );

        // Update both users' m.direct account data to include the new room
        try {
          await this.matrixRoomService.configureDMRoomAccountData(
            user1MatrixId,
            user2MatrixId,
            roomResult.roomId,
            tenantId,
          );
          this.logger.log(
            `Successfully configured m.direct account data for DM room ${roomResult.roomId}`,
          );
        } catch (accountDataError) {
          this.logger.warn(
            `Failed to configure m.direct account data for DM room ${roomResult.roomId}: ${accountDataError.message}`,
          );
          // Continue - room still works without this metadata
        }

        // Return empty object as per Matrix spec - indicates room alias exists
        return {};
      } catch (roomError) {
        // Handle "Room alias already taken" as success - room exists
        if (
          roomError.message &&
          (roomError.message.includes('Room alias already taken') ||
            roomError.message.includes('already exists') ||
            roomError.message.includes('MatrixError: [409]') ||
            roomError.message.includes('MatrixError: [400]') ||
            roomError.message.includes('alias already taken'))
        ) {
          this.logger.log(
            `Matrix DM room already exists for alias ${roomAlias} - returning success`,
          );
          return {};
        }
        this.logger.error(
          `Failed to create Matrix DM room: ${roomError.message}`,
        );
        return { error: 'Room not found' };
      }
    } catch (error) {
      this.logger.error(`Error creating DM room: ${error.message}`);
      return { error: 'Room not found' };
    }
  }

  /**
   * Handle m.room.create events to set up room configuration and invite attendees
   */
  private handleRoomCreateEvent(event: any): void {
    try {
      const roomId = event.room_id;
      this.logger.log(
        `Room created: ${roomId} - waiting for alias to configure`,
      );
      // Room setup will happen in handleRoomAliasEvent when we get the alias
    } catch (error) {
      this.logger.error(
        `Failed to handle room create event: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Handle m.room.canonical_alias events to configure room and invite attendees
   */
  private async handleRoomAliasEvent(event: any): Promise<void> {
    try {
      const roomId = event.room_id;
      const alias = event.content?.alias;

      if (!alias) {
        this.logger.warn(`No alias in room alias event for ${roomId}`);
        return;
      }

      this.logger.log(`Configuring room ${roomId} with alias ${alias}`);

      // Parse alias to determine entity type and details
      // Expected formats: #event-{slug}-{tenantId}:server or #group-{slug}-{tenantId}:server
      const aliasWithoutHash = alias.startsWith('#')
        ? alias.substring(1)
        : alias;
      const [localpart] = aliasWithoutHash.split(':');

      const parts = localpart.split('-');
      if (parts.length < 3) {
        this.logger.warn(`Invalid alias format: ${alias}`);
        return;
      }

      const entityType = parts[0]; // 'event' or 'group'
      const tenantId = parts[parts.length - 1]; // Last part is tenant ID
      const entitySlug = parts.slice(1, -1).join('-'); // Everything between type and tenant

      if (entityType === 'event') {
        await this.configureEventRoom(roomId, entitySlug, tenantId, alias);
      } else if (entityType === 'group') {
        await this.configureGroupRoom(roomId, entitySlug, tenantId, alias);
      } else {
        this.logger.warn(
          `Unknown entity type: ${entityType} for alias ${alias}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle room alias event: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Configure an event room and invite all confirmed attendees
   */
  private async configureEventRoom(
    roomId: string | null,
    eventSlug: string,
    tenantId: string,
    alias: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Configuring event room ${roomId || alias} for event ${eventSlug} in tenant ${tenantId}`,
      );

      // Get event details using tenant connection
      const event = await this.eventQueryService.showEventBySlugWithTenant(
        eventSlug,
        tenantId,
      );
      if (!event) {
        this.logger.warn(`Event not found: ${eventSlug} in tenant ${tenantId}`);
        return;
      }

      // Get the actual room ID - either from parameter or resolve from alias
      let actualRoomId = roomId;
      if (!actualRoomId) {
        this.logger.log(`Resolving room ID from alias: ${alias}`);
        try {
          // Use MatrixBotService to resolve the alias to room ID
          actualRoomId = await this.matrixRoomService.resolveRoomAlias(alias);
          this.logger.log(
            `Resolved alias ${alias} to room ID: ${actualRoomId}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to resolve room alias ${alias}: ${error.message}`,
          );
          return;
        }
      }

      // Update the event's matrixRoomId field in the database
      if (actualRoomId && event.matrixRoomId !== actualRoomId) {
        this.logger.log(
          `Updating event ${event.id} matrixRoomId to: ${actualRoomId}`,
        );
        try {
          await this.eventManagementService.updateMatrixRoomIdWithTenant(
            event.id,
            actualRoomId,
            tenantId,
          );
          this.logger.log(
            `Successfully updated event ${event.id} matrixRoomId`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to update event matrixRoomId: ${error.message}`,
          );
        }
      } else {
        this.logger.log(
          `Event ${event.id} already has correct matrixRoomId: ${actualRoomId}`,
        );
      }

      this.logger.log(
        `Room configured for event ${event.name} (${event.id}), room ID: ${actualRoomId}`,
      );

      // Get all confirmed attendees for this event
      const confirmedAttendees =
        await this.eventAttendeeQueryService.showConfirmedEventAttendeesByEventId(
          event.id,
          tenantId,
        );
      this.logger.log(
        `Found ${confirmedAttendees.length} confirmed attendees for event ${eventSlug}`,
      );

      // Get Matrix server name from tenant config
      const tenantConfig = getTenantConfig(tenantId);
      const serverName = tenantConfig?.matrixConfig?.serverName;
      if (!serverName) {
        this.logger.error(
          `Matrix server name not configured for tenant: ${tenantId}`,
        );
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      // Invite each confirmed attendee to the Matrix room
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
              `User ${attendee.user.slug} has no Matrix handle, skipping`,
            );
            continue;
          }

          // Get user's Matrix ID from their handle
          const userMatrixId = `@${matrixHandleRegistration.handle}:${serverName}`;

          this.logger.debug(
            `Inviting attendee ${userMatrixId} to room ${alias}`,
          );

          // Invite user to the Matrix room using room alias
          await this.matrixRoomService.inviteUser(alias, userMatrixId);
          successCount++;

          this.logger.debug(
            `Successfully invited attendee ${userMatrixId} to room ${alias}`,
          );
        } catch (error) {
          errorCount++;
          this.logger.error(
            `Failed to invite attendee ${attendee.user.slug} to Matrix room: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `Event room invitation completed: ${successCount} users invited, ${errorCount} errors`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to configure event room: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Handle user join attempts - check if they should be proactively invited
   */
  private async handleJoinAttempt(event: any): Promise<void> {
    try {
      const { sender, room_id } = event;
      this.logger.log(
        `🚪 JOIN ATTEMPT: User ${sender} trying to join room ${room_id}`,
      );

      // Find which tenant owns this room by checking canonical alias across all tenants
      const tenants = fetchTenants();
      let roomAlias: string | null = null;
      let owningTenantId: string | null = null;

      // Filter out any tenants with empty or invalid IDs
      const validTenants = tenants.filter(
        (tenant) => tenant && tenant.id && tenant.id.trim(),
      );

      for (const tenant of validTenants) {
        try {
          roomAlias = await this.matrixRoomService.getRoomCanonicalAlias(
            room_id,
            tenant.id,
          );
          if (roomAlias) {
            this.logger.debug(
              `Found room ${room_id} in tenant ${tenant.id} with alias ${roomAlias}`,
            );
            owningTenantId = tenant.id;
            break;
          }
        } catch (error) {
          this.logger.debug(
            `Room ${room_id} not found in tenant ${tenant.id}: ${error.message}`,
          );
          continue;
        }
      }

      if (!roomAlias || !owningTenantId) {
        this.logger.warn(
          `No canonical alias found for room ${room_id} in any tenant`,
        );
        return;
      }

      // Parse room alias to get entity information
      const entityInfo = this.parseRoomAliasToEntityInfo(roomAlias);
      if (!entityInfo) {
        this.logger.warn(`Unable to parse room alias: ${roomAlias}`);
        return;
      }

      const { entityType, entitySlug, tenantId } = entityInfo;
      this.logger.debug(
        `Parsed room alias: type=${entityType}, slug=${entitySlug}, tenant=${tenantId}`,
      );

      // Verify parsed tenant ID matches the owning tenant ID
      if (tenantId !== owningTenantId) {
        this.logger.warn(
          `Tenant ID mismatch: alias says ${tenantId}, but room found in ${owningTenantId}`,
        );
      }

      if (entityType === 'event') {
        this.logger.log(
          `🚪 JOIN ATTEMPT: Processing event room join for ${sender} in ${entitySlug}`,
        );
        await this.handleEventJoinAttempt(
          sender,
          entitySlug,
          owningTenantId,
          room_id,
        );
      } else if (entityType === 'group') {
        this.logger.log(
          `🚪 JOIN ATTEMPT: Processing group room join for ${sender} in ${entitySlug}`,
        );
        await this.handleGroupJoinAttempt(
          sender,
          entitySlug,
          owningTenantId,
          room_id,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error handling join attempt: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Parse room alias to extract entity type, slug, and tenant ID
   * Reuses the same parsing logic used throughout the controller
   */
  private parseRoomAliasToEntityInfo(
    roomAlias: string,
  ): { entityType: string; entitySlug: string; tenantId: string } | null {
    try {
      // Reuse existing parsing logic from handleRoomAliasEvent
      const aliasWithoutHash = roomAlias.startsWith('#')
        ? roomAlias.substring(1)
        : roomAlias;
      const [localpart] = aliasWithoutHash.split(':');

      const parts = localpart.split('-');
      if (parts.length < 3) {
        return null;
      }

      const entityType = parts[0]; // 'event' or 'group'
      const tenantId = parts[parts.length - 1]; // Last part is tenant ID
      const entitySlug = parts.slice(1, -1).join('-'); // Everything between type and tenant

      return { entityType, entitySlug, tenantId };
    } catch (error) {
      this.logger.error(
        `Error parsing room alias ${roomAlias}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Handle join attempt for event rooms - check if user is confirmed attendee
   */
  private async handleEventJoinAttempt(
    senderMatrixId: string,
    eventSlug: string,
    tenantId: string,
    _roomId: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Checking event join attempt for ${senderMatrixId} in event ${eventSlug}`,
      );

      // Get the event
      const event = await this.eventQueryService.showEventBySlugWithTenant(
        eventSlug,
        tenantId,
      );
      if (!event) {
        this.logger.warn(`Event not found: ${eventSlug} in tenant ${tenantId}`);
        return;
      }

      // Extract Matrix handle from sender ID (@handle:server -> handle)
      const handleMatch = senderMatrixId.match(/^@([^:]+):/);
      if (!handleMatch) {
        this.logger.warn(`Invalid Matrix ID format: ${senderMatrixId}`);
        return;
      }
      const handle = handleMatch[1];

      // Get user by Matrix handle
      const matrixHandleRegistration =
        await this.globalMatrixValidationService.getUserByMatrixHandle(
          handle,
          tenantId,
        );

      if (!matrixHandleRegistration) {
        this.logger.debug(
          `Matrix handle ${handle} not registered in tenant ${tenantId}`,
        );
        return;
      }

      // Check if user is allowed to chat (confirmed, cancelled, or rejected attendees)
      const isAllowedToChat =
        await this.eventAttendeeQueryService.isUserAllowedToChat(
          event.id,
          matrixHandleRegistration.userId,
          tenantId,
        );

      if (isAllowedToChat) {
        this.logger.log(
          `User ${senderMatrixId} is allowed to chat, inviting to room`,
        );

        // Generate room alias for invitation (reuse existing format)
        const roomAlias = `#event-${eventSlug}-${tenantId}:${this.configService.get('matrix', { infer: true })?.serverName || 'matrix.openmeet.net'}`;

        // Send invitation via MatrixRoomService
        await this.matrixRoomService.inviteUser(roomAlias, senderMatrixId);

        this.logger.log(
          `Successfully invited ${senderMatrixId} to event room ${roomAlias}`,
        );

        // Immediately sync power levels for this user to ensure proper permissions
        try {
          this.logger.log(
            `🔄 POWER SYNC: Setting power levels for newly invited user ${senderMatrixId} in event ${eventSlug}`,
          );

          // Get room ID from alias for power level operations
          const actualRoomId =
            await this.matrixRoomService.resolveRoomAlias(roomAlias);

          // Trigger power level sync for the entire event to ensure consistency
          await this.syncEventPowerLevels(eventSlug, tenantId, actualRoomId);

          this.logger.log(
            `✅ POWER SYNC: Successfully updated power levels after inviting ${senderMatrixId}`,
          );
        } catch (powerLevelError) {
          // Don't fail the invitation if power level sync fails - log and continue
          this.logger.warn(
            `Failed to sync power levels after inviting ${senderMatrixId}: ${powerLevelError.message}`,
          );
        }
      } else {
        this.logger.debug(
          `User ${senderMatrixId} is not allowed to chat in event ${eventSlug}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error handling event join attempt: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Handle join attempt for group rooms - check if user is confirmed member
   */
  private async handleGroupJoinAttempt(
    senderMatrixId: string,
    groupSlug: string,
    tenantId: string,
    _roomId: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Checking group join attempt for ${senderMatrixId} in group ${groupSlug}`,
      );

      // Get the group
      const group = await this.getGroupBySlugWithTenant(groupSlug, tenantId);
      if (!group) {
        this.logger.warn(`Group not found: ${groupSlug} in tenant ${tenantId}`);
        return;
      }

      // Extract Matrix handle from sender ID (@handle:server -> handle)
      const handleMatch = senderMatrixId.match(/^@([^:]+):/);
      if (!handleMatch) {
        this.logger.warn(`Invalid Matrix ID format: ${senderMatrixId}`);
        return;
      }
      const handle = handleMatch[1];

      // Get user by Matrix handle
      const matrixHandleRegistration =
        await this.globalMatrixValidationService.getUserByMatrixHandle(
          handle,
          tenantId,
        );

      if (!matrixHandleRegistration) {
        this.logger.debug(
          `Matrix handle ${handle} not registered in tenant ${tenantId}`,
        );
        return;
      }

      this.logger.log(
        `Found Matrix handle registration for ${handle}: userId=${matrixHandleRegistration.userId}`,
      );

      this.logger.log(
        `Checking group membership: groupId=${group.id}, userId=${matrixHandleRegistration.userId}`,
      );

      const groupMember =
        await this.groupMemberQueryService.findGroupMemberByUserId(
          group.id,
          matrixHandleRegistration.userId,
          tenantId,
        );

      if (!groupMember) {
        this.logger.warn(
          `User ${senderMatrixId} (userId: ${matrixHandleRegistration.userId}) is not a member of group ${groupSlug} (groupId: ${group.id}) - access denied`,
        );
        return;
      }

      this.logger.log(
        `Found group membership: userId=${matrixHandleRegistration.userId}, groupId=${group.id}, role=${groupMember.groupRole.name}`,
      );

      // Check if user has a confirmed role (not guest)
      const allowedRoles = [
        GroupRole.Owner,
        GroupRole.Admin,
        GroupRole.Moderator,
        GroupRole.Member,
      ];

      if (!allowedRoles.includes(groupMember.groupRole.name as GroupRole)) {
        this.logger.debug(
          `User ${senderMatrixId} has role ${groupMember.groupRole.name}, not allowed to join group ${groupSlug}`,
        );
        return;
      }

      this.logger.log(
        `User ${senderMatrixId} is confirmed group member with role ${groupMember.groupRole.name}, inviting to room`,
      );

      // Generate room alias for invitation (reuse existing format)
      const roomAlias = `#group-${groupSlug}-${tenantId}:${this.configService.get('matrix', { infer: true })?.serverName || 'matrix.openmeet.net'}`;

      // Send invitation via MatrixRoomService
      await this.matrixRoomService.inviteUser(roomAlias, senderMatrixId);

      this.logger.log(
        `Successfully invited ${senderMatrixId} to group room ${roomAlias}`,
      );

      // Immediately sync power levels for this user to ensure proper permissions
      try {
        this.logger.log(
          `🔄 POWER SYNC: Setting power levels for newly invited user ${senderMatrixId} in group ${groupSlug}`,
        );

        // Get room ID from alias for power level operations
        const actualRoomId =
          await this.matrixRoomService.resolveRoomAlias(roomAlias);

        // Trigger power level sync for the entire group to ensure consistency
        await this.syncGroupPowerLevels(groupSlug, tenantId, actualRoomId);

        this.logger.log(
          `✅ POWER SYNC: Successfully updated power levels after inviting ${senderMatrixId}`,
        );
      } catch (powerLevelError) {
        // Don't fail the invitation if power level sync fails - log and continue
        this.logger.warn(
          `Failed to sync power levels after inviting ${senderMatrixId}: ${powerLevelError.message}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error handling group join attempt: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Configure a group room and invite all members
   */
  private async configureGroupRoom(
    roomId: string,
    groupSlug: string,
    tenantId: string,
    alias: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Configuring group room ${roomId} for group ${groupSlug} in tenant ${tenantId}`,
      );

      // Get group details using tenant connection
      const group = await this.getGroupBySlugWithTenant(groupSlug, tenantId);
      if (!group) {
        this.logger.warn(`Group not found: ${groupSlug} in tenant ${tenantId}`);
        return;
      }

      // Get the actual room ID - either from parameter or resolve from alias
      let actualRoomId = roomId;
      if (!actualRoomId) {
        this.logger.log(`Resolving room ID from alias: ${alias}`);
        try {
          // Use MatrixBotService to resolve the alias to room ID
          actualRoomId = await this.matrixRoomService.resolveRoomAlias(alias);
          this.logger.log(
            `Resolved alias ${alias} to room ID: ${actualRoomId}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to resolve room alias ${alias}: ${error.message}`,
          );
          return;
        }
      }

      // Safely update the group's matrixRoomId field with room existence verification
      if (actualRoomId) {
        let shouldUpdateDatabase = false;
        let updateReason = '';

        if (!group.matrixRoomId) {
          shouldUpdateDatabase = true;
          updateReason = 'group has no room ID';
        } else if (group.matrixRoomId === actualRoomId) {
          this.logger.debug(
            `Group ${group.id} already has correct matrixRoomId: ${actualRoomId}`,
          );
        } else {
          // Handle room conflict by verifying existing room exists
          const existingRoomExists =
            await this.matrixRoomService.verifyRoomExists(
              group.matrixRoomId,
              tenantId,
            );
          if (!existingRoomExists) {
            shouldUpdateDatabase = true;
            updateReason = `existing room ${group.matrixRoomId} no longer exists`;
          } else {
            this.logger.warn(
              `Room conflict: keeping existing room ${group.matrixRoomId} for group ${group.id}`,
            );
          }
        }

        if (shouldUpdateDatabase) {
          this.logger.log(
            `Updating group ${group.id} matrixRoomId to: ${actualRoomId} (${updateReason})`,
          );
          try {
            await this.groupService.updateMatrixRoomId(
              group.id,
              actualRoomId,
              tenantId,
            );
          } catch (error) {
            this.logger.error(
              `Failed to update group matrixRoomId: ${error.message}`,
            );
          }
        }
      }

      this.logger.log(
        `Room configured for group ${group.name} (${group.id}), room ID: ${actualRoomId}`,
      );

      // Get Matrix server name from tenant config
      const tenantConfig = getTenantConfig(tenantId);
      const serverName = tenantConfig?.matrixConfig?.serverName;
      if (!serverName) {
        this.logger.error(
          `Matrix server name not configured for tenant: ${tenantId}`,
        );
        return;
      }

      // Get all confirmed group members (excluding guests) using service layer
      let groupMembers: any[] = [];
      try {
        groupMembers =
          await this.groupMemberQueryService.getConfirmedGroupMembersForMatrix(
            group.id,
            tenantId,
          );
        this.logger.log(
          `Found ${groupMembers.length} confirmed group members for group ${groupSlug}`,
        );
      } catch (memberError) {
        this.logger.error(
          `Failed to retrieve group members for ${groupSlug}: ${memberError.message}`,
        );
        return; // Can't invite members if we can't retrieve them
      }

      let successCount = 0;
      let errorCount = 0;

      // Invite each confirmed group member to the Matrix room
      for (const groupMember of groupMembers) {
        try {
          // Get user's Matrix handle
          const matrixHandleRegistration =
            await this.globalMatrixValidationService.getMatrixHandleForUser(
              groupMember.user.id,
              tenantId,
            );
          if (!matrixHandleRegistration) {
            this.logger.debug(
              `User ${groupMember.user.slug} has no Matrix handle, skipping`,
            );
            continue;
          }

          // Get user's Matrix ID from their handle
          const userMatrixId = `@${matrixHandleRegistration.handle}:${serverName}`;

          this.logger.debug(
            `Inviting group member ${userMatrixId} (${groupMember.groupRole.name}) to room ${alias}`,
          );

          // Invite user to the Matrix room using room alias
          await this.matrixRoomService.inviteUser(alias, userMatrixId);
          successCount++;

          this.logger.debug(
            `Successfully invited group member ${userMatrixId} to room ${alias}`,
          );
        } catch (error) {
          errorCount++;
          this.logger.error(
            `Failed to invite group member ${groupMember.user.slug} to Matrix room: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `Group room invitation completed: ${successCount} users invited, ${errorCount} errors`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to configure group room: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Handle user activity in Matrix rooms - sync power levels based on OpenMeet roles
   * Triggered by m.room.message events when users are active
   */
  private async handleUserActivity(event: any): Promise<void> {
    try {
      const { sender, room_id } = event;

      // Skip bot messages to avoid recursive sync
      if (sender.includes('openmeet-bot')) {
        this.logger.debug(
          `Skipping bot message from ${sender} in room ${room_id}`,
        );
        return;
      }

      this.logger.log(
        `🔄 POWER SYNC: Handling user activity: ${sender} in room ${room_id}`,
      );

      // Find which tenant owns this room
      const tenants = fetchTenants();
      let roomAlias: string | null = null;
      let owningTenantId: string | null = null;

      const validTenants = tenants.filter(
        (tenant) => tenant && tenant.id && tenant.id.trim(),
      );

      for (const tenant of validTenants) {
        try {
          roomAlias = await this.matrixRoomService.getRoomCanonicalAlias(
            room_id,
            tenant.id,
          );
          if (roomAlias) {
            owningTenantId = tenant.id;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!roomAlias || !owningTenantId) {
        this.logger.log(
          `🔄 POWER SYNC: No alias found for room ${room_id} - skipping sync`,
        );
        return;
      }

      this.logger.log(
        `🔄 POWER SYNC: Found room alias ${roomAlias} for tenant ${owningTenantId}`,
      );

      // Parse room alias to get entity information
      const entityInfo = this.parseRoomAliasToEntityInfo(roomAlias);
      if (!entityInfo) {
        this.logger.debug(`Unable to parse room alias: ${roomAlias}`);
        return;
      }

      this.logger.log(
        `🔄 POWER SYNC: Syncing power levels for ${entityInfo.entityType} ${entityInfo.entitySlug} after user activity`,
      );

      // Sync power levels based on room type
      switch (entityInfo.entityType) {
        case 'event':
          await this.syncEventPowerLevels(
            entityInfo.entitySlug,
            entityInfo.tenantId,
            room_id,
          );
          break;
        case 'group':
          await this.syncGroupPowerLevels(
            entityInfo.entitySlug,
            entityInfo.tenantId,
            room_id,
          );
          break;
        case 'dm':
          await this.syncDMPowerLevels(
            entityInfo.entitySlug,
            entityInfo.tenantId,
            room_id,
          );
          break;
        default:
          this.logger.debug(`Unknown room type: ${entityInfo.entityType}`);
      }
    } catch (error) {
      this.logger.error(
        `Error handling user activity for power level sync: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Sync Matrix power levels for event rooms based on OpenMeet attendee roles
   */
  private async syncEventPowerLevels(
    eventSlug: string,
    tenantId: string,
    roomId: string,
  ): Promise<void> {
    try {
      // Get the event
      const event = await this.eventQueryService.showEventBySlugWithTenant(
        eventSlug,
        tenantId,
      );

      if (!event) {
        this.logger.debug(
          `Event not found: ${eventSlug} in tenant ${tenantId}`,
        );
        return;
      }

      // Get all confirmed attendees with their roles
      this.logger.log(
        `🔄 POWER SYNC: Getting confirmed attendees for event ${eventSlug} (ID: ${event.id}) in tenant ${tenantId}`,
      );
      const confirmedAttendees =
        await this.eventAttendeeQueryService.showConfirmedEventAttendeesByEventId(
          event.id,
          tenantId,
        );

      this.logger.log(
        `🔄 POWER SYNC: Found ${confirmedAttendees.length} confirmed attendees for event ${eventSlug}`,
      );

      if (confirmedAttendees.length === 0) {
        this.logger.debug(
          `No confirmed attendees for event ${eventSlug} - skipping power level sync`,
        );
        return;
      }

      const powerLevelsMap = await this.buildEventPowerLevelsMap(
        confirmedAttendees,
        tenantId,
      );
      await this.applyPowerLevels(
        roomId,
        powerLevelsMap,
        tenantId,
        `event ${eventSlug}`,
      );
    } catch (error) {
      this.logger.error(
        `Error syncing event power levels: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Sync Matrix power levels for group rooms based on OpenMeet member roles
   */
  private async syncGroupPowerLevels(
    groupSlug: string,
    tenantId: string,
    roomId: string,
  ): Promise<void> {
    try {
      // Get the group
      const group = await this.getGroupBySlugWithTenant(groupSlug, tenantId);
      if (!group) {
        this.logger.debug(
          `Group not found: ${groupSlug} in tenant ${tenantId}`,
        );
        return;
      }

      // Get all confirmed group members
      const confirmedMembers =
        await this.groupMemberQueryService.getConfirmedGroupMembersForMatrix(
          group.id,
          tenantId,
        );

      if (confirmedMembers.length === 0) {
        this.logger.debug(
          `No confirmed members for group ${groupSlug} - skipping power level sync`,
        );
        return;
      }

      const powerLevelsMap = await this.buildGroupPowerLevelsMap(
        confirmedMembers,
        tenantId,
      );
      await this.applyPowerLevels(
        roomId,
        powerLevelsMap,
        tenantId,
        `group ${groupSlug}`,
      );
    } catch (error) {
      this.logger.error(
        `Error syncing group power levels: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Sync Matrix power levels for DM rooms (equal power levels for both users)
   */
  private async syncDMPowerLevels(
    dmIdentifier: string,
    tenantId: string,
    roomId: string,
  ): Promise<void> {
    try {
      // Parse DM identifier: user1Handle-user2Handle
      const userHandles = dmIdentifier.split('-');
      if (userHandles.length !== 2) {
        this.logger.warn(`Invalid DM identifier format: ${dmIdentifier}`);
        return;
      }

      const powerLevelsMap = await this.buildDMPowerLevelsMap(
        userHandles,
        tenantId,
      );
      await this.applyPowerLevels(
        roomId,
        powerLevelsMap,
        tenantId,
        `DM ${dmIdentifier}`,
      );
    } catch (error) {
      this.logger.error(
        `Error syncing DM power levels: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Build power levels map for event attendees
   */
  private async buildEventPowerLevelsMap(
    attendees: any[],
    tenantId: string,
  ): Promise<Record<string, number>> {
    const powerLevelsMap: Record<string, number> = {};
    const serverName = await this.getMatrixServerName(tenantId);
    if (!serverName) return powerLevelsMap;

    for (const attendee of attendees) {
      try {
        this.logger.log(
          `🔄 POWER SYNC: Processing attendee ${attendee.user.slug} (ID: ${attendee.user.id}) with role: ${attendee.role?.name || 'unknown'}`,
        );

        const matrixHandleRegistration =
          await this.globalMatrixValidationService.getMatrixHandleForUser(
            attendee.user.id,
            tenantId,
          );

        if (!matrixHandleRegistration) {
          this.logger.warn(
            `🔄 POWER SYNC: No Matrix handle found for user ${attendee.user.slug} (ID: ${attendee.user.id}) - skipping power level assignment`,
          );
          continue;
        }

        const userMatrixId = `@${matrixHandleRegistration.handle}:${serverName}`;

        // Map OpenMeet attendee roles to Matrix power levels
        let powerLevel = 0;
        const roleName = attendee.role?.name || 'unknown';
        this.logger.log(
          `🔄 POWER SYNC: Found Matrix handle for ${attendee.user.slug}: ${userMatrixId}, role: ${roleName}`,
        );

        switch (roleName) {
          case 'host':
            powerLevel = 100; // Admin level
            break;
          case 'moderator':
            powerLevel = 50; // Moderator level
            break;
          case 'speaker':
            powerLevel = 25; // Elevated participant
            break;
          case 'participant':
          case 'guest':
          default:
            powerLevel = 0; // Regular user
            break;
        }

        powerLevelsMap[userMatrixId] = powerLevel;
        this.logger.log(
          `🔄 POWER SYNC: Assigned power level ${powerLevel} to ${attendee.user.slug} (${userMatrixId})`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to process attendee ${attendee.user.slug}: ${error.message}`,
        );
      }
    }

    return powerLevelsMap;
  }

  /**
   * Build power levels map for group members
   */
  private async buildGroupPowerLevelsMap(
    members: any[],
    tenantId: string,
  ): Promise<Record<string, number>> {
    const powerLevelsMap: Record<string, number> = {};
    const serverName = await this.getMatrixServerName(tenantId);
    if (!serverName) return powerLevelsMap;

    for (const member of members) {
      try {
        const matrixHandleRegistration =
          await this.globalMatrixValidationService.getMatrixHandleForUser(
            member.user.id,
            tenantId,
          );

        if (!matrixHandleRegistration) continue;

        const userMatrixId = `@${matrixHandleRegistration.handle}:${serverName}`;

        // Map OpenMeet group roles to Matrix power levels
        let powerLevel = 0;
        switch (member.groupRole.name) {
          case GroupRole.Owner:
            powerLevel = 100; // Admin level
            break;
          case GroupRole.Admin:
            powerLevel = 75; // High moderator level
            break;
          case GroupRole.Moderator:
            powerLevel = 50; // Standard moderator level
            break;
          case GroupRole.Member:
          default:
            powerLevel = 0; // Regular user
            break;
        }

        powerLevelsMap[userMatrixId] = powerLevel;
      } catch (error) {
        this.logger.warn(
          `Failed to process group member ${member.user.slug}: ${error.message}`,
        );
      }
    }

    return powerLevelsMap;
  }

  /**
   * Build power levels map for DM rooms (equal power for both users)
   */
  private async buildDMPowerLevelsMap(
    userHandles: string[],
    tenantId: string,
  ): Promise<Record<string, number>> {
    const powerLevelsMap: Record<string, number> = {};
    const serverName = await this.getMatrixServerName(tenantId);
    if (!serverName) return powerLevelsMap;

    // Both users get equal power in DMs (moderator level for room management)
    for (const handle of userHandles) {
      const userMatrixId = `@${handle}:${serverName}`;
      powerLevelsMap[userMatrixId] = 50; // Both users can moderate their DM
    }

    return powerLevelsMap;
  }

  /**
   * Apply power levels to Matrix room with bot admin access
   */
  private async applyPowerLevels(
    roomId: string,
    powerLevelsMap: Record<string, number>,
    tenantId: string,
    roomDescription: string,
  ): Promise<void> {
    try {
      // Add bot with admin level
      const botUserId = await this.getBotUserIdForTenant(tenantId);
      if (botUserId) {
        powerLevelsMap[botUserId] = 100;
      }

      // Apply power levels to Matrix room
      await this.matrixRoomService.setRoomPowerLevels(
        roomId,
        powerLevelsMap,
        tenantId,
      );

      this.logger.log(
        `Successfully synced power levels for ${roomDescription}: ${Object.keys(powerLevelsMap).length} users`,
      );
    } catch (error) {
      this.logger.error(
        `Error applying power levels for ${roomDescription}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Get Matrix server name for a tenant
   */
  private getMatrixServerName(tenantId: string): string | null {
    try {
      const tenantConfig = getTenantConfig(tenantId);
      return tenantConfig?.matrixConfig?.serverName || null;
    } catch (error) {
      this.logger.error(
        `Error getting Matrix server name for tenant ${tenantId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Get the bot user ID for a tenant
   */
  private async getBotUserIdForTenant(
    tenantId: string,
  ): Promise<string | null> {
    try {
      const serverName = await this.getMatrixServerName(tenantId);
      if (!serverName) return null;

      // Use AppService bot for power level operations (no tenant suffix)
      const appServiceId = this.configService.get('matrix', { infer: true })
        ?.appservice?.id;
      if (!appServiceId) return null;

      // Return AppService bot user ID to match MatrixBotService (simplified)
      return `@${appServiceId}:${serverName}`;
    } catch (error) {
      this.logger.error(
        `Error getting bot user ID for tenant ${tenantId}: ${error.message}`,
      );
      return null;
    }
  }

  // Debug endpoint to catch any unmatched requests - MUST BE LAST
  @Get('*')
  catchAllGet(@Param() params: any, @Headers() headers: any) {
    this.logger.log(
      `🔍 APPSERVICE DEBUG: Received GET request to ${params[0]} with headers: ${JSON.stringify(Object.keys(headers))}`,
    );
    return { debug: 'appservice is receiving requests' };
  }
}

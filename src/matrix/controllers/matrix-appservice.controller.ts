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
// Chat services removed - Matrix Application Service handles room operations directly
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupService } from '../../group/group.service';
import { MatrixRoomService } from '../services/matrix-room.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { GroupEntity } from '../../group/infrastructure/persistence/relational/entities/group.entity';
// import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity'; // Currently not used
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { GlobalMatrixValidationService } from '../services/global-matrix-validation.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { GroupRoleService } from '../../group-role/group-role.service';
import { GroupRole, GroupVisibility } from '../../core/constants/constant';
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
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly eventManagementService: EventManagementService,
    private readonly globalMatrixValidationService: GlobalMatrixValidationService,
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
    this.logger.debug(`Query user request for: ${userId}`);

    // Validate authorization token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        `Invalid authorization header format for user query: ${userId}`,
      );
      return { error: 'Invalid token' };
    }

    const token = authHeader.replace('Bearer ', '');
    if (token !== this.homeserverToken) {
      this.logger.warn(`Invalid token for user query: ${userId}`);
      return { error: 'Invalid token' };
    }

    // Accept all users - anyone can chat in our rooms
    this.logger.log(`Accepting user: ${userId}`);
    return {}; // Empty response = success
  }

  @Get('rooms/:roomAlias')
  async queryRoom(
    @Param('roomAlias') roomAlias: string,
    @Headers('authorization') authHeader: string,
  ) {
    return this.handleRoomQueryWithAuth(roomAlias, authHeader);
  }

  // Matrix standard App Services API path
  @Get('_matrix/app/v1/rooms/:roomAlias')
  async queryRoomStandard(
    @Param('roomAlias') roomAlias: string,
    @Headers('authorization') authHeader: string,
  ) {
    return this.handleRoomQueryWithAuth(roomAlias, authHeader);
  }

  private async handleRoomQueryWithAuth(roomAlias: string, authHeader: string) {
    this.logger.debug(`Query room request for: ${roomAlias}`);

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
    this.logger.debug(`Transaction ${txnId} with ${events.length} events`);

    // Validate authorization token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        `Invalid authorization header format for transaction: ${txnId}`,
      );
      return { error: 'Invalid token' };
    }

    const token = authHeader.replace('Bearer ', '');
    if (token !== this.homeserverToken) {
      this.logger.warn(`Invalid token for transaction: ${txnId}`);
      return { error: 'Invalid token' };
    }

    // Process events
    for (const event of events) {
      this.logger.log(`Processing event: ${event.type} from ${event.sender}`);

      // Handle different event types
      switch (event.type) {
        case 'm.room.message':
          this.logger.debug(`Message event: ${event.content?.body}`);
          break;
        case 'm.room.member':
          this.logger.debug(`Member event: ${event.content?.membership}`);
          if (
            event.content?.membership === 'join' &&
            event.sender === event.state_key
          ) {
            // User attempting to join - check if they need invitation
            await this.handleJoinAttempt(event);
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

  /**
   * Handle Matrix-native room queries and create rooms on-demand
   * This implements the Application Service room provisioning pattern
   */
  private async handleRoomQuery(roomAlias: string): Promise<any> {
    this.logger.log(`Processing Matrix-native room query: ${roomAlias}`);

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
        const roomOptions = {
          room_alias_name: localpart, // Use localpart for room alias
          name: `${event.name} Chat`,
          topic: `Chat room for ${event.name}`,
          isPublic: true, // This will set preset to PublicChat in MatrixRoomService
        };

        const roomResult = await this.matrixRoomService.createRoom(
          roomOptions,
          tenantId,
        );
        this.logger.log(
          `Matrix room created successfully: ${roomResult.roomId} with alias ${roomAlias}`,
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
   * Helper method to create a tenant-aware GroupMemberService instance
   * Bypasses REQUEST-scoped dependency by creating a mock request with tenantId
   */
  private createTenantAwareGroupMemberService(
    tenantId: string,
  ): GroupMemberService {
    // Create a mock request object with the tenant ID
    const mockRequest = { tenantId };

    // Create a new instance of GroupMemberService with the mock request
    const tenantAwareService = new GroupMemberService(
      mockRequest,
      this.tenantConnectionService,
      this.groupRoleService,
    );

    return tenantAwareService;
  }

  /**
   * Handle group room queries and create room if group exists
   */
  private async handleGroupRoomQuery(localpart: string): Promise<any> {
    try {
      // Parse: group-{slug}-{tenantId}
      const parts = localpart.split('-');
      if (parts.length < 3 || parts[0] !== 'group') {
        this.logger.warn(`Invalid group room alias format: ${localpart}`);
        return { error: 'Room not found' };
      }

      // Extract tenant ID (last part) and group slug (everything between group- and -{tenantId})
      const tenantId = parts[parts.length - 1];
      const groupSlug = parts.slice(1, -1).join('-');

      this.logger.log(
        `Checking if group exists: ${groupSlug} in tenant ${tenantId}`,
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
        const roomOptions = {
          room_alias_name: localpart, // Use localpart for room alias
          name: `${group.name} Chat`,
          topic: `Chat room for ${group.name}`,
          isPublic: group.visibility === GroupVisibility.Public, // Use proper boolean for MatrixRoomService
        };

        const roomResult = await this.matrixRoomService.createRoom(
          roomOptions,
          tenantId,
        );
        this.logger.log(
          `Matrix room created successfully: ${roomResult.roomId} with alias ${roomAlias}`,
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
        const roomOptions = {
          room_alias_name: localpart, // Use localpart for room alias
          name: `${user1Handle} and ${user2Handle}`, // Optional, clients often hide this
          topic: `Direct message between ${user1Handle} and ${user2Handle}`,
          isDirect: true, // Key parameter for DM rooms
          isPublic: false, // DMs are always private
          encrypted: true, // Enable encryption for privacy
          inviteUserIds: [user1MatrixId, user2MatrixId],
        };

        const roomResult = await this.matrixRoomService.createRoom(
          roomOptions,
          tenantId,
        );
        this.logger.log(
          `Matrix DM room created successfully: ${roomResult.roomId} with alias ${roomAlias}`,
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
        await this.eventAttendeeService.showConfirmedEventAttendeesByEventId(
          event.id,
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
      this.logger.log(`Join attempt by ${sender} in room ${room_id}`);

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
        await this.handleEventJoinAttempt(
          sender,
          entitySlug,
          owningTenantId,
          room_id,
        );
      } else if (entityType === 'group') {
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
        await this.eventAttendeeService.isUserAllowedToChat(
          event.id,
          matrixHandleRegistration.userId,
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

      // Check if user is a confirmed group member (not guest)
      const groupMemberService =
        this.createTenantAwareGroupMemberService(tenantId);
      const groupMember = await groupMemberService.findGroupMemberByUserId(
        group.id,
        matrixHandleRegistration.userId,
      );

      if (!groupMember) {
        this.logger.debug(
          `User ${senderMatrixId} is not a member of group ${groupSlug}`,
        );
        return;
      }

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

      this.logger.log(`Room configured for group ${group.name} (${group.id})`);

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
        const groupMemberService =
          this.createTenantAwareGroupMemberService(tenantId);
        groupMembers =
          await groupMemberService.getConfirmedGroupMembersForMatrix(group.id);
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

      // Update the group's matrixRoomId field in the database if we have the room ID
      if (roomId && group.matrixRoomId !== roomId) {
        this.logger.log(
          `Updating group ${group.id} matrixRoomId to: ${roomId}`,
        );
        try {
          // Update group's matrixRoomId using direct repository access (similar to event pattern)
          const dataSource =
            await this.tenantConnectionService.getTenantConnection(tenantId);
          const groupRepository = dataSource.getRepository(GroupEntity);
          await groupRepository.update(group.id, { matrixRoomId: roomId });
          this.logger.log(
            `Successfully updated group ${group.id} matrixRoomId`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to update group matrixRoomId: ${error.message}`,
          );
        }
      } else if (roomId) {
        this.logger.log(
          `Group ${group.id} already has correct matrixRoomId: ${roomId}`,
        );
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
}

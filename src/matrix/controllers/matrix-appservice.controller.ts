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
import { getTenantConfig } from '../../utils/tenant-config';

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
          // Note: Matrix Application Service handles room membership automatically
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
          isPublic: group.isPublic, // Use proper boolean for MatrixRoomService
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
            `Matrix room already exists for alias ${roomAlias} - returning success`,
          );
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

      // TODO: Get all group members - we need to implement this
      this.logger.log(
        `TODO: Get group members for group ${groupSlug} and invite to room ${alias}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to configure group room: ${error.message}`,
        error.stack,
      );
    }
  }
}

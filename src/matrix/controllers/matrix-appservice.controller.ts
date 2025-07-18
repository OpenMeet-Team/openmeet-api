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
import { UserRoomSyncService } from '../../chat/services/user-room-sync.service';
import { ChatRoomService } from '../../chat/rooms/chat-room.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupService } from '../../group/group.service';

@ApiTags('Matrix Application Service')
@TenantPublic()
@Controller('matrix/appservice')
export class MatrixAppServiceController {
  private readonly logger = new Logger(MatrixAppServiceController.name);

  private readonly appServiceToken: string;
  private readonly homeserverToken: string;

  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly userRoomSyncService: UserRoomSyncService,
    private readonly chatRoomService: ChatRoomService,
    private readonly eventQueryService: EventQueryService,
    private readonly groupService: GroupService,
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

    // For now, accept all users in our namespace
    if (userId.includes('openmeet-bot-') || userId.includes('openmeet-')) {
      this.logger.log(`Accepting user: ${userId}`);
      return {}; // Empty response = success
    }

    this.logger.warn(`Rejecting user outside namespace: ${userId}`);
    return { error: 'User not in namespace' };
  }

  @Get('rooms/:roomAlias')
  async queryRoom(
    @Param('roomAlias') roomAlias: string,
    @Headers('authorization') authHeader: string,
  ) {
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
  handleTransaction(
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
          // Trigger room sync for user login events (non-blocking)
          this.userRoomSyncService.handleMemberEvent(event).catch((error) => {
            this.logger.error(
              `Failed to handle member event: ${error.message}`,
              error.stack,
            );
          });
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
      const aliasWithoutHash = roomAlias.startsWith('#') ? roomAlias.substring(1) : roomAlias;
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
      this.logger.error(`Error handling room query for ${roomAlias}: ${error.message}`);
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
      
      this.logger.log(`Checking if event exists: ${eventSlug} in tenant ${tenantId}`);

      // Check if event exists in the business logic
      const event = await this.eventQueryService.findEventBySlug(eventSlug);
      if (!event) {
        this.logger.log(`Event not found: ${eventSlug}`);
        return { error: 'Room not found' };
      }

      this.logger.log(`Event exists: ${eventSlug} (ID: ${event.id}), creating Matrix room`);

      // Create the room using the chat room service
      const chatRoom = await this.chatRoomService.createEventChatRoomWithTenant(
        event.id,
        event.user.id, // Use event creator as room creator
        tenantId
      );

      this.logger.log(`Matrix room created for event ${eventSlug}: ${chatRoom.matrixRoomId}`);

      // Return success response with room ID
      return {
        room_id: chatRoom.matrixRoomId,
        room_alias: `#${localpart}:${this.configService.get('matrix', { infer: true })?.serverName || 'matrix.openmeet.net'}`
      };

    } catch (error) {
      this.logger.error(`Error creating event room: ${error.message}`);
      return { error: 'Room not found' };
    }
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
      
      this.logger.log(`Checking if group exists: ${groupSlug} in tenant ${tenantId}`);

      // Check if group exists in the business logic
      const group = await this.groupService.getGroupBySlug(groupSlug);
      if (!group) {
        this.logger.log(`Group not found: ${groupSlug}`);
        return { error: 'Room not found' };
      }

      this.logger.log(`Group exists: ${groupSlug} (ID: ${group.id}), creating Matrix room`);

      // Create the room using the chat room service
      const chatRoom = await this.chatRoomService.createGroupChatRoom(
        group.id,
        group.createdBy.id // Use group creator as room creator
      );

      this.logger.log(`Matrix room created for group ${groupSlug}: ${chatRoom.matrixRoomId}`);

      // Return success response with room ID
      return {
        room_id: chatRoom.matrixRoomId,
        room_alias: `#${localpart}:${this.configService.get('matrix', { infer: true })?.serverName || 'matrix.openmeet.net'}`
      };

    } catch (error) {
      this.logger.error(`Error creating group room: ${error.message}`);
      return { error: 'Room not found' };
    }
  }
}

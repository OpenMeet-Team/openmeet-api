import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Logger,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';
import { JWTAuthGuard } from '../auth/auth.guard';
import { OptionalJWTAuthGuard } from '../calendar-feed/optional-auth.guard';
import { VisibilityGuard } from '../shared/guard/visibility.guard';
import { Public } from '../auth/decorators/public.decorator';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { Optional } from '@nestjs/common';
import { DiscussionService } from './services/discussion.service';
import { ChatRoomService } from './rooms/chat-room.service';
import { DiscussionMessagesResponseDto } from './dto/discussion-message.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleEnum } from '../role/role.enum';
import { RolesGuard } from '../role/role.guard';

@ApiTags('Chat')
@Controller('chat')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly discussionService: DiscussionService,
    private readonly chatRoomService: ChatRoomService,
  ) {}

  /**
   * Event discussion endpoints
   */
  @Post('event/:slug/message')
  @ApiOperation({
    summary: 'Send a message to an event discussion',
    deprecated: true,
    description:
      'This endpoint has been deprecated. Use Matrix SDK directly for messaging.',
  })
  sendEventMessage(
    @Param('slug') _slug: string,
    @Body() _body: { message: string },
    @AuthUser() _user: User,
  ): { error: string; message: string } {
    return {
      error: 'DEPRECATED_ENDPOINT',
      message:
        'Message sending has been moved to frontend Matrix client. Use Matrix SDK directly for real-time messaging.',
    };
  }

  @Get('event/:slug/messages')
  @ApiOperation({
    summary: 'Get messages from an event discussion',
    deprecated: true,
    description:
      'This endpoint has been deprecated. Use Matrix SDK directly for messaging.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deprecated endpoint - use Matrix SDK for messaging',
  })
  getEventMessages(
    @Param('slug') _slug: string,
    @AuthUser() _user: User,
    @Query('limit') _limit?: number,
    @Query('from') _from?: string,
  ): { error: string; message: string } {
    return {
      error: 'DEPRECATED_ENDPOINT',
      message:
        'Message retrieval has been moved to frontend Matrix client. Use Matrix SDK directly for real-time messaging.',
    };
  }

  @Post('event/:slug/join')
  @ApiOperation({
    summary: 'Join an event chat room with appropriate permissions',
  })
  async joinEventChatRoom(
    @Param('slug') eventSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{ success: boolean; roomId?: string; message?: string }> {
    const tenantId = request.tenantId;
    this.logger.log(
      `User ${user.id} attempting to join event chat room for ${eventSlug} in tenant ${tenantId}`,
    );

    try {
      // Use ChatRoomService which supports bot authentication
      await this.chatRoomService.addUserToEventChatRoom(eventSlug, user.slug);

      // Get the room ID from the event
      const result = await this.chatRoomService.ensureRoomAccess(
        'event',
        eventSlug,
        user.slug,
        tenantId,
      );

      this.logger.log(
        `Successfully joined event chat room for ${eventSlug}, with Matrix room ID: ${result.roomId || 'unknown'}`,
      );

      return {
        success: result.success,
        roomId: result.roomId,
        message: result.message,
      };
    } catch (error) {
      this.logger.error(
        `Error joining event chat room for ${eventSlug}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        message: `Could not join chat room: ${error.message}`,
      };
    }
  }

  @Post('event/:slug/members/:userSlug')
  @ApiOperation({ summary: 'Add a member to the event chat room' })
  async addMemberToEventDiscussion(
    @Param('slug') eventSlug: string,
    @Param('userSlug') userSlug: string,
    @AuthUser() _user: User, // Prefix with underscore to indicate unused parameter
  ): Promise<{
    success: boolean;
    roomId?: string;
    message?: string;
  }> {
    try {
      const roomInfo =
        await this.discussionService.addMemberToEventDiscussionBySlugAndGetRoomId(
          eventSlug,
          userSlug,
        );

      return {
        success: true,
        roomId: roomInfo.roomId,
        message: 'Member added to event discussion successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error adding member to event discussion: ${error.message}`,
      );
      // Return a minimal success response to avoid breaking the frontend
      return {
        success: false,
        message: error.message || 'Failed to add member to event discussion',
      };
    }
  }

  @Delete('event/:slug/members/:userSlug')
  @ApiOperation({ summary: 'Remove a member from the event chat room' })
  async removeMemberFromEventDiscussion(
    @Param('slug') eventSlug: string,
    @Param('userSlug') userSlug: string,
    @AuthUser() _user: User, // Auth required but not used directly
  ): Promise<void> {
    return await this.discussionService.removeMemberFromEventDiscussionBySlug(
      eventSlug,
      userSlug,
    );
  }

  /**
   * Group discussion endpoints (placeholders for future implementation)
   */
  @Post('group/:slug/message')
  @ApiOperation({
    summary: 'Send a message to a group discussion',
    deprecated: true,
    description:
      'This endpoint has been deprecated. Use Matrix SDK directly for messaging.',
  })
  sendGroupMessage(
    @Param('slug') _slug: string,
    @Body() _body: { message: string },
    @AuthUser() _user: User,
    @Req() _request: any,
  ): { error: string; message: string } {
    return {
      error: 'DEPRECATED_ENDPOINT',
      message:
        'Message sending has been moved to frontend Matrix client. Use Matrix SDK directly for real-time messaging.',
    };
  }

  @Public()
  @UseGuards(OptionalJWTAuthGuard, VisibilityGuard)
  @Get('group/:slug/messages')
  @ApiOperation({
    summary: 'Get messages from a group discussion',
    deprecated: true,
    description:
      'This endpoint has been deprecated. Use Matrix SDK directly for messaging.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deprecated endpoint - use Matrix SDK for messaging',
  })
  getGroupMessages(
    @Param('slug') _slug: string,
    @Req() _request: any,
    @Query('limit') _limit?: number,
    @Query('from') _from?: string,
    @Optional() @AuthUser() _user?: User,
  ): { error: string; message: string } {
    return {
      error: 'DEPRECATED_ENDPOINT',
      message:
        'Message retrieval has been moved to frontend Matrix client. Use Matrix SDK directly for real-time messaging.',
    };
  }

  @Post('group/:slug/join')
  @ApiOperation({
    summary: 'Join a group chat room with appropriate permissions',
  })
  async joinGroupChatRoom(
    @Param('slug') groupSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{ success: boolean; roomId?: string; message?: string }> {
    this.logger.log(
      `User ${user.id} attempting to join group chat room for ${groupSlug}`,
    );

    // Pass the tenant ID explicitly from the request
    const tenantId = request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    try {
      // Use ChatRoomService which supports bot authentication
      await this.chatRoomService.addUserToGroupChatRoom(groupSlug, user.slug);

      // Get the room ID from the group
      const result = await this.chatRoomService.ensureRoomAccess(
        'group',
        groupSlug,
        user.slug,
        tenantId,
      );

      return {
        success: result.success,
        roomId: result.roomId,
        message: result.message,
      };
    } catch (error) {
      this.logger.error(
        `Error joining group chat room for ${groupSlug}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        message: `Could not join chat room: ${error.message}`,
      };
    }
  }

  @Post('group/:slug/members/:userSlug')
  @ApiOperation({ summary: 'Add a member to the group chat room' })
  async addMemberToGroupDiscussion(
    @Param('slug') groupSlug: string,
    @Param('userSlug') userSlug: string,
    @AuthUser() _user: User, // Auth required but not used directly
    @Req() request: any,
  ): Promise<void> {
    // Pass the tenant ID explicitly from the request
    const tenantId = request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    return await this.discussionService.addMemberToGroupDiscussionBySlug(
      groupSlug,
      userSlug,
      tenantId, // Pass tenant ID explicitly
    );
  }

  @Delete('group/:slug/members/:userSlug')
  @ApiOperation({ summary: 'Remove a member from the group chat room' })
  async removeMemberFromGroupDiscussion(
    @Param('slug') groupSlug: string,
    @Param('userSlug') userSlug: string,
    @AuthUser() _user: User, // Auth required but not used directly
    @Req() request: any,
  ): Promise<void> {
    // Pass the tenant ID explicitly from the request
    const tenantId = request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    return await this.discussionService.removeMemberFromGroupDiscussionBySlug(
      groupSlug,
      userSlug,
      tenantId, // Pass tenant ID explicitly
    );
  }

  /**
   * Direct message endpoints (placeholders for future implementation)
   */
  @Post('direct/:recipientId/message')
  @ApiOperation({ summary: 'Send a direct message to a user' })
  async sendDirectMessage(
    @Param('recipientId') recipientId: number,
    @Body() body: { message: string },
    @AuthUser() user: User,
  ): Promise<{ id: string }> {
    return await this.discussionService.sendDirectMessage(
      recipientId,
      user.id,
      body,
    );
  }

  @Get('direct/:userId/messages')
  @ApiOperation({ summary: 'Get direct messages between users' })
  @ApiResponse({
    status: 200,
    description: 'Direct messages between users',
    type: DiscussionMessagesResponseDto,
  })
  async getDirectMessages(
    @Param('userId') otherUserId: number,
    @AuthUser() user: User,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
  ): Promise<DiscussionMessagesResponseDto> {
    return await this.discussionService.getDirectMessages(
      user.id,
      otherUserId,
      limit,
      from,
    );
  }

  /**
   * Admin endpoints for chat room management
   */
  @Delete('admin/event/:slug/chatroom')
  @UseGuards(JWTAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin)
  @ApiOperation({ summary: 'Delete an event chat room (admin only)' })
  async deleteEventChatRoom(
    @Param('slug') eventSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{ success: boolean; message?: string }> {
    const tenantId = request.tenantId;
    this.logger.log(
      `Admin user ${user.id} attempting to delete event chat room for ${eventSlug} in tenant ${tenantId}`,
    );

    try {
      await this.discussionService.deleteEventChatRoom(eventSlug, tenantId);

      this.logger.log(`Successfully deleted event chat room for ${eventSlug}`);

      return {
        success: true,
        message: 'Chat room deleted successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error deleting event chat room for ${eventSlug}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        message: `Could not delete chat room: ${error.message}`,
      };
    }
  }

  @Post('admin/event/:slug/chatroom')
  @UseGuards(JWTAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin)
  @ApiOperation({ summary: 'Create a new event chat room (admin only)' })
  async createEventChatRoom(
    @Param('slug') eventSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{ success: boolean; roomId?: string; message?: string }> {
    const tenantId = request.tenantId;
    this.logger.log(
      `Admin user ${user.id} attempting to create event chat room for ${eventSlug} in tenant ${tenantId}`,
    );

    try {
      const result = await this.chatRoomService.ensureRoomAccess(
        'event',
        eventSlug,
        user.slug,
        tenantId,
      );

      this.logger.log(
        `Successfully created event chat room for ${eventSlug}, with Matrix room ID: ${result.roomId || 'unknown'}`,
      );

      return {
        success: result.success,
        roomId: result.roomId,
        message: result.message || 'Chat room created successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error creating event chat room for ${eventSlug}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        message: `Could not create chat room: ${error.message}`,
      };
    }
  }

  @Delete('admin/group/:slug/chatroom')
  @UseGuards(JWTAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin)
  @ApiOperation({ summary: 'Delete a group chat room (admin only)' })
  async deleteGroupChatRoom(
    @Param('slug') groupSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{ success: boolean; message?: string }> {
    const tenantId = request.tenantId;
    this.logger.log(
      `Admin user ${user.id} attempting to delete group chat room for ${groupSlug} in tenant ${tenantId}`,
    );

    try {
      await this.discussionService.deleteGroupChatRoom(groupSlug, tenantId);

      this.logger.log(`Successfully deleted group chat room for ${groupSlug}`);

      return {
        success: true,
        message: 'Chat room deleted successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error deleting group chat room for ${groupSlug}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        message: `Could not delete chat room: ${error.message}`,
      };
    }
  }

  @Post('admin/group/:slug/chatroom')
  @UseGuards(JWTAuthGuard, RolesGuard)
  @Roles(RoleEnum.Admin)
  @ApiOperation({ summary: 'Create a new group chat room (admin only)' })
  async createGroupChatRoom(
    @Param('slug') groupSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{ success: boolean; roomId?: string; message?: string }> {
    const tenantId = request.tenantId;
    this.logger.log(
      `Admin user ${user.id} attempting to create group chat room for ${groupSlug} in tenant ${tenantId}`,
    );

    try {
      const result = await this.chatRoomService.ensureRoomAccess(
        'group',
        groupSlug,
        user.slug,
        tenantId,
      );

      this.logger.log(
        `Successfully created group chat room for ${groupSlug}, with Matrix room ID: ${result.roomId || 'unknown'}`,
      );

      return {
        success: result.success,
        roomId: result.roomId,
        message: result.message || 'Chat room created successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error creating group chat room for ${groupSlug}: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        message: `Could not create chat room: ${error.message}`,
      };
    }
  }

  @Post('event/:slug/ensure-room')
  @ApiOperation({
    summary: 'Ensure event Matrix room exists and is accessible',
    description:
      'Verifies user access and ensures Matrix room exists, creating if missing',
  })
  async ensureEventRoom(
    @Param('slug') eventSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{
    success: boolean;
    roomId?: string;
    recreated: boolean;
    message?: string;
  }> {
    try {
      // Use ChatRoomService which tracks room recreation
      const result = await this.chatRoomService.ensureRoomAccess(
        'event',
        eventSlug,
        user.slug,
        request.tenantId,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Error ensuring event room for ${eventSlug}: ${error.message}`,
      );
      return {
        success: false,
        recreated: false,
        message: `Could not ensure room: ${error.message}`,
      };
    }
  }

  @Post('group/:slug/ensure-room')
  @ApiOperation({
    summary: 'Ensure group Matrix room exists and is accessible',
    description:
      'Verifies user access and ensures Matrix room exists, creating if missing',
  })
  async ensureGroupRoom(
    @Param('slug') groupSlug: string,
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{
    success: boolean;
    roomId?: string;
    recreated: boolean;
    message?: string;
  }> {
    try {
      // Use ChatRoomService which tracks room recreation
      const result = await this.chatRoomService.ensureRoomAccess(
        'group',
        groupSlug,
        user.slug,
        request.tenantId,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Error ensuring group room for ${groupSlug}: ${error.message}`,
      );
      return {
        success: false,
        recreated: false,
        message: `Could not ensure room: ${error.message}`,
      };
    }
  }
}

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

  constructor(private readonly discussionService: DiscussionService) {}

  /**
   * Event discussion endpoints
   */
  @Post('event/:slug/message')
  @ApiOperation({ summary: 'Send a message to an event discussion' })
  async sendEventMessage(
    @Param('slug') slug: string,
    @Body() body: { message: string },
    @AuthUser() user: User,
  ): Promise<{ id: string }> {
    return await this.discussionService.sendEventDiscussionMessage(
      slug,
      user.id,
      body,
    );
  }

  @Get('event/:slug/messages')
  @ApiOperation({ summary: 'Get messages from an event discussion' })
  @ApiResponse({
    status: 200,
    description: 'Messages from the event discussion',
    type: DiscussionMessagesResponseDto,
  })
  async getEventMessages(
    @Param('slug') slug: string,
    @AuthUser() user: User,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
  ): Promise<DiscussionMessagesResponseDto> {
    return await this.discussionService.getEventDiscussionMessages(
      slug,
      user.id,
      limit,
      from,
    );
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
      // Use the enhanced version that returns the room ID
      const result =
        await this.discussionService.addMemberToEventDiscussionBySlugAndGetRoomId(
          eventSlug,
          user.slug,
          tenantId,
        );

      this.logger.log(
        `Successfully joined event chat room for ${eventSlug}, with Matrix room ID: ${result.roomId || 'unknown'}`,
      );

      return {
        success: true,
        roomId: result.roomId,
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
  @ApiOperation({ summary: 'Send a message to a group discussion' })
  async sendGroupMessage(
    @Param('slug') slug: string,
    @Body() body: { message: string },
    @AuthUser() user: User,
    @Req() request: any,
  ): Promise<{ id: string }> {
    // Pass the tenant ID explicitly from the request
    const tenantId = request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // Use the discussion service with explicit tenant ID
    return await this.discussionService.sendGroupDiscussionMessage(
      slug,
      user.id,
      body,
      tenantId, // Pass tenant ID explicitly
    );
  }

  @Public()
  @UseGuards(OptionalJWTAuthGuard, VisibilityGuard)
  @Get('group/:slug/messages')
  @ApiOperation({
    summary: 'Get messages from a group discussion',
    description:
      'Public groups can be viewed by unauthenticated users. Private groups require authentication and membership.',
  })
  @ApiResponse({
    status: 200,
    description: 'Messages from the group discussion',
    type: DiscussionMessagesResponseDto,
  })
  async getGroupMessages(
    @Param('slug') slug: string,
    @Req() request: any,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
    @Optional() @AuthUser() user?: User,
  ): Promise<DiscussionMessagesResponseDto> {
    // Set the group slug header for VisibilityGuard
    request.headers['x-group-slug'] = slug;

    // Pass the tenant ID explicitly from the request
    const tenantId = request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // Use the discussion service with optional userId for unauthenticated users
    const userId = user?.id || null;

    return await this.discussionService.getGroupDiscussionMessages(
      slug,
      userId,
      limit,
      from,
      tenantId, // Pass tenant ID explicitly
    );
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
      // Ensure the group exists
      const group = await this.discussionService.groupExists(groupSlug);
      if (!group) {
        return {
          success: false,
          message: `Group with slug ${groupSlug} not found`,
        };
      }

      // Add the user to the group chat room
      await this.discussionService.addMemberToGroupDiscussionBySlug(
        groupSlug,
        user.slug,
        tenantId,
      );

      // Get the matrix room ID for the chat room
      try {
        const chatRooms = await this.discussionService.getGroupChatRooms(
          groupSlug,
          tenantId,
        );

        const roomId =
          chatRooms.length > 0 ? chatRooms[0].matrixRoomId : undefined;

        return {
          success: true,
          roomId: roomId,
          message: 'Successfully joined group chat room',
        };
      } catch (roomError) {
        this.logger.error(
          `Error getting chat rooms for group ${groupSlug}: ${roomError.message}`,
          roomError.stack,
        );

        // Return success but without a room ID
        return {
          success: true,
          message: 'Joined group chat room, but could not get room ID',
        };
      }
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
      const result = await this.discussionService.createEventChatRoom(
        eventSlug,
        user.slug,
        tenantId,
      );

      this.logger.log(
        `Successfully created event chat room for ${eventSlug}, with Matrix room ID: ${result.roomId || 'unknown'}`,
      );

      return {
        success: true,
        roomId: result.roomId,
        message: 'Chat room created successfully',
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
      const result = await this.discussionService.createGroupChatRoom(
        groupSlug,
        user.slug,
        tenantId,
      );

      this.logger.log(
        `Successfully created group chat room for ${groupSlug}, with Matrix room ID: ${result.roomId || 'unknown'}`,
      );

      return {
        success: true,
        roomId: result.roomId,
        message: 'Chat room created successfully',
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
}

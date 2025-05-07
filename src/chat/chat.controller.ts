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
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { DiscussionService } from './services/discussion.service';
import { DiscussionMessagesResponseDto } from './dto/discussion-message.dto';

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
  ): Promise<void> {
    this.logger.log(
      `User ${user.id} attempting to join event chat room for ${eventSlug}`,
    );
    // Implement our join endpoint by adding the current user to the room
    return await this.discussionService.addMemberToEventDiscussionBySlug(
      eventSlug,
      user.slug,
    );
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

  @Get('group/:slug/messages')
  @ApiOperation({ summary: 'Get messages from a group discussion' })
  @ApiResponse({
    status: 200,
    description: 'Messages from the group discussion',
    type: DiscussionMessagesResponseDto,
  })
  async getGroupMessages(
    @Param('slug') slug: string,
    @AuthUser() user: User,
    @Req() request: any,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
  ): Promise<DiscussionMessagesResponseDto> {
    // Pass the tenant ID explicitly from the request
    const tenantId = request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // Use the discussion service with explicit tenant ID
    return await this.discussionService.getGroupDiscussionMessages(
      slug,
      user.id,
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
  ): Promise<void> {
    this.logger.log(
      `User ${user.id} attempting to join group chat room for ${groupSlug}`,
    );

    // Pass the tenant ID explicitly from the request
    const tenantId = request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // Implement our join endpoint by adding the current user to the room
    return await this.discussionService.addMemberToGroupDiscussionBySlug(
      groupSlug,
      user.slug,
      tenantId, // Pass tenant ID explicitly
    );
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
}

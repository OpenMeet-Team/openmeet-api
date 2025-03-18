import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JWTAuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { DiscussionService } from './services/discussion.service';
import { Message } from '../matrix/types/matrix.types';

@ApiTags('Chat')
@Controller('chat')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class ChatController {
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
  async getEventMessages(
    @Param('slug') slug: string,
    @AuthUser() user: User,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
  ): Promise<{
    messages: Message[];
    end: string;
  }> {
    return await this.discussionService.getEventDiscussionMessages(
      slug,
      user.id,
      limit,
      from,
    );
  }

  @Post('event/:slug/members/:userSlug')
  @ApiOperation({ summary: 'Add a member to the event chat room' })
  async addMemberToEventDiscussion(
    @Param('slug') eventSlug: string,
    @Param('userSlug') userSlug: string,
    @AuthUser() _user: User, // Prefix with underscore to indicate unused parameter
  ): Promise<void> {
    return await this.discussionService.addMemberToEventDiscussionBySlug(
      eventSlug,
      userSlug,
    );
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
  ): Promise<{ id: string }> {
    return await this.discussionService.sendGroupDiscussionMessage(
      slug,
      user.id,
      body,
    );
  }

  @Get('group/:slug/messages')
  @ApiOperation({ summary: 'Get messages from a group discussion' })
  async getGroupMessages(
    @Param('slug') slug: string,
    @AuthUser() user: User,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
  ): Promise<{
    messages: Message[];
    end: string;
    roomId?: string;
  }> {
    return await this.discussionService.getGroupDiscussionMessages(
      slug,
      user.id,
      limit,
      from,
    );
  }

  @Post('group/:slug/members/:userSlug')
  @ApiOperation({ summary: 'Add a member to the group chat room' })
  async addMemberToGroupDiscussion(
    @Param('slug') groupSlug: string,
    @Param('userSlug') userSlug: string,
    @AuthUser() _user: User, // Auth required but not used directly
  ): Promise<void> {
    return await this.discussionService.addMemberToGroupDiscussionBySlug(
      groupSlug,
      userSlug,
    );
  }

  @Delete('group/:slug/members/:userSlug')
  @ApiOperation({ summary: 'Remove a member from the group chat room' })
  async removeMemberFromGroupDiscussion(
    @Param('slug') groupSlug: string,
    @Param('userSlug') userSlug: string,
    @AuthUser() _user: User, // Auth required but not used directly
  ): Promise<void> {
    return await this.discussionService.removeMemberFromGroupDiscussionBySlug(
      groupSlug,
      userSlug,
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
  async getDirectMessages(
    @Param('userId') otherUserId: number,
    @AuthUser() user: User,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
  ): Promise<{
    messages: Message[];
    end: string;
  }> {
    return await this.discussionService.getDirectMessages(
      user.id,
      otherUserId,
      limit,
      from,
    );
  }
}

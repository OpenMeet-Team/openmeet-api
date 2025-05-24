import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { UnifiedMessagingService } from './services/unified-messaging.service';
import { MessageDraftService } from './services/message-draft.service';
import { MessageAuditService } from './services/message-audit.service';
import { MessagePauseService } from './services/message-pause.service';
import { GroupService } from '../group/group.service';
import { EventQueryService } from '../event/services/event-query.service';
import { UserService } from '../user/user.service';

import { MessageStatus, MessageType } from './interfaces/message.interface';
import { SendMessageDto, RejectMessageDto } from './dto/send-message.dto';

import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from '../shared/guard/permissions.guard';
import { Permissions } from '../shared/guard/permissions.decorator';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import {
  GroupPermission,
  EventAttendeePermission,
  UserPermission,
} from '../core/constants/constant';

@ApiTags('Messaging')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('messaging')
export class MessagingController {
  constructor(
    private readonly messagingService: UnifiedMessagingService,
    private readonly draftService: MessageDraftService,
    private readonly auditService: MessageAuditService,
    private readonly pauseService: MessagePauseService,
    private readonly groupService: GroupService,
    private readonly eventService: EventQueryService,
    private readonly userService: UserService,
  ) {}

  @Post('groups/:groupSlug/send')
  @UseGuards(PermissionsGuard)
  @Permissions({
    context: 'group',
    permissions: [
      GroupPermission.SendGroupMessage,
      GroupPermission.SendBulkGroupMessage,
    ],
  })
  @ApiOperation({ summary: 'Send message to group members' })
  @ApiResponse({
    status: 201,
    description: 'Message sent or queued for review',
  })
  async sendGroupMessage(
    @Param('groupSlug') groupSlug: string,
    @AuthUser() user: UserEntity,
    @Body() messageRequest: SendMessageDto,
  ) {
    return await this.messagingService.sendGroupMessage(groupSlug, user.slug, {
      ...messageRequest,
      type: MessageType.GROUP_ANNOUNCEMENT,
    });
  }

  @Post('events/:eventSlug/send')
  @UseGuards(PermissionsGuard)
  @Permissions({
    context: 'event',
    permissions: [
      EventAttendeePermission.SendEventMessage,
      EventAttendeePermission.SendBulkEventMessage,
    ],
  })
  @ApiOperation({ summary: 'Send message to event attendees' })
  @ApiResponse({
    status: 201,
    description: 'Message sent or queued for review',
  })
  async sendEventMessage(
    @Param('eventSlug') eventSlug: string,
    @AuthUser() user: UserEntity,
    @Body() messageRequest: SendMessageDto,
  ) {
    return await this.messagingService.sendEventMessage(eventSlug, user.slug, {
      ...messageRequest,
      type: MessageType.EVENT_ANNOUNCEMENT,
    });
  }

  @Get('drafts')
  @ApiOperation({ summary: 'Get user message drafts' })
  @ApiResponse({ status: 200, description: 'List of message drafts' })
  async getUserDrafts(
    @AuthUser() user: UserEntity,
    @Query('status') status?: MessageStatus,
    @Query('type') type?: MessageType,
    @Query('groupId') groupId?: number,
    @Query('eventId') eventId?: number,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    return await this.draftService.getUserDrafts(
      user.id,
      { status, type, groupId, eventId },
      page,
      limit,
    );
  }

  @Get('drafts/:slug')
  @ApiOperation({ summary: 'Get message draft by slug' })
  @ApiResponse({ status: 200, description: 'Message draft details' })
  async getDraft(@Param('slug') slug: string, @AuthUser() user: UserEntity) {
    return await this.draftService.getDraft(slug, user.id);
  }

  @Put('drafts/:slug')
  @ApiOperation({ summary: 'Update message draft' })
  @ApiResponse({ status: 200, description: 'Updated message draft' })
  async updateDraft(
    @Param('slug') slug: string,
    @AuthUser() user: UserEntity,
    @Body() updates: Partial<SendMessageDto>,
  ) {
    return await this.draftService.updateDraft(slug, user.id, updates);
  }

  @Delete('drafts/:slug')
  @ApiOperation({ summary: 'Delete message draft' })
  @ApiResponse({ status: 200, description: 'Draft deleted successfully' })
  async deleteDraft(@Param('slug') slug: string, @AuthUser() user: UserEntity) {
    await this.draftService.deleteDraft(slug, user.id);
    return { message: 'Draft deleted successfully' };
  }

  @Post('drafts/:slug/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @Permissions({
    context: 'user',
    permissions: [UserPermission.ManageSettings],
  })
  @ApiOperation({ summary: 'Approve message draft for sending' })
  @ApiResponse({ status: 200, description: 'Message approved and sent' })
  async approveDraft(
    @Param('slug') slug: string,
    @AuthUser() user: UserEntity,
  ) {
    const approvedDraft = await this.draftService.approveDraft(slug, user.id);
    await this.messagingService.sendMessage(slug);
    return approvedDraft;
  }

  @Post('drafts/:slug/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @Permissions({
    context: 'user',
    permissions: [UserPermission.ManageSettings],
  })
  @ApiOperation({ summary: 'Reject message draft' })
  @ApiResponse({ status: 200, description: 'Message rejected' })
  async rejectDraft(
    @Param('slug') slug: string,
    @AuthUser() user: UserEntity,
    @Body() rejectDto: RejectMessageDto,
  ) {
    return await this.draftService.rejectDraft(slug, user.id, rejectDto.reason);
  }

  @Get('audit')
  @UseGuards(PermissionsGuard)
  @Permissions({
    context: 'user',
    permissions: [UserPermission.ManageSettings],
  })
  @ApiOperation({ summary: 'Get messaging audit log' })
  @ApiResponse({ status: 200, description: 'Audit log entries' })
  async getAuditLog(
    @Query('userSlug') userSlug?: string,
    @Query('groupSlug') groupSlug?: string,
    @Query('eventSlug') eventSlug?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 50,
  ) {
    // Convert slugs to IDs
    let userId: number | undefined;
    if (userSlug) {
      const user = await this.userService.findBySlug(userSlug);
      if (user) {
        userId = user.id;
      }
    }

    let groupId: number | undefined;
    if (groupSlug) {
      const group = await this.groupService.findGroupBySlug(groupSlug);
      if (group) {
        groupId = group.id;
      }
    }

    let eventId: number | undefined;
    if (eventSlug) {
      const event = await this.eventService.findEventBySlug(eventSlug);
      if (event) {
        eventId = event.id;
      }
    }

    const filters: any = {};
    if (userId) filters.userId = userId;
    if (groupId) filters.groupId = groupId;
    if (eventId) filters.eventId = eventId;
    if (action) filters.action = action;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    return await this.auditService.getAuditLog(filters, page, limit);
  }

  @Get('rate-limit/check')
  @ApiOperation({ summary: 'Check current rate limit status' })
  @ApiResponse({ status: 200, description: 'Rate limit information' })
  async checkRateLimit(
    @AuthUser() user: UserEntity,
    @Query('groupSlug') groupSlug?: string,
    @Query('eventSlug') eventSlug?: string,
  ) {
    // Convert slugs to IDs
    let groupId: number | undefined;
    if (groupSlug) {
      const group = await this.groupService.findGroupBySlug(groupSlug);
      if (group) {
        groupId = group.id;
      }
    }

    let eventId: number | undefined;
    if (eventSlug) {
      const event = await this.eventService.findEventBySlug(eventSlug);
      if (event) {
        eventId = event.id;
      }
    }

    return await this.auditService.checkRateLimit(user.id, groupId, eventId);
  }

  // Pause management endpoints (admin only)
  @Post('pause')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @Permissions({
    context: 'user',
    permissions: [UserPermission.ManageSettings],
  })
  @ApiOperation({ summary: 'Pause all message sending globally' })
  @ApiResponse({ status: 200, description: 'Messaging paused' })
  async pauseMessaging(
    @Body('reason') reason?: string,
    @Body('ttlSeconds') ttlSeconds?: number,
  ) {
    await this.pauseService.pauseMessaging(reason, ttlSeconds);
    return {
      message: 'Messaging paused successfully',
      status: await this.pauseService.isMessagingPaused(),
    };
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @Permissions({
    context: 'user',
    permissions: [UserPermission.ManageSettings],
  })
  @ApiOperation({ summary: 'Resume message sending' })
  @ApiResponse({ status: 200, description: 'Messaging resumed' })
  async resumeMessaging() {
    await this.pauseService.resumeMessaging();
    return { message: 'Messaging resumed successfully' };
  }

  @Get('pause/status')
  @ApiOperation({ summary: 'Check if messaging is paused' })
  @ApiResponse({ status: 200, description: 'Pause status' })
  async getPauseStatus() {
    const status = await this.pauseService.isMessagingPaused();
    const ttl = await this.pauseService.getPauseTTL();
    return { ...status, ttl };
  }

  @Post('pause/extend')
  @UseGuards(PermissionsGuard)
  @Permissions('ADMIN')
  @ApiOperation({ summary: 'Extend the pause duration' })
  @ApiResponse({ status: 200, description: 'Pause extended' })
  async extendPause(@Body('additionalSeconds') additionalSeconds: number) {
    await this.pauseService.extendPause(additionalSeconds);
    const ttl = await this.pauseService.getPauseTTL();
    return {
      message: `Pause extended by ${additionalSeconds} seconds`,
      newTtl: ttl,
    };
  }
}

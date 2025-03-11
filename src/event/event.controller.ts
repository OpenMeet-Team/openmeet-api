import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Req,
  Query,
  Res,
  HttpStatus,
  HttpCode,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';

import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { JWTAuthGuard } from '../auth/auth.guard';
import { QueryEventDto } from './dto/query-events.dto';
import { Public } from '../auth/decorators/public.decorator';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { CreateEventAttendeeDto } from '../event-attendee/dto/create-eventAttendee.dto';
import { UpdateEventAttendeeDto } from '../event-attendee/dto/update-eventAttendee.dto';
import { QueryEventAttendeeDto } from '../event-attendee/dto/query-eventAttendee.dto';
import { Permissions } from '../shared/guard/permissions.decorator';
import { PermissionsGuard } from '../shared/guard/permissions.guard';
import { VisibilityGuard } from '../shared/guard/visibility.guard';
import {
  EventAttendeePermission,
  UserPermission,
} from '../core/constants/constant';
import { Trace } from '../utils/trace.decorator';
import { EventManagementService } from './services/event-management.service';
import { EventQueryService } from './services/event-query.service';
import { EventRecommendationService } from './services/event-recommendation.service';
import { EventDiscussionService } from './services/event-discussion.service';

@ApiTags('Events')
@Controller('events')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class EventController {
  constructor(
    private readonly eventManagementService: EventManagementService,
    private readonly eventQueryService: EventQueryService,
    private readonly eventRecommendationService: EventRecommendationService,
    private readonly eventDiscussionService: EventDiscussionService,
    private readonly eventAttendeeService: EventAttendeeService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Get all events. Public endpoint with search and pagination. Results depend on the visibility of the event and permission of the user.',
  })
  @Public()
  @UseGuards(JWTAuthGuard, VisibilityGuard)
  @Trace('event.showAllEvents')
  async showAllEvents(
    @Query() pagination: PaginationDto,
    @Query() query: QueryEventDto,
    @Req() req,
  ): Promise<EventEntity[]> {
    return this.eventQueryService.showAllEvents(
      pagination,
      query,
      req.user as UserEntity,
    );
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get all events for the dashboard.',
  })
  @Trace('event.showDashboardEvents')
  async showDashboardEvents(@AuthUser() user: User): Promise<EventEntity[]> {
    return this.eventQueryService.showDashboardEvents(user.id);
  }

  @Permissions({
    context: 'user',
    permissions: [UserPermission.CreateEvents],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post()
  @ApiOperation({ summary: 'Create a new event' })
  @Trace('event.create')
  async create(
    @Body() createEventDto: CreateEventDto,
    @AuthUser() user: User,
  ): Promise<EventEntity> {
    return this.eventManagementService.create(createEventDto, user.id);
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ManageEvent],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Get(':slug/edit')
  @ApiOperation({ summary: 'Edit event by ID' })
  @Trace('event.editEvent')
  async editEvent(@Param('slug') slug: string): Promise<EventEntity | null> {
    return await this.eventQueryService.editEvent(slug);
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ViewEvent],
  })
  @Public()
  @UseGuards(JWTAuthGuard, VisibilityGuard)
  @Get(':slug')
  @ApiOperation({ summary: 'Show event details by ID' })
  @Trace('event.showEvent')
  async showEvent(
    @Param('slug') slug: string,
    @AuthUser() user: User,
  ): Promise<EventEntity> {
    return this.eventQueryService.showEvent(slug, user?.id);
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ManageEvent],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Patch(':slug')
  @ApiOperation({ summary: 'Update an event by ID' })
  async update(
    @Param('slug') slug: string,
    @Body() updateEventDto: UpdateEventDto,
    @Req() req: Request,
  ): Promise<EventEntity> {
    const user = req.user as UserEntity;
    const userId = user?.id;
    return this.eventManagementService.update(slug, updateEventDto, userId);
  }

  @Permissions({
    context: 'event',
    permissions: [
      EventAttendeePermission.ManageEvent,
      EventAttendeePermission.DeleteEvent,
    ],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Delete(':slug')
  async remove(@Param('slug') slug: string): Promise<void> {
    return this.eventManagementService.remove(slug);
  }

  @Permissions({
    context: 'user',
    permissions: [UserPermission.AttendEvents],
  })
  @Public()
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post(':slug/attend')
  @ApiOperation({ summary: 'Attending an event' })
  async attendEvent(
    @AuthUser() user: User,
    @Body() createEventAttendeeDto: CreateEventAttendeeDto,
    @Param('slug') slug: string,
  ) {
    return this.eventManagementService.attendEvent(
      slug,
      user.id,
      createEventAttendeeDto,
    );
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.AttendEvent],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post(':slug/cancel-attending')
  @ApiOperation({ summary: 'Cancel attending an event' })
  async cancelAttendingEvent(
    @Param('slug') slug: string,
    @AuthUser() user: User,
  ) {
    return await this.eventManagementService.cancelAttendingEvent(
      slug,
      user.id,
    );
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ManageAttendees],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Patch(':slug/attendees/:attendeeId')
  @ApiOperation({ summary: 'Update event attendee' })
  async updateEventAttendee(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Param('attendeeId') attendeeId: number,
  ) {
    return this.eventManagementService.updateEventAttendee(
      slug,
      attendeeId,
      req.body as UpdateEventAttendeeDto,
    );
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ManageAttendees],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Delete(':slug/attendees/:attendeeId')
  @ApiOperation({ summary: 'Delete event attendee' })
  async deleteEventAttendee(
    @Param('slug') slug: string,
    @Param('attendeeId') attendeeId: number,
  ) {
    return this.eventAttendeeService.deleteEventAttendee(attendeeId);
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ViewEvent],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Get(':slug/attendees')
  @ApiOperation({ summary: 'Get all event attendees' })
  async showEventAttendees(
    @Param('slug') slug: string,
    @Query() pagination: PaginationDto,
    @Query() query: QueryEventAttendeeDto,
    @AuthUser() user: User,
  ): Promise<any> {
    const userId = user?.id;
    query.userId = userId;
    return this.eventQueryService.showEventAttendees(slug, pagination);
  }

  @Public()
  @UseGuards(JWTAuthGuard)
  @Get(':slug/recommended-events')
  @ApiOperation({
    summary: 'Get similar events',
  })
  async showRecommendedEvents(@Param('slug') slug: string) {
    return await this.eventRecommendationService.showRecommendedEventsByEventSlug(
      slug,
    );
  }

  @UseGuards(JWTAuthGuard)
  @Post(':slug/discussions')
  @ApiOperation({ summary: 'Send a message to the event chat room' })
  async sendEventDiscussionMessage(
    @Param('slug') slug: string,
    @AuthUser() user: User,
    @Body() body: { message: string; topicName?: string },
  ): Promise<{ id: string }> {
    const result = await this.eventDiscussionService.sendEventDiscussionMessage(
      slug,
      user.id,
      body,
    );

    // Add some delay to allow Matrix to process the message
    await new Promise((resolve) => setTimeout(resolve, 50));

    return result;
  }

  @UseGuards(JWTAuthGuard)
  @Get(':slug/discussions')
  @ApiOperation({ summary: 'Get messages from the event chat room' })
  async getEventDiscussionMessages(
    @Param('slug') slug: string,
    @AuthUser() user: User,
    @Query('limit') limit?: number,
    @Query('from') from?: string,
  ) {
    return this.eventDiscussionService.getEventDiscussionMessages(
      slug,
      user.id,
      limit,
      from,
    );
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ManageEvent],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post(':slug/discussions/members/:userId')
  @ApiOperation({ summary: 'Add a member to the event chat room' })
  async addMemberToEventDiscussion(
    @Param('slug') slug: string,
    @Param('userId') userId: number,
  ): Promise<void> {
    const event = await this.eventQueryService.showEventBySlug(slug);
    if (!event) {
      throw new Error(`Event with slug ${slug} not found`);
    }
    return this.eventDiscussionService.addMemberToEventDiscussion(
      event.id,
      userId,
    );
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ManageEvent],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Delete(':slug/discussions/members/:userId')
  @ApiOperation({ summary: 'Remove a member from the event chat room' })
  async removeMemberFromEventDiscussion(
    @Param('slug') slug: string,
    @Param('userId') userId: number,
  ): Promise<void> {
    const event = await this.eventQueryService.showEventBySlug(slug);
    if (!event) {
      throw new Error(`Event with slug ${slug} not found`);
    }
    return this.eventDiscussionService.removeMemberFromEventDiscussion(
      event.id,
      userId,
    );
  }

  @UseGuards(JWTAuthGuard)
  @Get(':slug/discussions/stream')
  @ApiOperation({
    summary: 'Stream messages from the event chat room in real-time',
  })
  async streamEventDiscussionMessages(
    @Param('slug') slug: string,
    @AuthUser() user: User,
    @Res() response: Response,
  ): Promise<void> {
    if (!user) {
      response.status(HttpStatus.UNAUTHORIZED).send('Unauthorized');
      return;
    }

    // Set headers for SSE
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no'); // Important for Nginx
    response.flushHeaders();

    // Set up the event stream
    const event = await this.eventQueryService.showEventBySlug(slug);
    if (!event) {
      response.write(
        `data: ${JSON.stringify({ error: 'Event not found' })}\n\n`,
      );
      response.end();
      return;
    }

    // Track the last message timestamp to avoid duplicates
    let lastTimestamp = Date.now();
    let lastEventId = '';

    // Function to fetch and send new messages
    const sendUpdates = async () => {
      try {
        const messagesData =
          await this.eventDiscussionService.getEventDiscussionMessages(
            slug,
            user.id,
            30, // Limit
            lastEventId || undefined, // From
          );

        // Process new messages
        const messages = messagesData.messages || [];
        if (messages.length > 0) {
          // Update the lastEventId for pagination
          lastEventId = messagesData.end || '';

          // Filter to only include new messages
          const newMessages = messages.filter(
            (msg) => msg.timestamp > lastTimestamp,
          );

          if (newMessages.length > 0) {
            // Update the timestamp to the latest message
            lastTimestamp = Math.max(
              ...newMessages.map((msg) => msg.timestamp),
            );

            // Send each new message
            newMessages.forEach((message) => {
              response.write(`data: ${JSON.stringify(message)}\n\n`);
            });

            // Sending data (response.write automatically flushes data)
          }
        }
      } catch (error) {
        // Send error to client
        response.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      }
    };

    // Send initial messages
    await sendUpdates();

    // Set up polling interval
    const intervalId = setInterval(sendUpdates, 2000);

    // Handle client disconnect
    response.on('close', () => {
      clearInterval(intervalId);
      response.end();
    });
  }
}

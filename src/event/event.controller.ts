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
} from '@nestjs/common';

import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventService } from './event.service';
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

@ApiTags('Events')
@Controller('events')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class EventController {
  constructor(
    private readonly eventService: EventService,
    private readonly eventAttendeeService: EventAttendeeService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Get all events. Public endpoint with search and pagination. Results depend on the visibility of the event and permission of the user.',
  })
  @Public()
  @UseGuards(JWTAuthGuard, VisibilityGuard)
  async showAllEvents(
    @Query() pagination: PaginationDto,
    @Query() query: QueryEventDto,
    @Req() req,
  ): Promise<EventEntity[]> {
    return this.eventService.showAllEvents(
      pagination,
      query,
      req.user as UserEntity,
    );
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get all events for the dashboard.',
  })
  async showDashboardEvents(@AuthUser() user: User): Promise<EventEntity[]> {
    return this.eventService.showDashboardEvents(user.id);
  }

  @Permissions({
    context: 'user',
    permissions: [UserPermission.CreateEvents],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post()
  @ApiOperation({ summary: 'Create a new event' })
  async create(
    @Body() createEventDto: CreateEventDto,
    @AuthUser() user: User,
  ): Promise<EventEntity> {
    return this.eventService.create(createEventDto, user.id);
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ManageEvent],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Get(':slug/edit')
  @ApiOperation({ summary: 'Edit event by ID' })
  async editEvent(@Param('slug') slug: string): Promise<EventEntity | null> {
    return await this.eventService.editEvent(slug);
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ViewEvent],
  })
  @Public()
  @UseGuards(JWTAuthGuard, VisibilityGuard)
  @Get(':slug')
  @ApiOperation({ summary: 'Show event details by ID' })
  async showEvent(
    @Param('slug') slug: string,
    @AuthUser() user: User,
  ): Promise<EventEntity> {
    return this.eventService.showEvent(slug, user?.id);
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
    return this.eventService.update(slug, updateEventDto, userId);
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
    return this.eventService.remove(slug);
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
    return this.eventService.attendEvent(slug, user.id, createEventAttendeeDto);
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
    return await this.eventService.cancelAttendingEvent(slug, user.id);
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
    return this.eventService.updateEventAttendee(
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
    return this.eventService.showEventAttendees(slug, pagination);
  }

  @Public()
  @UseGuards(JWTAuthGuard)
  @Get(':slug/recommended-events')
  @ApiOperation({
    summary: 'Get similar events',
  })
  async showRecommendedEvents(@Param('slug') slug: string) {
    return await this.eventService.showRecommendedEventsByEventSlug(slug);
  }

  @Permissions({
    context: 'event',
    permissions: [
      EventAttendeePermission.MessageAttendees,
      EventAttendeePermission.CreateDiscussion,
    ],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post(':slug/discussions')
  @ApiOperation({ summary: 'Send a message to a group discussion' })
  async sendEventDiscussionMessage(
    @Param('slug') slug: string,
    @AuthUser() user: User,
    @Body() body: { message: string; topicName: string },
  ): Promise<{ id: number }> {
    return this.eventService.sendEventDiscussionMessage(slug, user.id, body);
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ManageDiscussions],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Patch(':slug/discussions/:messageId')
  @ApiOperation({ summary: 'Update a group discussion message' })
  async updateEventDiscussionMessage(
    @Param('slug') slug: string,
    @Param('messageId') messageId: number,
    @AuthUser() user: User,
    @Body() body: { message: string },
  ): Promise<{ id: number }> {
    return this.eventService.updateEventDiscussionMessage(
      messageId,
      body.message,
      user.id,
    );
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ManageDiscussions],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Delete(':slug/discussions/:messageId')
  @ApiOperation({ summary: 'Delete a group discussion message' })
  async deleteEventDiscussionMessage(
    @Param('slug') slug: string,
    @Param('messageId') messageId: number,
  ): Promise<{ id: number }> {
    return this.eventService.deleteEventDiscussionMessage(messageId);
  }
}

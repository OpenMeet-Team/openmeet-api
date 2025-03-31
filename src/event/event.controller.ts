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
  Header,
  Res,
} from '@nestjs/common';
// import { Response } from 'express'; - removed unused import

import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
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
import { ICalendarService } from './services/ical/ical.service';
import { RecurrenceModificationService } from '../recurrence/services/recurrence-modification.service';

@ApiTags('Events')
@Controller('events')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class EventController {
  constructor(
    private readonly eventManagementService: EventManagementService,
    private readonly eventQueryService: EventQueryService,
    private readonly eventRecommendationService: EventRecommendationService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly iCalendarService: ICalendarService,
    private readonly recurrenceModificationService: RecurrenceModificationService,
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

  @Public()
  @UseGuards(JWTAuthGuard)
  @Get(':slug/calendar')
  @ApiOperation({
    summary: 'Get iCalendar file for an event',
  })
  @Header('Content-Type', 'text/calendar')
  @Header('Content-Disposition', 'attachment; filename=event.ics')
  @Trace('event.getICalendar')
  async getICalendar(
    @Param('slug') slug: string,
    @Res() res: Response,
  ): Promise<void> {
    const event = await this.eventQueryService.showEvent(slug);

    if (!event) {
      res.status(404).send('Event not found');
      return;
    }

    const icalContent = this.iCalendarService.generateICalendar(event);

    // Set Content-Disposition with event slug as filename
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${event.slug}.ics`,
    );

    res.send(icalContent);
  }

  /**
   * Modify this and future occurrences of a recurring event
   *
   * This endpoint allows modifying a recurring event from a specific date forward.
   * It creates a new series starting at the specified date with the modified properties,
   * while preserving the original series up to but not including that date.
   */
  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ManageEvent],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Patch(':slug/occurrences/:date/future')
  @ApiOperation({
    summary: 'Modify this and all future occurrences of a recurring event',
  })
  @Trace('event.modifyThisAndFutureOccurrences')
  async modifyThisAndFutureOccurrences(
    @Param('slug') slug: string,
    @Param('date') date: string,
    @Body() updateEventDto: UpdateEventDto,
    @AuthUser() user: User,
  ): Promise<EventEntity> {
    return this.recurrenceModificationService.splitSeriesAt(
      slug,
      date,
      updateEventDto,
    );
  }

  /**
   * Get the effective event properties for a specific date
   *
   * This endpoint returns the event properties that apply to a specific date
   * in a recurring series, considering any split points or modifications.
   */
  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ViewEvent],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Get(':slug/effective-properties')
  @ApiOperation({
    summary: 'Get effective event properties for a specific date',
  })
  @Trace('event.getEffectiveProperties')
  async getEffectiveProperties(
    @Param('slug') slug: string,
    @Query('date') date: string,
  ): Promise<EventEntity> {
    return this.recurrenceModificationService.getEffectiveEventForDate(
      slug,
      date || new Date().toISOString(),
    );
  }
}

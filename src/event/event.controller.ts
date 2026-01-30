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
  NotFoundException,
  Optional,
} from '@nestjs/common';
// import { Response } from 'express'; - removed unused import

import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { JWTAuthGuard } from '../auth/auth.guard';
import { QueryEventDto } from './dto/query-events.dto';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';
import { DashboardEventsQueryDto } from './dto/dashboard-events-query.dto';
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
import { EventSeriesOccurrenceService } from '../event-series/services/event-series-occurrence.service';
import { Logger } from '@nestjs/common';
import {
  SendAdminMessageDto,
  PreviewAdminMessageDto,
} from './dto/admin-message.dto';
import { ContactOrganizersDto } from './dto/contact-organizers.dto';
import { EventMailService } from '../event-mail/event-mail.service';
import { AdminMessageResult } from './interfaces/admin-message-result.interface';
import { EventMutationResult } from './interfaces/event-mutation-result.interface';

@ApiTags('Events')
@Controller('events')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class EventController {
  private readonly logger = new Logger(EventController.name);

  constructor(
    private readonly eventManagementService: EventManagementService,
    private readonly eventQueryService: EventQueryService,
    private readonly eventRecommendationService: EventRecommendationService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly iCalendarService: ICalendarService,
    private readonly eventSeriesOccurrenceService: EventSeriesOccurrenceService,
    private readonly eventMailService: EventMailService,
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

  @Get('dashboard/summary')
  @ApiOperation({
    summary: 'Get dashboard summary with counts and upcoming events',
    description:
      'Returns event counts and limited previews for the "What\'s Next" dashboard view. Optimized for fast loading.',
  })
  @Trace('event.getDashboardSummary')
  async getDashboardSummary(
    @AuthUser() user: User,
  ): Promise<DashboardSummaryDto> {
    return this.eventQueryService.getDashboardSummary(user.id);
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get paginated list of user events with optional tab filter',
    description:
      'Returns paginated events for the current user. Use tab=hosting for events user is organizing, tab=attending for RSVPed events, tab=past for past events.',
  })
  @Trace('event.showDashboardEventsPaginated')
  async showDashboardEvents(
    @AuthUser() user: User,
    @Query() query: DashboardEventsQueryDto,
  ) {
    return this.eventQueryService.showDashboardEventsPaginated(user.id, query);
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
    @Req() req: Request,
  ): Promise<EventMutationResult> {
    // Log the raw request for debugging
    this.logger.debug(
      `EVENT CREATE REQUEST [${createEventDto.name}]:
      -----------------------------------------------
      ${JSON.stringify(createEventDto, null, 2)}

      ${JSON.stringify(req.headers, null, 2)}
      ${JSON.stringify(req.body, null, 2)}
      -----------------------------------------------
      `,
    );

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
    const event = await this.eventQueryService.showEvent(slug, user?.id);
    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }

    // isRecurring is now a computed property based on seriesSlug
    return event;
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.ManageEvent],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Patch(':slug')
  @ApiOperation({ summary: 'Update an event by Slug' })
  async update(
    @Param('slug') slug: string,
    @Body() updateEventDto: UpdateEventDto,
    @Req() req: Request,
  ): Promise<EventEntity> {
    const user = req.user as UserEntity;
    const userId = user?.id;

    this.logger.debug(
      `Updating event with DTO: ${JSON.stringify(updateEventDto)}`,
    );

    const { event: updatedEvent } = await this.eventManagementService.update(
      slug,
      updateEventDto,
      userId,
      updateEventDto.sendNotifications,
    );

    // Log what we're returning to help debug the test issue
    this.logger.debug(
      `Returning updated event: ${JSON.stringify({
        id: updatedEvent.id,
        slug: updatedEvent.slug,
        seriesSlug: updatedEvent.seriesSlug,
        series: updatedEvent.series,
      })}`,
    );

    return updatedEvent;
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

  // @Permissions({
  //   context: 'user',
  //   permissions: [UserPermission.AttendEvents],
  // })
  @Public()
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post(':slug/attend')
  @ApiOperation({ summary: 'Attending an event' })
  async attendEvent(
    @AuthUser() user: User,
    @Body() createEventAttendeeDto: CreateEventAttendeeDto,
    @Param('slug') slug: string,
  ) {
    const attendee = await this.eventManagementService.attendEvent(
      slug,
      user.id,
      createEventAttendeeDto,
    );
    return attendee;
  }

  // @Permissions({
  //   context: 'event',
  //   permissions: [EventAttendeePermission.AttendEvent],
  // })
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

  // @Permissions({
  //   context: 'event',
  //   permissions: [EventAttendeePermission.ManageAttendees],
  // })
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

  // @Permissions({
  //   context: 'event',
  //   permissions: [EventAttendeePermission.ManageAttendees],
  // })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Delete(':slug/attendees/:attendeeId')
  @ApiOperation({ summary: 'Delete event attendee' })
  async deleteEventAttendee(
    @Param('slug') slug: string,
    @Param('attendeeId') attendeeId: number,
  ) {
    return this.eventAttendeeService.deleteEventAttendee(attendeeId);
  }

  @Public()
  @UseGuards(JWTAuthGuard, VisibilityGuard)
  @Get(':slug/attendees')
  @ApiOperation({ summary: 'Get all event attendees' })
  async showEventAttendees(
    @Param('slug') slug: string,
    @Query() pagination: PaginationDto,
    @Query() query: QueryEventAttendeeDto,
    @Optional() @AuthUser() user?: User,
  ): Promise<any> {
    if (user?.id) {
      query.userId = user.id;
    }
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
    @AuthUser() _user: User,
  ): Promise<EventEntity> {
    // First update the current occurrence
    await this.eventManagementService.update(slug, updateEventDto, _user.id);

    // Then update all future occurrences
    await this.eventSeriesOccurrenceService.updateFutureOccurrences(
      slug,
      date,
      updateEventDto,
      _user.id,
    );

    // Return the updated current occurrence
    const event = await this.eventQueryService.findEventBySlug(slug);
    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }
    return event;
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
    return this.eventSeriesOccurrenceService.getEffectiveEventForDate(
      slug,
      date || new Date().toISOString(),
    );
  }

  @Public()
  @UseGuards(JWTAuthGuard, VisibilityGuard)
  @Get('series/:seriesSlug/events')
  @ApiOperation({ summary: 'Get events by series slug' })
  @Trace('event.getEventsBySeries')
  async getEventsBySeries(
    @Param('seriesSlug') seriesSlug: string,
    @Query() pagination: PaginationDto,
    @Req() _req,
  ): Promise<EventEntity[]> {
    try {
      this.logger.log(`Getting events for series ${seriesSlug}`);

      // Add performance timing
      const startTime = Date.now();

      // Wrap the database query with detailed logging and timeout
      this.logger.log(
        `Starting database query for series ${seriesSlug} events at ${new Date().toISOString()}`,
      );

      const findEventsPromise = this.eventQueryService.findEventsBySeriesSlug(
        seriesSlug,
        {
          page: +pagination.page || 1,
          limit: +pagination.limit || 10,
        },
      );

      // Add a timeout to prevent hanging
      const timeoutPromise = new Promise<[EventEntity[], number]>(
        (_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                `Timeout: Query for events in series ${seriesSlug} took too long`,
              ),
            );
          }, 10000); // 10 second timeout
        },
      );

      // Race the promises
      const result = await Promise.race([findEventsPromise, timeoutPromise]);
      const [events] = result;

      const queryTime = Date.now() - startTime;
      this.logger.log(
        `Query completed in ${queryTime}ms, found ${events.length} events for series ${seriesSlug}`,
      );

      // Return immediately to prevent further processing that could hang
      this.logger.log(
        `Returning ${events.length} events for series ${seriesSlug}`,
      );
      return events;
    } catch (error) {
      this.logger.error(
        `Error getting events for series ${seriesSlug}: ${error.message}`,
        error.stack,
      );

      // Instead of throwing, return an empty array to prevent hanging
      this.logger.log(
        `Returning empty array for series ${seriesSlug} due to error`,
      );
      return [];
    } finally {
      this.logger.log(
        `Completed getEventsBySeries for ${seriesSlug} at ${new Date().toISOString()}`,
      );
    }
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.MessageAttendees],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post(':slug/admin-message')
  @ApiOperation({ summary: 'Send admin message to all event attendees' })
  @Trace('event.sendAdminMessage')
  async sendAdminMessage(
    @Param('slug') slug: string,
    @Body() sendAdminMessageDto: SendAdminMessageDto,
    @AuthUser() user: User,
  ): Promise<AdminMessageResult> {
    const event = await this.eventQueryService.showEvent(slug);
    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }

    const result = await this.eventMailService.sendAdminMessageToAttendees(
      event,
      user.id,
      sendAdminMessageDto.subject,
      sendAdminMessageDto.message,
    );

    return result;
  }

  @Permissions({
    context: 'event',
    permissions: [EventAttendeePermission.MessageAttendees],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post(':slug/admin-message/preview')
  @ApiOperation({ summary: 'Send preview of admin message to test email' })
  @Trace('event.previewAdminMessage')
  async previewAdminMessage(
    @Param('slug') slug: string,
    @Body() previewAdminMessageDto: PreviewAdminMessageDto,
    @AuthUser() user: User,
  ): Promise<{ message: string }> {
    const event = await this.eventQueryService.showEvent(slug);
    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }

    await this.eventMailService.previewAdminMessage(
      event,
      user.id,
      previewAdminMessageDto.subject,
      previewAdminMessageDto.message,
      previewAdminMessageDto.testEmail,
    );

    return { message: 'Preview email sent successfully' };
  }

  @Post(':slug/contact-organizers')
  @ApiOperation({
    summary: 'Send message from attendee to event organizers',
    description:
      'Allows event attendees to send a message to all event organizers',
  })
  async contactOrganizers(
    @Param('slug') slug: string,
    @Body() contactOrganizersDto: ContactOrganizersDto,
    @AuthUser() user: User,
  ) {
    const event = await this.eventQueryService.showEvent(slug);
    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }

    return await this.eventMailService.sendAttendeeContactToOrganizers(
      event,
      user.id,
      contactOrganizersDto.contactType,
      contactOrganizersDto.subject,
      contactOrganizersDto.message,
    );
  }
}

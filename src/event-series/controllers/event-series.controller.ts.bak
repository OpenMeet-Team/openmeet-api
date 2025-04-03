import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { EventSeriesService } from '../services/event-series.service';
import { EventSeriesOccurrenceService } from '../services/event-series-occurrence.service';
import { CreateEventSeriesDto } from '../dto/create-event-series.dto';
import { UpdateEventSeriesDto } from '../dto/update-event-series.dto';
import { EventSeriesResponseDto } from '../dto/event-series-response.dto';
import { EventResponseDto } from '../../event/dto/event-response.dto';
import { JWTAuthGuard } from '../../auth/auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';

@ApiTags('event-series')
@Controller('event-series')
@UseGuards(JWTAuthGuard, TenantGuard)
/**
 * Controller for managing event series and their occurrences.
 *
 * Event Series represent recurring events with a recurrence pattern (like "every Monday")
 * and can generate multiple event occurrences. The recurrence pattern follows the RFC 5545 (iCalendar)
 * standard, supporting DAILY, WEEKLY, MONTHLY, and YEARLY frequencies.
 *
 * Key features:
 * - Create and manage event series with recurrence patterns
 * - Generate occurrences based on recurrence rules
 * - Manage exceptions and modifications to specific occurrences
 * - Update future occurrences while preserving past occurrences
 */
export class EventSeriesController {
  private readonly logger = new Logger(EventSeriesController.name);

  constructor(
    private readonly eventSeriesService: EventSeriesService,
    private readonly eventSeriesOccurrenceService: EventSeriesOccurrenceService,
  ) {
    // Ensure services are properly injected
    if (!eventSeriesService) {
      this.logger.error('EventSeriesService not injected properly');
    }
    if (!eventSeriesOccurrenceService) {
      this.logger.error('EventSeriesOccurrenceService not injected properly');
    }
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new event series',
    description: `
      Creates a new event series with a specified recurrence pattern.
      
      The recurrence pattern is defined using the RFC 5545 (iCalendar) standard, with support for:
      - DAILY: Repeats every day or every X days
      - WEEKLY: Repeats weekly on specified days (e.g., every Monday and Wednesday)
      - MONTHLY: Repeats monthly on specified days or positions (e.g., first Monday)
      - YEARLY: Repeats yearly on specified months and days
      
      The series requires template properties that will be used to generate
      individual event occurrences.
    `,
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'The event series has been successfully created',
    type: EventSeriesResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid recurrence rule or template properties',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'User is not authenticated',
  })
  async create(
    @Body() createEventSeriesDto: CreateEventSeriesDto,
    @Request() req,
  ) {
    // Extract tenant ID directly from request to avoid decorator issues
    const tenantId =
      req.tenantId || (req.headers && req.headers['x-tenant-id']);

    this.logger.log(
      `Creating event series in tenant ${tenantId} by user ${req.user.id}`,
    );

    // Verify the user ID and tenant info
    this.logger.debug(
      `User information: ${JSON.stringify({
        id: req.user.id,
        tenantId,
        headers: req.headers && req.headers['x-tenant-id'],
        hasUser: !!req.user,
      })}`,
    );

    // Log the received DTO
    this.logger.log(
      `Received event series DTO: ${JSON.stringify(createEventSeriesDto, null, 2)}`,
    );

    try {
      const eventSeries = await this.eventSeriesService.create(
        createEventSeriesDto,
        req.user.id,
      );

      return new EventSeriesResponseDto(eventSeries);
    } catch (error) {
      this.logger.error(
        `Error creating event series: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get all event series with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns event series with pagination',
    type: [EventSeriesResponseDto],
  })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Request() req,
  ) {
    // Extract tenant ID directly from request
    const tenantId =
      req.tenantId || (req.headers && req.headers['x-tenant-id']);

    this.logger.log(
      `Getting all event series in tenant ${tenantId} by user ${req.user.id}`,
    );

    const { data, total } = await this.eventSeriesService.findAll({
      page: +page,
      limit: +limit,
    });

    return {
      data: data.map((series) => new EventSeriesResponseDto(series)),
      meta: {
        total,
        page: +page,
        limit: +limit,
      },
    };
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get event series by user ID' })
  @ApiParam({ name: 'userId', type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns event series for a specific user',
    type: [EventSeriesResponseDto],
  })
  async findByUser(
    @Param('userId') userId: number,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Request() req,
  ) {
    // Extract tenant ID directly from request
    const tenantId =
      req.tenantId || (req.headers && req.headers['x-tenant-id']);

    this.logger.log(
      `Getting event series for user ${userId} in tenant ${tenantId}`,
    );

    const { data, total } = await this.eventSeriesService.findByUser(+userId, {
      page: +page,
      limit: +limit,
    });

    return {
      data: data.map((series) => new EventSeriesResponseDto(series)),
      meta: {
        total,
        page: +page,
        limit: +limit,
      },
    };
  }

  @Post('promote/:eventSlug')
  @ApiOperation({
    summary: 'Promote an existing event to a series',
    description: `
      Promotes an existing single event to become a recurring event series.
      The existing event becomes the template for the series.
      
      Requires a recurrence rule and timezone to define how the event repeats.
    `,
  })
  @ApiParam({
    name: 'eventSlug',
    type: String,
    description: 'Slug of the existing event to promote',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'The event has been successfully promoted to a series',
    type: EventSeriesResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid recurrence rule or the user does not have permission',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Event not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'User is not authenticated',
  })
  async promoteToSeries(
    @Param('eventSlug') eventSlug: string,
    @Body() promoteData: { recurrenceRule: any; timeZone: string },
    @Request() req,
  ) {
    this.logger.log(
      `Promoting event ${eventSlug} to a series by user ${req.user.id}`,
    );

    try {
      const eventSeries = await this.eventSeriesService.createFromExistingEvent(
        eventSlug,
        promoteData.recurrenceRule,
        promoteData.timeZone,
        req.user.id,
      );

      return new EventSeriesResponseDto(eventSeries);
    } catch (error) {
      this.logger.error(
        `Error promoting event to series: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Get('group/:groupId')
  @ApiOperation({ summary: 'Get event series by group ID' })
  @ApiParam({ name: 'groupId', type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns event series for a specific group',
    type: [EventSeriesResponseDto],
  })
  async findByGroup(
    @Param('groupId') groupId: number,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Request() req,
  ) {
    // Extract tenant ID directly from request
    const tenantId =
      req.tenantId || (req.headers && req.headers['x-tenant-id']);

    this.logger.log(
      `Getting event series for group ${groupId} in tenant ${tenantId}`,
    );

    const { data, total } = await this.eventSeriesService.findByGroup(
      +groupId,
      {
        page: +page,
        limit: +limit,
      },
    );

    return {
      data: data.map((series) => new EventSeriesResponseDto(series)),
      meta: {
        total,
        page: +page,
        limit: +limit,
      },
    };
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get an event series by slug' })
  @ApiParam({ name: 'slug', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns a specific event series',
    type: EventSeriesResponseDto,
  })
  async findOne(@Param('slug') slug: string, @Request() req) {
    // Extract tenant ID directly from request
    const tenantId =
      req.tenantId || (req.headers && req.headers['x-tenant-id']);

    this.logger.log(`Getting event series ${slug} in tenant ${tenantId}`);

    const eventSeries = await this.eventSeriesService.findBySlug(slug);
    return new EventSeriesResponseDto(eventSeries);
  }

  @Get(':slug/occurrences')
  @ApiOperation({
    summary: 'Get upcoming occurrences for an event series',
    description: `
      Retrieves upcoming occurrences for a specific event series, based on its recurrence pattern.
      
      This endpoint returns both materialized occurrences (those with actual event records in the database)
      and virtual occurrences (those that will be generated on-demand when accessed).
      
      The response includes occurrence dates and whether each occurrence has been materialized,
      along with the full event data when available.
      
      For performance reasons, a limited number of occurrences are returned, controlled by the 'count' parameter.
    `,
  })
  @ApiParam({
    name: 'slug',
    type: String,
    description: 'The unique slug of the event series',
  })
  @ApiQuery({
    name: 'count',
    required: false,
    type: Number,
    description: 'The maximum number of occurrences to return (default: 10)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns upcoming occurrences for an event series',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            format: 'date-time',
            description: 'The date of the occurrence in ISO format',
          },
          materialized: {
            type: 'boolean',
            description:
              'Whether this occurrence has been materialized (has an event record)',
          },
          event: {
            type: 'object',
            description: 'Full event data if materialized, otherwise null',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Event series not found',
  })
  async getUpcomingOccurrences(
    @Param('slug') slug: string,
    @Query('count') count = 10,
    @Request() req,
  ) {
    // Extract tenant ID directly from request
    const tenantId =
      req.tenantId || (req.headers && req.headers['x-tenant-id']);

    this.logger.log(
      `Getting upcoming occurrences for series ${slug} in tenant ${tenantId}`,
    );

    return this.eventSeriesOccurrenceService.getUpcomingOccurrences(
      slug,
      +count,
    );
  }

  @Get(':slug/:occurrenceDate')
  @ApiOperation({
    summary: 'Get or create an occurrence for a specific date',
    description: `
      Retrieves or creates ("materializes") an occurrence for a specific date in the series.
      
      This endpoint is used to get the details of a specific occurrence. If the occurrence
      doesn't exist yet as a concrete event record in the database, it will be "materialized"
      (created) based on the template properties of the series.
      
      The date must be a valid occurrence date according to the series' recurrence pattern.
      If the date does not match the recurrence pattern, a 400 Bad Request error will be returned.
      
      This is known as "vivification" or "lazy materialization" - events are only created when needed.
    `,
  })
  @ApiParam({
    name: 'slug',
    type: String,
    description: 'The unique slug of the event series',
  })
  @ApiParam({
    name: 'occurrenceDate',
    type: String,
    description:
      'The date of the occurrence in ISO format (YYYY-MM-DD or full ISO string)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns the event occurrence for the specified date',
    type: EventResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'The specified date is not a valid occurrence date according to the recurrence pattern',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Event series not found',
  })
  async getOrCreateOccurrence(
    @Param('slug') slug: string,
    @Param('occurrenceDate') occurrenceDate: string,
    @Request() req,
  ) {
    // Extract tenant ID directly from request
    const tenantId =
      req.tenantId || (req.headers && req.headers['x-tenant-id']);

    this.logger.log(
      `Getting or creating occurrence for series ${slug} on date ${occurrenceDate} in tenant ${tenantId}`,
    );

    const occurrence =
      await this.eventSeriesOccurrenceService.getOrCreateOccurrence(
        slug,
        occurrenceDate,
        req.user.id,
      );

    return occurrence;
  }

  @Patch(':slug')
  @ApiOperation({
    summary: 'Update an event series',
    description: `
      Updates the properties of an event series.
      
      This endpoint allows updating various aspects of the series, including:
      - Basic properties like name, description, etc.
      - The recurrence pattern (frequency, interval, etc.)
      - Template properties used to generate new occurrences
      
      Changes to the series properties affect:
      1. The series entity itself
      2. Future unmaterialized occurrences
      
      By default, changes do not affect already materialized occurrences unless
      the 'propagateChanges' flag is set to true in the request body.
      
      NOTE: Changing the recurrence pattern may result in some future occurrences
      no longer being valid, and new ones being added.
    `,
  })
  @ApiParam({
    name: 'slug',
    type: String,
    description: 'The unique slug of the event series',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The event series has been successfully updated',
    type: EventSeriesResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid properties or recurrence pattern',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Event series not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'User is not authenticated or not the owner of the series',
  })
  async update(
    @Param('slug') slug: string,
    @Body() updateEventSeriesDto: UpdateEventSeriesDto,
    @Request() req,
  ) {
    // Extract tenant ID directly from request
    const tenantId =
      req.tenantId || (req.headers && req.headers['x-tenant-id']);

    this.logger.log(
      `Updating event series ${slug} in tenant ${tenantId} by user ${req.user.id}`,
    );

    const eventSeries = await this.eventSeriesService.update(
      slug,
      updateEventSeriesDto,
      req.user.id,
    );

    return new EventSeriesResponseDto(eventSeries);
  }

  @Delete(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an event series' })
  @ApiParam({ name: 'slug', type: String })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'The event series has been successfully deleted',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'User is not authorized to delete this event series',
  })
  async remove(@Param('slug') slug: string, @Request() req) {
    // Extract tenant ID directly from request
    const tenantId =
      req.tenantId || (req.headers && req.headers['x-tenant-id']);

    this.logger.log(
      `Deleting event series ${slug} in tenant ${tenantId} by user ${req.user.id}`,
    );

    await this.eventSeriesService.delete(slug, req.user.id);
  }

  @Patch(':slug/future-from/:date')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update future occurrences from a specific date',
    description: `
      Updates all future occurrences from a specific date onward.
      
      This is useful when you want to make changes to all future events in a series
      without affecting past events. For example, changing the location or time
      for all future occurrences.
      
      The changes are applied to:
      1. The specified occurrence (if it exists)
      2. All materialized occurrences after the specified date
      3. The template that will be used for future unmaterialized occurrences
      
      This implements the common calendar pattern of "Change this and all future events".
    `,
  })
  @ApiParam({
    name: 'slug',
    type: String,
    description: 'The unique slug of the event series',
  })
  @ApiParam({
    name: 'date',
    type: String,
    description:
      'The starting date (ISO format) from which to apply changes to all future occurrences',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Future occurrences have been updated',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Success message with count of updated occurrences',
        },
        count: {
          type: 'number',
          description: 'Number of occurrences that were updated',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid date format or no properties to update',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Event series not found',
  })
  async updateFutureOccurrences(
    @Param('slug') slug: string,
    @Param('date') date: string,
    @Body() updates: any,
    @Request() req,
  ) {
    // Extract tenant ID directly from request
    const tenantId =
      req.tenantId || (req.headers && req.headers['x-tenant-id']);

    this.logger.log(
      `Updating future occurrences for series ${slug} from date ${date} in tenant ${tenantId}`,
    );

    const count =
      await this.eventSeriesOccurrenceService.updateFutureOccurrences(
        slug,
        date,
        updates,
        req.user.id,
      );

    return {
      message: `Updated ${count} future occurrences`,
      count,
    };
  }

  @Post(':slug/next-occurrence')
  @ApiOperation({ summary: 'Materialize the next occurrence in the series' })
  @ApiParam({ name: 'slug', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Next occurrence has been materialized',
  })
  async materializeNextOccurrence(@Param('slug') slug: string, @Request() req) {
    // Extract tenant ID directly from request
    const tenantId =
      req.tenantId || (req.headers && req.headers['x-tenant-id']);

    this.logger.log(
      `Materializing next occurrence for series ${slug} in tenant ${tenantId}`,
    );

    const occurrence =
      await this.eventSeriesOccurrenceService.materializeNextOccurrence(
        slug,
        req.user.id,
      );

    if (!occurrence) {
      return { message: 'No unmaterialized occurrences available' };
    }

    return occurrence;
  }
}

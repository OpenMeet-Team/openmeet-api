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
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { EventSeriesService } from '../services/event-series.service';
import { EventSeriesOccurrenceService } from '../services/event-series-occurrence.service';
import { CreateEventSeriesDto } from '../dto/create-event-series.dto';
import { UpdateEventSeriesDto } from '../dto/update-event-series.dto';
import { EventSeriesResponseDto } from '../dto/event-series-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/guards/tenant.guard';
import { Tenant } from '../../tenant/decorators/tenant.decorator';

@ApiTags('event-series')
@Controller('event-series')
@UseGuards(JwtAuthGuard, TenantGuard)
export class EventSeriesController {
  private readonly logger = new Logger(EventSeriesController.name);

  constructor(
    private readonly eventSeriesService: EventSeriesService,
    private readonly eventSeriesOccurrenceService: EventSeriesOccurrenceService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new event series' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'The event series has been successfully created',
    type: EventSeriesResponseDto,
  })
  async create(
    @Body() createEventSeriesDto: CreateEventSeriesDto,
    @Request() req,
    @Tenant() tenant: string,
  ) {
    this.logger.log(
      `Creating event series in tenant ${tenant} by user ${req.user.id}`,
    );
    
    const eventSeries = await this.eventSeriesService.create(
      createEventSeriesDto,
      req.user.id,
    );
    
    return new EventSeriesResponseDto(eventSeries);
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
    @Tenant() tenant: string,
  ) {
    this.logger.log(
      `Getting all event series in tenant ${tenant} by user ${req.user.id}`,
    );
    
    const { data, total } = await this.eventSeriesService.findAll({
      page: +page,
      limit: +limit,
    });
    
    return {
      data: data.map(series => new EventSeriesResponseDto(series)),
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
    @Tenant() tenant: string,
  ) {
    this.logger.log(
      `Getting event series for user ${userId} in tenant ${tenant}`,
    );
    
    const { data, total } = await this.eventSeriesService.findByUser(
      +userId,
      {
        page: +page,
        limit: +limit,
      },
    );
    
    return {
      data: data.map(series => new EventSeriesResponseDto(series)),
      meta: {
        total,
        page: +page,
        limit: +limit,
      },
    };
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
    @Tenant() tenant: string,
  ) {
    this.logger.log(
      `Getting event series for group ${groupId} in tenant ${tenant}`,
    );
    
    const { data, total } = await this.eventSeriesService.findByGroup(
      +groupId,
      {
        page: +page,
        limit: +limit,
      },
    );
    
    return {
      data: data.map(series => new EventSeriesResponseDto(series)),
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
  async findOne(@Param('slug') slug: string, @Tenant() tenant: string) {
    this.logger.log(`Getting event series ${slug} in tenant ${tenant}`);
    
    const eventSeries = await this.eventSeriesService.findBySlug(slug);
    return new EventSeriesResponseDto(eventSeries);
  }

  @Get(':slug/occurrences')
  @ApiOperation({ summary: 'Get upcoming occurrences for an event series' })
  @ApiParam({ name: 'slug', type: String })
  @ApiQuery({ name: 'count', required: false, type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns upcoming occurrences for an event series',
  })
  async getUpcomingOccurrences(
    @Param('slug') slug: string,
    @Query('count') count = 10,
    @Tenant() tenant: string,
  ) {
    this.logger.log(
      `Getting upcoming occurrences for series ${slug} in tenant ${tenant}`,
    );
    
    return this.eventSeriesOccurrenceService.getUpcomingOccurrences(
      slug,
      +count,
    );
  }

  @Get(':slug/:occurrenceDate')
  @ApiOperation({ summary: 'Get or create an occurrence for a specific date' })
  @ApiParam({ name: 'slug', type: String })
  @ApiParam({ name: 'occurrenceDate', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns an occurrence for a specific date',
  })
  async getOrCreateOccurrence(
    @Param('slug') slug: string,
    @Param('occurrenceDate') occurrenceDate: string,
    @Request() req,
    @Tenant() tenant: string,
  ) {
    this.logger.log(
      `Getting or creating occurrence for series ${slug} on date ${occurrenceDate} in tenant ${tenant}`,
    );
    
    const occurrence = await this.eventSeriesOccurrenceService.getOrCreateOccurrence(
      slug,
      occurrenceDate,
      req.user.id,
    );
    
    return occurrence;
  }

  @Patch(':slug')
  @ApiOperation({ summary: 'Update an event series' })
  @ApiParam({ name: 'slug', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The event series has been successfully updated',
    type: EventSeriesResponseDto,
  })
  async update(
    @Param('slug') slug: string,
    @Body() updateEventSeriesDto: UpdateEventSeriesDto,
    @Request() req,
    @Tenant() tenant: string,
  ) {
    this.logger.log(
      `Updating event series ${slug} in tenant ${tenant} by user ${req.user.id}`,
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
  async remove(
    @Param('slug') slug: string,
    @Request() req,
    @Tenant() tenant: string,
  ) {
    this.logger.log(
      `Deleting event series ${slug} in tenant ${tenant} by user ${req.user.id}`,
    );
    
    await this.eventSeriesService.delete(slug, req.user.id);
  }

  @Post(':slug/future-from/:date')
  @ApiOperation({ summary: 'Update future occurrences from a specific date' })
  @ApiParam({ name: 'slug', type: String })
  @ApiParam({ name: 'date', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Future occurrences have been updated',
  })
  async updateFutureOccurrences(
    @Param('slug') slug: string,
    @Param('date') date: string,
    @Body() updates: any,
    @Request() req,
    @Tenant() tenant: string,
  ) {
    this.logger.log(
      `Updating future occurrences for series ${slug} from date ${date} in tenant ${tenant}`,
    );
    
    const count = await this.eventSeriesOccurrenceService.updateFutureOccurrences(
      slug,
      date,
      updates,
      req.user.id,
    );
    
    return { 
      message: `Updated ${count} future occurrences`,
      count 
    };
  }

  @Post(':slug/next-occurrence')
  @ApiOperation({ summary: 'Materialize the next occurrence in the series' })
  @ApiParam({ name: 'slug', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Next occurrence has been materialized',
  })
  async materializeNextOccurrence(
    @Param('slug') slug: string,
    @Request() req,
    @Tenant() tenant: string,
  ) {
    this.logger.log(
      `Materializing next occurrence for series ${slug} in tenant ${tenant}`,
    );
    
    const occurrence = await this.eventSeriesOccurrenceService.materializeNextOccurrence(
      slug,
      req.user.id,
    );
    
    if (!occurrence) {
      return { message: 'No unmaterialized occurrences available' };
    }
    
    return occurrence;
  }
}
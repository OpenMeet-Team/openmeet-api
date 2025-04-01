import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { RecurrenceService } from '../recurrence.service';
import { RecurrenceModificationService } from '../services/recurrence-modification.service';
import { EventOccurrenceService } from '../services/event-occurrence.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { JWTAuthGuard } from '../../auth/auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SplitSeriesDto } from '../dto/split-series.dto';
import { AddExclusionDateDto } from '../dto/add-exclusion-date.dto';
import { OccurrencesQueryDto } from '../dto/occurrences-query.dto';

@ApiTags('recurrence')
@Controller('recurrence')
export class RecurrenceController {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly recurrenceService: RecurrenceService,
    private readonly recurrenceModificationService: RecurrenceModificationService,
    private readonly eventOccurrenceService: EventOccurrenceService,
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventQueryService: EventQueryService,
  ) {}

  @ApiOperation({
    summary: 'Split a recurring event series at a specific date',
    description:
      'Modifies the original series to end before the specified date and creates a new series starting from the specified date with modified properties',
  })
  @ApiParam({
    name: 'eventSlug',
    description: 'The slug of the recurring event',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'The new event series created from the split',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiBearerAuth()
  @UseGuards(JWTAuthGuard)
  @Post(':eventSlug/split')
  async splitSeriesAt(
    @Param('eventSlug') eventSlug: string,
    @Body() splitSeriesDto: SplitSeriesDto,
  ) {
    try {
      return await this.recurrenceModificationService.splitSeriesAt(
        eventSlug,
        splitSeriesDto.splitDate,
        splitSeriesDto.modifications,
      );
    } catch (error) {
      if (error.message === 'Event not found') {
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }
      throw error;
    }
  }

  @ApiOperation({
    summary: 'Get the effective event for a specific date',
    description:
      'Returns the appropriate event for a given date, taking into account any series splits',
  })
  @ApiParam({
    name: 'eventSlug',
    description: 'The slug of the recurring event',
    type: String,
  })
  @ApiQuery({
    name: 'date',
    description: 'The date to check (ISO string)',
    type: String,
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'The effective event for the given date',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @Get(':eventSlug/effective')
  async getEffectiveEventForDate(
    @Param('eventSlug') eventSlug: string,
    @Query('date') date: string,
  ) {
    try {
      return await this.recurrenceModificationService.getEffectiveEventForDate(
        eventSlug,
        date,
      );
    } catch (error) {
      if (error.message === 'Event not found') {
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }
      throw error;
    }
  }

  @ApiOperation({
    summary: 'Generate occurrences for a recurring event',
    description:
      'Returns all occurrences of a recurring event within the specified date range',
  })
  @ApiParam({
    name: 'eventSlug',
    description: 'The slug of the recurring event',
    type: String,
  })
  @ApiQuery({
    name: 'startDate',
    description: 'Start date for the range (ISO string)',
    type: String,
    required: false,
  })
  @ApiQuery({
    name: 'endDate',
    description: 'End date for the range (ISO string)',
    type: String,
    required: false,
  })
  @ApiQuery({
    name: 'count',
    description: 'Maximum number of occurrences to return',
    type: Number,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Array of occurrence dates',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @Get(':eventSlug/occurrences')
  async getEventOccurrences(
    @Param('eventSlug') eventSlug: string,
    @Query() query: OccurrencesQueryDto,
  ) {
    try {
      // Get the Date objects from service
      const occurrenceDates = await this.eventOccurrenceService.getOccurrences(
        eventSlug,
        query.startDate,
        query.endDate,
        query.count,
        query.includeExcluded,
      );

      // Get the event to check for exclusions
      const event = await this.eventQueryService.findEventBySlug(eventSlug);
      const exclusions = event?.recurrenceExceptions || [];

      // Transform each date into an object with date and isExcluded properties
      return occurrenceDates.map((date) => ({
        date: date.toISOString(),
        isExcluded: exclusions.includes(date.toISOString()),
      }));
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }
      throw error;
    }
  }

  @ApiOperation({
    summary: 'Get expanded event occurrences with full event objects',
    description:
      'Returns complete event objects for each occurrence of a recurring event within the date range',
  })
  @ApiParam({
    name: 'eventSlug',
    description: 'The slug of the recurring event',
    type: String,
  })
  @ApiQuery({
    name: 'startDate',
    description: 'Start date for the range (ISO string)',
    type: String,
    required: false,
  })
  @ApiQuery({
    name: 'endDate',
    description: 'End date for the range (ISO string)',
    type: String,
    required: false,
  })
  @ApiQuery({
    name: 'count',
    description: 'Maximum number of occurrences to return',
    type: Number,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Array of event objects for each occurrence',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @Get(':eventSlug/expanded-occurrences')
  async getExpandedEventOccurrences(
    @Param('eventSlug') eventSlug: string,
    @Query() query: OccurrencesQueryDto,
  ) {
    try {
      return await this.eventOccurrenceService.getExpandedEventOccurrences(
        eventSlug,
        query.startDate,
        query.endDate,
        query.count,
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }
      throw error;
    }
  }

  @ApiOperation({
    summary: 'Add an exclusion date to a recurring event',
    description:
      'Excludes a specific date from the recurrence pattern of an event',
  })
  @ApiParam({
    name: 'eventSlug',
    description: 'The slug of the recurring event',
    type: String,
  })
  @ApiResponse({
    status: 204,
    description: 'Exclusion date successfully added',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiBearerAuth()
  @UseGuards(JWTAuthGuard)
  @Patch(':eventSlug/exclusions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async addExclusionDate(
    @Param('eventSlug') eventSlug: string,
    @Body() exclusionDto: AddExclusionDateDto,
  ) {
    try {
      await this.eventOccurrenceService.addExclusionDate(
        eventSlug,
        exclusionDto.exclusionDate,
        this.request.user?.id,
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }
      throw error;
    }
  }

  @ApiOperation({
    summary: 'Remove an exclusion date from a recurring event',
    description:
      'Includes a previously excluded date in the recurrence pattern of an event',
  })
  @ApiParam({
    name: 'eventSlug',
    description: 'The slug of the recurring event',
    type: String,
  })
  @ApiQuery({
    name: 'date',
    description: 'The date to remove from exclusions (ISO string)',
    type: String,
    required: true,
  })
  @ApiResponse({
    status: 204,
    description: 'Exclusion date successfully removed',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiBearerAuth()
  @UseGuards(JWTAuthGuard)
  @Patch(':eventSlug/inclusions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeExclusionDate(
    @Param('eventSlug') eventSlug: string,
    @Query('date') date: string,
  ) {
    try {
      await this.eventOccurrenceService.removeExclusionDate(
        eventSlug,
        date,
        this.request.user?.id,
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }
      throw error;
    }
  }
}

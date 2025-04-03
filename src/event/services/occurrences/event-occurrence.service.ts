import {
  Injectable,
  Logger,
  Scope,
  Inject,
  forwardRef,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Repository, Between } from 'typeorm';
import { EventEntity } from '../../infrastructure/persistence/relational/entities/event.entity';
import { TenantConnectionService } from '../../../tenant/tenant.service';
import { EventSeriesOccurrenceService } from '../../../event-series/services/event-series-occurrence.service';
import { RecurrencePatternService } from '../../../event-series/services/recurrence-pattern.service';
import { IEventOccurrenceService } from './event-occurrence.interface';
import { OccurrenceOptions } from '../../../event-series/interfaces/recurrence.interface';
import { isAfter, isBefore, isEqual } from 'date-fns';
import { Trace } from '../../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';
import { EventStatus } from '../../../core/constants/constant';
import { EventSeriesEntity } from '../../../event-series/infrastructure/persistence/relational/entities/event-series.entity';

/**
 * @deprecated This service is deprecated and will be removed in a future version.
 * Please use EventSeriesOccurrenceService instead for all recurrence-related functionality.
 */
@Injectable({ scope: Scope.REQUEST })
export class EventOccurrenceService implements IEventOccurrenceService {
  private readonly logger = new Logger(EventOccurrenceService.name);
  private readonly tracer = trace.getTracer('event-occurrence-service');
  private eventRepository: Repository<EventEntity>;
  private eventSeriesRepository: Repository<EventSeriesEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    @Inject(forwardRef(() => RecurrencePatternService))
    private readonly recurrencePatternService: RecurrencePatternService,
    @Inject(forwardRef(() => EventSeriesOccurrenceService))
    private readonly eventSeriesOccurrenceService: EventSeriesOccurrenceService,
  ) {
    this.logger.warn(
      'DEPRECATION WARNING: EventOccurrenceService is deprecated and will be removed in a future version. ' +
        'Please use EventSeriesOccurrenceService instead for all recurrence-related functionality.',
    );
    void this.initializeRepository();
  }

  @Trace('event-occurrence.initializeRepository')
  async initializeRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
    this.eventSeriesRepository = dataSource.getRepository(EventSeriesEntity);
  }

  /**
   * Generate occurrence events for a recurring event
   * @deprecated Use EventSeriesOccurrenceService.getUpcomingOccurrences instead
   */
  @Trace('event-occurrence.generateOccurrences')
  generateOccurrences(
    _parentEvent: EventEntity,
    _options: OccurrenceOptions = {},
  ): Promise<EventEntity[]> {
    // Implementation commented out to avoid duplicate code issues
    // Use EventSeriesOccurrenceService.getUpcomingOccurrences instead
    this.logger.warn(
      'generateOccurrences is deprecated - use EventSeriesOccurrenceService.getUpcomingOccurrences instead',
    );
    return Promise.resolve([]);
  }

  /**
   * Get occurrences of a recurring event within a date range
   * @deprecated Use EventSeriesOccurrenceService.getUpcomingOccurrences with date filtering instead
   */
  @Trace('event-occurrence.getOccurrencesInRange')
  getOccurrencesInRange(
    _parentEventId: number,
    _startDate: Date,
    _endDate: Date,
    _includeExceptions: boolean = true,
  ): Promise<EventEntity[]> {
    // Implementation commented out to avoid duplicate code issues
    // Use EventSeriesOccurrenceService.getUpcomingOccurrences instead
    this.logger.warn(
      'getOccurrencesInRange is deprecated - use EventSeriesOccurrenceService.getUpcomingOccurrences instead',
    );
    return Promise.resolve([]);
  }

  /**
   * Create or update an exception occurrence of a recurring event
   * @deprecated Use EventSeriesOccurrenceService.materializeOccurrence instead
   */
  @Trace('event-occurrence.createExceptionOccurrence')
  createExceptionOccurrence(
    _parentEventId: number,
    _originalDate: Date,
    _modifications: Partial<EventEntity>,
  ): Promise<EventEntity> {
    // Implementation commented out to avoid duplicate code issues
    // Use EventSeriesOccurrenceService.materializeOccurrence instead
    this.logger.warn(
      'createExceptionOccurrence is deprecated - use EventSeriesOccurrenceService.materializeOccurrence instead',
    );
    return Promise.reject(
      new Error(
        'Method deprecated - use EventSeriesOccurrenceService.materializeOccurrence instead',
      ),
    );
  }

  /**
   * Delete an occurrence from a recurring event
   * @deprecated For EventSeries-based events, cancel a specific occurrence instead
   */
  @Trace('event-occurrence.excludeOccurrence')
  excludeOccurrence(
    _parentEventId: number,
    _occurrenceDate: Date,
  ): Promise<boolean> {
    // Implementation commented out to avoid duplicate code issues
    // Use deleteOccurrence instead
    this.logger.warn(
      'excludeOccurrence is deprecated - use deleteOccurrence instead',
    );
    return Promise.resolve(false);
  }

  /**
   * Add back a previously excluded occurrence
   * @deprecated For EventSeries-based events, reactivate a specific occurrence instead
   */
  @Trace('event-occurrence.includeOccurrence')
  includeOccurrence(
    _parentEventId: number,
    _occurrenceDate: Date,
  ): Promise<boolean> {
    // Implementation commented out to avoid duplicate code issues
    // Use restoreOccurrence instead
    this.logger.warn(
      'includeOccurrence is deprecated - use restoreOccurrence instead',
    );
    return Promise.resolve(false);
  }

  /**
   * Create a new occurrence entity from a parent event
   */
  private createOccurrenceFromParent(
    parentEvent: EventEntity,
    occurrenceDate: Date,
  ): EventEntity {
    // Calculate the time difference between start and end dates
    const duration = parentEvent.endDate
      ? parentEvent.endDate.getTime() - parentEvent.startDate.getTime()
      : 0;

    // Create end date for the occurrence based on the same duration
    const endDate =
      duration > 0 ? new Date(occurrenceDate.getTime() + duration) : undefined;

    // Create the occurrence entity
    const occurrence = new EventEntity();

    // Copy relevant properties from parent
    Object.assign(occurrence, {
      name: parentEvent.name,
      description: parentEvent.description,
      type: parentEvent.type,
      status: parentEvent.status,
      visibility: parentEvent.visibility,
      locationOnline: parentEvent.locationOnline,
      maxAttendees: parentEvent.maxAttendees,
      requireApproval: parentEvent.requireApproval,
      approvalQuestion: parentEvent.approvalQuestion,
      requireGroupMembership: parentEvent.requireGroupMembership,
      allowWaitlist: parentEvent.allowWaitlist,
      location: parentEvent.location,
      lat: parentEvent.lat,
      lon: parentEvent.lon,
      image: parentEvent.image,
      securityClass: parentEvent.securityClass,
      priority: parentEvent.priority,
      blocksTime: parentEvent.blocksTime,
      resources: parentEvent.resources,
      color: parentEvent.color,
      conferenceData: parentEvent.conferenceData,

      // Occurrence-specific fields
      startDate: occurrenceDate,
      endDate: endDate,
      series: parentEvent.series,
      originalDate: occurrenceDate,
    });

    return occurrence;
  }

  async createOccurrence(
    parentEventId: number,
    occurrenceDate: Date,
  ): Promise<EventEntity | null> {
    await this.initializeRepository();

    // Find the parent event
    const parentEvent = await this.eventRepository.findOne({
      where: { id: parentEventId },
      relations: ['series', 'user', 'group', 'categories'],
    });

    if (!parentEvent) {
      throw new NotFoundException(`Event with ID ${parentEventId} not found`);
    }

    // Verify this is a recurring event
    if (!parentEvent.series) {
      throw new BadRequestException(
        `Event with ID ${parentEventId} is not part of a series`,
      );
    }

    // Check if occurrence already exists
    const existingOccurrence = await this.findOccurrenceByDate(
      parentEventId,
      occurrenceDate,
    );

    if (existingOccurrence) {
      return existingOccurrence;
    }

    // Create a new occurrence
    const occurrence = this.eventRepository.create({
      ...parentEvent,
      id: undefined, // Ensure we get a new ID
      ulid: undefined, // Will be generated on save
      slug: undefined, // Will be generated on save
      startDate: occurrenceDate,
      endDate: parentEvent.endDate
        ? this.adjustEndDate(
            parentEvent.startDate,
            parentEvent.endDate,
            occurrenceDate,
          )
        : undefined,
      series: parentEvent.series, // Link to the same series
    });

    // Save the new occurrence
    return await this.eventRepository.save(occurrence);
  }

  /**
   * Find an occurrence by its date
   */
  async findOccurrenceByDate(
    parentEventId: number,
    occurrenceDate: Date,
  ): Promise<EventEntity | null> {
    await this.initializeRepository();

    const parentEvent = await this.eventRepository.findOne({
      where: { id: parentEventId },
      relations: ['series'],
    });

    if (!parentEvent || !parentEvent.series) {
      return null;
    }

    // Look for an existing materialized occurrence with this date
    // Since we don't have originalOccurrenceDate, use startDate instead
    const matchingEvents = await this.eventRepository.find({
      where: {
        series: { id: parentEvent.series.id },
        startDate: occurrenceDate,
      },
    });

    return matchingEvents.length > 0 ? matchingEvents[0] : null;
  }

  /**
   * Generate occurrences for a recurring event
   */
  @Trace('event-occurrence.getOccurrences')
  async getOccurrences(
    startDate: Date,
    endDate: Date,
    rule: any,
    exdates: string[] = [],
    timeZone: string = 'UTC',
  ): Promise<Date[]> {
    try {
      return await this.recurrencePatternService.generateOccurrences(
        startDate,
        rule,
        { timeZone, exdates, until: endDate },
      );
    } catch (error) {
      throw new Error(`Error generating occurrences: ${error.message}`);
    }
  }

  /**
   * Delete an occurrence from a recurring event
   */
  async deleteOccurrence(
    parentEventId: number,
    occurrenceDate: Date,
  ): Promise<void> {
    await this.initializeRepository();

    // Find the parent event
    const parentEvent = await this.eventRepository.findOne({
      where: { id: parentEventId },
      relations: ['series'],
    });

    if (!parentEvent) {
      throw new NotFoundException(`Event with ID ${parentEventId} not found`);
    }

    // Verify this is a recurring event
    if (!parentEvent.series) {
      throw new BadRequestException(
        `Event with ID ${parentEventId} is not part of a series`,
      );
    }

    // Check if there's a materialized occurrence for this date
    const existingOccurrence = await this.findOccurrenceByDate(
      parentEventId,
      occurrenceDate,
    );

    if (existingOccurrence) {
      // Delete the materialized occurrence
      await this.eventRepository.remove(existingOccurrence);
    }

    // Add the date to the exception list in the series
    const dateString = occurrenceDate.toISOString();

    // Ensure we have an exceptions array
    if (!parentEvent.series.recurrenceExceptions) {
      parentEvent.series.recurrenceExceptions = [];
    }

    // Add to exceptions if not already there
    if (!parentEvent.series.recurrenceExceptions.includes(dateString)) {
      parentEvent.series.recurrenceExceptions.push(dateString);
      await this.eventSeriesRepository.save(parentEvent.series);
    }
  }

  /**
   * Delete all occurrences for a recurring event
   */
  async deleteAllOccurrences(parentEventId: number): Promise<number> {
    await this.initializeRepository();

    // Find the parent event
    const parentEvent = await this.eventRepository.findOne({
      where: { id: parentEventId },
      relations: ['series'],
    });

    if (!parentEvent) {
      throw new NotFoundException(`Event with ID ${parentEventId} not found`);
    }

    // Verify this is a recurring event
    if (!parentEvent.series) {
      return 0; // Not a recurring event, so no occurrences to delete
    }

    // Find all materialized occurrences
    const occurrences = await this.eventRepository.find({
      where: {
        series: { id: parentEvent.series.id },
      },
    });

    // Delete each occurrence
    for (const occurrence of occurrences) {
      await this.eventRepository.remove(occurrence);
    }

    return occurrences.length;
  }

  /**
   * Restore a previously deleted occurrence
   */
  async restoreOccurrence(
    parentEventId: number,
    occurrenceDate: Date,
  ): Promise<EventEntity | null> {
    await this.initializeRepository();

    // Find the parent event
    const parentEvent = await this.eventRepository.findOne({
      where: { id: parentEventId },
      relations: ['series'],
    });

    if (!parentEvent) {
      throw new NotFoundException(`Event with ID ${parentEventId} not found`);
    }

    // Verify this is a recurring event
    if (!parentEvent.series) {
      throw new BadRequestException(
        `Event with ID ${parentEventId} is not part of a series`,
      );
    }

    const dateString = occurrenceDate.toISOString();

    // Remove date from exceptions if present
    if (
      parentEvent.series.recurrenceExceptions &&
      parentEvent.series.recurrenceExceptions.length > 0
    ) {
      parentEvent.series.recurrenceExceptions =
        parentEvent.series.recurrenceExceptions.filter((d) => d !== dateString);

      // Save the updated parent event with the exception removed
      await this.eventSeriesRepository.save(parentEvent.series);
    }

    // Check if there's a materialized occurrence - if not, we're done
    const existingOccurrence = await this.findOccurrenceByDate(
      parentEventId,
      occurrenceDate,
    );

    if (!existingOccurrence) {
      return null; // Nothing to restore
    }

    return existingOccurrence;
  }

  /**
   * Utility function to adjust the end date based on the time difference between
   * original start and end dates
   */
  private adjustEndDate(
    originalStart: Date,
    originalEnd: Date,
    newStart: Date,
  ): Date {
    const durationMs = originalEnd.getTime() - originalStart.getTime();
    return new Date(newStart.getTime() + durationMs);
  }
}

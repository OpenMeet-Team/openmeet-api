import { Injectable, Logger, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Repository, Between, IsNull, Not, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { EventEntity } from '../../infrastructure/persistence/relational/entities/event.entity';
import { TenantConnectionService } from '../../../tenant/tenant.service';
import { RecurrenceService } from '../../../recurrence/recurrence.service';
import { IEventOccurrenceService } from './event-occurrence.interface';
import { OccurrenceOptions } from '../../../recurrence/interfaces/recurrence.interface';
import { addDays, isAfter, isBefore, isEqual, parseISO } from 'date-fns';
import { Trace } from '../../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';

@Injectable({ scope: Scope.REQUEST })
export class EventOccurrenceService implements IEventOccurrenceService {
  private readonly logger = new Logger(EventOccurrenceService.name);
  private readonly tracer = trace.getTracer('event-occurrence-service');
  private eventRepository: Repository<EventEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly recurrenceService: RecurrenceService,
  ) {
    void this.initializeRepository();
  }

  @Trace('event-occurrence.initializeRepository')
  async initializeRepository() {
    const tenantId = this.request.tenantId;
    const dataSource = await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
  }

  /**
   * Generate occurrence events for a recurring event
   */
  @Trace('event-occurrence.generateOccurrences')
  async generateOccurrences(
    parentEvent: EventEntity,
    options: OccurrenceOptions = {},
  ): Promise<EventEntity[]> {
    try {
      await this.initializeRepository();

      if (!parentEvent.isRecurring || !parentEvent.recurrenceRule) {
        this.logger.warn(`Cannot generate occurrences for non-recurring event ${parentEvent.id}`);
        return [];
      }

      // Get recurrence rule and settings from parent event
      const { recurrenceRule, timeZone, startDate } = parentEvent;
      const recurrenceExceptions = parentEvent.recurrenceExceptions || [];

      // Set generation options
      const generationOptions: OccurrenceOptions = {
        timeZone: timeZone || 'UTC',
        ...options,
      };
      
      // Handle exception dates with proper typing
      if (recurrenceExceptions && recurrenceExceptions.length > 0) {
        const processedExdates = recurrenceExceptions.map(
          d => typeof d === 'string' ? d : new Date(d)
        );
        generationOptions.exdates = processedExdates as string[]; // Type assertion for TypeScript
      }

      // Generate occurrence dates using RecurrenceService
      const occurrenceDates = this.recurrenceService.generateOccurrences(
        startDate,
        recurrenceRule as any,
        generationOptions,
      );

      // Skip the first occurrence if it's the same as the parent event's start date
      const filteredDates = occurrenceDates.filter(date => 
        !isEqual(new Date(date.toISOString().split('T')[0]), 
                new Date(parentEvent.startDate.toISOString().split('T')[0]))
      );

      // Check which occurrences already exist in the database
      const existingOccurrences = await this.eventRepository.find({
        where: {
          parentEventId: parentEvent.id,
          isRecurrenceException: false,
        },
      });

      // Map of existing occurrence dates for quick lookup
      const existingDatesMap = new Map<string, EventEntity>();
      existingOccurrences.forEach(occurrence => {
        const dateKey = occurrence.startDate.toISOString().split('T')[0];
        existingDatesMap.set(dateKey, occurrence);
      });

      // Create occurrence events for new dates
      const newOccurrences: EventEntity[] = [];
      
      for (const occurrenceDate of filteredDates) {
        const dateKey = occurrenceDate.toISOString().split('T')[0];

        // Skip if this occurrence already exists
        if (existingDatesMap.has(dateKey)) {
          continue;
        }

        // Create the occurrence entity
        const occurrence = this.createOccurrenceFromParent(parentEvent, occurrenceDate);
        newOccurrences.push(occurrence);
      }

      // Batch save the new occurrences
      if (newOccurrences.length > 0) {
        return await this.eventRepository.save(newOccurrences);
      }

      return newOccurrences;
    } catch (error) {
      this.logger.error(`Error generating occurrences: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get occurrences of a recurring event within a date range
   */
  @Trace('event-occurrence.getOccurrencesInRange')
  async getOccurrencesInRange(
    parentEventId: number,
    startDate: Date,
    endDate: Date,
    includeExceptions: boolean = true,
  ): Promise<EventEntity[]> {
    try {
      await this.initializeRepository();

      // Fetch the parent event
      const parentEvent = await this.eventRepository.findOne({
        where: { id: parentEventId, isRecurring: true },
      });

      if (!parentEvent) {
        this.logger.warn(`Parent event with ID ${parentEventId} not found or not recurring`);
        return [];
      }

      // Base query conditions for occurrences
      const whereConditions: any = {
        parentEventId,
        startDate: Between(startDate, endDate),
      };

      // If we don't want exceptions, exclude them
      if (!includeExceptions) {
        whereConditions.isRecurrenceException = false;
      }

      // Fetch occurrences from the database
      const occurrences = await this.eventRepository.find({
        where: whereConditions,
        order: { startDate: 'ASC' },
      });

      // Check if we need to generate additional occurrences
      const { recurrenceRule, timeZone } = parentEvent;
      
      if (recurrenceRule) {
        // Generate occurrence dates for the range
        const generatedDates = this.recurrenceService.generateOccurrences(
          parentEvent.startDate,
          recurrenceRule as any,
          {
            timeZone: timeZone || 'UTC',
            exdates: parentEvent.recurrenceExceptions,
            until: endDate,
          },
        ).filter(date => 
          isAfter(date, startDate) && 
          isBefore(date, endDate)
        );

        // Create a map of existing occurrences by date for quick lookup
        const existingDatesMap = new Map<string, boolean>();
        occurrences.forEach(occurrence => {
          const dateKey = occurrence.startDate.toISOString().split('T')[0];
          existingDatesMap.set(dateKey, true);
        });

        // Create occurrence entities for dates not in the database
        const newOccurrences: EventEntity[] = [];
        
        for (const occurrenceDate of generatedDates) {
          const dateKey = occurrenceDate.toISOString().split('T')[0];
          
          // Skip if this occurrence already exists
          if (existingDatesMap.has(dateKey)) {
            continue;
          }
          
          // Create the occurrence entity
          const occurrence = this.createOccurrenceFromParent(parentEvent, occurrenceDate);
          newOccurrences.push(occurrence);
        }

        // Batch save the new occurrences
        if (newOccurrences.length > 0) {
          const savedOccurrences = await this.eventRepository.save(newOccurrences);
          occurrences.push(...savedOccurrences);
        }
      }

      // Sort by start date before returning
      return occurrences.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    } catch (error) {
      this.logger.error(`Error getting occurrences in range: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Create or update an exception occurrence of a recurring event
   */
  @Trace('event-occurrence.createExceptionOccurrence')
  async createExceptionOccurrence(
    parentEventId: number,
    originalDate: Date,
    modifications: Partial<EventEntity>,
  ): Promise<EventEntity> {
    try {
      await this.initializeRepository();

      // Fetch the parent event
      const parentEvent = await this.eventRepository.findOne({
        where: { id: parentEventId, isRecurring: true },
      });

      if (!parentEvent) {
        throw new Error(`Parent event with ID ${parentEventId} not found or not recurring`);
      }

      // Check if this occurrence is part of the recurrence pattern
      const isInPattern = this.recurrenceService.isDateInRecurrencePattern(
        originalDate,
        parentEvent.startDate,
        parentEvent.recurrenceRule as any,
        parentEvent.timeZone,
        parentEvent.recurrenceExceptions,
      );

      if (!isInPattern) {
        throw new Error(`Date ${originalDate.toISOString()} is not part of the recurrence pattern`);
      }

      // Check if this exception already exists
      let existingException = await this.eventRepository.findOne({
        where: {
          parentEventId,
          originalDate,
          isRecurrenceException: true,
        },
      });

      // If it exists, update it
      if (existingException) {
        Object.assign(existingException, modifications);
        return await this.eventRepository.save(existingException);
      }

      // Otherwise, create a new exception occurrence
      // First, find the regular occurrence if it exists
      let occurrence = await this.eventRepository.findOne({
        where: {
          parentEventId,
          startDate: originalDate,
          isRecurrenceException: false,
        },
      });

      // If no occurrence exists yet, create one from the parent
      if (!occurrence) {
        occurrence = this.createOccurrenceFromParent(parentEvent, originalDate);
      }

      // Convert it to an exception and apply modifications
      occurrence.isRecurrenceException = true;
      occurrence.originalDate = originalDate;
      Object.assign(occurrence, modifications);

      // Add to parent's exception list if not already there
      if (!parentEvent.recurrenceExceptions) {
        parentEvent.recurrenceExceptions = [];
      }

      if (!parentEvent.recurrenceExceptions.includes(originalDate.toISOString())) {
        parentEvent.recurrenceExceptions.push(originalDate.toISOString());
        await this.eventRepository.save(parentEvent);
      }

      // Save and return the exception occurrence
      return await this.eventRepository.save(occurrence);
    } catch (error) {
      this.logger.error(`Error creating exception occurrence: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete an occurrence from a recurring event
   */
  @Trace('event-occurrence.excludeOccurrence')
  async excludeOccurrence(
    parentEventId: number,
    occurrenceDate: Date,
  ): Promise<boolean> {
    try {
      await this.initializeRepository();

      // Fetch the parent event
      const parentEvent = await this.eventRepository.findOne({
        where: { id: parentEventId, isRecurring: true },
      });

      if (!parentEvent) {
        throw new Error(`Parent event with ID ${parentEventId} not found or not recurring`);
      }

      // Check if this occurrence is part of the recurrence pattern
      const isInPattern = this.recurrenceService.isDateInRecurrencePattern(
        occurrenceDate,
        parentEvent.startDate,
        parentEvent.recurrenceRule as any,
        parentEvent.timeZone,
      );

      if (!isInPattern) {
        throw new Error(`Date ${occurrenceDate.toISOString()} is not part of the recurrence pattern`);
      }

      // Add to parent's exception list if not already there
      if (!parentEvent.recurrenceExceptions) {
        parentEvent.recurrenceExceptions = [];
      }

      const dateString = occurrenceDate.toISOString();
      if (!parentEvent.recurrenceExceptions.includes(dateString)) {
        parentEvent.recurrenceExceptions.push(dateString);
        await this.eventRepository.save(parentEvent);
      }

      // Delete any existing occurrence for this date
      const result = await this.eventRepository.delete({
        parentEventId,
        startDate: occurrenceDate,
      });

      return result.affected ? result.affected > 0 : false;
    } catch (error) {
      this.logger.error(`Error excluding occurrence: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Add back a previously excluded occurrence
   */
  @Trace('event-occurrence.includeOccurrence')
  async includeOccurrence(
    parentEventId: number,
    occurrenceDate: Date,
  ): Promise<boolean> {
    try {
      await this.initializeRepository();

      // Fetch the parent event
      const parentEvent = await this.eventRepository.findOne({
        where: { id: parentEventId, isRecurring: true },
      });

      if (!parentEvent) {
        throw new Error(`Parent event with ID ${parentEventId} not found or not recurring`);
      }

      // Remove from parent's exception list
      if (parentEvent.recurrenceExceptions && parentEvent.recurrenceExceptions.length > 0) {
        const dateString = occurrenceDate.toISOString();
        parentEvent.recurrenceExceptions = parentEvent.recurrenceExceptions
          .filter(d => d !== dateString);
        await this.eventRepository.save(parentEvent);
      }

      // Create a new occurrence for this date if it doesn't exist
      const existingOccurrence = await this.eventRepository.findOne({
        where: {
          parentEventId,
          startDate: occurrenceDate,
        },
      });

      if (!existingOccurrence) {
        const newOccurrence = this.createOccurrenceFromParent(parentEvent, occurrenceDate);
        await this.eventRepository.save(newOccurrence);
      }

      return true;
    } catch (error) {
      this.logger.error(`Error including occurrence: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Delete all occurrences of a recurring event
   */
  @Trace('event-occurrence.deleteAllOccurrences')
  async deleteAllOccurrences(parentEventId: number): Promise<number> {
    try {
      await this.initializeRepository();

      // Delete all occurrences for this parent event
      const result = await this.eventRepository.delete({
        parentEventId,
      });

      return result.affected ? result.affected : 0;
    } catch (error) {
      this.logger.error(`Error deleting occurrences: ${error.message}`, error.stack);
      return 0;
    }
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
    const endDate = duration > 0
      ? new Date(occurrenceDate.getTime() + duration)
      : undefined;

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
      isAllDay: parentEvent.isAllDay,
      securityClass: parentEvent.securityClass,
      priority: parentEvent.priority,
      blocksTime: parentEvent.blocksTime,
      resources: parentEvent.resources,
      color: parentEvent.color,
      conferenceData: parentEvent.conferenceData,
      
      // Occurrence-specific fields
      startDate: occurrenceDate,
      endDate: endDate,
      parentEventId: parentEvent.id,
      timeZone: parentEvent.timeZone,
      isRecurring: false,
      isRecurrenceException: false,
    });

    return occurrence;
  }
}
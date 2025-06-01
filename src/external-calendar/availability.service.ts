import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { CalendarSourceService } from '../calendar-source/calendar-source.service';
import { ExternalEventRepository } from './infrastructure/persistence/relational/repositories/external-event.repository';

export interface ConflictEvent {
  eventId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  calendarSourceUlid: string;
}

export interface AvailabilityResult {
  available: boolean;
  conflicts: string[];
  conflictingEvents: ConflictEvent[];
}

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    private readonly calendarSourceService: CalendarSourceService,
    private readonly externalEventRepository: ExternalEventRepository,
  ) {}

  async checkAvailability(
    userId: number,
    startTime: Date,
    endTime: Date,
    calendarSourceIds: string[],
    tenantId: string,
  ): Promise<AvailabilityResult> {
    this.logger.log(
      `Checking availability for user ${userId} from ${startTime} to ${endTime}`,
    );

    // Validate time range
    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }

    // Get calendar sources to check
    const calendarSources = await this.getCalendarSources(
      userId,
      calendarSourceIds,
      tenantId,
    );

    // Check each calendar source for conflicts
    const conflicts: string[] = [];
    const conflictingEvents: ConflictEvent[] = [];

    for (const calendarSource of calendarSources) {
      const events =
        await this.externalEventRepository.findByCalendarSourceAndTimeRange(
          tenantId,
          calendarSource.id,
          startTime,
          endTime,
        );

      if (events.length > 0) {
        conflicts.push(calendarSource.ulid);

        // Convert events to conflict format
        const sourceConflicts = events.map((event) => ({
          eventId: event.externalId,
          title: event.summary || 'Untitled Event',
          startTime: event.startTime,
          endTime: event.endTime,
          calendarSourceUlid: calendarSource.ulid,
        }));

        conflictingEvents.push(...sourceConflicts);
      }
    }

    const available = conflicts.length === 0;

    this.logger.log(
      `Availability check for user ${userId}: ${available ? 'available' : `${conflicts.length} conflicts found`}`,
    );

    return {
      available,
      conflicts,
      conflictingEvents,
    };
  }

  async getConflicts(
    userId: number,
    startTime: Date,
    endTime: Date,
    calendarSourceIds: string[],
    tenantId: string,
  ): Promise<ConflictEvent[]> {
    this.logger.log(
      `Getting conflicts for user ${userId} from ${startTime} to ${endTime}`,
    );

    // Validate time range
    if (endTime <= startTime) {
      throw new BadRequestException('Invalid date range');
    }

    // Get calendar sources to check
    const calendarSources = await this.getCalendarSources(
      userId,
      calendarSourceIds,
      tenantId,
    );

    // Get all events from all specified calendar sources
    const allConflicts: ConflictEvent[] = [];

    for (const calendarSource of calendarSources) {
      const events =
        await this.externalEventRepository.findByCalendarSourceAndTimeRange(
          tenantId,
          calendarSource.id,
          startTime,
          endTime,
        );

      // Convert events to conflict format
      const sourceConflicts = events.map((event) => ({
        eventId: event.externalId,
        title: event.summary || 'Untitled Event',
        startTime: event.startTime,
        endTime: event.endTime,
        calendarSourceUlid: calendarSource.ulid,
      }));

      allConflicts.push(...sourceConflicts);
    }

    // Sort by start time
    allConflicts.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    this.logger.log(
      `Found ${allConflicts.length} conflicts for user ${userId}`,
    );

    return allConflicts;
  }

  private async getCalendarSources(
    userId: number,
    calendarSourceIds: string[],
    tenantId: string,
  ) {
    if (calendarSourceIds.length === 0) {
      // Use all active calendar sources for the user
      this.logger.debug(`Using all calendar sources for user ${userId}`);
      return await this.calendarSourceService.findAllByUser(userId, tenantId);
    }

    // Validate and fetch specific calendar sources
    const calendarSources: any[] = [];
    for (const ulid of calendarSourceIds) {
      try {
        const calendarSource = await this.calendarSourceService.findByUlid(
          ulid,
          tenantId,
        );

        // Verify user ownership
        if (calendarSource.userId !== userId) {
          throw new NotFoundException(
            `Calendar source ${ulid} not found or access denied`,
          );
        }

        calendarSources.push(calendarSource);
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw new NotFoundException(`One or more calendar sources not found`);
        }
        throw error;
      }
    }

    return calendarSources;
  }
}

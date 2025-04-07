import { EventEntity } from '../../infrastructure/persistence/relational/entities/event.entity';
import { OccurrenceOptions } from '../../../event-series/interfaces/recurrence.interface';

/**
 * @deprecated This interface is deprecated and will be removed in a future version.
 * Please use EventSeriesOccurrenceService instead for all recurrence-related functionality.
 */
export interface IEventOccurrenceService {
  /**
   * Generate occurrence events for a recurring event
   * @deprecated Use EventSeriesOccurrenceService.getUpcomingOccurrences instead
   */
  generateOccurrences(
    parentEvent: EventEntity,
    options?: OccurrenceOptions,
  ): Promise<EventEntity[]>;

  /**
   * Get occurrences of a recurring event within a date range
   * @deprecated Use EventSeriesOccurrenceService.getUpcomingOccurrences instead
   */
  getOccurrencesInRange(
    parentEventId: number,
    startDate: Date,
    endDate: Date,
    includeExceptions?: boolean,
  ): Promise<EventEntity[]>;

  /**
   * Create or update an exception occurrence of a recurring event
   * @deprecated Use EventSeriesOccurrenceService.materializeOccurrence instead
   */
  createExceptionOccurrence(
    parentEventId: number,
    originalDate: Date,
    modifications: Partial<EventEntity>,
  ): Promise<EventEntity>;

  /**
   * Delete an occurrence from a recurring event
   * @deprecated Use EventSeriesOccurrenceService methods instead
   */
  excludeOccurrence(
    parentEventId: number,
    occurrenceDate: Date,
  ): Promise<boolean>;

  /**
   * Add back a previously excluded occurrence
   * @deprecated Use EventSeriesOccurrenceService methods instead
   */
  includeOccurrence(
    parentEventId: number,
    occurrenceDate: Date,
  ): Promise<boolean>;

  /**
   * Delete all occurrences of a recurring event
   * @deprecated Use EventSeriesService.delete instead to remove the entire series
   */
  deleteAllOccurrences(parentEventId: number): Promise<number>;
}

import { EventEntity } from '../../infrastructure/persistence/relational/entities/event.entity';
import { OccurrenceOptions } from '../../../event-series/interfaces/recurrence.interface';

export interface IEventOccurrenceService {
  /**
   * Generate occurrence events for a recurring event
   */
  generateOccurrences(
    parentEvent: EventEntity,
    options?: OccurrenceOptions,
  ): Promise<EventEntity[]>;

  /**
   * Get occurrences of a recurring event within a date range
   */
  getOccurrencesInRange(
    parentEventId: number,
    startDate: Date,
    endDate: Date,
    includeExceptions?: boolean,
  ): Promise<EventEntity[]>;

  /**
   * Create or update an exception occurrence of a recurring event
   */
  createExceptionOccurrence(
    parentEventId: number,
    originalDate: Date,
    modifications: Partial<EventEntity>,
  ): Promise<EventEntity>;

  /**
   * Delete an occurrence from a recurring event
   */
  excludeOccurrence(
    parentEventId: number,
    occurrenceDate: Date,
  ): Promise<boolean>;

  /**
   * Add back a previously excluded occurrence
   */
  includeOccurrence(
    parentEventId: number,
    occurrenceDate: Date,
  ): Promise<boolean>;

  /**
   * Delete all occurrences of a recurring event
   */
  deleteAllOccurrences(parentEventId: number): Promise<number>;
}

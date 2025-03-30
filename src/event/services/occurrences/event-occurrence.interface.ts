import { EventEntity } from '../../infrastructure/persistence/relational/entities/event.entity';
import { OccurrenceOptions } from '../../../recurrence/interfaces/recurrence.interface';

/**
 * Interface for managing event occurrences
 */
export interface IEventOccurrenceService {
  /**
   * Generate occurrence events for a recurring event
   * 
   * @param parentEvent - The parent recurring event
   * @param options - Options for occurrence generation
   * @returns Array of generated occurrence events
   */
  generateOccurrences(
    parentEvent: EventEntity,
    options?: OccurrenceOptions,
  ): Promise<EventEntity[]>;
  
  /**
   * Get occurrences of a recurring event within a date range
   * 
   * @param parentEventId - ID of the parent recurring event
   * @param startDate - Start of the date range
   * @param endDate - End of the date range
   * @param includeExceptions - Whether to include exception occurrences
   * @returns Array of occurrence events within the specified range
   */
  getOccurrencesInRange(
    parentEventId: number,
    startDate: Date,
    endDate: Date,
    includeExceptions?: boolean,
  ): Promise<EventEntity[]>;
  
  /**
   * Create or update an exception occurrence of a recurring event
   * 
   * @param parentEventId - ID of the parent recurring event
   * @param originalDate - Original date of the occurrence to modify
   * @param modifications - Properties to modify in the occurrence
   * @returns The modified occurrence event
   */
  createExceptionOccurrence(
    parentEventId: number,
    originalDate: Date,
    modifications: Partial<EventEntity>,
  ): Promise<EventEntity>;
  
  /**
   * Delete an occurrence from a recurring event
   * 
   * @param parentEventId - ID of the parent recurring event
   * @param occurrenceDate - Date of the occurrence to exclude
   * @returns Success status
   */
  excludeOccurrence(
    parentEventId: number,
    occurrenceDate: Date,
  ): Promise<boolean>;
  
  /**
   * Add back a previously excluded occurrence
   * 
   * @param parentEventId - ID of the parent recurring event
   * @param occurrenceDate - Date of the occurrence to include
   * @returns Success status
   */
  includeOccurrence(
    parentEventId: number,
    occurrenceDate: Date,
  ): Promise<boolean>;
  
  /**
   * Delete all occurrences of a recurring event
   * 
   * @param parentEventId - ID of the parent recurring event
   * @returns Number of deleted occurrences
   */
  deleteAllOccurrences(
    parentEventId: number,
  ): Promise<number>;
}
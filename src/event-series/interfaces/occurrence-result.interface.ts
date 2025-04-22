import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';

/**
 * Interface defining the structure of occurrence results
 */
export interface OccurrenceResult {
  /**
   * ISO string date of the occurrence
   */
  date: string;

  /**
   * Optional event entity if the occurrence is materialized
   */
  event?: EventEntity;

  /**
   * Whether this occurrence exists as a concrete event in the database
   */
  materialized: boolean;

  /**
   * Optional error message if there was a problem generating this occurrence
   */
  error?: string;
}

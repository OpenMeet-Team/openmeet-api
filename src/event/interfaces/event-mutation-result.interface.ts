import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';

/**
 * Result of an event mutation operation (create/update).
 *
 * This interface wraps the event entity with additional metadata
 * about AT Protocol publishing status.
 */
export interface EventMutationResult {
  /** The created or updated event */
  event: EventEntity;

  /**
   * Indicates the user needs to re-link their AT Protocol account via OAuth.
   * When true, the frontend should prompt the user to connect their account.
   */
  needsOAuthLink?: boolean;
}

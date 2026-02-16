/**
 * Result of an AT Protocol publishing operation.
 *
 * The `action` field is the primary indicator of what happened:
 * - 'published': New record created on PDS
 * - 'updated': Existing record updated on PDS
 * - 'deleted': Record deleted from PDS
 * - 'skipped': Record not eligible for publishing (not an error)
 * - 'pending': Reserved for future background processing
 * - 'error': Publishing failed with an actionable error message
 * - 'conflict': PDS record was modified externally (optimistic concurrency conflict)
 */
export interface PublishResult {
  /** What action was taken - primary indicator of result */
  action: 'published' | 'updated' | 'deleted' | 'skipped' | 'pending' | 'error' | 'conflict';

  /** The AT Protocol URI of the published record (e.g., at://did:plc:xxx/community.lexicon.calendar.event/rkey) */
  atprotoUri?: string;

  /** The record key used in the AT Protocol URI */
  atprotoRkey?: string;

  /** The Content Identifier (CID) of the published record, used for StrongRef */
  atprotoCid?: string;

  /** Error message when action is 'error' */
  error?: string;

  /** Indicates the user needs to re-link their AT Protocol account via OAuth */
  needsOAuthLink?: boolean;

  /** Validation error message when record fails lexicon schema validation */
  validationError?: string;
}

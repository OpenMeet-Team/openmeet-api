/**
 * Generic wrapper for a row from any Contrail per-collection table.
 * The `record` field is typed per-collection via lexicon-generated types.
 *
 * All Contrail tables share the same base columns (uri, did, rkey, cid,
 * record, time_us, indexed_at). Count columns vary per collection
 * based on Contrail's relation config.
 */
export interface ContrailRecord<T = Record<string, unknown>> {
  uri: string;
  did: string;
  rkey: string;
  cid: string | null;
  record: T | null;
  time_us: string; // PG bigint → string
  indexed_at: string;
  // Count columns are dynamic — access via bracket notation
  [key: string]: unknown;
}

/**
 * Derive the Contrail table name from a collection NSID.
 * Mirrors Contrail's `recordsTableName()` in src/core/types.ts.
 */
export function contrailTableName(collection: string): string {
  return 'records_' + collection.replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * A SQL condition with parameterized values.
 * Param placeholders use $N numbering (caller manages the offset).
 */
export interface ContrailCondition {
  sql: string;
  params: unknown[];
}

declare module '@atmo-dev/contrail' {
  export interface QueryableField {
    type?: 'range';
  }

  export interface RelationConfig {
    collection: string;
    field?: string;
    match?: 'uri' | 'did';
    groupBy?: string;
    count?: boolean;
    countDistinct?: string;
    groups?: Record<string, string>;
  }

  export interface ReferenceConfig {
    collection: string;
    field: string;
  }

  export interface CollectionConfig {
    collection: string;
    discover?: boolean;
    queryable?: Record<string, QueryableField>;
    relations?: Record<string, RelationConfig>;
    references?: Record<string, ReferenceConfig>;
    searchable?: string[] | false;
    methods?: ('listRecords' | 'getRecord')[];
    timeField?: string | false;
  }

  export interface Logger {
    log(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
  }

  export interface ContrailConfig {
    namespace: string;
    collections: Record<string, CollectionConfig>;
    relays?: string[];
    jetstreams?: string[];
    logger?: Logger;
    notify?: boolean | string;
  }

  export type Database = unknown;

  export interface ContrailOptions extends ContrailConfig {
    db?: Database;
    spacesDb?: Database;
  }

  export interface BackfillProgress {
    records: number;
    usersComplete: number;
    usersTotal: number;
    usersFailed: number;
  }

  export interface BackfillAllOptions {
    concurrency?: number;
    onProgress?: (p: BackfillProgress) => void;
  }

  export class Contrail {
    constructor(options: ContrailOptions);
    init(db?: Database, spacesDb?: Database): Promise<void>;
    discover(db?: Database): Promise<string[]>;
    backfill(options?: BackfillAllOptions, db?: Database): Promise<number>;
  }
}

declare module '@atmo-dev/contrail/server' {
  import type { Contrail } from '@atmo-dev/contrail';
  export function createHandler(
    contrail: Contrail,
  ): (request: Request) => Promise<Response>;
}

declare module '@atmo-dev/contrail/postgres' {
  import type { Pool } from 'pg';
  import type { Database } from '@atmo-dev/contrail';
  export function createPostgresDatabase(pool: Pool): Database;
}

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

  export interface NetworkOverrides {
    resolver?: unknown;
    slingshotUrl?: string;
    additionalAllowedHosts?: string[];
  }

  export interface ContrailConfig {
    namespace: string;
    collections: Record<string, CollectionConfig>;
    relays?: string[];
    jetstreams?: string[];
    logger?: Logger;
    notify?: boolean | string;
    networkOverrides?: NetworkOverrides;
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

  export interface RunPersistentOptions {
    signal?: AbortSignal;
  }

  export interface CollectionStats {
    missing: number;
    staleUpdates: number;
    inSync: number;
  }

  export interface RefreshProgress {
    usersComplete: number;
    usersTotal: number;
    usersFailed: number;
    recordsScanned: number;
  }

  export interface RefreshResult {
    byCollection: Record<string, CollectionStats>;
    total: CollectionStats;
    usersScanned: number;
    usersFailed: number;
    ignoreWindowMs: number;
    elapsedMs: number;
  }

  export interface RefreshOptions {
    concurrency?: number;
    ignoreWindowMs?: number;
    nsids?: string[];
    onProgress?: (p: RefreshProgress) => void;
    maxRetries?: number;
    requestTimeout?: number;
  }

  export class Contrail {
    constructor(options: ContrailOptions);
    init(db?: Database, spacesDb?: Database): Promise<void>;
    discover(db?: Database): Promise<string[]>;
    backfill(options?: BackfillAllOptions, db?: Database): Promise<number>;
    refresh(options?: RefreshOptions, db?: Database): Promise<RefreshResult>;
    runPersistent(options?: RunPersistentOptions): Promise<void>;
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

declare module '@atcute/identity-resolver' {
  export class CompositeDidDocumentResolver {
    constructor(config: { methods: Record<string, unknown> });
  }
  export class PlcDidDocumentResolver {
    constructor(config: { apiUrl: string });
  }
  export class WebDidDocumentResolver {
    constructor();
  }
}

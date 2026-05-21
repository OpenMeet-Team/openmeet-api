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

  export interface CredentialKeyMaterial {
    /** Private key in JWK form. P-256 / ES256. */
    privateKey: Record<string, unknown>;
    /** Public key in JWK form. Must match privateKey. */
    publicKey: Record<string, unknown>;
    /** DID-doc verification method id. Defaults to "atproto_space_authority". */
    keyId?: string;
  }

  export interface AuthorityConfig {
    /** NSID identifying the kind of space this authority hosts. */
    type: string;
    /** Service DID that service-auth tokens target (aud) and that signs
     *  issued credentials (iss). */
    serviceDid: string;
    /** ES256 signing key for issuing space credentials. When omitted,
     *  net.openmeet.space.getCredential returns 501. */
    signing?: CredentialKeyMaterial;
  }

  export interface SpacesConfig {
    authority?: AuthorityConfig;
  }

  /** Opaque pre-built community integration from @atmo-dev/contrail-community. */
  export type CommunityIntegration = unknown;

  export interface ContrailConfig {
    namespace: string;
    collections: Record<string, CollectionConfig>;
    relays?: string[];
    jetstreams?: string[];
    logger?: Logger;
    notify?: boolean | string;
    networkOverrides?: NetworkOverrides;
    spaces?: SpacesConfig;
    /** User-supplied community config blob (masterKey, plcDirectory, etc.).
     *  Read by the community integration via config.community. */
    community?: unknown;
  }

  export type Database = unknown;

  export interface ContrailOptions extends ContrailConfig {
    db?: Database;
    spacesDb?: Database;
    communityIntegration?: CommunityIntegration;
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

  export function generateAuthoritySigningKey(): Promise<CredentialKeyMaterial>;
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

declare module '@atmo-dev/contrail-community' {
  import type {
    Database,
    ContrailConfig,
    CommunityIntegration,
  } from '@atmo-dev/contrail';

  export interface CommunityIntegrationOptions {
    db: Database;
    config: ContrailConfig;
  }

  export function createCommunityIntegration(
    options: CommunityIntegrationOptions,
  ): CommunityIntegration;
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

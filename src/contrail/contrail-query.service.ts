import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import {
  ContrailRecord,
  ContrailCondition,
  contrailTableName,
} from './contrail-record.types';

/**
 * Allowlist of valid ORDER BY expressions for Contrail queries.
 * Any orderBy value not in this list will be rejected to prevent SQL injection.
 */
const VALID_ORDER_BY_EXPRESSIONS = [
  "record->>'startsAt' ASC, uri ASC",
  "r.record->>'startsAt' ASC, r.uri ASC",
] as const;

/**
 * Collection-generic query service for Contrail's per-collection tables.
 *
 * Callers pass a collection NSID and SQL conditions; this service
 * handles table name derivation, parameterized queries, and pagination.
 * Domain-specific query logic (which fields to filter, how to interpret
 * the record JSONB) belongs in the calling service, not here.
 */
@Injectable()
export class ContrailQueryService {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  /**
   * Validate that an orderBy expression is in the allowlist.
   */
  private validateOrderBy(orderBy: string): void {
    if (
      !VALID_ORDER_BY_EXPRESSIONS.includes(
        orderBy as (typeof VALID_ORDER_BY_EXPRESSIONS)[number],
      )
    ) {
      throw new Error(
        `Invalid orderBy expression: "${orderBy}". Must be one of: ${VALID_ORDER_BY_EXPRESSIONS.join(', ')}`,
      );
    }
  }

  /**
   * Get DataSource for the public schema where Contrail tables live.
   * Empty-string tenant ID maps to the default (public) schema.
   */
  async getPublicDataSource(): Promise<DataSource> {
    return this.tenantConnectionService.getTenantConnection('');
  }

  /**
   * Query any Contrail collection table with conditions, ordering, and pagination.
   */
  async find<T = Record<string, unknown>>(
    collection: string,
    options: {
      conditions?: ContrailCondition[];
      orderBy?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ records: ContrailRecord<T>[]; total: number }> {
    if (options.orderBy) {
      this.validateOrderBy(options.orderBy);
    }

    const table = contrailTableName(collection);
    const ds = await this.getPublicDataSource();

    // Flatten conditions into a single WHERE clause with sequential $N params
    const allParams: unknown[] = [];
    const sqlParts: string[] = [];
    let paramIdx = 0;

    for (const cond of options.conditions ?? []) {
      // Rewrite $1, $2, ... in each condition to the global offset
      const rewritten = cond.sql.replace(/\$(\d+)/g, () => {
        paramIdx++;
        return `$${paramIdx}`;
      });
      sqlParts.push(rewritten);
      allParams.push(...cond.params);
    }

    const where = sqlParts.length > 0 ? `WHERE ${sqlParts.join(' AND ')}` : '';

    const countResult = await ds.query(
      `SELECT count(*) as total FROM ${table} ${where}`,
      allParams,
    );
    const total = parseInt(countResult[0]?.total ?? '0', 10);

    const orderClause = options.orderBy ? `ORDER BY ${options.orderBy}` : '';

    let pageSql = `SELECT * FROM ${table} ${where} ${orderClause}`;
    const pageParams = [...allParams];

    if (options.limit) {
      pageSql += ` LIMIT $${pageParams.length + 1}`;
      pageParams.push(options.limit);
    }
    if (options.offset) {
      pageSql += ` OFFSET $${pageParams.length + 1}`;
      pageParams.push(options.offset);
    }

    const records = (await ds.query(
      pageSql,
      pageParams,
    )) as ContrailRecord<T>[];
    return { records, total };
  }

  /**
   * Query a Contrail collection with a geo filter via atproto_geo_index JOIN.
   * Deduplicates multi-location events via GROUP BY.
   */
  async findWithGeoFilter<T = Record<string, unknown>>(
    collection: string,
    geoFilter: { lat: number; lon: number; radiusMeters: number },
    options: {
      conditions?: ContrailCondition[];
      orderBy?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ records: ContrailRecord<T>[]; total: number }> {
    if (options.orderBy) {
      this.validateOrderBy(options.orderBy);
    }

    const table = contrailTableName(collection);
    const ds = await this.getPublicDataSource();

    // Build conditions with sequential params, reserving $1-$3 for geo
    const geoParams: unknown[] = [
      geoFilter.lon,
      geoFilter.lat,
      geoFilter.radiusMeters,
    ];
    let paramIdx = 3;

    const sqlParts: string[] = [
      `ST_DWithin(g.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`,
    ];

    for (const cond of options.conditions ?? []) {
      const rewritten = cond.sql.replace(/\$(\d+)/g, () => {
        paramIdx++;
        return `$${paramIdx}`;
      });
      sqlParts.push(rewritten);
      geoParams.push(...cond.params);
    }

    const where = `WHERE ${sqlParts.join(' AND ')}`;
    const allParams = geoParams;

    // Count distinct events matching geo + conditions
    const countResult = await ds.query(
      `SELECT count(DISTINCT r.uri) as total
       FROM ${table} r
       JOIN atproto_geo_index g ON g.uri = r.uri
       ${where}`,
      allParams,
    );
    const total = parseInt(countResult[0]?.total ?? '0', 10);

    const orderClause = options.orderBy ? `ORDER BY ${options.orderBy}` : '';

    // Select with GROUP BY to deduplicate multi-location matches
    let pageSql = `
      SELECT r.*
      FROM ${table} r
      JOIN atproto_geo_index g ON g.uri = r.uri
      ${where}
      GROUP BY r.uri, r.did, r.rkey, r.cid, r.record, r.time_us, r.indexed_at
      ${orderClause}`;
    const pageParams = [...allParams];

    if (options.limit) {
      pageSql += ` LIMIT $${pageParams.length + 1}`;
      pageParams.push(options.limit);
    }
    if (options.offset) {
      pageSql += ` OFFSET $${pageParams.length + 1}`;
      pageParams.push(options.offset);
    }

    const records = (await ds.query(
      pageSql,
      pageParams,
    )) as ContrailRecord<T>[];
    return { records, total };
  }

  /**
   * Look up a single record by its AT URI.
   */
  async findByUri<T = Record<string, unknown>>(
    collection: string,
    uri: string,
  ): Promise<ContrailRecord<T> | null> {
    const table = contrailTableName(collection);
    const ds = await this.getPublicDataSource();
    const rows = await ds.query(`SELECT * FROM ${table} WHERE uri = $1`, [uri]);
    return (rows[0] as ContrailRecord<T>) ?? null;
  }

  /**
   * Batch-fetch records by multiple URIs in a single query.
   * Uses PK index on uri column.
   */
  async findByUris<T = Record<string, unknown>>(
    collection: string,
    uris: string[],
  ): Promise<ContrailRecord<T>[]> {
    if (uris.length === 0) return [];
    const table = contrailTableName(collection);
    const ds = await this.getPublicDataSource();
    const placeholders = uris.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await ds.query(
      `SELECT * FROM ${table} WHERE uri IN (${placeholders})`,
      uris,
    );
    return rows as ContrailRecord<T>[];
  }

  /**
   * Batch DID → handle resolution from the identities table.
   */
  async resolveHandles(dids: string[]): Promise<Map<string, string>> {
    if (dids.length === 0) return new Map();

    const ds = await this.getPublicDataSource();
    const placeholders = dids.map((_, i) => `$${i + 1}`).join(', ');
    const rows: Array<{ did: string; handle: string | null }> = await ds.query(
      `SELECT did, handle FROM identities WHERE did IN (${placeholders})`,
      dids,
    );

    return new Map(
      rows.filter((r) => r.handle !== null).map((r) => [r.did, r.handle!]),
    );
  }
}

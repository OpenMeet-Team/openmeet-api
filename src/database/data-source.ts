import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { SpanStatusCode, trace, context, SpanKind } from '@opentelemetry/api';
import { getMetricsService } from './database-metrics.service';
import { createHash } from 'crypto';

/**
 * Extract the SQL operation type from a query string
 */
function extractOperation(query: string): string {
  const trimmed = query.trim().toUpperCase();
  if (trimmed.startsWith('SELECT')) return 'SELECT';
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  if (trimmed.startsWith('BEGIN')) return 'BEGIN';
  if (trimmed.startsWith('COMMIT')) return 'COMMIT';
  if (trimmed.startsWith('ROLLBACK')) return 'ROLLBACK';
  return 'OTHER';
}

/**
 * Sanitize SQL query by replacing literal values with placeholders
 * Removes sensitive data like emails, passwords, API keys from traces
 * @internal Exported for testing
 */
export function sanitizeQuery(query: string): string {
  let sanitized = query;

  // Replace string literals (single quotes): 'value' -> ?
  sanitized = sanitized.replace(/'([^']*)'/g, '?');

  // Replace numeric literals that aren't part of SQL keywords
  // Matches standalone numbers but not in table names, column names, etc.
  sanitized = sanitized.replace(/\b(\d+)\b/g, '?');

  // Replace array/list values: (1, 2, 3) -> (?)
  sanitized = sanitized.replace(/\([?,\s]+\)/g, '(?)');

  // Collapse multiple consecutive ? to single ? for readability
  sanitized = sanitized.replace(/\?(\s*,\s*\?)+/g, '?');

  return sanitized;
}

/**
 * Generate query fingerprint for grouping similar queries
 * Creates a consistent hash for queries with same structure
 * @internal Exported for testing
 */
export function generateQueryFingerprint(sanitizedQuery: string): string {
  // Normalize whitespace and case for consistent fingerprinting
  const normalized = sanitizedQuery
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim()
    .toUpperCase();

  // Create short hash (first 12 chars of SHA256)
  return createHash('sha256').update(normalized).digest('hex').substring(0, 12);
}

/**
 * Patch the PostgreSQL driver's query method to record metrics and traces
 * This intercepts ALL database queries at the driver level
 */
function patchDriverForMetrics(dataSource: DataSource, tenantId: string): void {
  try {
    const driver = (dataSource.driver as any)?.master;
    if (!driver) {
      console.warn(
        `[DB-METRICS] Cannot patch driver for tenant ${tenantId}: master pool not found`,
      );
      return;
    }

    // Avoid patching the same pool multiple times
    if (driver._openmeet_query_patched) {
      console.log(
        `[DB-METRICS] Driver already patched for tenant ${tenantId}, skipping`,
      );
      return;
    }

    const tracer = trace.getTracer('database');

    // TypeORM uses pool.connect() to get clients, then calls query on the client
    // So we need to patch pool.connect() to wrap the client's query method
    const originalConnect = driver.connect.bind(driver);

    driver.connect = function (callback: any): any {
      return originalConnect(function (
        err: any,
        client: any,
        release: any,
      ): any {
        if (err || !client) {
          return callback(err, client, release);
        }

        // Patch this client's query method if not already patched
        if (!client._openmeet_query_patched) {
          const originalClientQuery = client.query.bind(client);

          client.query = function (...args: any[]): any {
            const startTime = Date.now();

            // Extract query text
            const query =
              typeof args[0] === 'string'
                ? args[0]
                : args[0]?.text || args[0]?.query || 'UNKNOWN';
            const operation = extractOperation(query);

            // Sanitize query to remove sensitive values (PII, credentials, etc.)
            const sanitizedQuery = sanitizeQuery(query);
            const queryFingerprint = generateQueryFingerprint(sanitizedQuery);

            // Start trace span with proper context propagation
            const span = tracer.startSpan(
              'db.query',
              {
                kind: SpanKind.CLIENT,
                attributes: {
                  'db.system': 'postgresql',
                  'db.operation': operation,
                  'db.statement': sanitizedQuery.substring(0, 1000), // Truncate for safety
                  'db.query.fingerprint': queryFingerprint,
                  'db.name': process.env.DATABASE_NAME,
                  'tenant.id': tenantId,
                },
              },
              context.active(),
            );

            const result = originalClientQuery(...args);

            // Handle promise-based queries (node-postgres always returns promises)
            if (result && typeof result.then === 'function') {
              return result
                .then((res: any) => {
                  const duration = Date.now() - startTime;

                  // Record metrics with success status
                  const metricsService = getMetricsService();
                  if (metricsService) {
                    metricsService.recordQueryDuration(
                      tenantId,
                      operation,
                      duration,
                      'success',
                    );
                  }

                  span.setAttribute('db.duration_ms', duration);
                  span.setStatus({ code: SpanStatusCode.OK });
                  span.end();

                  return res;
                })
                .catch((err: any) => {
                  const duration = Date.now() - startTime;

                  // Record metrics with error status
                  const metricsService = getMetricsService();
                  if (metricsService) {
                    metricsService.recordQueryDuration(
                      tenantId,
                      operation,
                      duration,
                      'error',
                    );
                  }

                  span.recordException(err);
                  span.setStatus({ code: SpanStatusCode.ERROR });
                  span.end();

                  throw err;
                });
            }

            // Synchronous fallback (unlikely with node-postgres)
            // Record metrics immediately without timing
            const duration = Date.now() - startTime;
            const metricsService = getMetricsService();
            if (metricsService) {
              metricsService.recordQueryDuration(
                tenantId,
                operation,
                duration,
                'success',
              );
            }
            span.setAttribute('db.duration_ms', duration);
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            return result;
          };

          client._openmeet_query_patched = true;
        }

        return callback(err, client, release);
      });
    };

    // Mark this pool as patched
    driver._openmeet_query_patched = true;
  } catch (error) {
    console.error(
      `[DB-METRICS] Failed to patch database driver for tenant ${tenantId}:`,
      error,
    );
  }
}

// Add connection cache at module level
const connectionCache = new Map<
  string,
  {
    connection: DataSource;
    lastUsed: number;
    tenantId: string;
  }
>();

const CONNECTION_TIMEOUT = 60 * 60 * 1000; // 1 hour
const MAX_CONNECTIONS = 100;

// Store interval reference so we can clear it
let cleanupInterval: NodeJS.Timeout | null = null;

export function startCleanupInterval() {
  if (cleanupInterval) {
    return cleanupInterval; // Return existing interval
  }

  cleanupInterval = setInterval(
    () => {
      const now = Date.now();
      for (const [key, value] of connectionCache.entries()) {
        if (now - value.lastUsed > CONNECTION_TIMEOUT) {
          value.connection.destroy().catch(console.error);
          connectionCache.delete(key);
        }
      }
    },
    15 * 60 * 1000,
  );

  return cleanupInterval;
}

export function stopCleanupInterval() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

export function getConnectionCache() {
  return connectionCache;
}

// Only start cleanup interval in production/development
if (process.env.NODE_ENV !== 'test') {
  startCleanupInterval();
}

// Add cleanup on module unload for tests
if (process.env.NODE_ENV === 'test') {
  process.on('beforeExit', stopCleanupInterval);
}

export const AppDataSource = (tenantId: string) => {
  const tracer = trace.getTracer('database');
  const schemaName = tenantId ? `tenant_${tenantId}` : '';

  // Check cache first
  const cacheKey = `${process.env.DATABASE_URL}_${schemaName}`;
  const cached = connectionCache.get(cacheKey);

  if (cached?.connection?.isInitialized) {
    cached.lastUsed = Date.now();

    // Ensure the driver is patched even for cached connections
    // This handles cases where connection was created before metrics service initialized
    patchDriverForMetrics(cached.connection, tenantId);

    return cached.connection;
  } else if (cached) {
    // Only remove from cache if connection exists but isn't initialized
    connectionCache.delete(cacheKey);
  }

  // Check connection limit
  if (connectionCache.size >= MAX_CONNECTIONS) {
    // Remove oldest connection
    let oldestKey: string | undefined = undefined;
    let oldestTime = Date.now();

    for (const [key, value] of connectionCache.entries()) {
      if (value.lastUsed < oldestTime) {
        oldestTime = value.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const old = connectionCache.get(oldestKey);
      if (old) {
        old.connection.destroy().catch(console.error);
        connectionCache.delete(oldestKey);
      }
    }
  }

  const span = tracer.startSpan('create-data-source', {
    kind: SpanKind.CLIENT,
    attributes: {
      'tenant.id': tenantId,
      'schema.name': schemaName,
      'cache.hit': false,
    },
  });

  const dataSource = context.with(trace.setSpan(context.active(), span), () => {
    return new DataSource({
      name: schemaName,
      type: process.env.DATABASE_TYPE,
      url: process.env.DATABASE_URL,
      host: process.env.DATABASE_HOST,
      port: process.env.DATABASE_PORT
        ? parseInt(process.env.DATABASE_PORT, 10)
        : 5432,
      username: process.env.DATABASE_USERNAME,
      password: process.env.DATABASE_PASSWORD,
      schema: schemaName,
      database: process.env.DATABASE_NAME,
      synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
      entitySkipConstructor: true,
      dropSchema: false,
      keepConnectionAlive: true,
      logging:
        process.env.NODE_ENV === 'development'
          ? ['error', 'schema', 'warn', 'log', 'debug']
          : ['error', 'warn'],
      logger: process.env.NODE_ENV === 'development' ? 'advanced-console' : '',
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      migrations: [__dirname + '/migrations/**/*{.ts,.js}'],
      cli: {
        migrationsDir: 'src/database/migrations', // path where migrations generated
        entitiesDir: 'src',

        subscribersDir: 'subscriber',
      },
      extra: {
        // based on https://node-postgres.com/api/pool
        // max connection pool size
        max: process.env.DATABASE_MAX_CONNECTIONS
          ? parseInt(process.env.DATABASE_MAX_CONNECTIONS, 10)
          : 100,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        min: 5,
        maxUses: 7500,
        statement_timeout: 15000,
        query_timeout: 15000,
        application_name: `openmeet_${process.env.NODE_ENV}_${tenantId}`,
        ssl:
          process.env.DATABASE_SSL_ENABLED === 'true'
            ? {
                rejectUnauthorized:
                  process.env.DATABASE_REJECT_UNAUTHORIZED === 'true',
                ca: process.env.DATABASE_CA ?? undefined,
                key: process.env.DATABASE_KEY ?? undefined,
                cert: process.env.DATABASE_CERT ?? undefined,
              }
            : undefined,
        // Connection pool settings
        poolSize: process.env.DATABASE_POOL_SIZE
          ? parseInt(process.env.DATABASE_POOL_SIZE, 10)
          : 20,
        maxPoolSize: process.env.DATABASE_MAX_POOL_SIZE
          ? parseInt(process.env.DATABASE_MAX_POOL_SIZE, 10)
          : 40,
        // Cleanup idle connections
        allowExitOnIdle: true,
      },
    } as DataSourceOptions);
  });

  span.end();

  // Enhance initialize method with retry logic
  const originalInitialize = dataSource.initialize.bind(dataSource);
  dataSource.initialize = async (): Promise<DataSource> => {
    return tracer.startActiveSpan(
      'initialize-data-source',
      { kind: SpanKind.CLIENT },
      async (span) => {
        const maxRetries = 3;
        let retryCount = 0;

        while (retryCount < maxRetries) {
          try {
            span.setAttribute('tenant.id', tenantId);
            span.setAttribute('schema.name', schemaName);
            span.setAttribute('retry.count', retryCount);

            const startTime = Date.now();
            await originalInitialize();
            const duration = Date.now() - startTime;

            span.setAttribute('database.connection_time_ms', duration);

            // Record connection acquisition metrics
            const metricsService = getMetricsService();
            if (metricsService) {
              metricsService.recordConnectionAcquisition(tenantId, duration);
            }

            // Set up pool error event listener
            try {
              const pool = (dataSource.driver as any).master;
              if (pool && !pool._openmeet_listeners_attached) {
                pool.on('error', (err: Error & { code?: string }) => {
                  const errorType = err.code || err.name || 'UNKNOWN';
                  if (metricsService) {
                    metricsService.recordConnectionError(tenantId, errorType);
                  }
                });
                // Mark that we've attached listeners to avoid duplicates
                pool._openmeet_listeners_attached = true;
              }
            } catch (error) {
              console.error('Failed to attach pool error listener:', error);
            }

            // Patch driver to intercept queries for metrics and tracing
            patchDriverForMetrics(dataSource, tenantId);

            // Cache successful connection
            connectionCache.set(cacheKey, {
              connection: dataSource,
              lastUsed: Date.now(),
              tenantId: tenantId,
            });

            return dataSource;
          } catch (error) {
            retryCount++;
            if (retryCount === maxRetries) {
              span.recordException(error);
              span.setStatus({ code: SpanStatusCode.ERROR });
              throw error;
            }
            // Exponential backoff
            await new Promise((resolve) =>
              setTimeout(resolve, Math.pow(2, retryCount) * 1000),
            );
          }
        }
        // This should never be reached due to the throw in the catch block
        throw new Error('Failed to initialize connection after max retries');
      },
    );
  };

  return dataSource;
};

// Export a single DataSource instance for the default tenant
const DefaultDataSource = AppDataSource('');
export default DefaultDataSource;

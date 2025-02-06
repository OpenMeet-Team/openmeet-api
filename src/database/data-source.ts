import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { SpanStatusCode, trace, context, SpanKind } from '@opentelemetry/api';

// Add connection cache at module level
const connectionCache = new Map<
  string,
  {
    connection: DataSource;
    lastUsed: number;
  }
>();

const CONNECTION_TIMEOUT = 60 * 60 * 1000; // 1 hour
const MAX_CONNECTIONS = 100;

// Store interval reference so we can clear it
let cleanupInterval: NodeJS.Timeout | null = null;

// Add cleanup interval with proper handling for tests
export function startCleanupInterval() {
  if (cleanupInterval) return; // Prevent multiple intervals

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
  ); // Clean every 15 minutes

  // Ensure cleanup on process exit
  process.on('beforeExit', () => {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  });
}

// Add function to stop cleanup for tests
export function stopCleanupInterval() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// Start cleanup interval in non-test environment
if (process.env.NODE_ENV !== 'test') {
  startCleanupInterval();
}

export const AppDataSource = (tenantId: string) => {
  const tracer = trace.getTracer('database');
  const schemaName = tenantId ? `tenant_${tenantId}` : '';

  // Check cache first
  const cacheKey = `${process.env.DATABASE_URL}_${schemaName}`;
  const cached = connectionCache.get(cacheKey);

  if (cached?.connection?.isInitialized) {
    cached.lastUsed = Date.now();
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
          ? ['error', 'schema', 'warn', 'log', 'query']
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
        connectionTimeoutMillis: 2000,
        min: 2, // Minimum connections to maintain
        maxUses: 7500, // Maximum number of times to use a connection before releasing it
        statement_timeout: 60000, // Timeout SQL statements after 60s
        query_timeout: 60000, // Timeout entire queries after 60s
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
          : 10,
        maxPoolSize: process.env.DATABASE_MAX_POOL_SIZE
          ? parseInt(process.env.DATABASE_MAX_POOL_SIZE, 10)
          : 20,
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

            // Cache successful connection
            connectionCache.set(cacheKey, {
              connection: dataSource,
              lastUsed: Date.now(),
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

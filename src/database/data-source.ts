import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { SpanStatusCode, trace, context, SpanKind } from '@opentelemetry/api';

export const AppDataSource = (tenantId: string) => {
  const tracer = trace.getTracer('database');
  const schemaName = tenantId ? `tenant_${tenantId}` : '';

  // Create a span for DataSource creation
  const span = tracer.startSpan('create-data-source', {
    kind: SpanKind.CLIENT,
    attributes: {
      'tenant.id': tenantId,
      'schema.name': schemaName,
    },
  });

  // Create the DataSource within the context of our span
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
        connectionTimeoutMillis: 500,
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
      },
    } as DataSourceOptions);
  });

  span.end();

  // Store the original initialize method
  const originalInitialize = dataSource.initialize.bind(dataSource);

  // Replace with traced version
  dataSource.initialize = async () => {
    return tracer.startActiveSpan(
      'initialize-data-source',
      {
        kind: SpanKind.CLIENT,
      },
      async (span) => {
        try {
          span.setAttribute('tenant.id', tenantId);
          span.setAttribute('schema.name', schemaName);
          span.setAttribute('database.operation', 'initialize');

          const startTime = Date.now();
          await originalInitialize();
          const duration = Date.now() - startTime;

          span.setAttribute('database.connection_time_ms', duration);

          // Use optional chaining and type checking for attributes
          const dbName = dataSource.options?.database;
          const dbType = dataSource.options?.type;

          if (dbName) span.setAttribute('database.name', String(dbName));
          if (dbType) span.setAttribute('database.type', String(dbType));

          return dataSource;
        } catch (error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  };

  return dataSource;
};

// Export a single DataSource instance for the default tenant
const DefaultDataSource = AppDataSource('');
export default DefaultDataSource;

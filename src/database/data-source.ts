import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';

export const AppDataSource = (tenantId: string) => {
  const schemaName = tenantId ? `tenant_${tenantId}` : '';
  // const schemaName = 'public';
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
        ? ['error', 'schema', 'warn', 'log']
        : false,
    logger: process.env.TYPEORM_LOGGER,
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
};

// Export a single DataSource instance for the default tenant
const DefaultDataSource = AppDataSource('');
export default DefaultDataSource;

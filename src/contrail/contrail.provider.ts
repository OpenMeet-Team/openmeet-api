import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import pg from 'pg';
import type { Contrail } from '@atmo-dev/contrail';
import { buildContrailConfig } from './contrail.config';
import { loadContrail } from './contrail-loader';

const DEFAULT_SCHEMA = 'contrail';

@Injectable()
export class ContrailProvider implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContrailProvider.name);
  private pool?: pg.Pool;
  private contrail?: Contrail;
  private handler?: (request: Request) => Promise<Response>;

  async onModuleInit(): Promise<void> {
    const databaseUrl = process.env.CONTRAIL_DATABASE_URL;
    if (!databaseUrl) {
      this.logger.warn(
        'CONTRAIL_DATABASE_URL not set; ContrailProvider will not initialize. ' +
          '/xrpc/net.openmeet.* requests will return 503.',
      );
      return;
    }

    const schema = process.env.CONTRAIL_SCHEMA ?? DEFAULT_SCHEMA;

    // node-postgres supports `options` at runtime to pass libpq startup
    // parameters; @types/pg doesn't expose it yet (cast through PoolConfig).
    this.pool = new pg.Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema},public`,
    } as pg.PoolConfig);

    const { pkg, server, postgres } = await loadContrail();
    const config = await buildContrailConfig();
    const db = postgres.createPostgresDatabase(this.pool);
    this.contrail = new pkg.Contrail({ ...config, db });

    await this.pool!.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await this.contrail!.init();

    this.handler = server.createHandler(this.contrail);

    const redactedUrl = databaseUrl.replace(/:[^:@/]+@/, ':***@');
    this.logger.log(
      `Contrail initialized; namespace=${config.namespace}, schema=${schema}, db=${redactedUrl}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  isReady(): boolean {
    return this.handler !== undefined;
  }

  async handle(request: Request): Promise<Response> {
    if (!this.handler) {
      return new Response(
        JSON.stringify({
          error: 'NotInitialized',
          message:
            'ContrailProvider is not initialized (CONTRAIL_DATABASE_URL unset)',
        }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      );
    }
    return this.handler(request);
  }
}

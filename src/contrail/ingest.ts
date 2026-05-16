/**
 * Long-running Contrail live-ingest entrypoint. Streams ATProto records from
 * the configured Jetstream(s) into the Contrail index continuously.
 *
 * Run as a Kubernetes Deployment (NOT inside the API pod). Process-liveness
 * (no HTTP probe) is the sole health signal — kubelet restarts a dead pod.
 * runPersistent's built-in reconnect/backoff handles transient Jetstream
 * failures.
 *
 * Required env:
 *   CONTRAIL_DATABASE_URL    Postgres connection string
 *   CONTRAIL_SCHEMA          Schema name (default: contrail)
 *   CONTRAIL_JETSTREAM_URLS  Comma-separated Jetstream WS URLs
 *
 * Optional env (private-network deployment):
 *   CONTRAIL_PLC_URL         Override hardcoded PLC
 *   CONTRAIL_SLINGSHOT_URL   Override Slingshot endpoint
 *   CONTRAIL_ALLOWED_HOSTS   Comma-separated SSRF allowlist
 *   CONTRAIL_RELAYS          Comma-separated relay URLs
 */
import pg from 'pg';
import { buildContrailConfig } from './contrail.config';
import { loadContrail } from './contrail-loader';

const DEFAULT_SCHEMA = 'contrail';

async function main(): Promise<void> {
  const databaseUrl = process.env.CONTRAIL_DATABASE_URL;
  if (!databaseUrl) {
    console.error('CONTRAIL_DATABASE_URL is required');
    process.exit(1);
  }
  const schema = process.env.CONTRAIL_SCHEMA ?? DEFAULT_SCHEMA;

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema},public`,
  } as pg.PoolConfig);

  const { pkg, postgres } = await loadContrail();
  const config = await buildContrailConfig();
  const db = postgres.createPostgresDatabase(pool);
  const contrail = new pkg.Contrail({ ...config, db });

  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await contrail.init(db);

  const ac = new AbortController();
  const shutdown = (signal: string) => {
    console.log(`[ingest] received ${signal}; aborting`);
    ac.abort();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  console.log(
    `[ingest] starting; namespace=${config.namespace}, schema=${schema}, ` +
      `jetstreams=${(config.jetstreams ?? []).join(',') || '(default)'}`,
  );

  try {
    await contrail.runPersistent({ signal: ac.signal });
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[ingest] fatal error:', err);
  process.exit(1);
});

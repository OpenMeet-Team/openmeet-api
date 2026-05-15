/**
 * One-shot Contrail sync: discover known DIDs from public relays and backfill
 * their records into the Contrail Postgres index.
 *
 * Designed to run as a standalone process (npm script or K8s Job). MUST NOT
 * run inside an API pod — Jetstream ingest belongs in a dedicated process if
 * we ever stand it up (Phase 2 decision; not in this script).
 *
 * Usage:
 *   CONTRAIL_DATABASE_URL=postgres://... \
 *   CONTRAIL_SCHEMA=contrail \
 *   npm run contrail:sync
 */
import pg from 'pg';
import { contrailConfig } from './contrail.config';
import { withInitLock } from './contrail-init-lock';
import { loadContrail } from './contrail-loader';

const INIT_LOCK_KEY = 'net.openmeet.contrail.init';
const DEFAULT_SCHEMA = 'contrail';

function elapsed(start: number): string {
  const ms = Date.now() - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = ((ms % 60_000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

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

  try {
    const { pkg, postgres } = await loadContrail();
    const db = postgres.createPostgresDatabase(pool);
    const contrail = new pkg.Contrail({ ...contrailConfig, db });
    const syncStart = Date.now();

    console.log(`=== Contrail sync (schema=${schema}) ===\n`);

    await withInitLock(pool, INIT_LOCK_KEY, async () => {
      await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await contrail.init();
    });

    console.log('--- Discovery ---');
    const discoveryStart = Date.now();
    const discovered = await contrail.discover();
    console.log(
      `  Done: ${discovered.length} users in ${elapsed(discoveryStart)}\n`,
    );

    console.log('--- Backfill ---');
    const backfillStart = Date.now();
    const total = await contrail.backfill({
      concurrency: 10,
      onProgress: ({ records, usersComplete, usersTotal, usersFailed }) => {
        const secs = (Date.now() - backfillStart) / 1000;
        const rate = secs > 0 ? Math.round(records / secs) : 0;
        const failStr = usersFailed > 0 ? ` | ${usersFailed} failed` : '';
        process.stdout.write(
          `\r  ${records} records | ${usersComplete}/${usersTotal} users | ${rate}/s | ${elapsed(backfillStart)}${failStr}   `,
        );
      },
    });
    process.stdout.write('\n');
    console.log(`  Done: ${total} records in ${elapsed(backfillStart)}\n`);

    console.log(`=== Finished in ${elapsed(syncStart)} ===`);
    console.log(`  Discovered: ${discovered.length} users`);
    console.log(`  Backfilled: ${total} records`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

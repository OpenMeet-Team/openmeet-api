/**
 * One-shot Contrail sync: discover new DIDs, backfill their history, and
 * refresh records for already-known DIDs to repair drift from Jetstream gaps
 * (cursor expiry, extended outages). Safe to run repeatedly — discovery and
 * backfill are idempotent; refresh skips records inside the lib's ignore
 * window. Intended to run daily as a CronJob alongside the live-ingest
 * Deployment that handles the continuous case.
 *
 * Usage:
 *   CONTRAIL_DATABASE_URL=postgres://... \
 *   CONTRAIL_SCHEMA=contrail \
 *   npm run contrail:sync
 */
import pg from 'pg';
import { buildContrailConfig } from './contrail.config';
import { loadContrail } from './contrail-loader';

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
    const config = await buildContrailConfig();
    const db = postgres.createPostgresDatabase(pool);
    const contrail = new pkg.Contrail({ ...config, db });
    const syncStart = Date.now();

    console.log(`=== Contrail sync (schema=${schema}) ===\n`);

    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await contrail.init();

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

    // Refresh: re-walk every known DID's PDS and apply any records we're
    // missing or have stale. Closes drift caused by Jetstream cursor expiry
    // (multi-day outages) or transient ingest failures the live-ingest pod
    // didn't recover from. Records inside the lib's ignoreWindowMs (default
    // 60s) are skipped so this stays cheap.
    console.log('--- Refresh ---');
    const refreshStart = Date.now();
    const refreshResult = await contrail.refresh({
      onProgress: ({
        usersComplete,
        usersTotal,
        usersFailed,
        recordsScanned,
      }) => {
        const failStr = usersFailed > 0 ? ` | ${usersFailed} failed` : '';
        process.stdout.write(
          `\r  ${recordsScanned} scanned | ${usersComplete}/${usersTotal} users | ${elapsed(refreshStart)}${failStr}   `,
        );
      },
    });
    process.stdout.write('\n');
    console.log(
      `  Done: ${refreshResult.total.missing} missing, ${refreshResult.total.staleUpdates} stale across ${refreshResult.usersScanned} users in ${elapsed(refreshStart)}\n`,
    );

    console.log(`=== Finished in ${elapsed(syncStart)} ===`);
    console.log(`  Discovered: ${discovered.length} users`);
    console.log(`  Backfilled: ${total} records`);
    console.log(
      `  Refreshed: ${refreshResult.total.missing} missing + ${refreshResult.total.staleUpdates} stale (${refreshResult.usersScanned} users scanned)`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

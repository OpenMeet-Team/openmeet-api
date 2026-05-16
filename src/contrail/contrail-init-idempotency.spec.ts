/**
 * Asserts that contrail.init() is safe to call concurrently against the same
 * database. Replaces the previous contrail-init-lock.spec which exercised the
 * consumer-side advisory lock; idempotency is now the library's responsibility
 * (see fork PR #44 / commit L3).
 *
 * Gated on CONTRAIL_TEST_DATABASE_URL — local-only by default.
 */
import pg from 'pg';
import { loadContrail } from './contrail-loader';
import { buildContrailConfig } from './contrail.config';

const databaseUrl = process.env.CONTRAIL_TEST_DATABASE_URL;

const maybe = databaseUrl ? describe : describe.skip;

maybe('contrail.init() idempotency', () => {
  let pool: pg.Pool;

  beforeEach(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query('DROP SCHEMA IF EXISTS contrail_idempotency_test CASCADE');
    await pool.query('CREATE SCHEMA contrail_idempotency_test');
  });

  afterEach(async () => {
    await pool.query('DROP SCHEMA contrail_idempotency_test CASCADE');
    await pool.end();
  });

  it('should not throw when called twice sequentially', async () => {
    const { pkg, postgres } = await loadContrail();
    const config = await buildContrailConfig();
    const db = postgres.createPostgresDatabase(pool);
    const contrail = new pkg.Contrail({ ...config, db });

    await contrail.init(db);
    await expect(contrail.init(db)).resolves.not.toThrow();
  });

  it('should be safe under concurrent invocation', async () => {
    const { pkg, postgres } = await loadContrail();
    const config = await buildContrailConfig();
    const db = postgres.createPostgresDatabase(pool);
    const contrail = new pkg.Contrail({ ...config, db });

    await expect(
      Promise.all([contrail.init(db), contrail.init(db), contrail.init(db)]),
    ).resolves.not.toThrow();
  });
});

import pg from 'pg';
import { withInitLock } from './contrail-init-lock';

const TEST_DB_URL = process.env.CONTRAIL_TEST_DATABASE_URL;

const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb('withInitLock (requires CONTRAIL_TEST_DATABASE_URL)', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: TEST_DB_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should serialize concurrent critical sections', async () => {
    const events: string[] = [];
    const work = async (id: string) => {
      await withInitLock(pool, 'om-test-init-lock', async () => {
        events.push(`${id}-enter`);
        await new Promise((r) => setTimeout(r, 50));
        events.push(`${id}-exit`);
      });
    };

    await Promise.all([work('A'), work('B')]);

    expect(events).toHaveLength(4);
    const aEnter = events.indexOf('A-enter');
    const aExit = events.indexOf('A-exit');
    const bEnter = events.indexOf('B-enter');
    const bExit = events.indexOf('B-exit');

    const aBeforeB = aEnter < aExit && aExit < bEnter && bEnter < bExit;
    const bBeforeA = bEnter < bExit && bExit < aEnter && aEnter < aExit;

    expect(aBeforeB || bBeforeA).toBe(true);
  });

  it('should release the lock on critical-section throw', async () => {
    await expect(
      withInitLock(pool, 'om-test-init-lock-throw', () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    let ran = false;
    await withInitLock(pool, 'om-test-init-lock-throw', () => {
      ran = true;
      return Promise.resolve();
    });
    expect(ran).toBe(true);
  });
});

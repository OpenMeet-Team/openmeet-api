import pg from 'pg';

export async function withInitLock<T>(
  pool: pg.Pool,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1)::bigint)', [key]);
    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1)::bigint)', [
        key,
      ]);
    }
  } finally {
    client.release();
  }
}

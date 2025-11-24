import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionsUpdatedAtIndex1764000467000
  implements MigrationInterface
{
  name = 'AddSessionsUpdatedAtIndex1764000467000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add index on sessions.updatedAt for active users metric query
    // This supports the query in MetricsService that counts active users:
    // SELECT COUNT(DISTINCT "userId") FROM sessions WHERE "updatedAt" > NOW() - INTERVAL '30 days'
    // The updatedAt field tracks both initial login and token refresh activity
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sessions_updatedAt"
      ON "${schema}"."sessions" ("updatedAt")
    `);

    // Add composite index for more complex queries that filter by both userId and updatedAt
    // This optimizes per-user session lookups with recency filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sessions_userId_updatedAt"
      ON "${schema}"."sessions" ("userId", "updatedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Remove indexes in reverse order
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_sessions_userId_updatedAt"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_sessions_updatedAt"
    `);
  }
}

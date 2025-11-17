import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1763381658000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1763381658000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // 1. Add index on sessions.createdAt
    // This fixes the slow query in MetricsService that runs every 5 minutes:
    // SELECT COUNT(DISTINCT "userId") FROM sessions WHERE "createdAt" > NOW() - INTERVAL '30 days'
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sessions_createdAt"
      ON "${schema}"."sessions" ("createdAt")
    `);

    // 2. Add foreign key indexes on groupMembers
    // This table has 98.62% sequential scans with 231,251 seq scans
    // Only has PK index, missing FK indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_groupMembers_groupId"
      ON "${schema}"."groupMembers" ("groupId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_groupMembers_userId"
      ON "${schema}"."groupMembers" ("userId")
    `);

    // 3. Add index on eventAttendees.userId
    // Currently only has composite index on (eventId, userId)
    // Need individual userId index for queries that filter by user
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_eventAttendees_userId"
      ON "${schema}"."eventAttendees" ("userId")
    `);

    // 4. Add index on eventAttendees.eventId
    // For queries that filter by event
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_eventAttendees_eventId"
      ON "${schema}"."eventAttendees" ("eventId")
    `);

    // 5. Add composite index on sessions for common query pattern
    // Optimizes queries that filter by userId and createdAt together
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sessions_userId_createdAt"
      ON "${schema}"."sessions" ("userId", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Remove indexes in reverse order
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_sessions_userId_createdAt"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_eventAttendees_eventId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_eventAttendees_userId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_groupMembers_userId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_groupMembers_groupId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_sessions_createdAt"
    `);
  }
}

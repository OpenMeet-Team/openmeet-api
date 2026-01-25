import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAtprotoSyncFields1769291626489 implements MigrationInterface {
  name = 'AddAtprotoSyncFields1769291626489';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add AT Protocol sync tracking columns to events table
    // These track when events are PUBLISHED to user's PDS (distinct from sourceId which tracks IMPORTED records)
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events"
      ADD COLUMN IF NOT EXISTS "atprotoUri" TEXT,
      ADD COLUMN IF NOT EXISTS "atprotoRkey" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "atprotoSyncedAt" TIMESTAMP
    `);

    // Index for finding pending syncs: public events not yet published to PDS
    // Uses partial index for efficiency - only indexes records matching the WHERE clause
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_events_atproto_pending_sync"
      ON "${schema}"."events" ("visibility", "atprotoUri")
      WHERE "visibility" = 'public' AND "atprotoUri" IS NULL
    `);

    // Add AT Protocol sync tracking columns to eventAttendees table
    // These track when RSVPs are PUBLISHED to user's PDS
    await queryRunner.query(`
      ALTER TABLE "${schema}"."eventAttendees"
      ADD COLUMN IF NOT EXISTS "atprotoUri" TEXT,
      ADD COLUMN IF NOT EXISTS "atprotoRkey" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "atprotoSyncedAt" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop the partial index first
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_events_atproto_pending_sync"
    `);

    // Drop columns from events table (in reverse order of creation)
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events"
      DROP COLUMN IF EXISTS "atprotoSyncedAt",
      DROP COLUMN IF EXISTS "atprotoRkey",
      DROP COLUMN IF EXISTS "atprotoUri"
    `);

    // Drop columns from eventAttendees table
    await queryRunner.query(`
      ALTER TABLE "${schema}"."eventAttendees"
      DROP COLUMN IF EXISTS "atprotoSyncedAt",
      DROP COLUMN IF EXISTS "atprotoRkey",
      DROP COLUMN IF EXISTS "atprotoUri"
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateActivityFeedTable1760956752292
  implements MigrationInterface
{
  name = 'CreateActivityFeedTable1760956752292';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Create activityFeed table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."activityFeed" (
        "id" SERIAL PRIMARY KEY,
        "ulid" CHAR(26) UNIQUE NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),

        "activityType" VARCHAR(50) NOT NULL,
        "feedScope" VARCHAR(20) NOT NULL,

        "groupId" INTEGER REFERENCES "${schema}"."groups"(id) ON DELETE CASCADE,
        "eventId" INTEGER REFERENCES "${schema}"."events"(id) ON DELETE CASCADE,

        "actorId" INTEGER REFERENCES "${schema}"."users"(id) ON DELETE SET NULL,
        "actorIds" INTEGER[] DEFAULT '{}',

        "targetType" VARCHAR(50),
        "targetId" INTEGER,

        "metadata" JSONB DEFAULT '{}',

        "visibility" VARCHAR(20) DEFAULT 'public' NOT NULL,

        "aggregationKey" VARCHAR(200),
        "aggregationStrategy" VARCHAR(20),
        "aggregatedCount" INTEGER DEFAULT 1 NOT NULL,

        CONSTRAINT "chk_feed_scope" CHECK ("feedScope" IN ('sitewide', 'group', 'event')),
        CONSTRAINT "chk_visibility" CHECK ("visibility" IN ('public', 'authenticated', 'members_only', 'private')),
        CONSTRAINT "chk_aggregation_strategy" CHECK ("aggregationStrategy" IS NULL OR "aggregationStrategy" IN ('time_window', 'daily', 'none'))
      )
    `);

    // Create index on activityType for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activityFeed_activity_type"
      ON "${schema}"."activityFeed" ("activityType")
    `);

    // Create index on feedScope for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activityFeed_feed_scope"
      ON "${schema}"."activityFeed" ("feedScope")
    `);

    // Create index on visibility for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activityFeed_visibility"
      ON "${schema}"."activityFeed" ("visibility")
    `);

    // Create index on aggregationKey for aggregation lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activityFeed_aggregation_key"
      ON "${schema}"."activityFeed" ("aggregationKey")
    `);

    // Create composite index for group feed queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activityFeed_group_feed"
      ON "${schema}"."activityFeed" ("groupId", "updatedAt" DESC)
      WHERE "feedScope" = 'group'
    `);

    // Create composite index for event feed queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activityFeed_event_feed"
      ON "${schema}"."activityFeed" ("eventId", "updatedAt" DESC)
      WHERE "feedScope" = 'event'
    `);

    // Create composite index for sitewide feed queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activityFeed_sitewide_feed"
      ON "${schema}"."activityFeed" ("feedScope", "visibility", "updatedAt" DESC)
      WHERE "feedScope" = 'sitewide'
    `);

    // Create index on groupId for foreign key
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activityFeed_group_id"
      ON "${schema}"."activityFeed" ("groupId")
    `);

    // Create index on eventId for foreign key
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activityFeed_event_id"
      ON "${schema}"."activityFeed" ("eventId")
    `);

    // Create index on actorId for foreign key
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activityFeed_actor_id"
      ON "${schema}"."activityFeed" ("actorId")
    `);

    // Create index on createdAt for retention cleanup
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_activityFeed_created_at"
      ON "${schema}"."activityFeed" ("createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop all indexes first
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_activityFeed_created_at"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_activityFeed_actor_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_activityFeed_event_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_activityFeed_group_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_activityFeed_sitewide_feed"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_activityFeed_event_feed"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_activityFeed_group_feed"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_activityFeed_aggregation_key"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_activityFeed_visibility"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_activityFeed_feed_scope"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_activityFeed_activity_type"
    `);

    // Drop the table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."activityFeed"
    `);
  }
}

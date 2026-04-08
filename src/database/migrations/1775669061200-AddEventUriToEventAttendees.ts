import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventUriToEventAttendees1775669061200
  implements MigrationInterface
{
  name = 'AddEventUriToEventAttendees1775669061200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Make eventId nullable — allows attendance records for foreign events
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ALTER COLUMN "eventId" DROP NOT NULL`,
    );

    // Add eventUri column for cross-referencing with Contrail
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD COLUMN IF NOT EXISTS "eventUri" TEXT`,
    );

    // Backfill eventUri from existing events with atprotoUri
    await queryRunner.query(`
      UPDATE "${schema}"."eventAttendees" ea
      SET "eventUri" = e."atprotoUri"
      FROM "${schema}"."events" e
      WHERE ea."eventId" = e.id AND e."atprotoUri" IS NOT NULL
    `);

    // Partial index on eventUri for lookup by AT Protocol URI
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_eventAttendees_eventUri" ON "${schema}"."eventAttendees" ("eventUri") WHERE "eventUri" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_eventAttendees_eventUri"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN IF EXISTS "eventUri"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ALTER COLUMN "eventId" SET NOT NULL`,
    );
  }
}

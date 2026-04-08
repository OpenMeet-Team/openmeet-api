import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventUriToEventAttendees1775669061200
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Make eventId nullable — allows attendance records for foreign events
    await queryRunner.query(
      `ALTER TABLE "eventAttendees" ALTER COLUMN "eventId" DROP NOT NULL`,
    );

    // Add eventUri column for cross-referencing with Contrail
    await queryRunner.query(
      `ALTER TABLE "eventAttendees" ADD COLUMN "eventUri" TEXT`,
    );

    // Backfill eventUri from existing events with atprotoUri
    await queryRunner.query(`
      UPDATE "eventAttendees" ea
      SET "eventUri" = e."atprotoUri"
      FROM events e
      WHERE ea."eventId" = e.id AND e."atprotoUri" IS NOT NULL
    `);

    // Partial index on eventUri for lookup by AT Protocol URI
    await queryRunner.query(
      `CREATE INDEX "IDX_eventAttendees_eventUri" ON "eventAttendees" ("eventUri") WHERE "eventUri" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_eventAttendees_eventUri"`,
    );
    await queryRunner.query(
      `ALTER TABLE "eventAttendees" DROP COLUMN "eventUri"`,
    );
    await queryRunner.query(
      `ALTER TABLE "eventAttendees" ALTER COLUMN "eventId" SET NOT NULL`,
    );
  }
}

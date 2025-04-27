import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSourceFieldsToEventAttendees1745767742000
  implements MigrationInterface
{
  name = 'AddSourceFieldsToEventAttendees1745767742000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add source fields columns to eventAttendees table
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD COLUMN "sourceType" "event_source_type" NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD COLUMN "sourceId" varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD COLUMN "sourceUrl" varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD COLUMN "sourceData" jsonb NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD COLUMN "lastSyncedAt" timestamp NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Remove source fields columns from eventAttendees table
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN "lastSyncedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN "sourceData"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN "sourceUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN "sourceId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN "sourceType"`,
    );
  }
}

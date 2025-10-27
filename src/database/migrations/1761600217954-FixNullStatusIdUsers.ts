import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixNullStatusIdUsers1761600217954 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // This migration fixes users with NULL statusId, which prevents passwordless login
    // Shadow accounts and early users were created without statusId set
    // This affects ~75 users in production including admins and Bluesky shadow accounts

    // Update all users with NULL statusId to active (statusId = 1)
    await queryRunner.query(`
      UPDATE "${schema}".users
      SET "statusId" = 1
      WHERE "statusId" IS NULL;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // We don't want to revert users back to NULL statusId in the down migration
    // as it would break their login again
    // This is a data fix migration, not a schema change
  }
}

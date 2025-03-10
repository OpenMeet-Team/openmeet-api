import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMatrixFieldsToUser1741534434414 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add Matrix-specific fields to the User entity
    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      ADD COLUMN IF NOT EXISTS "matrixUserId" character varying,
      ADD COLUMN IF NOT EXISTS "matrixAccessToken" character varying,
      ADD COLUMN IF NOT EXISTS "matrixDeviceId" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Remove Matrix-specific fields from the User entity
    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      DROP COLUMN IF EXISTS "matrixUserId",
      DROP COLUMN IF EXISTS "matrixAccessToken",
      DROP COLUMN IF EXISTS "matrixDeviceId"
    `);
  }
}

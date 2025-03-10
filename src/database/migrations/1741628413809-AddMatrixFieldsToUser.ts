import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMatrixFieldsToUser1741628413809 implements MigrationInterface {
  name = 'AddMatrixFieldsToUser1741628413809';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add matrixUserId column
    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      ADD COLUMN IF NOT EXISTS "matrixUserId" character varying
    `);
    
    // Add matrixAccessToken column
    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      ADD COLUMN IF NOT EXISTS "matrixAccessToken" character varying
    `);
    
    // Add matrixDeviceId column
    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      ADD COLUMN IF NOT EXISTS "matrixDeviceId" character varying
    `);

    // Update preferences JSONB column to include matrix settings
    await queryRunner.query(`
      UPDATE "${schema}"."users" 
      SET "preferences" = COALESCE("preferences", '{}') || 
      '{"matrix": {"connected": false}}'::jsonb
      WHERE "preferences" IS NULL OR NOT ("preferences" ? 'matrix')
    `);

    // Add index for better query performance when searching matrix preferences
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_preferences_matrix_connected" 
      ON "${schema}"."users" ((preferences->'matrix'->>'connected'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop the index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_users_preferences_matrix_connected"
    `);

    // Remove matrix fields from preferences
    await queryRunner.query(`
      UPDATE "${schema}"."users" 
      SET "preferences" = "preferences" - 'matrix'
      WHERE "preferences" ? 'matrix'
    `);

    // Drop columns
    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      DROP COLUMN IF EXISTS "matrixDeviceId"
    `);
    
    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      DROP COLUMN IF EXISTS "matrixAccessToken"
    `);
    
    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      DROP COLUMN IF EXISTS "matrixUserId"
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPreferences1738934536914 implements MigrationInterface {
  name = 'AddUserPreferences1738934536914';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      ADD COLUMN IF NOT EXISTS "preferences" JSONB DEFAULT NULL
    `);

    // Add index for better query performance when searching preferences
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_preferences_bluesky_connected" 
      ON "${schema}"."users" ((preferences->'bluesky'->>'connected'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_users_preferences_bluesky_connected"
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      DROP COLUMN IF EXISTS "preferences"
    `);
  }
}

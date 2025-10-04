import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSecureIdToSessions1759515034304 implements MigrationInterface {
  name = 'AddSecureIdToSessions1759515034304';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add secureId column (nullable initially to allow migration of existing data)
    await queryRunner.query(`
      ALTER TABLE "${schema}"."sessions"
      ADD COLUMN IF NOT EXISTS "secureId" character varying
    `);

    // Generate UUIDs for existing sessions
    await queryRunner.query(`
      UPDATE "${schema}"."sessions"
      SET "secureId" = gen_random_uuid()::text
      WHERE "secureId" IS NULL
    `);

    // Make secureId NOT NULL and add unique constraint
    await queryRunner.query(`
      ALTER TABLE "${schema}"."sessions"
      ALTER COLUMN "secureId" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."sessions"
      ADD CONSTRAINT "UQ_sessions_secureId" UNIQUE ("secureId")
    `);

    // Add index for faster lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sessions_secureId"
      ON "${schema}"."sessions" ("secureId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Remove index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_sessions_secureId"
    `);

    // Remove unique constraint
    await queryRunner.query(`
      ALTER TABLE "${schema}"."sessions"
      DROP CONSTRAINT IF EXISTS "UQ_sessions_secureId"
    `);

    // Remove column
    await queryRunner.query(`
      ALTER TABLE "${schema}"."sessions"
      DROP COLUMN IF EXISTS "secureId"
    `);
  }
}

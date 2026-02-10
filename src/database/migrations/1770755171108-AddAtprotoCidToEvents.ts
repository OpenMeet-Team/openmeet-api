import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAtprotoCidToEvents1770755171108 implements MigrationInterface {
  name = 'AddAtprotoCidToEvents1770755171108';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add AT Protocol CID column to events table
    // This stores the Content Identifier returned by putRecord, required for building
    // StrongRef objects (e.g., RSVP subjects must include both uri and cid)
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events"
      ADD COLUMN IF NOT EXISTS "atprotoCid" TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      ALTER TABLE "${schema}"."events"
      DROP COLUMN IF EXISTS "atprotoCid"
    `);
  }
}

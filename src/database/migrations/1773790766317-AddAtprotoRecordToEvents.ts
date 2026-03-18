import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAtprotoRecordToEvents1773790766317
  implements MigrationInterface
{
  name = 'AddAtprotoRecordToEvents1773790766317';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      ALTER TABLE "${schema}"."events"
      ADD COLUMN IF NOT EXISTS "atprotoRecord" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      ALTER TABLE "${schema}"."events"
      DROP COLUMN IF EXISTS "atprotoRecord"
    `);
  }
}

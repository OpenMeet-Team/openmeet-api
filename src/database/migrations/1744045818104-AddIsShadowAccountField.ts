import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsShadowAccountField1744045818104
  implements MigrationInterface
{
  name = 'AddIsShadowAccountField1744045818104';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      ADD COLUMN IF NOT EXISTS "isShadowAccount" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      DROP COLUMN IF EXISTS "isShadowAccount"
    `);
  }
}

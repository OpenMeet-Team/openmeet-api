import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTakeOwnershipPendingToAtprotoIdentities1786741129455
  implements MigrationInterface
{
  name = 'AddTakeOwnershipPendingToAtprotoIdentities1786741129455';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      ALTER TABLE "${schema}"."userAtprotoIdentities"
      ADD COLUMN IF NOT EXISTS "takeOwnershipPendingAt" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      ALTER TABLE "${schema}"."userAtprotoIdentities"
      DROP COLUMN IF EXISTS "takeOwnershipPendingAt"
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTakeOwnershipStatusToAtprotoIdentities1786741129455
  implements MigrationInterface
{
  name = 'AddTakeOwnershipStatusToAtprotoIdentities1786741129455';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      ALTER TABLE "${schema}"."userAtprotoIdentities"
      ADD COLUMN IF NOT EXISTS "takeOwnershipStatus" character varying(16)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      ALTER TABLE "${schema}"."userAtprotoIdentities"
      DROP COLUMN IF EXISTS "takeOwnershipStatus"
    `);
  }
}

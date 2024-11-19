import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUuidToGroupMigration1732014700433
  implements MigrationInterface
{
  name = 'AddUuidToGroupMigration1732014700433';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" ADD "ulid" character varying NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" DROP COLUMN "ulid"`,
    );
  }
}

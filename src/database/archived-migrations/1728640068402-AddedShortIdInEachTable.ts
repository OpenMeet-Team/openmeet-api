import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddedShortIdInEachTable1728640068402
  implements MigrationInterface
{
  name = 'AddedShortIdInEachTable1728640068402';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Default schema

    await queryRunner.query(
      `ALTER TABLE "${schema}"."permissions" ADD "shortId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."roles" ADD "shortId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."statuses" ADD "shortId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ADD "shortId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."subcategories" ADD "shortId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupPermissions" ADD "shortId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRoles" ADD "shortId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" ADD "shortId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" ADD "shortId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."categories" ADD "shortId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD "shortId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD "shortId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."sessions" ADD "shortId" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Default schema

    await queryRunner.query(
      `ALTER TABLE "${schema}"."sessions" DROP COLUMN "shortId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP COLUMN "shortId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" DROP COLUMN "shortId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."categories" DROP COLUMN "shortId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" DROP COLUMN "shortId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" DROP COLUMN "shortId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRoles" DROP COLUMN "shortId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupPermissions" DROP COLUMN "shortId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."subcategories" DROP COLUMN "shortId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" DROP COLUMN "shortId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."statuses" DROP COLUMN "shortId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."roles" DROP COLUMN "shortId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."permissions" DROP COLUMN "shortId"`,
    );
  }
}

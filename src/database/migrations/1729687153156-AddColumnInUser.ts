import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddColumnInUser1729687153156 implements MigrationInterface {
  name = 'AddColumnInUser1729687153156';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD "zulipId" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP COLUMN "zulipId"`,
    );
  }
}

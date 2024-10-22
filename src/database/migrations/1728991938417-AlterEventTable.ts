import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterEventTable1728991938417 implements MigrationInterface {
  name = 'AlterEventTable1728991938417';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD "slug" character varying(255)`,
    );

    await queryRunner.query(
      `UPDATE "${schema}"."events" SET "slug" = 'some-default-value' WHERE "slug" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ALTER COLUMN "slug" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" DROP COLUMN "slug"`,
    );
  }
}

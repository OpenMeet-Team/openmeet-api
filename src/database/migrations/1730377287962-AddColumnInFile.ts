import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddColumnInFile1730377287962 implements MigrationInterface {
  name = 'AddColumnInFile1730377287962';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" DROP COLUMN "entityType"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "${schema}"."files_entitytype_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" DROP COLUMN "requiredApproval"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ADD "fileName" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ADD "fileSize" integer NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ADD "mimeType" character varying NOT NULL`,
    );
    await queryRunner.query(
      `CREATE SEQUENCE IF NOT EXISTS "${schema}"."files_id_seq" OWNED BY "${schema}"."files"."id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ALTER COLUMN "id" SET DEFAULT nextval('"${schema}"."files_id_seq"')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ALTER COLUMN "id" DROP DEFAULT`,
    );
    await queryRunner.query(
      `DROP SEQUENCE IF EXISTS "${schema}"."files_id_seq"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" DROP COLUMN "mimeType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" DROP COLUMN "fileSize"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" DROP COLUMN "fileName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" ADD "requiredApproval" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."files_entitytype_enum" AS ENUM('user', 'event', 'group')`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ADD "entityType" "${schema}"."files_entitytype_enum"`,
    );
  }
}

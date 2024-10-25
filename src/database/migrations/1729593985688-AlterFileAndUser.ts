import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterFileAndUser1729593985688 implements MigrationInterface {
  name = 'AlterFileAndUser1729593985688';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Dynamically get the schema name
    await queryRunner.query(
      `CREATE TYPE "${schema}"."files_entitytype_enum" AS ENUM('user', 'event', 'group')`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ADD "entityType" "${schema}"."files_entitytype_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "${schema}"."users" ADD "bio" text`);

    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP COLUMN "photoId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD "photoId" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" DROP CONSTRAINT "PK_6c16b9093a142e0e7613b04a3d9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ADD CONSTRAINT "PK_6c16b9093a142e0e7613b04a3d9" PRIMARY KEY ("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP COLUMN "bio"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" DROP COLUMN "entityType"`,
    );
    await queryRunner.query(`DROP TYPE "${schema}"."files_entitytype_enum"`);
  }
}

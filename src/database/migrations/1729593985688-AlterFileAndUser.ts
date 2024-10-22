import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterFileAndUser1729593985688 implements MigrationInterface {
  name = 'AlterFileAndUser1729593985688';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Dynamically get the schema name
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ADD "uuid" uuid NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."files_entitytype_enum" AS ENUM('user', 'event', 'group')`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ADD "entityType" "${schema}"."files_entitytype_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "${schema}"."users" ADD "bio" text`);
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP CONSTRAINT "FK_f856a4818b32c69dbc8811f3d2c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" DROP CONSTRAINT "PK_6c16b9093a142e0e7613b04a3d9"`,
    );
    await queryRunner.query(`ALTER TABLE "${schema}"."files" DROP COLUMN "id"`);
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ADD "id" SERIAL NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ADD CONSTRAINT "PK_6c16b9093a142e0e7613b04a3d9" PRIMARY KEY ("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP CONSTRAINT "REL_f856a4818b32c69dbc8811f3d2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP COLUMN "photoId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD "photoId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD CONSTRAINT "UQ_f856a4818b32c69dbc8811f3d2c" UNIQUE ("photoId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD CONSTRAINT "FK_f856a4818b32c69dbc8811f3d2c" FOREIGN KEY ("photoId") REFERENCES "${schema}"."files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP CONSTRAINT "FK_f856a4818b32c69dbc8811f3d2c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP CONSTRAINT "UQ_f856a4818b32c69dbc8811f3d2c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP COLUMN "photoId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD "photoId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD CONSTRAINT "REL_f856a4818b32c69dbc8811f3d2" UNIQUE ("photoId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" DROP CONSTRAINT "PK_6c16b9093a142e0e7613b04a3d9"`,
    );
    await queryRunner.query(`ALTER TABLE "${schema}"."files" DROP COLUMN "id"`);
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ADD CONSTRAINT "PK_6c16b9093a142e0e7613b04a3d9" PRIMARY KEY ("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD CONSTRAINT "FK_f856a4818b32c69dbc8811f3d2c" FOREIGN KEY ("photoId") REFERENCES "${schema}"."files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP COLUMN "bio"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" DROP COLUMN "entityType"`,
    );
    await queryRunner.query(`DROP TYPE "${schema}"."files_entitytype_enum"`);
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" DROP COLUMN "uuid"`,
    );
  }
}

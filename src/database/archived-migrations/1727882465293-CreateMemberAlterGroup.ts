import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMemberAlterGroup1727882465293 implements MigrationInterface {
  name = 'CreateMemberAlterGroup1727882465293';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_856709098512cc0c7d3dc074852"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_e094457bdb54720a55043082fe4"`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupMember" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "groupId" integer, CONSTRAINT "PK_dbf23f6a7b4374ae57b50d262f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Group" ADD "slug" character varying(255) NOT NULL DEFAULT 'default-slug'`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Group" ADD "approved" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."Group_status_enum" AS ENUM('PUBLIC', 'PRIVATE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Group" ADD "status" "${schema}"."Group_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" ADD "groupId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMember" ADD CONSTRAINT "FK_28166f82e7f80ccf53d396182e1" FOREIGN KEY ("groupId") REFERENCES "${schema}"."Group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" ADD CONSTRAINT "FK_43b3517c34a5630da5083cb2fe9" FOREIGN KEY ("groupId") REFERENCES "${schema}"."Group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_e094457bdb54720a55043082fe4" FOREIGN KEY ("subCategoryId") REFERENCES "${schema}"."subCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_856709098512cc0c7d3dc074852" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_856709098512cc0c7d3dc074852"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_e094457bdb54720a55043082fe4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" DROP CONSTRAINT "FK_43b3517c34a5630da5083cb2fe9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMember" DROP CONSTRAINT "FK_28166f82e7f80ccf53d396182e1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" DROP COLUMN "groupId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Group" DROP COLUMN "status"`,
    );
    await queryRunner.query(`DROP TYPE "${schema}"."Group_status_enum"`);
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Group" DROP COLUMN "approved"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Group" DROP COLUMN "slug"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."groupMember"`);
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_e094457bdb54720a55043082fe4" FOREIGN KEY ("subCategoryId") REFERENCES "${schema}"."subCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_856709098512cc0c7d3dc074852" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}

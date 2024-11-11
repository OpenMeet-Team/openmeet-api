import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameGroupCategoriesColumns1729023329762
  implements MigrationInterface
{
  name = 'RenameGroupCategoriesColumns1729023329762';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "FK_733b91e79dc09e35d5551757683"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "FK_464b2f0143de9ea9725a24956d2"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_464b2f0143de9ea9725a24956d"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_733b91e79dc09e35d555175768"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "PK_febacc92b4f386777f08e7d1b8e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "PK_733b91e79dc09e35d5551757683" PRIMARY KEY ("categoriesId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP COLUMN "groupsId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "PK_733b91e79dc09e35d5551757683"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP COLUMN "categoriesId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD "groupId" integer NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "PK_c510b553cc043b896bb49781375" PRIMARY KEY ("groupId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD "categoryId" integer NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "PK_c510b553cc043b896bb49781375"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "PK_c359b1d97e42b492e070323052c" PRIMARY KEY ("groupId", "categoryId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c510b553cc043b896bb4978137" ON "${schema}"."groupCategories" ("groupId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a7e4e0b30b63776099205b1592" ON "${schema}"."groupCategories" ("categoryId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "FK_c510b553cc043b896bb49781375" FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "FK_a7e4e0b30b63776099205b15925" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "FK_a7e4e0b30b63776099205b15925"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "FK_c510b553cc043b896bb49781375"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_a7e4e0b30b63776099205b1592"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_c510b553cc043b896bb4978137"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "PK_c359b1d97e42b492e070323052c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "PK_c510b553cc043b896bb49781375" PRIMARY KEY ("groupId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP COLUMN "categoryId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "PK_c510b553cc043b896bb49781375"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP COLUMN "groupId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD "categoriesId" integer NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "PK_733b91e79dc09e35d5551757683" PRIMARY KEY ("categoriesId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD "groupsId" integer NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "PK_733b91e79dc09e35d5551757683"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "PK_febacc92b4f386777f08e7d1b8e" PRIMARY KEY ("groupsId", "categoriesId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_733b91e79dc09e35d555175768" ON "${schema}"."groupCategories" ("categoriesId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_464b2f0143de9ea9725a24956d" ON "${schema}"."groupCategories" ("groupsId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "FK_464b2f0143de9ea9725a24956d2" FOREIGN KEY ("groupsId") REFERENCES "${schema}"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "FK_733b91e79dc09e35d5551757683" FOREIGN KEY ("categoriesId") REFERENCES "${schema}"."categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}

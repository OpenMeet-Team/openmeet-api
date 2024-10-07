import { MigrationInterface, QueryRunner } from 'typeorm';

export class CategoriesSubCategories1727688370400
  implements MigrationInterface
{
  name = 'CategoriesSubCategories1727688370400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Creating subCategory table
    await queryRunner.query(`CREATE TABLE "${schema}"."Category" (
          "id" SERIAL NOT NULL, 
          "name" character varying(255) NOT NULL, 
          "slug" character varying(255) NOT NULL
      )`);

    // Creating ENUM type
    await queryRunner.query(
      `CREATE TYPE "${schema}"."subCategory_type_enum" AS ENUM('EVENT', 'GROUP')`,
    );

    await queryRunner.query(`
      CREATE TABLE "${schema}"."Category" (
        "id" SERIAL NOT NULL, 
        "name" character varying(255) NOT NULL, 
        "slug" character varying(255), 
        CONSTRAINT "PK_58ac195f4b1005721f6e844dae3" PRIMARY KEY ("id")
      )
    `);
    // Creating subCategory table
    await queryRunner.query(`CREATE TABLE "${schema}"."subCategory" (
            "id" SERIAL NOT NULL, 
            "title" character varying(255) NOT NULL, 
            "description" text NOT NULL, 
            "type" "${schema}"."subCategory_type_enum", 
            "categoryId" integer, 
            CONSTRAINT "PK_58ac195f4b1005721f6e844daee" PRIMARY KEY ("id")
        )`);

    // Creating Group table
    await queryRunner.query(`CREATE TABLE "${schema}"."Group" (
            "id" SERIAL NOT NULL, 
            "name" character varying(255) NOT NULL, 
            "description" text NOT NULL, 
            CONSTRAINT "PK_d064bd160defed65823032ee547" PRIMARY KEY ("id")
        )`);

    // Creating userInterests join table
    await queryRunner.query(`CREATE TABLE "${schema}"."userInterests" (
            "subCategoryId" integer NOT NULL, 
            "userId" integer NOT NULL, 
            CONSTRAINT "PK_d6106c6b5f03813d166abe6e9b9" PRIMARY KEY ("subCategoryId", "userId")
        )`);

    // Creating indexes on userInterests for subCategoryId and userId
    await queryRunner.query(
      `CREATE INDEX "IDX_e094457bdb54720a55043082fe" ON "${schema}"."userInterests" ("subCategoryId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_856709098512cc0c7d3dc07485" ON "${schema}"."userInterests" ("userId")`,
    );

    // Creating group_categories_category join table
    await queryRunner.query(`CREATE TABLE "${schema}"."group_categories_category" (
            "groupId" integer NOT NULL, 
            "categoryId" integer NOT NULL, 
            CONSTRAINT "PK_bb606b9ed239a6f1de8b30ae3f6" PRIMARY KEY ("groupId", "categoryId")
        )`);

    // Creating indexes on group_categories_category for groupId and categoryId
    await queryRunner.query(
      `CREATE INDEX "IDX_55ec55270cbd701570ee9ad979" ON "${schema}"."group_categories_category" ("groupId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c03a1e84ff1bd7302451647fd6" ON "${schema}"."group_categories_category" ("categoryId")`,
    );

    // Creating category_groups_group join table
    await queryRunner.query(`CREATE TABLE "${schema}"."category_groups_group" (
            "categoryId" integer NOT NULL, 
            "groupId" integer NOT NULL, 
            CONSTRAINT "PK_34618c934aa42269ac3df440b50" PRIMARY KEY ("categoryId", "groupId")
        )`);

    // Creating indexes on category_groups_group for categoryId and groupId
    await queryRunner.query(
      `CREATE INDEX "IDX_300e9942ce51ca84d7aea6ab29" ON "${schema}"."category_groups_group" ("categoryId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e5a897361fcbb74c800fe105c" ON "${schema}"."category_groups_group" ("groupId")`,
    );

    // Adding foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "${schema}"."subCategory" ADD CONSTRAINT "FK_e84f5e6499f4f3e12aef86d6c3f" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."Category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_e094457bdb54720a55043082fe4" FOREIGN KEY ("subCategoryId") REFERENCES "${schema}"."subCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_856709098512cc0c7d3dc074852" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."group_categories_category" ADD CONSTRAINT "FK_55ec55270cbd701570ee9ad9799" FOREIGN KEY ("groupId") REFERENCES "${schema}"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."group_categories_category" ADD CONSTRAINT "FK_c03a1e84ff1bd7302451647fd60" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."Category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_groups_group" ADD CONSTRAINT "FK_300e9942ce51ca84d7aea6ab29e" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."Category"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_groups_group" ADD CONSTRAINT "FK_5e5a897361fcbb74c800fe105c8" FOREIGN KEY ("groupId") REFERENCES "${schema}"."Group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_groups_group" DROP CONSTRAINT "FK_5e5a897361fcbb74c800fe105c8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_groups_group" DROP CONSTRAINT "FK_300e9942ce51ca84d7aea6ab29e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."group_categories_category" DROP CONSTRAINT "FK_c03a1e84ff1bd7302451647fd60"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."group_categories_category" DROP CONSTRAINT "FK_55ec55270cbd701570ee9ad9799"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_856709098512cc0c7d3dc074852"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_e094457bdb54720a55043082fe4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."subCategory" DROP CONSTRAINT "FK_e84f5e6499f4f3e12aef86d6c3f"`,
    );

    // Drop indexes
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5e5a897361fcbb74c800fe105c"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_300e9942ce51ca84d7aea6ab29"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."category_groups_group"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_c03a1e84ff1bd7302451647fd6"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_55ec55270cbd701570ee9ad979"`,
    );
    await queryRunner.query(
      `DROP TABLE "${schema}"."group_categories_category"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_856709098512cc0c7d3dc07485"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_e094457bdb54720a55043082fe"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."userInterests"`);
    await queryRunner.query(`DROP TABLE "${schema}"."Group"`);
    await queryRunner.query(`DROP TABLE "${schema}"."subCategory"`);

    // Drop ENUM type
    await queryRunner.query(`DROP TYPE "${schema}"."subCategory_type_enum"`);
  }
}

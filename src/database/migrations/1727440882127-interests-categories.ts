import { MigrationInterface, QueryRunner } from 'typeorm';

export class InterestsCategories1727440882127 implements MigrationInterface {
  name = 'InterestsCategories1727440882127';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    await queryRunner.query(
      `CREATE TABLE "${schema}"."Interest" ("id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "categoryId" integer, CONSTRAINT "PK_c05072ade4d89081ddec4292bd4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."Category" ("id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, CONSTRAINT "PK_c2727780c5b9b0c564c29a4977c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."interest_users_user" ("interestId" integer NOT NULL, "userId" integer NOT NULL, CONSTRAINT "PK_d9a0604697925bcd3f219aa1451" PRIMARY KEY ("interestId", "userId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e6343d90ec0c3f8a80e48624e4" ON "${schema}"."interest_users_user" ("interestId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b592f3b3a73b834aec2c32ef64" ON "${schema}"."interest_users_user" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."category_events_event" ("categoryId" integer NOT NULL, "eventId" integer NOT NULL, CONSTRAINT "PK_328e675814f9cbc0734af108542" PRIMARY KEY ("categoryId", "eventId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5ec511506f673c4d2f9e6a6581" ON "${schema}"."category_events_event" ("categoryId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_99ad0d8882edac5001e8fffaed" ON "${schema}"."category_events_event" ("eventId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."event_categories_category" ("eventId" integer NOT NULL, "categoryId" integer NOT NULL, CONSTRAINT "PK_be85f4d4f79d2e4f53685ed7f96" PRIMARY KEY ("eventId", "categoryId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9fc5e5dab789917cc33940c08a" ON "${schema}"."event_categories_category" ("eventId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0c38526fad528c70c7c5baaa08" ON "${schema}"."event_categories_category" ("categoryId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."user_interests_interest" ("userId" integer NOT NULL, "interestId" integer NOT NULL, CONSTRAINT "PK_d01761bfe3b04d617d57c4927a3" PRIMARY KEY ("userId", "interestId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5afca45962c04f51b2e91e0351" ON "${schema}"."user_interests_interest" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d52a2a3498ea0af1471fd20025" ON "${schema}"."user_interests_interest" ("interestId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Interest" ADD CONSTRAINT "FK_1950059e77da5102d55110b9362" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."Category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."interest_users_user" ADD CONSTRAINT "FK_e6343d90ec0c3f8a80e48624e40" FOREIGN KEY ("interestId") REFERENCES "${schema}"."Interest"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."interest_users_user" ADD CONSTRAINT "FK_b592f3b3a73b834aec2c32ef644" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_events_event" ADD CONSTRAINT "FK_5ec511506f673c4d2f9e6a65815" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."Category"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_events_event" ADD CONSTRAINT "FK_99ad0d8882edac5001e8fffaed0" FOREIGN KEY ("eventId") REFERENCES "${schema}"."Event"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."event_categories_category" ADD CONSTRAINT "FK_9fc5e5dab789917cc33940c08a9" FOREIGN KEY ("eventId") REFERENCES "${schema}"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."event_categories_category" ADD CONSTRAINT "FK_0c38526fad528c70c7c5baaa081" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."Category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."user_interests_interest" ADD CONSTRAINT "FK_5afca45962c04f51b2e91e03516" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."user_interests_interest" ADD CONSTRAINT "FK_d52a2a3498ea0af1471fd200251" FOREIGN KEY ("interestId") REFERENCES "${schema}"."Interest"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    await queryRunner.query(
      `ALTER TABLE "${schema}"."user_interests_interest" DROP CONSTRAINT "FK_d52a2a3498ea0af1471fd200251"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."user_interests_interest" DROP CONSTRAINT "FK_5afca45962c04f51b2e91e03516"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."event_categories_category" DROP CONSTRAINT "FK_0c38526fad528c70c7c5baaa081"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."event_categories_category" DROP CONSTRAINT "FK_9fc5e5dab789917cc33940c08a9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_events_event" DROP CONSTRAINT "FK_99ad0d8882edac5001e8fffaed0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_events_event" DROP CONSTRAINT "FK_5ec511506f673c4d2f9e6a65815"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."interest_users_user" DROP CONSTRAINT "FK_b592f3b3a73b834aec2c32ef644"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."interest_users_user" DROP CONSTRAINT "FK_e6343d90ec0c3f8a80e48624e40"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Interest" DROP CONSTRAINT "FK_1950059e77da5102d55110b9362"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_d52a2a3498ea0af1471fd20025"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5afca45962c04f51b2e91e0351"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."user_interests_interest"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_0c38526fad528c70c7c5baaa08"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_9fc5e5dab789917cc33940c08a"`,
    );
    await queryRunner.query(
      `DROP TABLE "${schema}"."event_categories_category"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_99ad0d8882edac5001e8fffaed"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5ec511506f673c4d2f9e6a6581"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."category_events_event"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_b592f3b3a73b834aec2c32ef64"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_e6343d90ec0c3f8a80e48624e4"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."interest_users_user"`);
    await queryRunner.query(`DROP TABLE "${schema}"."Category"`);
    await queryRunner.query(`DROP TABLE "${schema}"."Interest"`);
  }
}

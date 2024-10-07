import { MigrationInterface, QueryRunner } from 'typeorm';

export class TableNameChanges1728305771959 implements MigrationInterface {
  name = 'TableNameChanges1728305771959';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_856709098512cc0c7d3dc074852"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_e094457bdb54720a55043082fe4"`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventAttendees" ("eventId" integer NOT NULL, "userId" integer NOT NULL, "rsvpStatus" text NOT NULL, "isHost" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_e47b1fedacf94185d9310d135e0" PRIMARY KEY ("eventId", "userId"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupCategories" ("groupId" integer NOT NULL, "categoryId" integer NOT NULL, CONSTRAINT "PK_c359b1d97e42b492e070323052c" PRIMARY KEY ("groupId", "categoryId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c510b553cc043b896bb4978137" ON "${schema}"."groupCategories" ("groupId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a7e4e0b30b63776099205b1592" ON "${schema}"."groupCategories" ("categoryId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventCategories" ("categoryId" integer NOT NULL, "eventId" integer NOT NULL, CONSTRAINT "PK_78ef94d612fddc21167a7561a3b" PRIMARY KEY ("categoryId", "eventId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dc068501e56c37f17ad7b35b06" ON "${schema}"."eventCategories" ("categoryId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d51bbedb963a7d4d1f6b526b4a" ON "${schema}"."eventCategories" ("eventId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_d01e8bdc1bf70c757dfa11597b4" FOREIGN KEY ("eventId") REFERENCES "${schema}"."Event"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_ab75812b6349113ca79b9856995" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "FK_c510b553cc043b896bb49781375" FOREIGN KEY ("groupId") REFERENCES "${schema}"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "FK_a7e4e0b30b63776099205b15925" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."Category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" ADD CONSTRAINT "FK_dc068501e56c37f17ad7b35b068" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."Category"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" ADD CONSTRAINT "FK_d51bbedb963a7d4d1f6b526b4a9" FOREIGN KEY ("eventId") REFERENCES "${schema}"."Event"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_856709098512cc0c7d3dc074852" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_e094457bdb54720a55043082fe4" FOREIGN KEY ("subCategoryId") REFERENCES "${schema}"."subCategory"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_e094457bdb54720a55043082fe4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_856709098512cc0c7d3dc074852"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" DROP CONSTRAINT "FK_d51bbedb963a7d4d1f6b526b4a9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" DROP CONSTRAINT "FK_dc068501e56c37f17ad7b35b068"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "FK_a7e4e0b30b63776099205b15925"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "FK_c510b553cc043b896bb49781375"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP CONSTRAINT "FK_ab75812b6349113ca79b9856995"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP CONSTRAINT "FK_d01e8bdc1bf70c757dfa11597b4"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_d51bbedb963a7d4d1f6b526b4a"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_dc068501e56c37f17ad7b35b06"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."eventCategories"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_a7e4e0b30b63776099205b1592"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_c510b553cc043b896bb4978137"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."groupCategories"`);
    await queryRunner.query(`DROP TABLE "${schema}"."eventAttendees"`);
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_e094457bdb54720a55043082fe4" FOREIGN KEY ("subCategoryId") REFERENCES "${schema}"."subCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_856709098512cc0c7d3dc074852" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}

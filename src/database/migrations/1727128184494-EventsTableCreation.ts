import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventsTableCreation1727128184494 implements MigrationInterface {
  name = 'EventsTableCreation1727128184494';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Default schema is 'public', replace if needed

    await queryRunner.query(
      `CREATE TABLE "${schema}"."event_attendees" ("eventId" integer NOT NULL, "userId" integer NOT NULL, "rsvpStatus" text NOT NULL, "isHost" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_edb4129eb44589ffaccce13f6ce" PRIMARY KEY ("eventId", "userId"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."Event" ("id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "image" character varying(255), "description" text NOT NULL, "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP NOT NULL, "location" character varying(255) NOT NULL, "lat" double precision, "lon" double precision, "is_public" boolean NOT NULL DEFAULT false, "userId" integer, CONSTRAINT "PK_894abf6d0c8562b398c717414d6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."event_attendees" ADD CONSTRAINT "FK_21056813ffb169d392d38a40c2d" FOREIGN KEY ("eventId") REFERENCES "${schema}"."Event"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."event_attendees" ADD CONSTRAINT "FK_07eb323a7b08ba51fe4b582f3f4" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" ADD CONSTRAINT "FK_df4217bb197f7673ebb368ea6e8" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "Event" DROP CONSTRAINT "FK_df4217bb197f7673ebb368ea6e8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_attendees" DROP CONSTRAINT "FK_07eb323a7b08ba51fe4b582f3f4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_attendees" DROP CONSTRAINT "FK_21056813ffb169d392d38a40c2d"`,
    );
    await queryRunner.query(`DROP TABLE "Event"`);
    await queryRunner.query(`DROP TABLE "event_attendees"`);
  }
}

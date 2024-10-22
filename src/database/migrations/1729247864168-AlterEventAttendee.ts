import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterEventAttendee1729247864168 implements MigrationInterface {
  name = 'AlterEventAttendee1729247864168';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN "rsvpStatus"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN "isHost"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD "isHost" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD "rsvpStatus" text`,
    );
  }
}

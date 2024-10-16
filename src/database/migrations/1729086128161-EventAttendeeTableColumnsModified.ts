import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventAttendeeTableColumnsModified1729086128161
  implements MigrationInterface
{
  name = 'EventAttendeeTableColumnsModified1729086128161';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ALTER COLUMN "rsvpStatus" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ALTER COLUMN "rsvpStatus" SET NOT NULL`,
    );
  }
}

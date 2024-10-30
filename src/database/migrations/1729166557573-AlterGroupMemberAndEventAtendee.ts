import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterGroupMemberAndEventAtendee1729166557573
  implements MigrationInterface
{
  name = 'AlterGroupMemberAndEventAtendee1729166557573';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Create new enum types for eventAttendees status and role
    await queryRunner.query(
      `CREATE TYPE "${schema}"."eventAttendees_status_enum" AS ENUM('invited', 'confirmed', 'attended', 'cancelled', 'rejected')`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD "status" "${schema}"."eventAttendees_status_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."eventAttendees_role_enum" AS ENUM('participant', 'host', 'speaker', 'moderator', 'guest')`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD "role" "${schema}"."eventAttendees_role_enum"`,
    );

    // Alter eventAttendees rsvpStatus to be nullable
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ALTER COLUMN "rsvpStatus" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Revert eventAttendees rsvpStatus to not null
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ALTER COLUMN "rsvpStatus" SET NOT NULL`,
    );

    // Drop the enum types from eventAttendees
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN "role"`,
    );
    await queryRunner.query(`DROP TYPE "${schema}"."eventAttendees_role_enum"`);
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN "status"`,
    );
    await queryRunner.query(
      `DROP TYPE "${schema}"."eventAttendees_status_enum"`,
    );
  }
}

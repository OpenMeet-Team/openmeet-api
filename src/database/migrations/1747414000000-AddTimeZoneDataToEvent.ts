import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimeZoneDataToEvent1747414000000 implements MigrationInterface {
  name = 'AddTimeZoneDataToEvent1747414000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    console.log(
      'Applying timezone defaults to existing events (data migration)...',
    );

    const generalDefaultTimeZone = 'America/New_York';
    await queryRunner.query(
      `
      UPDATE "${schema}"."events"
      SET "timeZone" = $1
      WHERE "timeZone" IS NULL;
    `,
      [generalDefaultTimeZone],
    );
    console.log(
      `Set general default timeZone to ${generalDefaultTimeZone} for events with NULL timeZone.`,
    );

    const vancouverTimeZone = 'America/Vancouver';
    try {
      await queryRunner.query(
        `
        UPDATE "${schema}"."events"
        SET "timeZone" = $1
        WHERE "groupId" = 14;
      `,
        [vancouverTimeZone],
      );
      console.log(
        `Set timeZone to ${vancouverTimeZone} for events with groupId 14.`,
      );
    } catch (e) {
      console.error(
        'Failed to update timeZone for groupId 14. Does "groupId" column exist on "events" table?',
        e.message,
      );
    }

    const honoluluTimeZone = 'Pacific/Honolulu';
    try {
      await queryRunner.query(
        `
        UPDATE "${schema}"."events"
        SET "timeZone" = $1
        WHERE "groupId" = 17;
      `,
        [honoluluTimeZone],
      );
      console.log(
        `Set timeZone to ${honoluluTimeZone} for events with groupId 17.`,
      );
    } catch (e) {
      console.error('Failed to update timeZone for Kona events.', e.message);
    }

    // Set America/New_York for events with userId 4 or 22
    const userIdTimeZone = 'America/New_York';
    try {
      await queryRunner.query(
        `
        UPDATE "${schema}"."events"
        SET "timeZone" = $1
        WHERE "userId" IN (4, 22, 120, 119);
      `,
        [userIdTimeZone],
      );
      console.log(
        `Set timeZone to ${userIdTimeZone} for events with userId 4, 22, 120, or 119.`,
      );
    } catch (e) {
      console.error(
        'Failed to update timeZone for userId 4, 22, 120, or 119 events.',
        e.message,
      );
    }

    console.log(
      'AddTimeZoneDataToEvent data migration completed successfully.',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This down migration will simply reset all timeZone values to the general default
    const schema = queryRunner.connection.options.name || 'public';
    const generalDefaultTimeZone = 'America/New_York';
    await queryRunner.query(
      `
      UPDATE "${schema}"."events"
      SET "timeZone" = $1;
    `,
      [generalDefaultTimeZone],
    );
    console.log('Reverted all event timeZone values to the general default.');
  }
}

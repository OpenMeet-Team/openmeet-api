import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventAttendeesIndexes1764351067000
  implements MigrationInterface
{
  name = 'AddEventAttendeesIndexes1764351067000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add index on eventAttendees.userId for filtering events by user
    // This supports queries like: WHERE attendee.userId = $1
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_eventAttendees_userId"
      ON "${schema}"."eventAttendees" ("userId")
    `);

    // Add index on eventAttendees.eventId for join conditions
    // This supports: JOIN eventAttendees ON eventAttendees.eventId = event.id
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_eventAttendees_eventId"
      ON "${schema}"."eventAttendees" ("eventId")
    `);

    // Add composite index for filtering user's events by status
    // This supports: WHERE attendee.userId = $1 AND attendee.status != $2
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_eventAttendees_userId_status"
      ON "${schema}"."eventAttendees" ("userId", "status")
    `);

    // Add composite index for counting attendees by event and status
    // This supports: WHERE status = $1 GROUP BY eventId
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_eventAttendees_status_eventId"
      ON "${schema}"."eventAttendees" ("status", "eventId")
    `);

    // Add index on events.startDate for date filtering and ORDER BY
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_events_startDate"
      ON "${schema}"."events" ("startDate")
    `);

    // Add index on events.status for filtering by event status
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_events_status"
      ON "${schema}"."events" ("status")
    `);

    // Add composite index for common query pattern: status + startDate
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_events_status_startDate"
      ON "${schema}"."events" ("status", "startDate")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop events indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_events_status_startDate"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_events_status"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_events_startDate"
    `);

    // Drop eventAttendees indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_eventAttendees_status_eventId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_eventAttendees_userId_status"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_eventAttendees_eventId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_eventAttendees_userId"
    `);
  }
}

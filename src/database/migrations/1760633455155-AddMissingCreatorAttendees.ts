import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingCreatorAttendees1760633455155 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // This migration adds missing attendee records for event creators
    // Many imported events (from Bluesky, web scrapers) don't have the creator
    // as an attendee, which prevents them from managing their own events

    // Step 1: Insert attendee records for event creators that don't have them
    await queryRunner.query(`
      INSERT INTO "${schema}"."eventAttendees" ("userId", "eventId", "roleId", "status", "createdAt", "updatedAt")
      SELECT DISTINCT
        e."userId" as "userId",
        e.id as "eventId",
        (SELECT id FROM "${schema}"."eventRoles" WHERE name = 'host' LIMIT 1) as "roleId",
        'confirmed'::"${schema}"."eventAttendees_status_enum" as "status",
        NOW() as "createdAt",
        NOW() as "updatedAt"
      FROM "${schema}".events e
      LEFT JOIN "${schema}"."eventAttendees" ea
        ON e.id = ea."eventId" AND e."userId" = ea."userId"
      WHERE ea.id IS NULL  -- Only insert if creator is not already an attendee
        AND e."userId" IS NOT NULL  -- Skip events with no creator (shouldn't happen)
      ON CONFLICT DO NOTHING;  -- Skip if somehow the record was created during migration
    `);

    // Step 2: Upgrade event creators with low permissions to host role
    await queryRunner.query(`
      UPDATE "${schema}"."eventAttendees" ea
      SET "roleId" = (SELECT id FROM "${schema}"."eventRoles" WHERE name = 'host' LIMIT 1),
          "updatedAt" = NOW()
      FROM "${schema}".events e,
           "${schema}"."eventRoles" er
      WHERE ea."eventId" = e.id
        AND ea."roleId" = er.id
        AND ea."userId" = e."userId"  -- Only update if user is the event creator
        AND er.name IN ('participant', 'speaker', 'guest')  -- Only upgrade low permission roles
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // We don't want to remove attendee records in the down migration
    // as it could remove legitimate attendees that were added after the migration
    // This is a data fix migration, not a schema change

    // If you really need to rollback, you would need to track which records
    // were added by this migration specifically, which is complex and risky
  }
}

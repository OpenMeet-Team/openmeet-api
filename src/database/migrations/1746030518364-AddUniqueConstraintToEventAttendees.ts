import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUniqueConstraintToEventAttendees1746030518364 implements MigrationInterface {
    name = 'AddUniqueConstraintToEventAttendees1746030518364';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const schema = queryRunner.connection.options.name || 'public';
        console.log(`Applying AddUniqueConstraintToEventAttendees migration in schema ${schema}`);

        // First, let's identify any duplicate attendee records to clean up
        await queryRunner.query(`
          CREATE TEMPORARY TABLE temp_duplicate_attendees AS
          SELECT 
            MIN(id) as keep_id,
            ARRAY_AGG(id) as all_ids,
            "eventId", 
            "userId",
            COUNT(*) as count
          FROM "${schema}"."eventAttendees"
          GROUP BY "eventId", "userId"
          HAVING COUNT(*) > 1
        `);

        // For each set of duplicates, keep only the most recently updated record
        await queryRunner.query(`
          UPDATE "${schema}"."eventAttendees" ea
          SET status = (
            SELECT status 
            FROM "${schema}"."eventAttendees" latest
            WHERE latest.id = (
              SELECT id FROM "${schema}"."eventAttendees" 
              WHERE "eventId" = ea."eventId" AND "userId" = ea."userId"
              ORDER BY "updatedAt" DESC 
              LIMIT 1
            )
          )
          FROM temp_duplicate_attendees td
          WHERE ea.id = td.keep_id
        `);

        // Delete the duplicate records, keeping only the one we updated
        await queryRunner.query(`
          DELETE FROM "${schema}"."eventAttendees"
          WHERE id IN (
            SELECT unnest(all_ids) FROM temp_duplicate_attendees tda
            WHERE all_ids <> ARRAY[keep_id]
          )
        `);

        // Now add the unique constraint
        await queryRunner.query(`
          ALTER TABLE "${schema}"."eventAttendees" 
          ADD CONSTRAINT "UQ_${schema}_event_attendee_user_event" 
          UNIQUE ("eventId", "userId")
        `);

        // Drop the temporary table
        await queryRunner.query(`DROP TABLE temp_duplicate_attendees`);
        
        console.log(`Successfully added unique constraint to eventAttendees in schema ${schema}`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const schema = queryRunner.connection.options.name || 'public';
        
        // Remove the unique constraint if we need to roll back the migration
        await queryRunner.query(`
          ALTER TABLE "${schema}"."eventAttendees" 
          DROP CONSTRAINT "UQ_${schema}_event_attendee_user_event"
        `);
        
        console.log(`Removed unique constraint from eventAttendees in schema ${schema}`);
    }
}
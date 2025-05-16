import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimeZoneToEvent1747413187416 implements MigrationInterface {
  name = 'AddTimeZoneToEvent1747413187416';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    console.log('Running AddTimeZoneToEvent migration...');

    // Add the timeZone column if it does not exist
    const columnExists = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = '${schema}'
        AND table_name = 'events'
        AND column_name = 'timeZone';
    `);

    if (columnExists && columnExists.length > 0) {
      // If the column exists but is nullable or has no default, alter it
      await queryRunner.query(`
        ALTER TABLE "${schema}"."events"
        ALTER COLUMN "timeZone" SET DEFAULT 'UTC',
        ALTER COLUMN "timeZone" SET NOT NULL;
      `);
      console.log('Ensured timeZone column is NOT NULL with default UTC');
    } else {
      await queryRunner.query(`
        ALTER TABLE "${schema}"."events"
        ADD COLUMN "timeZone" VARCHAR(100) NOT NULL DEFAULT 'UTC';
      `);
      console.log(
        'Added timeZone column to events table as NOT NULL with default UTC',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    console.log('Reverting AddTimeZoneToEvent migration...');

    // Remove the timeZone column if it exists
    const columnExists = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = '${schema}'
        AND table_name = 'events'
        AND column_name = 'timeZone';
    `);

    if (columnExists && columnExists.length > 0) {
      await queryRunner.query(`
        ALTER TABLE "${schema}"."events"
        DROP COLUMN "timeZone";
      `);
      console.log('Dropped timeZone column from events table');
    } else {
      console.log('Column timeZone does not exist on events table, skipping');
    }
  }
} 
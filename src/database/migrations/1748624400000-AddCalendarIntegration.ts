import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCalendarIntegration1748624400000 implements MigrationInterface {
  name = 'AddCalendarIntegration1748624400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Create calendar source type enum
    await queryRunner.query(`
      CREATE TYPE "${schema}"."calendar_source_type_enum" AS ENUM('google', 'apple', 'outlook', 'ical')
    `);

    // Create calendarSources table
    await queryRunner.query(`
      CREATE TABLE "${schema}"."calendarSources" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "ulid" character(26) NOT NULL,
        "userId" integer NOT NULL,
        "type" "${schema}"."calendar_source_type_enum" NOT NULL,
        "name" character varying(255) NOT NULL,
        "url" text,
        "accessToken" text,
        "refreshToken" text,
        "expiresAt" TIMESTAMP,
        "isActive" boolean NOT NULL DEFAULT true,
        "isPrivate" boolean NOT NULL DEFAULT false,
        "syncFrequency" integer NOT NULL DEFAULT '60',
        "lastSyncedAt" TIMESTAMP,
        CONSTRAINT "UQ_${schema}_calendarSources_ulid" UNIQUE ("ulid"),
        CONSTRAINT "PK_${schema}_calendarSources_id" PRIMARY KEY ("id")
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_${schema}_calendarSources_userId_isActive" ON "${schema}"."calendarSources" ("userId", "isActive")
    `);

    // Add foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "${schema}"."calendarSources" 
      ADD CONSTRAINT "FK_${schema}_calendarSources_userId" 
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE
    `);

    // Add calendar preferences to users table (for future calendar features)
    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      ADD COLUMN "calendarTimezone" character varying(50) DEFAULT 'UTC',
      ADD COLUMN "calendarWeekStart" integer DEFAULT 1,
      ADD COLUMN "calendarWorkHoursStart" time DEFAULT '09:00',
      ADD COLUMN "calendarWorkHoursEnd" time DEFAULT '17:00',
      ADD COLUMN "calendarWorkDays" integer[] DEFAULT ARRAY[1,2,3,4,5]
    `);

    console.log(
      `Created calendarSources table and related structures in schema: ${schema}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Remove calendar preferences from users table
    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      DROP COLUMN IF EXISTS "calendarTimezone",
      DROP COLUMN IF EXISTS "calendarWeekStart",
      DROP COLUMN IF EXISTS "calendarWorkHoursStart",
      DROP COLUMN IF EXISTS "calendarWorkHoursEnd",
      DROP COLUMN IF EXISTS "calendarWorkDays"
    `);

    // Drop foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "${schema}"."calendarSources" 
      DROP CONSTRAINT IF EXISTS "FK_${schema}_calendarSources_userId"
    `);

    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_${schema}_calendarSources_userId_isActive"
    `);

    // Drop table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."calendarSources"
    `);

    // Drop enum type
    await queryRunner.query(`
      DROP TYPE IF EXISTS "${schema}"."calendar_source_type_enum"
    `);

    console.log(
      `Dropped calendarSources table and related structures from schema: ${schema}`,
    );
  }
}

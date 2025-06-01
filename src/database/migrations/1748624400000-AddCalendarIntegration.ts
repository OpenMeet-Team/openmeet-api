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

    // Create external events status enum
    await queryRunner.query(`
      CREATE TYPE "${schema}"."external_event_status_enum" AS ENUM('busy', 'free', 'tentative')
    `);

    // Create externalEvents table for caching external calendar events
    await queryRunner.query(`
      CREATE TABLE "${schema}"."externalEvents" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "ulid" character(26) NOT NULL,
        "externalId" character varying(255) NOT NULL,
        "summary" text,
        "startTime" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endTime" TIMESTAMP WITH TIME ZONE NOT NULL,
        "isAllDay" boolean NOT NULL DEFAULT false,
        "status" "${schema}"."external_event_status_enum" NOT NULL DEFAULT 'busy',
        "location" text,
        "description" text,
        "calendarSourceId" integer NOT NULL,
        CONSTRAINT "UQ_${schema}_externalEvents_ulid" UNIQUE ("ulid"),
        CONSTRAINT "UQ_${schema}_externalEvents_source_external" UNIQUE ("calendarSourceId", "externalId"),
        CONSTRAINT "PK_${schema}_externalEvents_id" PRIMARY KEY ("id")
      )
    `);

    // Create indexes for external events
    await queryRunner.query(`
      CREATE INDEX "IDX_${schema}_externalEvents_source_time" ON "${schema}"."externalEvents" ("calendarSourceId", "startTime", "endTime")
    `);

    // Add foreign key constraint for external events
    await queryRunner.query(`
      ALTER TABLE "${schema}"."externalEvents" 
      ADD CONSTRAINT "FK_${schema}_externalEvents_calendarSourceId" 
      FOREIGN KEY ("calendarSourceId") REFERENCES "${schema}"."calendarSources"("id") ON DELETE CASCADE
    `);

    console.log(
      `Created calendarSources and externalEvents tables with related structures in schema: ${schema}`,
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

    // Drop external events foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "${schema}"."externalEvents" 
      DROP CONSTRAINT IF EXISTS "FK_${schema}_externalEvents_calendarSourceId"
    `);

    // Drop external events indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_${schema}_externalEvents_source_time"
    `);

    // Drop external events table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."externalEvents"
    `);

    // Drop external events enum type
    await queryRunner.query(`
      DROP TYPE IF EXISTS "${schema}"."external_event_status_enum"
    `);

    // Drop calendar sources foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "${schema}"."calendarSources" 
      DROP CONSTRAINT IF EXISTS "FK_${schema}_calendarSources_userId"
    `);

    // Drop calendar sources indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_${schema}_calendarSources_userId_isActive"
    `);

    // Drop calendar sources table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."calendarSources"
    `);

    // Drop calendar sources enum type
    await queryRunner.query(`
      DROP TYPE IF EXISTS "${schema}"."calendar_source_type_enum"
    `);

    console.log(
      `Dropped calendarSources and externalEvents tables with related structures from schema: ${schema}`,
    );
  }
}

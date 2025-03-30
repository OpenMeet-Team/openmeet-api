# Recurring Events: Data Model Design

This document outlines the initial database schema changes required to support recurring events with timezone information in OpenMeet.

## Current Limitations

The current event model in OpenMeet has several limitations we need to address:

1. No support for recurring events (each event is a single occurrence)
2. No explicit timezone storage (dates are stored without timezone context)
3. No way to represent exceptions to recurring patterns
4. No consistency between events in different timezones
5. No mechanism to distinguish between recurrence pattern events and specific occurrences

## Database Schema Changes

### Event Entity Updates

We'll extend the `EventEntity` in `openmeet-api/src/event/infrastructure/persistence/relational/entities/event.entity.ts` with the following fields:

```typescript
@Column({ nullable: true, type: 'varchar', length: 50 })
timeZone: string;

@Column({ nullable: true, type: 'jsonb' })
recurrenceRule: Record<string, any>;

@Column({ nullable: true, type: 'jsonb' })
recurrenceExceptions: string[];

@Column({ nullable: true })
recurrenceUntil: Date;

@Column({ nullable: true })
recurrenceCount: number;

@Column({ nullable: false, default: false })
isRecurring: boolean;

@Column({ nullable: true })
parentEventId: number;

@Column({ nullable: false, default: false })
isRecurrenceException: boolean;

@Column({ nullable: true })
originalDate: Date;

@ManyToOne(() => EventEntity, { nullable: true })
@JoinColumn({ name: 'parentEventId' })
parentEvent: EventEntity;

@OneToMany(() => EventEntity, event => event.parentEvent)
occurrences: EventEntity[];
```

### Parent vs. Occurrence Event Model

To properly distinguish between recurrence pattern events and their occurrences, we'll use the following approach:

#### Parent (Pattern) Events
- `isRecurring = true` - Indicates this is a recurrence pattern/parent event
- `parentEventId = null` - No parent, this is the original pattern event
- `recurrenceRule` - Contains the actual recurrence pattern definition
- Represents the "template" for all occurrences
- The `startDate` field represents the very first occurrence and is used as the anchor for the recurrence rule

#### Occurrence Events
- `parentEventId` - Set to the ID of the parent event
- `originalDate` - Stores the original date of this occurrence based on recurrence rule
- Derived from the parent event, inheriting most properties unless overridden

#### Exception Occurrences
- `isRecurrenceException = true` - Indicates this occurrence has been modified
- `parentEventId` - Points to the parent event
- `originalDate` - Stores the original date this occurrence would have had
- Contains the modified properties that differ from the pattern

This approach allows us to:
1. Easily identify parent events vs. occurrences
2. Query all occurrences of a pattern event
3. Find modified occurrences separately from generated ones
4. Preserve modifications when recurrence patterns change

### DTOs Updates

We'll update the following DTOs to support recurring events:

1. `CreateEventDto`:

```typescript
export class CreateEventDto {
  // existing fields...
  
  @IsOptional()
  @IsString()
  timeZone?: string;
  
  @IsOptional()
  @IsObject()
  recurrenceRule?: Record<string, any>;
  
  @IsOptional()
  @IsArray()
  recurrenceExceptions?: string[];
  
  @IsOptional()
  @IsDateString()
  recurrenceUntil?: string;
  
  @IsOptional()
  @IsNumber()
  @Min(1)
  recurrenceCount?: number;
}
```

2. `UpdateEventDto` (similar to CreateEventDto)

3. `EventResponseDto`:

```typescript
export class EventResponseDto {
  // existing fields...
  
  timeZone?: string;
  isRecurring: boolean;
  recurrenceRule?: Record<string, any>;
  parentEventId?: number;
  isRecurrenceException?: boolean;
  originalDate?: string;
}
```

## Database Migration

We'll create a migration to add these new fields to the events table:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecurrenceFields1680000000000 implements MigrationInterface {
  name = 'AddRecurrenceFields1680000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "events" ADD "timeZone" character varying(50)`);
    await queryRunner.query(`ALTER TABLE "events" ADD "recurrenceRule" jsonb`);
    await queryRunner.query(`ALTER TABLE "events" ADD "recurrenceExceptions" jsonb`);
    await queryRunner.query(`ALTER TABLE "events" ADD "recurrenceUntil" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "events" ADD "recurrenceCount" integer`);
    await queryRunner.query(`ALTER TABLE "events" ADD "isRecurring" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "events" ADD "parentEventId" integer`);
    await queryRunner.query(`ALTER TABLE "events" ADD "isRecurrenceException" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "events" ADD "originalDate" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "events" ADD CONSTRAINT "FK_parent_event_id" FOREIGN KEY ("parentEventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    
    // Add index for efficient querying
    await queryRunner.query(`CREATE INDEX "IDX_events_is_recurring" ON "events" ("isRecurring")`);
    await queryRunner.query(`CREATE INDEX "IDX_events_parent_id" ON "events" ("parentEventId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_events_parent_id"`);
    await queryRunner.query(`DROP INDEX "IDX_events_is_recurring"`);
    await queryRunner.query(`ALTER TABLE "events" DROP CONSTRAINT "FK_parent_event_id"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "originalDate"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "isRecurrenceException"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "parentEventId"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "isRecurring"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "recurrenceCount"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "recurrenceUntil"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "recurrenceExceptions"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "recurrenceRule"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "timeZone"`);
  }
}
```

## Recurrence Rule Format

The `recurrenceRule` field will follow the iCalendar RFC 5545 format, stored as a JSON object:

```json
{
  "freq": "WEEKLY",
  "interval": 2,
  "count": 10,
  "byday": ["MO", "WE", "FR"],
  "wkst": "MO"
}
```

## Additional Properties from RFC 5545/7986

Based on iCalendar standards, we'll add these additional fields to enhance our event model:

```typescript
@Column({ nullable: true, type: 'enum', enum: EventSecurityClass })
securityClass: EventSecurityClass;

@Column({ nullable: true, type: 'int', default: 0 })
priority: number;

@Column({ nullable: false, type: 'boolean', default: true })
blocksTime: boolean; // TRANSP property

@Column({ nullable: true, type: 'boolean' })
isAllDay: boolean;

@Column({ nullable: true, type: 'jsonb' })
resources: string[];

@Column({ nullable: true, type: 'string' })
color: string; // RFC 7986

@Column({ nullable: true, type: 'jsonb' })
conferenceData: Record<string, any>; // RFC 7986
```

See the document `05-rfc5545-considerations.md` for detailed explanations of these properties.

## Timezone Handling Implementation

Our implementation of timezone handling follows these principles:

1. **Storage in UTC, Display in Local Time**: 
   - All event dates (`startDate`, `endDate`, etc.) are stored in UTC in the database
   - The original timezone is preserved in the `timeZone` field of each event
   - This allows consistent storage while preserving the user's intent

2. **Recurrence Calculations in Original Timezone**:
   - When generating occurrences, the RecurrenceService:
     - Takes the original start date (in UTC)
     - Converts it to the specified timezone using `toZonedTime` from date-fns-tz
     - Applies recurrence rules in that timezone context
     - Converts resulting dates back to UTC for storage
   - This ensures that "daily at 9 AM" in Eastern Time always means 9 AM Eastern Time, regardless of UTC offset or DST changes

3. **Handling DST Transitions**:
   - The implementation correctly handles Daylight Saving Time transitions
   - Events recur at the same local time, even when crossing DST boundaries
   - For example, a daily 9 AM Eastern Time event will occur at 9 AM EDT during summer and 9 AM EST during winter

4. **Timezone Conversion for APIs**:
   - The RecurrenceService provides methods to convert dates between timezones
   - This ensures consistent user experience regardless of the user's timezone

5. **Preserving Original Time Intent**:
   - By storing both UTC times and the original timezone, we preserve the user's original intent
   - This is crucial for recurring events where the specific local time is important

## Next Steps

After implementing these schema changes, we'll need to:

1. Update the EventManagementService to handle recurrence rules
2. Create a RecurrenceService to generate event occurrences
3. Update the EventQueryService to support querying recurring events
4. Implement timezone handling in event creation and display
5. Add UI components for the additional RFC 5545/7986 properties

The changes outlined in this document are the first step in supporting recurring events in OpenMeet.
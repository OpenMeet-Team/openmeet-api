import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddRecurringEventFields1743371499235 implements MigrationInterface {
  name = 'AddRecurringEventFields1743371499235';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add recurring event fields to the events table
    await queryRunner.addColumns(`${schema}.events`, [
      new TableColumn({
        name: 'timeZone',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
      new TableColumn({
        name: 'recurrenceRule',
        type: 'jsonb',
        isNullable: true,
      }),
      new TableColumn({
        name: 'recurrenceExceptions',
        type: 'jsonb',
        isNullable: true,
      }),
      new TableColumn({
        name: 'recurrenceUntil',
        type: 'timestamp',
        isNullable: true,
      }),
      new TableColumn({
        name: 'recurrenceCount',
        type: 'integer',
        isNullable: true,
      }),
      new TableColumn({
        name: 'isRecurring',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
      new TableColumn({
        name: 'parentEventId',
        type: 'integer',
        isNullable: true,
      }),
      new TableColumn({
        name: 'isRecurrenceException',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
      new TableColumn({
        name: 'originalDate',
        type: 'timestamp',
        isNullable: true,
      }),
      // Additional RFC 5545/7986 properties
      new TableColumn({
        name: 'securityClass',
        type: 'varchar',
        length: '20',
        isNullable: true,
      }),
      new TableColumn({
        name: 'priority',
        type: 'integer',
        default: 0,
        isNullable: true,
      }),
      new TableColumn({
        name: 'blocksTime',
        type: 'boolean',
        default: true,
        isNullable: false,
      }),
      new TableColumn({
        name: 'isAllDay',
        type: 'boolean',
        isNullable: true,
      }),
      new TableColumn({
        name: 'resources',
        type: 'jsonb',
        isNullable: true,
      }),
      new TableColumn({
        name: 'color',
        type: 'varchar',
        length: '20',
        isNullable: true,
      }),
      new TableColumn({
        name: 'conferenceData',
        type: 'jsonb',
        isNullable: true,
      }),
    ]);

    // Add foreign key for parent event
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events" 
      ADD CONSTRAINT "FK_events_parent_event_id" 
      FOREIGN KEY ("parentEventId") 
      REFERENCES "${schema}"."events"("id") 
      ON DELETE CASCADE
    `);

    // Add indices for efficient querying
    await queryRunner.createIndices(`${schema}.events`, [
      new TableIndex({
        name: 'IDX_events_is_recurring',
        columnNames: ['isRecurring'],
      }),
      new TableIndex({
        name: 'IDX_events_parent_event_id',
        columnNames: ['parentEventId'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop indices
    await queryRunner.dropIndex(`${schema}.events`, 'IDX_events_parent_event_id');
    await queryRunner.dropIndex(`${schema}.events`, 'IDX_events_is_recurring');

    // Drop foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events" 
      DROP CONSTRAINT IF EXISTS "FK_events_parent_event_id"
    `);

    // Drop all added columns
    await queryRunner.dropColumns(`${schema}.events`, [
      'timeZone',
      'recurrenceRule',
      'recurrenceExceptions',
      'recurrenceUntil',
      'recurrenceCount',
      'isRecurring',
      'parentEventId',
      'isRecurrenceException',
      'originalDate',
      'securityClass',
      'priority',
      'blocksTime',
      'isAllDay',
      'resources',
      'color',
      'conferenceData',
    ]);
  }
}
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class RedesignRecurringEvents1743371499235
  implements MigrationInterface
{
  name = 'RedesignRecurringEvents1743371499235';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // 1. Create EventSeries table
    await queryRunner.createTable(
      new Table({
        name: `${schema}.event_series`,
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'ulid',
            type: 'char',
            length: '26',
            isUnique: true,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'slug',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          // Recurrence fields moved from events to series
          {
            name: 'recurrenceRule',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'recurrenceExceptions',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'recurrenceDescription',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'templateEventSlug',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'matrixRoomId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'userId',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'groupId',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'imageId',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'sourceType',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'sourceId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'sourceUrl',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'sourceData',
            type: 'jsonb',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // 2. Add timeZone and RFC properties to events table
    await queryRunner.addColumns(`${schema}.events`, [
      new TableColumn({
        name: 'timeZone',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
      // Add RFC 5545/7986 properties
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

    // 3. Add event to series relationship fields
    await queryRunner.addColumns(`${schema}.events`, [
      new TableColumn({
        name: 'seriesId',
        type: 'integer',
        isNullable: true,
      }),
      new TableColumn({
        name: 'seriesSlug',
        type: 'varchar',
        length: '255',
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
    ]);

    // 4. Add unique constraint to events.slug if it doesn't exist
    try {
      await queryRunner.query(`
        ALTER TABLE "${schema}".events 
        ADD CONSTRAINT "UQ_events_slug" UNIQUE (slug)
      `);
    } catch {
      // Ignore error if constraint already exists
    }

    // 5. Add indexes to EventSeries table
    await queryRunner.createIndices(`${schema}.event_series`, [
      new TableIndex({
        name: 'IDX_event_series_slug',
        columnNames: ['slug'],
      }),
      new TableIndex({
        name: 'IDX_event_series_ulid',
        columnNames: ['ulid'],
      }),
      new TableIndex({
        name: 'IDX_event_series_user_id',
        columnNames: ['userId'],
      }),
      new TableIndex({
        name: 'IDX_event_series_template_event_slug',
        columnNames: ['templateEventSlug'],
      }),
    ]);

    // 6. Add indexes to events table
    await queryRunner.createIndices(`${schema}.events`, [
      new TableIndex({
        name: 'IDX_events_series_id',
        columnNames: ['seriesId'],
      }),
      new TableIndex({
        name: 'IDX_events_series_slug',
        columnNames: ['seriesSlug'],
      }),
    ]);

    // 7. Add foreign keys from EventSeries to other tables
    await queryRunner.createForeignKeys(`${schema}.event_series`, [
      new TableForeignKey({
        name: 'FK_event_series_user',
        columnNames: ['userId'],
        referencedTableName: `${schema}.users`,
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_event_series_group',
        columnNames: ['groupId'],
        referencedTableName: `${schema}.groups`,
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
      new TableForeignKey({
        name: 'FK_event_series_file',
        columnNames: ['imageId'],
        referencedTableName: `${schema}.files`,
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
      new TableForeignKey({
        name: 'FK_event_series_template_event_slug',
        columnNames: ['templateEventSlug'],
        referencedTableName: `${schema}.events`,
        referencedColumnNames: ['slug'],
        onDelete: 'SET NULL',
      }),
    ]);

    // 8. Add foreign key from events to series
    await queryRunner.createForeignKey(
      `${schema}.events`,
      new TableForeignKey({
        name: 'FK_events_series',
        columnNames: ['seriesId'],
        referencedTableName: `${schema}.event_series`,
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // 9. Add foreign key from events to series by slug
    await queryRunner.createForeignKey(
      `${schema}.events`,
      new TableForeignKey({
        name: 'FK_events_series_slug',
        columnNames: ['seriesSlug'],
        referencedTableName: `${schema}.event_series`,
        referencedColumnNames: ['slug'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // 1. Drop foreign keys from events table
    await queryRunner.dropForeignKey(
      `${schema}.events`,
      'FK_events_series_slug',
    );
    await queryRunner.dropForeignKey(`${schema}.events`, 'FK_events_series');

    // 2. Drop foreign keys from event_series table
    await queryRunner.dropForeignKey(
      `${schema}.event_series`,
      'FK_event_series_template_event_slug',
    );
    await queryRunner.dropForeignKey(
      `${schema}.event_series`,
      'FK_event_series_file',
    );
    await queryRunner.dropForeignKey(
      `${schema}.event_series`,
      'FK_event_series_group',
    );
    await queryRunner.dropForeignKey(
      `${schema}.event_series`,
      'FK_event_series_user',
    );

    // 3. Drop indexes from events table
    await queryRunner.dropIndex(`${schema}.events`, 'IDX_events_series_slug');
    await queryRunner.dropIndex(`${schema}.events`, 'IDX_events_series_id');

    // 4. Drop indexes from event_series table
    await queryRunner.dropIndex(
      `${schema}.event_series`,
      'IDX_event_series_template_event_slug',
    );
    await queryRunner.dropIndex(
      `${schema}.event_series`,
      'IDX_event_series_user_id',
    );
    await queryRunner.dropIndex(
      `${schema}.event_series`,
      'IDX_event_series_ulid',
    );
    await queryRunner.dropIndex(
      `${schema}.event_series`,
      'IDX_event_series_slug',
    );

    // 5. Drop series relationship columns from events table
    await queryRunner.dropColumns(`${schema}.events`, [
      'seriesId',
      'seriesSlug',
      'isRecurrenceException',
      'originalDate',
    ]);

    // 6. Drop RFC properties from events table
    await queryRunner.dropColumns(`${schema}.events`, [
      'timeZone',
      'securityClass',
      'priority',
      'blocksTime',
      'isAllDay',
      'resources',
      'color',
      'conferenceData',
    ]);

    // 7. Drop event_series table
    await queryRunner.dropTable(`${schema}.event_series`);
  }
}

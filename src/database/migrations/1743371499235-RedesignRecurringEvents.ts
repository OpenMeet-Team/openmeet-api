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
        name: `${schema}.eventSeries`,
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
          // Add timeZone column
          {
            name: 'timeZone',
            type: 'varchar',
            length: '100',
            isNullable: true,
            default: "'UTC'", // Default to UTC
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
      // new TableColumn({
      //   name: 'timeZone',
      //   type: 'varchar',
      //   length: '50',
      //   isNullable: true,
      // }),
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
    try {
      await queryRunner.addColumns(`${schema}.events`, [
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
    } catch (error) {
      console.warn(
        'Error adding series relationship columns to events table:',
        error.message,
      );
    }

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
    await queryRunner.createIndices(`${schema}.eventSeries`, [
      new TableIndex({
        name: 'IDX_eventSeries_slug',
        columnNames: ['slug'],
      }),
      new TableIndex({
        name: 'IDX_eventSeries_ulid',
        columnNames: ['ulid'],
      }),
      new TableIndex({
        name: 'IDX_eventSeries_user_id',
        columnNames: ['userId'],
      }),
      new TableIndex({
        name: 'IDX_eventSeries_template_event_slug',
        columnNames: ['templateEventSlug'],
      }),
    ]);

    // 6. Add indexes to events table
    try {
      await queryRunner.createIndices(`${schema}.events`, [
        new TableIndex({
          name: 'IDX_events_series_slug',
          columnNames: ['seriesSlug'],
        }),
      ]);
    } catch (error) {
      console.warn('Error creating events series indexes:', error.message);
    }

    // 7. Add foreign keys from EventSeries to other tables
    await queryRunner.createForeignKeys(`${schema}.eventSeries`, [
      new TableForeignKey({
        name: 'FK_eventSeries_user',
        columnNames: ['userId'],
        referencedTableName: `${schema}.users`,
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_eventSeries_group',
        columnNames: ['groupId'],
        referencedTableName: `${schema}.groups`,
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
      new TableForeignKey({
        name: 'FK_eventSeries_file',
        columnNames: ['imageId'],
        referencedTableName: `${schema}.files`,
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
      new TableForeignKey({
        name: 'FK_eventSeries_template_event_slug',
        columnNames: ['templateEventSlug'],
        referencedTableName: `${schema}.events`,
        referencedColumnNames: ['slug'],
        onDelete: 'SET NULL',
      }),
    ]);

    // 8. Drop foreign key from events to series
    try {
      await queryRunner.dropForeignKey(`${schema}.events`, 'FK_events_series');
    } catch (error) {
      console.warn(
        'Foreign key FK_events_series not found or already dropped:',
        error.message,
      );
    }

    // 9. Drop index on seriesId
    try {
      await queryRunner.dropIndex(`${schema}.events`, 'IDX_events_series_id');
    } catch (error) {
      console.warn(
        'Index IDX_events_series_id not found or already dropped:',
        error.message,
      );
    }

    // 10. Drop seriesId column
    try {
      await queryRunner.dropColumn(`${schema}.events`, 'seriesId');
    } catch (error) {
      console.warn(
        'Column seriesId not found or already dropped:',
        error.message,
      );
    }

    // 11. Add foreign key from events to series by slug
    try {
      await queryRunner.createForeignKey(
        `${schema}.events`,
        new TableForeignKey({
          name: 'FK_events_series_slug',
          columnNames: ['seriesSlug'],
          referencedTableName: `${schema}.eventSeries`,
          referencedColumnNames: ['slug'],
          onDelete: 'SET NULL',
        }),
      );
    } catch (error) {
      console.warn(
        'Error creating FK_events_series_slug foreign key:',
        error.message,
      );
    }

    // 12. Drop materialized column which is no longer needed
    try {
      // First drop the index on the materialized column if it exists
      await queryRunner.query(`
        DROP INDEX IF EXISTS "${schema}"."IDX_events_materialized";
      `);

      // Then drop the materialized column
      await queryRunner.query(`
        ALTER TABLE "${schema}"."events" 
        DROP COLUMN IF EXISTS "materialized";
      `);
      console.log('Successfully dropped materialized column from events table');
    } catch (error) {
      console.warn('Error dropping materialized column:', error.message);
      // Continue with migration even if dropping the column fails
      // This allows the migration to work on fresh installs where the column doesn't exist
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Reverse the operations in reverse order

    // Drop relationships first
    await queryRunner.dropForeignKey(
      `${schema}.eventSeries`,
      'FK_eventSeries_user',
    );
    await queryRunner.dropForeignKey(
      `${schema}.eventSeries`,
      'FK_eventSeries_group',
    );
    await queryRunner.dropForeignKey(
      `${schema}.eventSeries`,
      'FK_eventSeries_image',
    );

    // Drop indexes
    await queryRunner.dropIndex(
      `${schema}.eventSeries`,
      'IDX_eventSeries_slug',
    );
    await queryRunner.dropIndex(
      `${schema}.eventSeries`,
      'IDX_eventSeries_ulid',
    );
    await queryRunner.dropIndex(
      `${schema}.eventSeries`,
      'IDX_eventSeries_user_id',
    );
    await queryRunner.dropIndex(
      `${schema}.eventSeries`,
      'IDX_eventSeries_template_event_slug',
    );
    await queryRunner.dropIndex(`${schema}.events`, 'IDX_events_series_slug');

    // Remove the added columns from events table
    await queryRunner.dropColumns(`${schema}.events`, [
      'seriesSlug',
      'isRecurrenceException',
      'originalDate',
      // 'timeZone', // Column no longer added in up(), so don't drop
      'securityClass',
      'priority',
      'blocksTime',
      'isAllDay',
      'resources',
      'color',
      'conferenceData',
    ]);

    // Drop timeZone column from eventSeries table
    await queryRunner.dropColumn(`${schema}.eventSeries`, 'timeZone');

    // Drop EventSeries table
    await queryRunner.dropTable(`${schema}.eventSeries`);

    // Add back recurrence fields to events table (approximate reversal)
    await queryRunner.addColumns(`${schema}.events`, [
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
    ]);
  }
}

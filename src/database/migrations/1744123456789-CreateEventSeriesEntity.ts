import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
  TableColumn,
} from 'typeorm';

export class CreateEventSeriesEntity1744123456789
  implements MigrationInterface
{
  name = 'CreateEventSeriesEntity1744123456789';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Create EventSeries table
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
          {
            name: 'timeZone',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'recurrenceRule',
            type: 'jsonb',
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

    // Add indexes to EventSeries table
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
    ]);

    // Add foreign keys to EventSeries table
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
    ]);

    // Add seriesId, materialized, and original_occurrence_date columns to events table
    await queryRunner.addColumns(`${schema}.events`, [
      new TableColumn({
        name: 'seriesId',
        type: 'integer',
        isNullable: true,
      }),
      new TableColumn({
        name: 'materialized',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
      new TableColumn({
        name: 'originalOccurrenceDate',
        type: 'timestamp',
        isNullable: true,
      }),
    ]);

    // Add indexes and foreign keys for new columns
    await queryRunner.createIndices(`${schema}.events`, [
      new TableIndex({
        name: 'IDX_events_series_id',
        columnNames: ['seriesId'],
      }),
      new TableIndex({
        name: 'IDX_events_materialized',
        columnNames: ['materialized'],
      }),
    ]);

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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop foreign key from events table
    await queryRunner.dropForeignKey(`${schema}.events`, 'FK_events_series');

    // Drop indexes from events table
    await queryRunner.dropIndex(`${schema}.events`, 'IDX_events_materialized');
    await queryRunner.dropIndex(`${schema}.events`, 'IDX_events_series_id');

    // Drop columns from events table
    await queryRunner.dropColumns(`${schema}.events`, [
      'seriesId',
      'materialized',
      'originalOccurrenceDate',
    ]);

    // Drop foreign keys from event_series table
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

    // Drop indexes from event_series table
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

    // Drop event_series table
    await queryRunner.dropTable(`${schema}.event_series`);
  }
}

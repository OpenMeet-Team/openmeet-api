import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRecurrenceSplitPointField1743392858448
  implements MigrationInterface
{
  name = 'AddRecurrenceSplitPointField1743392858448';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add recurrenceSplitPoint field to the events table
    await queryRunner.addColumn(
      `${schema}.events`,
      new TableColumn({
        name: 'recurrenceSplitPoint',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );

    // Create an index for efficient querying
    await queryRunner.query(`
      CREATE INDEX "IDX_events_recurrence_split_point" 
      ON "${schema}"."events" ("recurrenceSplitPoint")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_events_recurrence_split_point"
    `);

    // Drop column
    await queryRunner.dropColumn(`${schema}.events`, 'recurrenceSplitPoint');
  }
}

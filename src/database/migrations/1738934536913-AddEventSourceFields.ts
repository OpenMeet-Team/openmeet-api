import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddEventSourceFields1738934536913 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
        CREATE TYPE "${schema}"."event_source_type" AS ENUM ('bluesky', 'eventbrite', 'facebook', 'luma', 'meetup', 'other', 'web')
    `);

    await queryRunner.addColumns(`${schema}.events`, [
      new TableColumn({
        name: 'sourceType',
        type: 'event_source_type',
        isNullable: true,
        default: 'null',
      }),
      new TableColumn({
        name: 'sourceId',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
      new TableColumn({
        name: 'sourceUrl',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
      new TableColumn({
        name: 'lastSyncedAt',
        type: 'timestamp',
        isNullable: true,
      }),
      new TableColumn({
        name: 'sourceData',
        type: 'jsonb',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.dropColumns(`${schema}.events`, [
      'sourceType',
      'sourceId',
      'sourceUrl',
      'lastSyncedAt',
      'sourceData',
    ]);
    await queryRunner.query(`DROP TYPE "${schema}"."event_source_type"`);
  }
}

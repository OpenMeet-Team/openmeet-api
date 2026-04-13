import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAtprotoUriFullIndex1776192000000 implements MigrationInterface {
  name = 'AddAtprotoUriFullIndex1776192000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_events_atprotoUri"
      ON "${schema}"."events" ("atprotoUri")
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_events_atproto_pending_sync"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_events_atproto_pending_sync"
      ON "${schema}"."events" ("visibility", "atprotoUri")
      WHERE "visibility" = 'public' AND "atprotoUri" IS NULL
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_events_atprotoUri"
    `);
  }
}

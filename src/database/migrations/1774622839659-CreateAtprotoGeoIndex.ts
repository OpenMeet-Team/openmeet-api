import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAtprotoGeoIndex1774622839659 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS atproto_geo_index (
        uri TEXT NOT NULL,
        location_idx INT NOT NULL,
        location geography(Point, 4326),
        PRIMARY KEY (uri, location_idx)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_atproto_geo_location
      ON atproto_geo_index USING GIST (location)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_atproto_geo_location`);
    await queryRunner.query(`DROP TABLE IF EXISTS atproto_geo_index`);
  }
}

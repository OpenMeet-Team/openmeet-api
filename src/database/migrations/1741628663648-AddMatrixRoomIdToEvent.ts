import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMatrixRoomIdToEvent1741628663648 implements MigrationInterface {
  name = 'AddMatrixRoomIdToEvent1741628663648';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add matrixRoomId column to events table
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events" 
      ADD COLUMN IF NOT EXISTS "matrixRoomId" character varying
    `);

    // Create index for faster lookups by matrixRoomId
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_events_matrix_room_id" 
      ON "${schema}"."events" ("matrixRoomId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop the index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_events_matrix_room_id"
    `);

    // Drop the column
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events" 
      DROP COLUMN IF EXISTS "matrixRoomId"
    `);
  }
}

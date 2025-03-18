import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMatrixRoomIdToGroup1742079156067 implements MigrationInterface {
  name = 'AddMatrixRoomIdToGroup1742079156067';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add matrixRoomId column to groups table
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groups" 
      ADD COLUMN IF NOT EXISTS "matrixRoomId" character varying(255)
    `);

    // Create index for faster lookups by matrixRoomId
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_groups_matrix_room_id" 
      ON "${schema}"."groups" ("matrixRoomId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop the index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_groups_matrix_room_id"
    `);

    // Drop the column
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groups" 
      DROP COLUMN IF EXISTS "matrixRoomId"
    `);
  }
}

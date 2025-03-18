import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserFieldsToChatRoom1742238062562 implements MigrationInterface {
  name = 'AddUserFieldsToChatRoom1742238062562';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add user1Id and user2Id columns to chat_rooms table
    await queryRunner.query(`
      ALTER TABLE "${schema}"."chat_rooms" 
      ADD COLUMN IF NOT EXISTS "user1Id" INTEGER,
      ADD COLUMN IF NOT EXISTS "user2Id" INTEGER
    `);

    // Create indexes for the new columns
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chat_rooms_user1_id" 
      ON "${schema}"."chat_rooms" ("user1Id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chat_rooms_user2_id" 
      ON "${schema}"."chat_rooms" ("user2Id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_chat_rooms_user1_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_chat_rooms_user2_id"
    `);

    // Drop columns
    await queryRunner.query(`
      ALTER TABLE "${schema}"."chat_rooms" 
      DROP COLUMN IF EXISTS "user1Id",
      DROP COLUMN IF EXISTS "user2Id"
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatRoomTable1741628726345 implements MigrationInterface {
  name = 'CreateChatRoomTable1741628726345';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Create enum types for ChatRoomType and ChatRoomVisibility
    await queryRunner.query(`
      CREATE TYPE "${schema}"."chat_room_type" AS ENUM ('event', 'group', 'direct')
    `);

    await queryRunner.query(`
      CREATE TYPE "${schema}"."chat_room_visibility" AS ENUM ('public', 'private')
    `);

    // Create chatRooms table (using camelCase for consistency with other tables)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."chatRooms" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(255) NOT NULL,
        "topic" TEXT,
        "matrixRoomId" VARCHAR(255) NOT NULL,
        "type" "${schema}"."chat_room_type" NOT NULL DEFAULT 'group',
        "visibility" "${schema}"."chat_room_visibility" NOT NULL DEFAULT 'public',
        "settings" JSONB,
        "creatorId" INTEGER REFERENCES "${schema}"."users"(id),
        "eventId" INTEGER REFERENCES "${schema}"."events"(id),
        "groupId" INTEGER REFERENCES "${schema}"."groups"(id),
        "user1Id" INTEGER,
        "user2Id" INTEGER,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // Create index on matrixRoomId for faster lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chatRooms_matrix_room_id" 
      ON "${schema}"."chatRooms" ("matrixRoomId")
    `);

    // Create indexes for foreign keys
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chatRooms_creator_id" 
      ON "${schema}"."chatRooms" ("creatorId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chatRooms_event_id" 
      ON "${schema}"."chatRooms" ("eventId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chatRooms_group_id" 
      ON "${schema}"."chatRooms" ("groupId")
    `);

    // Create indexes for user1Id and user2Id (used for direct messages)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chatRooms_user1_id" 
      ON "${schema}"."chatRooms" ("user1Id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chatRooms_user2_id" 
      ON "${schema}"."chatRooms" ("user2Id")
    `);

    // Create userChatRooms junction table for many-to-many relationship (using camelCase for consistency)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."userChatRooms" (
        "chatRoomId" INTEGER NOT NULL REFERENCES "${schema}"."chatRooms"(id) ON DELETE CASCADE,
        "userId" INTEGER NOT NULL REFERENCES "${schema}"."users"(id) ON DELETE CASCADE,
        "joinedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "role" VARCHAR(50),
        PRIMARY KEY ("chatRoomId", "userId")
      )
    `);

    // Create indexes for junction table
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_userChatRooms_user_id" 
      ON "${schema}"."userChatRooms" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_userChatRooms_chat_room_id" 
      ON "${schema}"."userChatRooms" ("chatRoomId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop indexes for junction table first
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_userChatRooms_user_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_userChatRooms_chat_room_id"
    `);

    // Drop junction table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."userChatRooms"
    `);

    // Drop indexes for chat rooms table
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_chatRooms_matrix_room_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_chatRooms_creator_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_chatRooms_event_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_chatRooms_group_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_chatRooms_user1_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."idx_chatRooms_user2_id"
    `);

    // Drop main table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."chatRooms"
    `);

    // Drop enum types
    await queryRunner.query(`
      DROP TYPE IF EXISTS "${schema}"."chat_room_visibility"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "${schema}"."chat_room_type"
    `);
  }
}

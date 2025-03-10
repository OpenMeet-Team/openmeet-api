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

    // Create chat_rooms table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."chat_rooms" (
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
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // Create index on matrixRoomId for faster lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chat_rooms_matrix_room_id" 
      ON "${schema}"."chat_rooms" ("matrixRoomId")
    `);

    // Create indexes for foreign keys
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chat_rooms_creator_id" 
      ON "${schema}"."chat_rooms" ("creatorId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chat_rooms_event_id" 
      ON "${schema}"."chat_rooms" ("eventId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chat_rooms_group_id" 
      ON "${schema}"."chat_rooms" ("groupId")
    `);

    // Create user_chat_rooms junction table for many-to-many relationship
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."user_chat_rooms" (
        "chatRoomId" INTEGER NOT NULL REFERENCES "${schema}"."chat_rooms"(id) ON DELETE CASCADE,
        "userId" INTEGER NOT NULL REFERENCES "${schema}"."users"(id) ON DELETE CASCADE,
        "joinedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "role" VARCHAR(50),
        PRIMARY KEY ("chatRoomId", "userId")
      )
    `);

    // Create indexes for junction table
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_chat_rooms_user_id" 
      ON "${schema}"."user_chat_rooms" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_chat_rooms_chat_room_id" 
      ON "${schema}"."user_chat_rooms" ("chatRoomId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop junction table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."user_chat_rooms"
    `);

    // Drop main table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."chat_rooms"
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

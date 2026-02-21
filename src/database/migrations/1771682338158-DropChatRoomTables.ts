import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropChatRoomTables1771682338158 implements MigrationInterface {
  name = 'DropChatRoomTables1771682338158';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop junction table first (depends on chatRooms)
    await queryRunner.query(
      `DROP TABLE IF EXISTS "${schema}"."userChatRooms" CASCADE`,
    );

    // Drop indexes on chatRooms
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."idx_chatRooms_matrix_room_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."idx_chatRooms_creator_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."idx_chatRooms_event_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."idx_chatRooms_group_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."idx_chatRooms_user1_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."idx_chatRooms_user2_id"`,
    );

    // Drop chatRooms table
    await queryRunner.query(
      `DROP TABLE IF EXISTS "${schema}"."chatRooms" CASCADE`,
    );

    // Drop enum types
    await queryRunner.query(
      `DROP TYPE IF EXISTS "${schema}"."chat_room_type"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "${schema}"."chat_room_visibility"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Recreate enum types
    await queryRunner.query(
      `CREATE TYPE "${schema}"."chat_room_type" AS ENUM ('event', 'group', 'direct')`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."chat_room_visibility" AS ENUM ('public', 'private')`,
    );

    // Recreate chatRooms table
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

    // Recreate indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chatRooms_matrix_room_id"
      ON "${schema}"."chatRooms" ("matrixRoomId")
    `);
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
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chatRooms_user1_id"
      ON "${schema}"."chatRooms" ("user1Id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_chatRooms_user2_id"
      ON "${schema}"."chatRooms" ("user2Id")
    `);

    // Recreate userChatRooms junction table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."userChatRooms" (
        "chatRoomId" INTEGER NOT NULL REFERENCES "${schema}"."chatRooms"(id) ON DELETE CASCADE,
        "userId" INTEGER NOT NULL REFERENCES "${schema}"."users"(id) ON DELETE CASCADE,
        "joinedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "role" VARCHAR(50),
        PRIMARY KEY ("chatRoomId", "userId")
      )
    `);

    // Recreate junction table indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_userChatRooms_user_id"
      ON "${schema}"."userChatRooms" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_userChatRooms_chat_room_id"
      ON "${schema}"."userChatRooms" ("chatRoomId")
    `);
  }
}

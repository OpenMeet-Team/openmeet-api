import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveZulipFields1743090229098 implements MigrationInterface {
  name = 'RemoveZulipFields1743090229098';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop the userChats table that connected users to Zulip chats
    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."userChats"
    `);

    // Drop the chats table that stored Zulip chat information
    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."chats"
    `);

    // Remove Zulip fields from users table
    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      DROP COLUMN IF EXISTS "zulipUserId"
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      DROP COLUMN IF EXISTS "zulipApiKey"
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      DROP COLUMN IF EXISTS "zulipUsername"
    `);

    // Remove Zulip fields from groups table
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groups" 
      DROP COLUMN IF EXISTS "zulipChannelId"
    `);

    // Remove Zulip fields from events table
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events" 
      DROP COLUMN IF EXISTS "zulipChannelId"
    `);
    
    // Remove zulip preferences from user preferences JSONB
    await queryRunner.query(`
      UPDATE "${schema}"."users" 
      SET "preferences" = "preferences" - 'zulip'
      WHERE "preferences" ? 'zulip'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // This migration is not fully reversible as it removes data
    // In a production scenario, you should backup data before removing it
    
    // Recreate the chats table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."chats" (
        "id" SERIAL NOT NULL,
        "ulid" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_chats" PRIMARY KEY ("id")
      )
    `);
    
    // Recreate the userChats junction table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."userChats" (
        "userId" integer NOT NULL,
        "chatId" integer NOT NULL,
        CONSTRAINT "PK_userChats" PRIMARY KEY ("userId", "chatId")
      )
    `);
    
    await queryRunner.query(`
      ALTER TABLE "${schema}"."userChats" 
      ADD CONSTRAINT "FK_userChats_users" 
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE
    `);
    
    await queryRunner.query(`
      ALTER TABLE "${schema}"."userChats" 
      ADD CONSTRAINT "FK_userChats_chats" 
      FOREIGN KEY ("chatId") REFERENCES "${schema}"."chats"("id") ON DELETE CASCADE
    `);

    // Restore Zulip fields to events table
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events" 
      ADD COLUMN IF NOT EXISTS "zulipChannelId" integer
    `);

    // Restore Zulip fields to groups table
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groups" 
      ADD COLUMN IF NOT EXISTS "zulipChannelId" integer
    `);

    // Restore Zulip fields to users table
    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      ADD COLUMN IF NOT EXISTS "zulipUsername" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      ADD COLUMN IF NOT EXISTS "zulipApiKey" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."users" 
      ADD COLUMN IF NOT EXISTS "zulipUserId" integer
    `);
    
    // Add empty zulip settings to preferences
    await queryRunner.query(`
      UPDATE "${schema}"."users" 
      SET "preferences" = COALESCE("preferences", '{}') || 
      '{"zulip": {"connected": false}}'::jsonb
      WHERE "preferences" IS NULL OR NOT ("preferences" ? 'zulip')
    `);
  }
}

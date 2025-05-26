import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMessagingTables1747425000000 implements MigrationInterface {
  name = 'CreateMessagingTables1747425000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Create enum types for messaging
    await queryRunner.query(`
      CREATE TYPE "${schema}"."message_type" AS ENUM ('group_announcement', 'event_announcement', 'individual_message', 'admin_contact')
    `);

    await queryRunner.query(`
      CREATE TYPE "${schema}"."message_status" AS ENUM ('draft', 'pending_review', 'approved', 'rejected', 'scheduled', 'sent', 'failed')
    `);

    await queryRunner.query(`
      CREATE TYPE "${schema}"."message_channel" AS ENUM ('email', 'sms', 'bluesky', 'whatsapp')
    `);

    await queryRunner.query(`
      CREATE TYPE "${schema}"."message_log_status" AS ENUM ('sent', 'failed', 'bounced', 'delivered')
    `);

    await queryRunner.query(`
      CREATE TYPE "${schema}"."message_audit_action" AS ENUM ('draft_created', 'message_sent', 'review_requested', 'message_approved', 'message_rejected', 'rate_limit_exceeded', 'message_send_skipped', 'system_message_sent', 'system_message_skipped')
    `);

    await queryRunner.query(`
      CREATE TYPE "${schema}"."message_recipient_filter" AS ENUM ('all', 'members', 'attendees', 'admins', 'moderators')
    `);

    // Create messageDrafts table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."messageDrafts" (
        "id" SERIAL PRIMARY KEY,
        "slug" VARCHAR(255) NOT NULL UNIQUE,
        "tenantId" VARCHAR(50) NOT NULL,
        "type" "${schema}"."message_type" NOT NULL,
        "subject" VARCHAR(255) NOT NULL,
        "content" TEXT NOT NULL,
        "htmlContent" TEXT,
        "templateId" VARCHAR(100),
        "channels" TEXT NOT NULL,
        "groupId" INTEGER REFERENCES "${schema}"."groups"(id) ON DELETE CASCADE,
        "eventId" INTEGER REFERENCES "${schema}"."events"(id) ON DELETE CASCADE,
        "recipientUserIds" TEXT,
        "recipientFilter" "${schema}"."message_recipient_filter",
        "authorId" INTEGER NOT NULL REFERENCES "${schema}"."users"(id) ON DELETE CASCADE,
        "reviewerId" INTEGER REFERENCES "${schema}"."users"(id) ON DELETE SET NULL,
        "status" "${schema}"."message_status" NOT NULL DEFAULT 'draft',
        "rejectionReason" TEXT,
        "scheduledAt" TIMESTAMP,
        "sentAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // Create messageLogs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."messageLogs" (
        "id" SERIAL PRIMARY KEY,
        "tenantId" VARCHAR(50) NOT NULL,
        "messageId" INTEGER REFERENCES "${schema}"."messageDrafts"(id) ON DELETE CASCADE,
        "recipientUserId" INTEGER NOT NULL REFERENCES "${schema}"."users"(id) ON DELETE CASCADE,
        "channel" "${schema}"."message_channel" NOT NULL,
        "status" "${schema}"."message_log_status" NOT NULL,
        "sentAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deliveredAt" TIMESTAMP,
        "error" TEXT,
        "externalId" VARCHAR(255),
        "metadata" JSONB
      )
    `);

    // Create messageAudit table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."messageAudit" (
        "id" SERIAL PRIMARY KEY,
        "tenantId" VARCHAR(50) NOT NULL,
        "userId" INTEGER NOT NULL REFERENCES "${schema}"."users"(id) ON DELETE CASCADE,
        "action" "${schema}"."message_audit_action" NOT NULL,
        "groupId" INTEGER REFERENCES "${schema}"."groups"(id) ON DELETE CASCADE,
        "eventId" INTEGER REFERENCES "${schema}"."events"(id) ON DELETE CASCADE,
        "messageId" INTEGER REFERENCES "${schema}"."messageDrafts"(id) ON DELETE CASCADE,
        "details" JSON,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // Create indexes for messageDrafts
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_${schema}_messageDrafts_slug" 
      ON "${schema}"."messageDrafts" ("slug")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_${schema}_messageDrafts_tenantId_status" 
      ON "${schema}"."messageDrafts" ("tenantId", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_${schema}_messageDrafts_tenantId_authorId" 
      ON "${schema}"."messageDrafts" ("tenantId", "authorId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_${schema}_messageDrafts_tenantId_groupId" 
      ON "${schema}"."messageDrafts" ("tenantId", "groupId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_${schema}_messageDrafts_tenantId_eventId" 
      ON "${schema}"."messageDrafts" ("tenantId", "eventId")
    `);

    // Create indexes for messageLogs
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_${schema}_messageLogs_tenantId_messageId" 
      ON "${schema}"."messageLogs" ("tenantId", "messageId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_${schema}_messageLogs_tenantId_recipientUserId" 
      ON "${schema}"."messageLogs" ("tenantId", "recipientUserId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_${schema}_messageLogs_tenantId_status" 
      ON "${schema}"."messageLogs" ("tenantId", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_${schema}_messageLogs_tenantId_channel" 
      ON "${schema}"."messageLogs" ("tenantId", "channel")
    `);

    // Create indexes for messageAudit
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_${schema}_messageAudit_tenantId_userId" 
      ON "${schema}"."messageAudit" ("tenantId", "userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_${schema}_messageAudit_tenantId_action" 
      ON "${schema}"."messageAudit" ("tenantId", "action")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_${schema}_messageAudit_tenantId_groupId" 
      ON "${schema}"."messageAudit" ("tenantId", "groupId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_${schema}_messageAudit_tenantId_eventId" 
      ON "${schema}"."messageAudit" ("tenantId", "eventId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_${schema}_messageAudit_tenantId_createdAt" 
      ON "${schema}"."messageAudit" ("tenantId", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop indexes for messageAudit
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_messageAudit_tenantId_createdAt"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_messageAudit_tenantId_eventId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_messageAudit_tenantId_groupId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_messageAudit_tenantId_action"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_messageAudit_tenantId_userId"
    `);

    // Drop indexes for messageLogs
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_messageLogs_tenantId_channel"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_messageLogs_tenantId_status"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_messageLogs_tenantId_recipientUserId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_messageLogs_tenantId_messageId"
    `);

    // Drop indexes for messageDrafts
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_messageDrafts_tenantId_eventId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_messageDrafts_tenantId_groupId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_messageDrafts_tenantId_authorId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_messageDrafts_tenantId_status"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_messageDrafts_slug"
    `);

    // Drop tables
    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."messageAudit"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."messageLogs"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."messageDrafts"
    `);

    // Revert eventPermissions back to varchar
    await queryRunner.query(`
      ALTER TABLE "${schema}"."eventPermissions" 
      ALTER COLUMN "name" TYPE character varying(255) 
      USING "name"::text
    `);

    // Drop the eventPermissions enum type
    await queryRunner.query(`
      DROP TYPE IF EXISTS "${schema}"."eventPermissions_name_enum"
    `);

    // Drop enum types
    await queryRunner.query(`
      DROP TYPE IF EXISTS "${schema}"."message_recipient_filter"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "${schema}"."message_audit_action"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "${schema}"."message_log_status"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "${schema}"."message_channel"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "${schema}"."message_status"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "${schema}"."message_type"
    `);
  }
}

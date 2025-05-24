import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessagingEnumValues1747424500000 implements MigrationInterface {
  name = 'AddMessagingEnumValues1747424500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add new values to the groupPermissions enum
    await queryRunner.query(`
      ALTER TYPE "${schema}"."groupPermissions_name_enum" 
      ADD VALUE IF NOT EXISTS 'CONTACT_GROUP_ADMINS'
    `);

    await queryRunner.query(`
      ALTER TYPE "${schema}"."groupPermissions_name_enum" 
      ADD VALUE IF NOT EXISTS 'SEND_GROUP_MESSAGE'
    `);

    await queryRunner.query(`
      ALTER TYPE "${schema}"."groupPermissions_name_enum" 
      ADD VALUE IF NOT EXISTS 'SEND_BULK_GROUP_MESSAGE'
    `);

    // Convert eventPermissions from varchar to enum
    const eventPermissionsInfo = await queryRunner.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_schema = '${schema}' 
      AND table_name = 'eventPermissions' 
      AND column_name = 'name'
    `);

    if (
      eventPermissionsInfo.length > 0 &&
      eventPermissionsInfo[0].data_type === 'character varying'
    ) {
      // Create the eventPermissions enum type with all values including messaging ones
      await queryRunner.query(`
        CREATE TYPE "${schema}"."eventPermissions_name_enum" AS ENUM (
          'DELETE_EVENT',
          'CANCEL_EVENT',
          'MANAGE_EVENT',
          'APPROVE_ATTENDEES',
          'DELETE_ATTENDEES',
          'MANAGE_ATTENDEES',
          'MANAGE_DISCUSSIONS',
          'VIEW_EVENT',
          'ATTEND_EVENT',
          'MESSAGE_ATTENDEES',
          'SEND_EVENT_MESSAGE',
          'SEND_BULK_EVENT_MESSAGE',
          'CONTACT_EVENT_ORGANIZERS',
          'CREATE_DISCUSSION',
          'VIEW_DISCUSSION'
        )
      `);

      // Alter the eventPermissions table to use the enum type
      await queryRunner.query(`
        ALTER TABLE "${schema}"."eventPermissions" 
        ALTER COLUMN "name" TYPE "${schema}"."eventPermissions_name_enum" 
        USING "name"::"${schema}"."eventPermissions_name_enum"
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Note: We cannot remove individual enum values in PostgreSQL
    // We would need to recreate the entire enum without these values
    // which is complex and potentially destructive

    // Convert eventPermissions back to varchar if it was converted
    const enumExists = await queryRunner.query(`
      SELECT 1 FROM pg_type 
      WHERE typname = 'eventPermissions_name_enum' 
      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema}')
    `);

    if (enumExists.length > 0) {
      await queryRunner.query(`
        ALTER TABLE "${schema}"."eventPermissions" 
        ALTER COLUMN "name" TYPE VARCHAR(255) 
        USING "name"::VARCHAR(255)
      `);

      await queryRunner.query(`
        DROP TYPE "${schema}"."eventPermissions_name_enum"
      `);
    }
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessagingPermissions1748012720000
  implements MigrationInterface
{
  name = 'AddMessagingPermissions1748012720000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Note: The enum values were added in AddMessagingEnumValues migration
    // Now we can use them to insert the permissions

    // Add group messaging permissions if they don't exist
    await queryRunner.query(`
      INSERT INTO "${schema}"."groupPermissions" ("name", "createdAt", "updatedAt")
      SELECT name::"${schema}"."groupPermissions_name_enum", NOW(), NOW()
      FROM (VALUES ('SEND_GROUP_MESSAGE'), ('SEND_BULK_GROUP_MESSAGE')) AS v(name)
      WHERE NOT EXISTS (
        SELECT 1 FROM "${schema}"."groupPermissions" 
        WHERE "name" = v.name::"${schema}"."groupPermissions_name_enum"
      )
    `);

    // Add event messaging permissions if they don't exist
    // By now eventPermissions should be using the enum type from the previous migration
    await queryRunner.query(`
      INSERT INTO "${schema}"."eventPermissions" ("name", "createdAt", "updatedAt")
      SELECT name::"${schema}"."eventPermissions_name_enum", NOW(), NOW()
      FROM (VALUES ('SEND_EVENT_MESSAGE'), ('SEND_BULK_EVENT_MESSAGE')) AS v(name)
      WHERE NOT EXISTS (
        SELECT 1 FROM "${schema}"."eventPermissions" 
        WHERE "name" = v.name::"${schema}"."eventPermissions_name_enum"
      )
    `);

    // Associate group messaging permissions with appropriate roles
    // Owner role gets both permissions
    await queryRunner.query(`
      INSERT INTO "${schema}"."groupRolePermissions" ("groupRoleId", "groupPermissionId")
      SELECT gr.id, gp.id
      FROM "${schema}"."groupRoles" gr
      CROSS JOIN "${schema}"."groupPermissions" gp
      WHERE gr.name = 'owner' 
      AND gp.name IN ('SEND_GROUP_MESSAGE', 'SEND_BULK_GROUP_MESSAGE')
      AND NOT EXISTS (
        SELECT 1 FROM "${schema}"."groupRolePermissions" grp
        WHERE grp."groupRoleId" = gr.id AND grp."groupPermissionId" = gp.id
      )
    `);

    // Admin role gets both permissions
    await queryRunner.query(`
      INSERT INTO "${schema}"."groupRolePermissions" ("groupRoleId", "groupPermissionId")
      SELECT gr.id, gp.id
      FROM "${schema}"."groupRoles" gr
      CROSS JOIN "${schema}"."groupPermissions" gp
      WHERE gr.name = 'admin' 
      AND gp.name IN ('SEND_GROUP_MESSAGE', 'SEND_BULK_GROUP_MESSAGE')
      AND NOT EXISTS (
        SELECT 1 FROM "${schema}"."groupRolePermissions" grp
        WHERE grp."groupRoleId" = gr.id AND grp."groupPermissionId" = gp.id
      )
    `);

    // Moderator role gets only SEND_GROUP_MESSAGE
    await queryRunner.query(`
      INSERT INTO "${schema}"."groupRolePermissions" ("groupRoleId", "groupPermissionId")
      SELECT gr.id, gp.id
      FROM "${schema}"."groupRoles" gr
      CROSS JOIN "${schema}"."groupPermissions" gp
      WHERE gr.name = 'moderator' 
      AND gp.name = 'SEND_GROUP_MESSAGE'
      AND NOT EXISTS (
        SELECT 1 FROM "${schema}"."groupRolePermissions" grp
        WHERE grp."groupRoleId" = gr.id AND grp."groupPermissionId" = gp.id
      )
    `);

    // Associate event messaging permissions with appropriate roles
    // Host role gets both permissions
    await queryRunner.query(`
      INSERT INTO "${schema}"."eventRolePermissions" ("eventRoleId", "eventPermissionId")
      SELECT er.id, ep.id
      FROM "${schema}"."eventRoles" er
      CROSS JOIN "${schema}"."eventPermissions" ep
      WHERE er.name = 'host' 
      AND ep.name IN ('SEND_EVENT_MESSAGE', 'SEND_BULK_EVENT_MESSAGE')
      AND NOT EXISTS (
        SELECT 1 FROM "${schema}"."eventRolePermissions" erp
        WHERE erp."eventRoleId" = er.id AND erp."eventPermissionId" = ep.id
      )
    `);

    // Moderator role gets both permissions
    await queryRunner.query(`
      INSERT INTO "${schema}"."eventRolePermissions" ("eventRoleId", "eventPermissionId")
      SELECT er.id, ep.id
      FROM "${schema}"."eventRoles" er
      CROSS JOIN "${schema}"."eventPermissions" ep
      WHERE er.name = 'moderator' 
      AND ep.name IN ('SEND_EVENT_MESSAGE', 'SEND_BULK_EVENT_MESSAGE')
      AND NOT EXISTS (
        SELECT 1 FROM "${schema}"."eventRolePermissions" erp
        WHERE erp."eventRoleId" = er.id AND erp."eventPermissionId" = ep.id
      )
    `);

    // Speaker role gets only SEND_EVENT_MESSAGE
    await queryRunner.query(`
      INSERT INTO "${schema}"."eventRolePermissions" ("eventRoleId", "eventPermissionId")
      SELECT er.id, ep.id
      FROM "${schema}"."eventRoles" er
      CROSS JOIN "${schema}"."eventPermissions" ep
      WHERE er.name = 'speaker' 
      AND ep.name = 'SEND_EVENT_MESSAGE'
      AND NOT EXISTS (
        SELECT 1 FROM "${schema}"."eventRolePermissions" erp
        WHERE erp."eventRoleId" = er.id AND erp."eventPermissionId" = ep.id
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Remove associations from role-permission tables
    await queryRunner.query(`
      DELETE FROM "${schema}"."groupRolePermissions"
      WHERE "groupPermissionId" IN (
        SELECT id FROM "${schema}"."groupPermissions" 
        WHERE name IN ('SEND_GROUP_MESSAGE', 'SEND_BULK_GROUP_MESSAGE')
      )
    `);

    await queryRunner.query(`
      DELETE FROM "${schema}"."eventRolePermissions"
      WHERE "eventPermissionId" IN (
        SELECT id FROM "${schema}"."eventPermissions" 
        WHERE name IN ('SEND_EVENT_MESSAGE', 'SEND_BULK_EVENT_MESSAGE')
      )
    `);

    // Remove the permissions
    await queryRunner.query(`
      DELETE FROM "${schema}"."groupPermissions" 
      WHERE name IN ('SEND_GROUP_MESSAGE', 'SEND_BULK_GROUP_MESSAGE')
    `);

    await queryRunner.query(`
      DELETE FROM "${schema}"."eventPermissions" 
      WHERE name IN ('SEND_EVENT_MESSAGE', 'SEND_BULK_EVENT_MESSAGE')
    `);
  }
}

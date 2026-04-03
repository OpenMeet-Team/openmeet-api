import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixModeratorPermsAndAddReceiveContactMessages1775044606840
  implements MigrationInterface
{
  name = 'FixModeratorPermsAndAddReceiveContactMessages1775044606840';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // 1. Add new enum value for RECEIVE_CONTACT_MESSAGES
    await queryRunner.query(`
      ALTER TYPE "${schema}"."groupPermissions_name_enum"
      ADD VALUE IF NOT EXISTS 'RECEIVE_CONTACT_MESSAGES'
    `);

    // Commit enum changes so they can be used in subsequent queries
    await queryRunner.commitTransaction();
    await queryRunner.startTransaction();

    // 2. Insert the new RECEIVE_CONTACT_MESSAGES permission row
    await queryRunner.query(`
      INSERT INTO "${schema}"."groupPermissions" (name, "createdAt", "updatedAt")
      SELECT 'RECEIVE_CONTACT_MESSAGES', NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM "${schema}"."groupPermissions" WHERE name = 'RECEIVE_CONTACT_MESSAGES'
      );
    `);

    // 3. Add RECEIVE_CONTACT_MESSAGES to Owner role
    await queryRunner.query(`
      INSERT INTO "${schema}"."groupRolePermissions" ("groupRoleId", "groupPermissionId")
      SELECT gr.id, gp.id
      FROM "${schema}"."groupRoles" gr, "${schema}"."groupPermissions" gp
      WHERE gr.name = 'owner'
        AND gp.name = 'RECEIVE_CONTACT_MESSAGES'
        AND NOT EXISTS (
          SELECT 1 FROM "${schema}"."groupRolePermissions" grp_existing
          WHERE grp_existing."groupRoleId" = gr.id
            AND grp_existing."groupPermissionId" = gp.id
        );
    `);

    // 4. Add RECEIVE_CONTACT_MESSAGES to Admin role
    await queryRunner.query(`
      INSERT INTO "${schema}"."groupRolePermissions" ("groupRoleId", "groupPermissionId")
      SELECT gr.id, gp.id
      FROM "${schema}"."groupRoles" gr, "${schema}"."groupPermissions" gp
      WHERE gr.name = 'admin'
        AND gp.name = 'RECEIVE_CONTACT_MESSAGES'
        AND NOT EXISTS (
          SELECT 1 FROM "${schema}"."groupRolePermissions" grp_existing
          WHERE grp_existing."groupRoleId" = gr.id
            AND grp_existing."groupPermissionId" = gp.id
        );
    `);

    // 5. Add MANAGE_REPORTS to Admin role (Owner already has it)
    await queryRunner.query(`
      INSERT INTO "${schema}"."groupRolePermissions" ("groupRoleId", "groupPermissionId")
      SELECT gr.id, gp.id
      FROM "${schema}"."groupRoles" gr, "${schema}"."groupPermissions" gp
      WHERE gr.name = 'admin'
        AND gp.name = 'MANAGE_REPORTS'
        AND NOT EXISTS (
          SELECT 1 FROM "${schema}"."groupRolePermissions" grp_existing
          WHERE grp_existing."groupRoleId" = gr.id
            AND grp_existing."groupPermissionId" = gp.id
        );
    `);

    // 6. Remove MANAGE_MEMBERS from Moderator role
    await queryRunner.query(`
      DELETE FROM "${schema}"."groupRolePermissions"
      WHERE "groupRoleId" = (
        SELECT id FROM "${schema}"."groupRoles" WHERE name = 'moderator'
      )
      AND "groupPermissionId" = (
        SELECT id FROM "${schema}"."groupPermissions" WHERE name = 'MANAGE_MEMBERS'
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // 1. Re-add MANAGE_MEMBERS to Moderator role
    await queryRunner.query(`
      INSERT INTO "${schema}"."groupRolePermissions" ("groupRoleId", "groupPermissionId")
      SELECT gr.id, gp.id
      FROM "${schema}"."groupRoles" gr, "${schema}"."groupPermissions" gp
      WHERE gr.name = 'moderator'
        AND gp.name = 'MANAGE_MEMBERS'
        AND NOT EXISTS (
          SELECT 1 FROM "${schema}"."groupRolePermissions" grp_existing
          WHERE grp_existing."groupRoleId" = gr.id
            AND grp_existing."groupPermissionId" = gp.id
        );
    `);

    // 2. Remove MANAGE_REPORTS from Admin role
    // Note: This was added by this migration; the seed already had it for Admin,
    // but for databases that were migrated (not seeded), this is the reverse.
    await queryRunner.query(`
      DELETE FROM "${schema}"."groupRolePermissions"
      WHERE "groupRoleId" = (
        SELECT id FROM "${schema}"."groupRoles" WHERE name = 'admin'
      )
      AND "groupPermissionId" = (
        SELECT id FROM "${schema}"."groupPermissions" WHERE name = 'MANAGE_REPORTS'
      );
    `);

    // 3. Remove RECEIVE_CONTACT_MESSAGES from Owner and Admin roles
    await queryRunner.query(`
      DELETE FROM "${schema}"."groupRolePermissions"
      WHERE "groupPermissionId" = (
        SELECT id FROM "${schema}"."groupPermissions" WHERE name = 'RECEIVE_CONTACT_MESSAGES'
      );
    `);

    // 4. Remove the RECEIVE_CONTACT_MESSAGES permission record
    await queryRunner.query(`
      DELETE FROM "${schema}"."groupPermissions"
      WHERE name = 'RECEIVE_CONTACT_MESSAGES';
    `);

    // Note: PostgreSQL enum values cannot be removed, so RECEIVE_CONTACT_MESSAGES
    // will remain in the enum type. This is harmless.
  }
}

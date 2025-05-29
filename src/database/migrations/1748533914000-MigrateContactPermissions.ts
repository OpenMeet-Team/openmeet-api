import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateContactPermissions1748533914000
  implements MigrationInterface
{
  name = 'MigrateContactPermissions1748533914000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // First, ensure the new permission records exist in the groupPermissions table
    // (The enum values were added by the previous migration, now we need the actual records)
    await queryRunner.query(`
      INSERT INTO "${schema}"."groupPermissions" (name, "createdAt", "updatedAt")
      SELECT 'CONTACT_MEMBERS', NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM "${schema}"."groupPermissions" WHERE name = 'CONTACT_MEMBERS'
      );
    `);

    await queryRunner.query(`
      INSERT INTO "${schema}"."groupPermissions" (name, "createdAt", "updatedAt")
      SELECT 'CONTACT_ADMINS', NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM "${schema}"."groupPermissions" WHERE name = 'CONTACT_ADMINS'
      );
    `);

    // Grant ContactMembers to all users who currently have ManageMembers
    // This ensures admins/owners can continue messaging members
    await queryRunner.query(`
      INSERT INTO "${schema}"."groupRolePermissions" ("groupRoleId", "groupPermissionId")
      SELECT gr.id, gp.id 
      FROM "${schema}"."groupRoles" gr, "${schema}"."groupPermissions" gp
      WHERE gp.name = 'CONTACT_MEMBERS' 
        AND gr.id IN (
          SELECT DISTINCT grp."groupRoleId" 
          FROM "${schema}"."groupRolePermissions" grp
          JOIN "${schema}"."groupPermissions" gp2 ON grp."groupPermissionId" = gp2.id  
          WHERE gp2.name = 'MANAGE_MEMBERS'
        )
        AND NOT EXISTS (
          SELECT 1 FROM "${schema}"."groupRolePermissions" grp_existing
          WHERE grp_existing."groupRoleId" = gr.id 
            AND grp_existing."groupPermissionId" = gp.id
        );
    `);

    // Grant ContactAdmins to all group members
    // This allows members to contact admins
    await queryRunner.query(`
      INSERT INTO "${schema}"."groupRolePermissions" ("groupRoleId", "groupPermissionId")  
      SELECT gr.id, gp.id
      FROM "${schema}"."groupRoles" gr, "${schema}"."groupPermissions" gp
      WHERE gp.name = 'CONTACT_ADMINS'
        AND gr.name IN ('guest', 'member', 'moderator', 'admin', 'owner')
        AND NOT EXISTS (
          SELECT 1 FROM "${schema}"."groupRolePermissions" grp_existing
          WHERE grp_existing."groupRoleId" = gr.id 
            AND grp_existing."groupPermissionId" = gp.id
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Remove ContactMembers and ContactAdmins permissions added by this migration
    // Note: This is a destructive operation and should be used carefully
    console.log(
      'Removing ContactMembers and ContactAdmins permissions from all roles. This may break messaging functionality.',
    );

    // First remove the permission assignments
    await queryRunner.query(`
      DELETE FROM "${schema}"."groupRolePermissions" 
      WHERE "groupPermissionId" IN (
        SELECT id FROM "${schema}"."groupPermissions" 
        WHERE name IN ('CONTACT_MEMBERS', 'CONTACT_ADMINS')
      );
    `);

    // Then remove the permission records themselves
    await queryRunner.query(`
      DELETE FROM "${schema}"."groupPermissions" 
      WHERE name IN ('CONTACT_MEMBERS', 'CONTACT_ADMINS');
    `);
  }
}

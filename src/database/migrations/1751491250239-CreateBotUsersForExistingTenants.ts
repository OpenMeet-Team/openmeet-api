import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { ulid } from 'ulid';

export class CreateBotUsersForExistingTenants1751491250239
  implements MigrationInterface
{
  name = 'CreateBotUsersForExistingTenants1751491250239';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Skip if this is not a tenant schema
    if (!schema.startsWith('tenant_')) {
      console.log(
        `⏭️ Skipping bot user creation for non-tenant schema: ${schema}`,
      );
      return;
    }

    const tenantId = schema.replace('tenant_', '');
    console.log(
      `🤖 Creating bot user for tenant: ${tenantId} (schema: ${schema})`,
    );

    // Check if users table exists in this schema
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = '${schema}' 
        AND table_name = 'users'
      );
    `);

    if (!tableExists[0].exists) {
      console.log(
        `  ⚠️ Users table does not exist in schema ${schema}, skipping...`,
      );
      return;
    }

    const botEmailDomain = process.env.BOT_EMAIL_DOMAIN || 'openmeet.net';
    const botEmail = `bot-${tenantId}@${botEmailDomain}`;
    const botSlug = `openmeet-bot-${tenantId}`;

    // Check if bot user already exists
    const existingBot = await queryRunner.query(
      `SELECT id, slug FROM "${schema}"."users" WHERE email = $1`,
      [botEmail],
    );

    if (existingBot.length > 0) {
      console.log(
        `  ✓ Bot user already exists for tenant ${tenantId}: ${existingBot[0].slug}`,
      );
      return;
    }

    // Get bot password from tenant configuration
    let botPassword = `bot-secure-password-${tenantId}-2025`; // Default fallback

    try {
      // Try to get password from TENANTS_B64 configuration
      const tenantsB64 = process.env.TENANTS_B64;
      if (tenantsB64) {
        const tenants = JSON.parse(
          Buffer.from(tenantsB64, 'base64').toString(),
        );
        const tenant = tenants.find((t: any) => t.id === tenantId);
        if (tenant?.botUser?.password) {
          botPassword = tenant.botUser.password;
          console.log(
            `  🔑 Using configured password for bot user in tenant: ${tenantId}`,
          );
        } else {
          console.log(
            `  ⚠️ No configured password found, using default for tenant: ${tenantId}`,
          );
        }
      }
    } catch (error) {
      console.log(
        `  ⚠️ Failed to parse tenant config, using default password: ${error.message}`,
      );
    }

    // Hash the password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(botPassword, salt);

    // Generate ULID for the user
    const userUlid = ulid();

    // Get active status ID (assuming 1 is active)
    const statusResult = await queryRunner.query(
      `SELECT id FROM "public"."statuses" WHERE name = 'active' LIMIT 1`,
    );
    const statusId = statusResult.length > 0 ? statusResult[0].id : 1;

    // Get user role ID
    const roleResult = await queryRunner.query(
      `SELECT id FROM "public"."roles" WHERE name = 'user' LIMIT 1`,
    );
    const roleId = roleResult.length > 0 ? roleResult[0].id : 2;

    try {
      // Insert bot user
      await queryRunner.query(
        `
        INSERT INTO "${schema}"."users" (
          "ulid", "email", "firstName", "lastName", "slug", "password", 
          "statusId", "roleId", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
        )
      `,
        [
          userUlid,
          botEmail,
          'OpenMeet',
          'Bot',
          botSlug,
          hashedPassword,
          statusId,
          roleId,
        ],
      );

      console.log(`  ✅ Created bot user for tenant ${tenantId}: ${botSlug}`);
    } catch (error) {
      console.error(
        `  ❌ Failed to create bot user for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Skip if this is not a tenant schema
    if (!schema.startsWith('tenant_')) {
      console.log(
        `⏭️ Skipping bot user removal for non-tenant schema: ${schema}`,
      );
      return;
    }

    const tenantId = schema.replace('tenant_', '');
    const botEmailDomain = process.env.BOT_EMAIL_DOMAIN || 'openmeet.net';
    const botEmail = `bot-${tenantId}@${botEmailDomain}`;

    console.log(
      `🗑️ Removing bot user for tenant: ${tenantId} (schema: ${schema})`,
    );

    try {
      // Remove bot user
      const result = await queryRunner.query(
        `DELETE FROM "${schema}"."users" WHERE email = $1`,
        [botEmail],
      );

      if (result.affectedRows > 0) {
        console.log(`  ✅ Removed bot user for tenant: ${tenantId}`);
      } else {
        console.log(`  ⚠️ No bot user found to remove for tenant: ${tenantId}`);
      }
    } catch (error) {
      console.error(
        `  ❌ Failed to remove bot user for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }
}

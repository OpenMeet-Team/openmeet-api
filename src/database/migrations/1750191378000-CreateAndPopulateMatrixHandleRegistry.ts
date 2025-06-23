import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAndPopulateMatrixHandleRegistry1750191378000
  implements MigrationInterface
{
  name = 'CreateAndPopulateMatrixHandleRegistry1750191378000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Check if registry already exists (created by previous tenant)
    const registryExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'matrixHandleRegistry'
      );
    `);

    if (registryExists[0].exists) {
      console.log(
        `⏭️ Matrix handle registry already exists - migrating ${schema} data only...`,
      );
      // Registry exists, just migrate this tenant's data
      await this.populateCurrentTenantHandles(queryRunner, schema);
      return;
    }

    console.log(
      `🏗️ Creating global Matrix handle registry (first tenant: ${schema})...`,
    );

    // 1. Create the global Matrix handle registry table in the public schema
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "matrixHandleRegistry" (
        id SERIAL PRIMARY KEY,
        handle VARCHAR(255) NOT NULL,
        "tenantId" VARCHAR(255) NOT NULL,
        "userId" INTEGER NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT "uq_matrix_handle" UNIQUE (handle)
      );
    `);

    // 2. Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_matrix_handle_registry_handle" 
      ON "matrixHandleRegistry"(handle);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_matrix_handle_registry_tenant_user" 
      ON "matrixHandleRegistry"("tenantId", "userId");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_matrix_handle_registry_tenant" 
      ON "matrixHandleRegistry"("tenantId");
    `);

    // 3. Add constraint to ensure case-insensitive uniqueness
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_matrix_handle_registry_handle_lower" 
      ON "matrixHandleRegistry"(LOWER(handle));
    `);

    // 4. Add constraint to ensure one Matrix handle per user
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_matrix_handle_registry_one_per_user" 
      ON "matrixHandleRegistry"("tenantId", "userId");
    `);

    console.log('✅ Created global matrixHandleRegistry table with indexes');

    // 5. Populate with existing Matrix users from THIS tenant only
    await this.populateCurrentTenantHandles(queryRunner, schema);
  }

  private async populateCurrentTenantHandles(
    queryRunner: QueryRunner,
    currentSchema: string,
  ): Promise<void> {
    console.log(`🔄 Migrating Matrix handles for ${currentSchema}...`);

    // Determine tenant ID from schema name
    const tenantId = currentSchema.replace('tenant_', '');
    const schemaName = `tenant_${tenantId}`;

    // Check if users table exists in this schema
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = '${schemaName}' 
        AND table_name = 'users'
      );
    `);

    if (!tableExists[0].exists) {
      console.log(
        `  ⚠️ Users table does not exist in schema ${schemaName}, skipping...`,
      );
      return;
    }

    // Check if matrixUserId column exists before querying
    const matrixUserIdColumnExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = '${schemaName}' 
        AND table_name = 'users' 
        AND column_name = 'matrixUserId'
      );
    `);

    if (!matrixUserIdColumnExists[0].exists) {
      console.log(
        `  ⚠️ matrixUserId column does not exist in ${schemaName}.users, skipping...`,
      );
      return;
    }

    // Extract Matrix handles from existing users in this tenant
    let existingUsers;
    try {
      existingUsers = await queryRunner.query(`
        SELECT 
          id as "userId",
          "matrixUserId",
          CASE 
            WHEN "matrixUserId" IS NOT NULL AND "matrixUserId" LIKE '@%:%'
            THEN SUBSTRING("matrixUserId" FROM 2 FOR POSITION(':' IN "matrixUserId") - 2)
            ELSE NULL
          END as extracted_handle
        FROM "${schemaName}".users 
        WHERE "matrixUserId" IS NOT NULL 
        AND "matrixUserId" LIKE '@%:%'
      `);
    } catch (error) {
      console.log(
        `  ⚠️ Error querying users in schema ${schemaName}: ${error.message}, skipping...`,
      );
      return;
    }

    let totalRegistered = 0;

    // Insert unique handles into registry (one handle per user)
    for (const user of existingUsers) {
      if (user.extracted_handle) {
        try {
          await queryRunner.query(
            `
            INSERT INTO "matrixHandleRegistry" (handle, "tenantId", "userId", "createdAt", "updatedAt")
            VALUES ($1, $2, $3, NOW(), NOW())
            ON CONFLICT ("tenantId", "userId") DO UPDATE SET
              handle = EXCLUDED.handle,
              "updatedAt" = NOW()
            `,
            [user.extracted_handle.toLowerCase(), tenantId, user.userId],
          );

          totalRegistered++;
          console.log(
            `  ✓ Registered: ${user.extracted_handle} → user ${user.userId} (tenant: ${tenantId})`,
          );
        } catch (error) {
          console.warn(
            `  ⚠ Failed to register handle ${user.extracted_handle} for user ${user.userId}: ${error.message}`,
          );
        }
      }
    }

    console.log(
      `  📊 Processed ${existingUsers.length} users from ${schemaName}`,
    );
    console.log(`  ✅ Registered ${totalRegistered} handles for ${tenantId}`);
  }

  private async populateExistingHandles(
    queryRunner: QueryRunner,
  ): Promise<void> {
    console.log('🔄 Starting population of existing Matrix handles...');

    // Get all tenant schemas
    const tenantSchemas = await queryRunner.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name LIKE 'tenant_%' OR schema_name = 'public'
    `);

    let totalProcessed = 0;
    let totalRegistered = 0;

    // Extract handles from existing Matrix user IDs across all tenant schemas
    for (const schema of tenantSchemas) {
      const schemaName = schema.schema_name;

      console.log(`📂 Processing schema: ${schemaName}`);

      // Check if the users table exists in this schema before querying
      const tableExists = await queryRunner.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = '${schemaName}' 
          AND table_name = 'users'
        );
      `);

      if (!tableExists[0].exists) {
        console.log(
          `  ⚠️ Users table does not exist in schema ${schemaName}, skipping...`,
        );
        continue;
      }

      // Extract Matrix handles from existing users in this tenant
      let existingUsers;
      try {
        existingUsers = await queryRunner.query(`
          SELECT 
            id as "userId",
            "matrixUserId",
            CASE 
              WHEN "matrixUserId" IS NOT NULL AND "matrixUserId" LIKE '@%:%'
              THEN SUBSTRING("matrixUserId" FROM 2 FOR POSITION(':' IN "matrixUserId") - 2)
              ELSE NULL
            END as extracted_handle
          FROM "${schemaName}".users 
          WHERE "matrixUserId" IS NOT NULL 
          AND "matrixUserId" LIKE '@%:%'
        `);
      } catch (error) {
        console.log(
          `  ⚠️ Error querying users in schema ${schemaName}: ${error.message}, skipping...`,
        );
        continue;
      }

      // Determine tenant ID from schema name
      const tenantId =
        schemaName === 'public' ? '' : schemaName.replace('tenant_', '');

      // Insert unique handles into registry (one handle per user, ignore global duplicates)
      for (const user of existingUsers) {
        if (user.extracted_handle) {
          try {
            // Use INSERT ... ON CONFLICT for the user constraint (one handle per user)
            // If handle is globally taken, skip this user
            await queryRunner.query(
              `
              INSERT INTO "matrixHandleRegistry" (handle, "tenantId", "userId", "createdAt", "updatedAt")
              VALUES ($1, $2, $3, NOW(), NOW())
              ON CONFLICT ("tenantId", "userId") DO UPDATE SET
                handle = EXCLUDED.handle,
                "updatedAt" = NOW()
              `,
              [user.extracted_handle.toLowerCase(), tenantId, user.userId],
            );

            totalRegistered++;
            console.log(
              `  ✓ Registered: ${user.extracted_handle} → user ${user.userId} (tenant: ${tenantId})`,
            );
          } catch (error) {
            console.warn(
              `  ⚠ Failed to register handle ${user.extracted_handle} for user ${user.userId}: ${error.message}`,
            );
          }
        }
      }

      totalProcessed += existingUsers.length;
      console.log(
        `  📊 Processed ${existingUsers.length} users from ${schemaName}`,
      );
    }

    // Report final statistics
    const registryCount = await queryRunner.query(
      'SELECT COUNT(*) as count FROM "matrixHandleRegistry"',
    );

    console.log('');
    console.log('🎉 Matrix handle registry population complete!');
    console.log(`📈 Total users processed: ${totalProcessed}`);
    console.log(`✅ Total handles registered: ${totalRegistered}`);
    console.log(
      `🗃️ Registry table contains: ${registryCount[0].count} entries`,
    );

    if (totalProcessed > totalRegistered) {
      console.log(
        `⚠️ ${totalProcessed - totalRegistered} handles were skipped (duplicates or invalid format)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Only drop the global table once (from the last tenant being rolled back)
    const registryExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'matrixHandleRegistry'
      );
    `);

    if (!registryExists[0].exists) {
      console.log(
        `⏭️ Matrix handle registry already removed - skipping rollback for ${schema}`,
      );
      return;
    }

    console.log(`🔄 Rolling back Matrix handle registry (${schema})...`);

    // Drop indexes first
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_matrix_handle_registry_one_per_user";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_matrix_handle_registry_handle_lower";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_matrix_handle_registry_tenant";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_matrix_handle_registry_tenant_user";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_matrix_handle_registry_handle";`,
    );

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS "matrixHandleRegistry";`);

    console.log('✅ Matrix handle registry removed');
  }
}

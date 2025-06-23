import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanupLegacyMatrixFieldsFromUsers1750699375000
  implements MigrationInterface
{
  name = 'CleanupLegacyMatrixFieldsFromUsers1750699375000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    console.log(
      `🧹 Cleaning up legacy Matrix fields from ${schema}.users table...`,
    );

    // Check if matrixHandleRegistry exists (safety check - only for public schema)
    if (schema === 'public') {
      const registryExists = await queryRunner.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'matrixHandleRegistry'
        );
      `);

      if (!registryExists[0].exists) {
        throw new Error(
          'matrixHandleRegistry table not found. Please run the Matrix handle registry migration first.',
        );
      }

      console.log(
        '✅ Matrix handle registry found - safe to proceed with cleanup',
      );
    }

    // Check if users table exists in this schema
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = '${schema}' 
        AND table_name = 'users'
      );
    `);

    if (!tableExists[0].exists) {
      console.log(`⏭️ No users table in ${schema} - skipping cleanup`);
      return;
    }

    // Count existing Matrix users before cleanup
    const existingCount = await queryRunner.query(`
      SELECT COUNT(*) as count 
      FROM "${schema}".users 
      WHERE "matrixUserId" IS NOT NULL
    `);
    console.log(`📊 Found ${existingCount[0].count} Matrix users in ${schema}`);

    // Check if matrixUserId column exists before trying to drop it
    const matrixUserIdExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = '${schema}' 
        AND table_name = 'users' 
        AND column_name = 'matrixUserId'
      );
    `);

    // Check if matrixAccessToken column exists before trying to drop it
    const matrixAccessTokenExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = '${schema}' 
        AND table_name = 'users' 
        AND column_name = 'matrixAccessToken'
      );
    `);

    // Drop matrixUserId column if it exists
    if (matrixUserIdExists[0].exists) {
      await queryRunner.query(`
        ALTER TABLE "${schema}".users 
        DROP COLUMN "matrixUserId"
      `);
      console.log(`✅ Removed matrixUserId from ${schema}.users`);
    } else {
      console.log(`⏭️ matrixUserId already removed from ${schema}.users`);
    }

    // Drop matrixAccessToken column if it exists
    if (matrixAccessTokenExists[0].exists) {
      await queryRunner.query(`
        ALTER TABLE "${schema}".users 
        DROP COLUMN "matrixAccessToken"
      `);
      console.log(`✅ Removed matrixAccessToken from ${schema}.users`);
    } else {
      console.log(`⏭️ matrixAccessToken already removed from ${schema}.users`);
    }

    // Final status for this schema
    if (schema === 'public') {
      const registryCount = await queryRunner.query(
        'SELECT COUNT(*) as count FROM "matrixHandleRegistry"',
      );
      console.log('🎉 Legacy Matrix field cleanup complete!');
      console.log(
        `📊 Matrix handle registry contains: ${registryCount[0].count} total entries`,
      );
      console.log(
        '✅ Matrix user data is now managed exclusively through matrixHandleRegistry',
      );
    } else {
      console.log(`✅ Legacy Matrix fields cleaned up from ${schema}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    console.log(`🔄 Rolling back Matrix field cleanup for ${schema}...`);
    console.log('⚠️ This will re-add the columns but data will be lost!');

    // Check if users table exists
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = '${schema}' 
        AND table_name = 'users'
      );
    `);

    if (!tableExists[0].exists) {
      console.log(`⏭️ No users table in ${schema} - nothing to restore`);
      return;
    }

    // Re-add matrixUserId column
    await queryRunner.query(`
      ALTER TABLE "${schema}".users 
      ADD COLUMN IF NOT EXISTS "matrixUserId" character varying
    `);

    // Re-add matrixAccessToken column
    await queryRunner.query(`
      ALTER TABLE "${schema}".users 
      ADD COLUMN IF NOT EXISTS "matrixAccessToken" character varying
    `);

    console.log(`✅ Restored Matrix columns to ${schema}.users`);
    console.log(
      '⚠️ Columns restored but data is empty - manual repopulation required',
    );
  }
}

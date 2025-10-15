import { MigrationInterface, QueryRunner } from 'typeorm';

export class MergeDuplicateShadowAccounts1760531990000
  implements MigrationInterface
{
  name = 'MergeDuplicateShadowAccounts1760531990000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    const tenantId =
      schema === 'public' ? 'public' : schema.replace('tenant_', '');

    console.log(
      `🔍 Looking for duplicate shadow/real user accounts in ${schema}...`,
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

    // Find all duplicate pairs: real user + shadow user with same DID and provider
    // IMPORTANT: Only process accounts that are NOT already soft-deleted
    const duplicatePairs = await queryRunner.query(`
      SELECT
        real.id as real_user_id,
        real."socialId" as did,
        real.provider,
        real."firstName" as real_name,
        shadow.id as shadow_user_id,
        shadow."firstName" as shadow_name,
        (SELECT COUNT(*) FROM "${schema}".events WHERE "userId" = shadow.id) as shadow_event_count,
        (SELECT COUNT(*) FROM "${schema}".events WHERE "userId" = real.id) as real_event_count
      FROM "${schema}".users real
      JOIN "${schema}".users shadow ON
        real."socialId" = shadow."socialId"
        AND real.provider = shadow.provider
        AND real.id != shadow.id
      WHERE
        real."isShadowAccount" = false
        AND shadow."isShadowAccount" = true
        AND real.provider = 'bluesky'
        AND real."deletedAt" IS NULL
        AND shadow."deletedAt" IS NULL
      ORDER BY real.id
    `);

    if (duplicatePairs.length === 0) {
      console.log(
        `  ✅ No duplicate shadow/real user pairs found in ${schema}`,
      );
      return;
    }

    console.log(
      `  📊 Found ${duplicatePairs.length} duplicate pairs to merge in ${schema}`,
    );

    let successCount = 0;
    let errorCount = 0;

    // Merge each duplicate pair
    for (const pair of duplicatePairs) {
      try {
        console.log(
          `  🔄 Merging shadow user ${pair.shadow_user_id} (${pair.shadow_name}, ${pair.shadow_event_count} events) → real user ${pair.real_user_id} (${pair.real_name}, ${pair.real_event_count} events)`,
        );

        // Start a savepoint for this merge operation
        await queryRunner.query('SAVEPOINT merge_shadow_account');

        try {
          // 1. Transfer event ownership from shadow to real user
          const eventsUpdated = await queryRunner.query(
            `
            UPDATE "${schema}".events
            SET "userId" = $1
            WHERE "userId" = $2
            RETURNING id
            `,
            [pair.real_user_id, pair.shadow_user_id],
          );

          // 2. First, delete any attendee records for the shadow user where the real user already has a record
          await queryRunner.query(
            `
            DELETE FROM "${schema}"."eventAttendees"
            WHERE "userId" = $1
            AND "eventId" IN (
              SELECT "eventId"
              FROM "${schema}"."eventAttendees"
              WHERE "userId" = $2
            )
            `,
            [pair.shadow_user_id, pair.real_user_id],
          );

          // 3. Transfer remaining event attendee records from shadow to real user
          const attendeesUpdated = await queryRunner.query(
            `
            UPDATE "${schema}"."eventAttendees"
            SET "userId" = $1
            WHERE "userId" = $2
            RETURNING id
            `,
            [pair.real_user_id, pair.shadow_user_id],
          );

          // 4. First, delete any group memberships for the shadow user where the real user is already a member
          await queryRunner.query(
            `
            DELETE FROM "${schema}"."groupMembers"
            WHERE "userId" = $1
            AND "groupId" IN (
              SELECT "groupId"
              FROM "${schema}"."groupMembers"
              WHERE "userId" = $2
            )
            `,
            [pair.shadow_user_id, pair.real_user_id],
          );

          // 5. Transfer remaining group memberships from shadow to real user
          await queryRunner.query(
            `
            UPDATE "${schema}"."groupMembers"
            SET "userId" = $1
            WHERE "userId" = $2
            `,
            [pair.real_user_id, pair.shadow_user_id],
          );

          // 6. Transfer any other user relations if needed
          // Add more transfers here if you have other tables referencing users

          // 7. Soft delete the shadow user
          await queryRunner.query(
            `
            UPDATE "${schema}".users
            SET "deletedAt" = NOW()
            WHERE id = $1
            `,
            [pair.shadow_user_id],
          );

          // Release the savepoint if successful
          await queryRunner.query('RELEASE SAVEPOINT merge_shadow_account');

          successCount++;
          console.log(
            `    ✅ Merged successfully: ${eventsUpdated.length} events, ${attendeesUpdated.length} attendee records transferred`,
          );
        } catch (error) {
          // Rollback this specific merge if it fails
          await queryRunner.query('ROLLBACK TO SAVEPOINT merge_shadow_account');
          throw error;
        }
      } catch (error) {
        errorCount++;
        console.error(
          `    ❌ Failed to merge shadow user ${pair.shadow_user_id} → real user ${pair.real_user_id}: ${error.message}`,
        );
        // Continue with next pair even if this one fails
        continue;
      }
    }

    console.log('');
    console.log('🎉 Shadow account merge complete!');
    console.log(`  ✅ Successfully merged: ${successCount} pairs`);
    if (errorCount > 0) {
      console.log(`  ❌ Failed to merge: ${errorCount} pairs`);
    }
    console.log(`  📊 Tenant: ${tenantId}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    console.log(
      `⚠️ WARNING: This migration cannot be safely rolled back automatically.`,
    );
    console.log(
      `   The merged data would need to be manually restored from backups.`,
    );
    console.log(`   Schema: ${schema}`);

    // We don't automatically restore deleted shadow accounts as this could cause data inconsistencies
    // Manual restoration from backups would be needed if rollback is required
    return Promise.resolve();
  }
}

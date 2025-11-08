import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillActivityFeedMetadataHandles1762347422000
  implements MigrationInterface
{
  name = 'BackfillActivityFeedMetadataHandles1762347422000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    console.log(
      `🔍 Backfilling activity feed metadata with resolved handles in ${schema}...`,
    );

    /**
     * MIGRATION DESIGN: Uses transaction for atomic update
     *
     * This migration wraps the UPDATE in a transaction because:
     * - ✅ Single bulk UPDATE operation (not iterative)
     * - ✅ Copies data from users table (no external APIs)
     * - ✅ Idempotent: Only updates entries with DIDs in actorName
     * - ✅ Atomic: All-or-nothing prevents partial updates
     *
     * Unlike the user handle migration, this doesn't depend on external
     * services, so transaction safety is appropriate.
     */

    // Start transaction for atomic operation
    await queryRunner.startTransaction();

    try {
      // First, check if we have any activity feed entries with DIDs in actorName
      const affectedActivities = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM "${schema}"."activityFeed" af
      INNER JOIN "${schema}".users u ON af."actorId" = u.id
      WHERE u.provider = 'bluesky'
        AND u."isShadowAccount" = true
        AND af.metadata->>'actorName' LIKE 'did:%'
        AND u."deletedAt" IS NULL
    `);

      const count = parseInt(affectedActivities[0]?.count || '0', 10);

      if (count === 0) {
        console.log(
          `  ✅ No activity feed entries with DIDs in actorName found in ${schema}`,
        );
        await queryRunner.commitTransaction();
        return;
      }

      console.log(
        `  📊 Found ${count} activity feed entries to backfill in ${schema}`,
      );

      // Update activity feed metadata with resolved handles from users table
      // This uses jsonb_set to update just the actorName field in metadata
      const result = await queryRunner.query(`
      UPDATE "${schema}"."activityFeed" af
      SET metadata = jsonb_set(
        metadata,
        '{actorName}',
        to_jsonb(u."firstName")
      )
      FROM "${schema}".users u
      WHERE af."actorId" = u.id
        AND u.provider = 'bluesky'
        AND u."isShadowAccount" = true
        AND af.metadata->>'actorName' LIKE 'did:%'
        AND u."deletedAt" IS NULL
    `);

      const updatedCount = result[1] || 0;

      console.log('');
      console.log('🎉 Activity feed metadata backfill complete!');
      console.log(
        `  ✅ Successfully updated: ${updatedCount} activity entries`,
      );

      // Verify the update
      const remainingDids = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM "${schema}"."activityFeed" af
      INNER JOIN "${schema}".users u ON af."actorId" = u.id
      WHERE u.provider = 'bluesky'
        AND u."isShadowAccount" = true
        AND af.metadata->>'actorName' LIKE 'did:%'
        AND u."deletedAt" IS NULL
    `);

      const remainingCount = parseInt(remainingDids[0]?.count || '0', 10);

      if (remainingCount > 0) {
        console.log(
          `  ⚠️  Warning: ${remainingCount} activity entries still have DIDs in actorName`,
        );
        console.log(
          `      This may indicate users whose handles were not resolved in Part A migration`,
        );
      } else {
        console.log(`  ✅ Verification: No DIDs remaining in actorName`);
      }

      // Commit transaction
      await queryRunner.commitTransaction();
      console.log(`  ✅ Transaction committed successfully`);
    } catch (error) {
      // Rollback on any error
      await queryRunner.rollbackTransaction();
      console.error(
        `  ❌ Migration failed, transaction rolled back: ${error.message}`,
      );
      throw error;
    }
  }

  public down(_queryRunner: QueryRunner): Promise<void> {
    // We don't want to revert handles back to DIDs in the down migration
    // as the handles are the correct values (DIDs were incorrect)
    // This is a data fix migration, not a schema change
    console.log('⚠️  WARNING: This migration cannot be safely rolled back.');
    console.log(
      '   The resolved handles are the correct values (DIDs were incorrect).',
    );
    console.log(
      '   Activity feed metadata has been updated with current user handles.',
    );
    return Promise.resolve();
  }
}

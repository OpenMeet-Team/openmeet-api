import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillShadowUserHandles1762347421000
  implements MigrationInterface
{
  name = 'BackfillShadowUserHandles1762347421000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    console.log(
      `🔍 Backfilling shadow user handles with DIDs in firstName in ${schema}...`,
    );

    /**
     * MIGRATION DESIGN: No transaction wrapper (intentional)
     *
     * This migration uses a best-effort approach without a transaction:
     * - ✅ Idempotent: Only updates users with DIDs in firstName
     * - ✅ Resilient: Continues if individual users fail
     * - ✅ Safe to re-run: Skips already-migrated users
     * - ✅ Tracks results: Reports success/error/unchanged counts
     *
     * Using a transaction would cause the entire migration to fail if
     * ANY user's handle resolution fails, which is too strict for a
     * backfill operation that depends on external API calls.
     */

    // Find all shadow users with DIDs in firstName
    const shadowUsers = await queryRunner.query(`
      SELECT
        id,
        slug,
        "firstName",
        "socialId"
      FROM "${schema}".users
      WHERE "isShadowAccount" = true
        AND provider = 'bluesky'
        AND "firstName" LIKE 'did:%'
        AND "deletedAt" IS NULL
      ORDER BY id
    `);

    if (shadowUsers.length === 0) {
      console.log(
        `  ✅ No shadow users with DIDs in firstName found in ${schema}`,
      );
      return;
    }

    console.log(
      `  📊 Found ${shadowUsers.length} shadow users to backfill in ${schema}`,
    );

    // Import @atproto/identity for DID resolution (use require for TypeScript compatibility)
    let IdResolver;
    let getHandle;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const identity = require('@atproto/identity');
      IdResolver = identity.IdResolver;
      getHandle = identity.getHandle;
    } catch (error) {
      console.error(
        `  ❌ Failed to import @atproto/identity: ${error.message}`,
      );
      console.log(
        `  ⚠️  Migration cannot proceed without @atproto/identity package`,
      );
      console.log(`  💡 Install with: npm install @atproto/identity`);
      return;
    }

    // Create identity resolver
    const idResolver = new IdResolver();

    let successCount = 0;
    let errorCount = 0;
    let unchangedCount = 0;

    // Backfill each shadow user
    for (const user of shadowUsers) {
      try {
        console.log(
          `  🔄 Resolving handle for user ${user.id} (DID: ${user.socialId})...`,
        );

        // Resolve DID → handle using @atproto/identity
        let handle: string;
        try {
          const didDoc = await idResolver.did.resolveNoCheck(user.socialId);
          handle = getHandle(didDoc);
        } catch {
          console.log(
            `    ⚠️  Failed to resolve handle for user ${user.id}, keeping DID as firstName`,
          );
          unchangedCount++;
          continue;
        }

        if (!handle || handle === user.socialId) {
          // Resolution failed or returned DID
          console.log(
            `    ⚠️  Failed to resolve handle for user ${user.id}, keeping DID as firstName`,
          );
          unchangedCount++;
          continue;
        }

        // Update firstName with resolved handle
        await queryRunner.query(
          `
          UPDATE "${schema}".users
          SET "firstName" = $1
          WHERE id = $2
          `,
          [handle, user.id],
        );

        successCount++;
        console.log(
          `    ✅ Updated user ${user.id}: ${user.socialId} → ${handle}`,
        );
      } catch (error) {
        errorCount++;
        console.error(
          `    ❌ Failed to update user ${user.id}: ${error.message}`,
        );
        // Continue with next user even if this one fails
        continue;
      }
    }

    console.log('');
    console.log('🎉 Shadow user handle backfill complete!');
    console.log(`  ✅ Successfully updated: ${successCount} users`);
    console.log(`  ⚠️  Unchanged (resolution failed): ${unchangedCount} users`);
    if (errorCount > 0) {
      console.log(`  ❌ Failed to update: ${errorCount} users`);
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
    return Promise.resolve();
  }
}

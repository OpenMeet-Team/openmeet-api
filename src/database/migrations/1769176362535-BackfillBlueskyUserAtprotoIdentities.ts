import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to backfill existing Bluesky users into the userAtprotoIdentities table.
 *
 * This migration finds all users who:
 * - Have provider = 'bluesky'
 * - Have a socialId that contains their DID
 * - Do NOT already have a record in userAtprotoIdentities
 *
 * For each user, it creates a non-custodial AT Protocol identity record
 * with isCustodial = false and pdsCredentials = null.
 *
 * The PDS URL is resolved by calling the AT Protocol identity resolution.
 * If resolution fails, we fall back to 'https://bsky.social' as most users are on bsky.social.
 */
export class BackfillBlueskyUserAtprotoIdentities1769176362535
  implements MigrationInterface
{
  name = 'BackfillBlueskyUserAtprotoIdentities1769176362535';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    console.log(
      `\n🔍 Backfilling Bluesky users to userAtprotoIdentities in ${schema}...`,
    );

    /**
     * MIGRATION DESIGN: No transaction wrapper (intentional)
     *
     * This migration uses a best-effort approach without a transaction:
     * - Idempotent: Only creates records for users without existing identity
     * - Resilient: Continues if individual users fail
     * - Safe to re-run: Skips already-migrated users
     * - Tracks results: Reports success/error/skipped counts
     *
     * Using a transaction would cause the entire migration to fail if
     * ANY user's PDS resolution fails, which is too strict for a
     * backfill operation that depends on external API calls.
     */

    // Find all Bluesky users who don't have an identity record yet
    const blueskyUsers = await queryRunner.query(`
      SELECT
        u.id,
        u.ulid,
        u."socialId" as did,
        u.preferences->'bluesky'->>'handle' as handle
      FROM "${schema}".users u
      LEFT JOIN "${schema}"."userAtprotoIdentities" uai ON uai."userUlid" = u.ulid
      WHERE u.provider = 'bluesky'
        AND u."socialId" IS NOT NULL
        AND u."socialId" LIKE 'did:%'
        AND u."deletedAt" IS NULL
        AND uai.id IS NULL
      ORDER BY u.id
    `);

    if (blueskyUsers.length === 0) {
      console.log(
        `  ✅ No Bluesky users without identity records found in ${schema}`,
      );
      return;
    }

    console.log(
      `  📊 Found ${blueskyUsers.length} Bluesky users to backfill in ${schema}`,
    );

    // Import @atproto/identity for DID resolution
    let IdResolver: any;
    let getPds: any;
    let getHandle: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const identity = require('@atproto/identity');
      IdResolver = identity.IdResolver;
      getPds = identity.getPds;
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
    let fallbackCount = 0;

    // Backfill each Bluesky user
    for (const user of blueskyUsers) {
      try {
        console.log(`  🔄 Processing user ${user.id} (DID: ${user.did})...`);

        // Resolve DID document to get PDS URL and handle
        let pdsUrl = 'https://bsky.social'; // Default fallback
        let handle = user.handle;
        let usedFallback = false;

        try {
          const didDoc = await idResolver.did.resolveNoCheck(user.did);
          if (didDoc) {
            const resolvedPds = getPds(didDoc);
            if (resolvedPds) {
              pdsUrl = resolvedPds;
            } else {
              usedFallback = true;
            }

            // Get handle from DID document if not in preferences
            if (!handle) {
              handle = getHandle(didDoc);
            }
          } else {
            usedFallback = true;
          }
        } catch (resolveError) {
          console.log(
            `    ⚠️  Failed to resolve DID ${user.did}, using fallback PDS: ${resolveError.message}`,
          );
          usedFallback = true;
        }

        // Create the identity record
        await queryRunner.query(
          `
          INSERT INTO "${schema}"."userAtprotoIdentities"
            ("userUlid", "did", "handle", "pdsUrl", "pdsCredentials", "isCustodial", "createdAt", "updatedAt")
          VALUES
            ($1, $2, $3, $4, NULL, false, NOW(), NOW())
          ON CONFLICT ("userUlid") DO NOTHING
          `,
          [user.ulid, user.did, handle || null, pdsUrl],
        );

        if (usedFallback) {
          fallbackCount++;
          console.log(
            `    ✅ Created identity for user ${user.id} (used fallback PDS)`,
          );
        } else {
          successCount++;
          console.log(
            `    ✅ Created identity for user ${user.id} (PDS: ${pdsUrl})`,
          );
        }
      } catch (error) {
        errorCount++;
        console.error(
          `    ❌ Failed to create identity for user ${user.id}: ${error.message}`,
        );
        // Continue with next user even if this one fails
        continue;
      }
    }

    console.log('');
    console.log('🎉 Bluesky user identity backfill complete!');
    console.log(`  ✅ Successfully created: ${successCount} identities`);
    console.log(`  ⚠️  Created with fallback PDS: ${fallbackCount} identities`);
    if (errorCount > 0) {
      console.log(`  ❌ Failed to create: ${errorCount} identities`);
    }
  }

  public down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    console.log(
      `\n⚠️  Rolling back Bluesky user identity backfill in ${schema}...`,
    );

    // Remove identity records for non-custodial Bluesky users
    // Only delete records where isCustodial = false (backfilled records)
    // Custodial records are created separately and should not be affected
    return queryRunner
      .query(
        `
      DELETE FROM "${schema}"."userAtprotoIdentities"
      WHERE "isCustodial" = false
        AND "pdsCredentials" IS NULL
    `,
      )
      .then((result) => {
        console.log(
          `  ✅ Removed ${result?.rowCount || 0} non-custodial identity records`,
        );
      });
  }
}

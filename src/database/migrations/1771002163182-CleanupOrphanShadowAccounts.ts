import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to clean up orphan shadow accounts whose DID matches a real user
 * in the userAtprotoIdentities table.
 *
 * Background: findOrCreateShadowAccount() only checked users.socialId for DID
 * matching. Users who authenticated via AT Protocol OAuth have their DID in
 * userAtprotoIdentities, not users.socialId. This caused the firehose ingestion
 * to create orphan shadow accounts for every event/RSVP from those users.
 *
 * This migration:
 * 1. Transfers event ownership from orphan shadows → real users
 * 2. Transfers attendee records (skipping conflicts)
 * 3. Deletes the orphan shadow accounts
 *
 * Safe to re-run: idempotent, no-op if no orphans remain.
 */
export class CleanupOrphanShadowAccounts1771002163182
  implements MigrationInterface
{
  name = 'CleanupOrphanShadowAccounts1771002163182';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    console.log(`\n🔍 Cleaning up orphan shadow accounts in ${schema}...`);

    // Find all orphan shadow accounts: shadow users whose socialId (DID)
    // matches a real user's DID in userAtprotoIdentities
    const orphans = await queryRunner.query(`
      SELECT
        u.id as shadow_id,
        u."firstName" as shadow_name,
        u."socialId" as did,
        real_u.id as real_user_id,
        real_u.email as real_user_email
      FROM "${schema}".users u
      JOIN "${schema}"."userAtprotoIdentities" uai ON u."socialId" = uai.did
      JOIN "${schema}".users real_u ON uai."userUlid" = real_u.ulid
      WHERE u."isShadowAccount" = true
        AND u."deletedAt" IS NULL
      ORDER BY u.id
    `);

    if (orphans.length === 0) {
      console.log(`  ✅ No orphan shadow accounts found in ${schema}`);
      return;
    }

    console.log(
      `  📊 Found ${orphans.length} orphan shadow accounts in ${schema}`,
    );

    let eventsTransferred = 0;
    let attendeesTransferred = 0;
    let attendeesSkipped = 0;
    let shadowsDeleted = 0;
    let errorCount = 0;

    for (const orphan of orphans) {
      try {
        // Transfer events from shadow → real user
        const eventResult = await queryRunner.query(
          `
          UPDATE "${schema}".events
          SET "userId" = $1
          WHERE "userId" = $2
          `,
          [orphan.real_user_id, orphan.shadow_id],
        );
        const eventsCount = eventResult?.[1] || 0;
        eventsTransferred += eventsCount;

        // Transfer attendee records, skipping conflicts where the real user
        // is already an attendee on the same event
        const attendeeResult = await queryRunner.query(
          `
          UPDATE "${schema}"."eventAttendees" ea
          SET "userId" = $1
          WHERE ea."userId" = $2
            AND NOT EXISTS (
              SELECT 1 FROM "${schema}"."eventAttendees" existing
              WHERE existing."eventId" = ea."eventId"
                AND existing."userId" = $1
            )
          `,
          [orphan.real_user_id, orphan.shadow_id],
        );
        const attendeesCount = attendeeResult?.[1] || 0;
        attendeesTransferred += attendeesCount;

        // Delete remaining conflicting attendee records (real user already attending)
        const conflictResult = await queryRunner.query(
          `
          DELETE FROM "${schema}"."eventAttendees"
          WHERE "userId" = $1
          `,
          [orphan.shadow_id],
        );
        const conflictsCount = conflictResult?.[1] || 0;
        attendeesSkipped += conflictsCount;

        // Delete the orphan shadow account
        await queryRunner.query(
          `
          DELETE FROM "${schema}".users
          WHERE id = $1 AND "isShadowAccount" = true
          `,
          [orphan.shadow_id],
        );
        shadowsDeleted++;

        if (eventsCount > 0 || attendeesCount > 0) {
          console.log(
            `  ✅ Shadow ${orphan.shadow_id} (${orphan.shadow_name}) → user ${orphan.real_user_id} (${orphan.real_user_email || 'no email'}): ${eventsCount} events, ${attendeesCount} attendees transferred${conflictsCount > 0 ? `, ${conflictsCount} conflicts removed` : ''}`,
          );
        }
      } catch (error) {
        errorCount++;
        console.error(
          `  ❌ Failed to clean up shadow ${orphan.shadow_id}: ${error.message}`,
        );
        continue;
      }
    }

    console.log('');
    console.log('🎉 Orphan shadow account cleanup complete!');
    console.log(`  ✅ Shadows deleted: ${shadowsDeleted}`);
    console.log(`  📦 Events transferred: ${eventsTransferred}`);
    console.log(`  👥 Attendees transferred: ${attendeesTransferred}`);
    if (attendeesSkipped > 0) {
      console.log(`  ⚠️  Conflicting attendees removed: ${attendeesSkipped}`);
    }
    if (errorCount > 0) {
      console.log(`  ❌ Errors: ${errorCount}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async down(): Promise<void> {
    // This migration is not reversible — we can't recreate shadow accounts
    // with their original data after deletion. The forward fix is correct:
    // events and attendees should belong to the real user, not the shadow.
    console.log(
      '⚠️  CleanupOrphanShadowAccounts is not reversible. Shadow accounts cannot be recreated.',
    );
  }
}

import { AppDataSource } from './data-source';
import { fetchTenants } from '../utils/tenant-config';
import { ulid } from 'ulid';

/**
 * Backfill activity feeds from historical data
 *
 * This script creates activity feed entries for:
 * - Groups that were created
 * - Members who joined groups
 * - Events that were created
 * - RSVPs that were added
 * - Group/Event updates
 *
 * Run with: npm run backfill:activity-feeds
 */

interface BackfillStats {
  groupsCreated: number;
  membersJoined: number;
  eventsCreated: number;
  rsvpsAdded: number;
  groupUpdates: number;
  eventUpdates: number;
  errors: number;
}

async function backfillActivityFeedsForTenant(tenantId: string) {
  const dataSource = AppDataSource(tenantId);
  const schemaName = tenantId ? `tenant_${tenantId}` : 'public';
  const stats: BackfillStats = {
    groupsCreated: 0,
    membersJoined: 0,
    eventsCreated: 0,
    rsvpsAdded: 0,
    groupUpdates: 0,
    eventUpdates: 0,
    errors: 0,
  };

  try {
    await dataSource.initialize();
    const queryRunner = dataSource.createQueryRunner();

    try {
      await queryRunner.query(`SET search_path TO "${schemaName}"`);

      console.log(
        `\n=== Backfilling activity feeds for tenant: ${tenantId} ===\n`,
      );

      // 1. Backfill group creations
      console.log('1. Backfilling group creations...');
      const groups = await queryRunner.query(`
        SELECT
          g.id,
          g.slug,
          g.name,
          g.visibility,
          g."createdAt",
          u.id as "userId",
          u.slug as "userSlug",
          u."firstName",
          u."lastName"
        FROM "groups" g
        LEFT JOIN "users" u ON g."createdById" = u.id
        ORDER BY g."createdAt" ASC
      `);

      for (const group of groups) {
        try {
          const visibility = mapVisibility(group.visibility);
          const actorName =
            `${group.firstName || ''} ${group.lastName || ''}`.trim() ||
            'Unknown';

          // Create group-scoped activity
          await queryRunner.query(
            `
            INSERT INTO "activityFeed" (
              "ulid",
              "activityType",
              "feedScope",
              "groupId",
              "actorId",
              "actorIds",
              "visibility",
              "metadata",
              "aggregationStrategy",
              "aggregatedCount",
              "createdAt",
              "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT DO NOTHING
          `,
            [
              ulid(),
              'group.created',
              'group',
              group.id,
              group.userId,
              [group.userId],
              visibility,
              JSON.stringify({
                groupSlug: group.slug,
                groupName: group.name,
                actorSlug: group.userSlug,
                actorName,
              }),
              'none',
              1,
              group.createdAt,
              group.createdAt,
            ],
          );

          // Create sitewide activity
          if (group.visibility?.toLowerCase() === 'public') {
            // Public groups: show full details
            await queryRunner.query(
              `
              INSERT INTO "activityFeed" (
                "ulid",
                "activityType",
                "feedScope",
                "groupId",
                "actorId",
                "actorIds",
                "visibility",
                "metadata",
                "aggregationStrategy",
                "aggregatedCount",
                "createdAt",
                "updatedAt"
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
              ON CONFLICT DO NOTHING
            `,
              [
                ulid(),
                'group.created',
                'sitewide',
                group.id,
                group.userId,
                [group.userId],
                'public',
                JSON.stringify({
                  groupSlug: group.slug,
                  groupName: group.name,
                  actorSlug: group.userSlug,
                  actorName,
                }),
                'none',
                1,
                group.createdAt,
                group.createdAt,
              ],
            );
          } else {
            // Non-public groups: anonymized activity
            await queryRunner.query(
              `
              INSERT INTO "activityFeed" (
                "ulid",
                "activityType",
                "feedScope",
                "visibility",
                "metadata",
                "aggregationStrategy",
                "aggregatedCount",
                "createdAt",
                "updatedAt"
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT DO NOTHING
            `,
              [
                ulid(),
                'group.activity',
                'sitewide',
                'public',
                JSON.stringify({
                  activityCount: 1,
                  activityDescription: 'A new group was created',
                }),
                'time_window',
                1,
                group.createdAt,
                group.createdAt,
              ],
            );
          }

          stats.groupsCreated++;
        } catch (error) {
          console.error(
            `Error creating activity for group ${group.id}:`,
            error,
          );
          stats.errors++;
        }
      }
      console.log(
        `   ✓ Created ${stats.groupsCreated} group creation activities`,
      );

      // 2. Backfill member joins (with aggregation)
      console.log('2. Backfilling member joins...');
      const members = await queryRunner.query(`
        SELECT
          gm.id,
          gm."groupId",
          gm."userId",
          gm."createdAt",
          g.slug as "groupSlug",
          g.name as "groupName",
          g.visibility as "groupVisibility",
          u.slug as "userSlug",
          u."firstName",
          u."lastName"
        FROM "groupMembers" gm
        JOIN "groups" g ON gm."groupId" = g.id
        LEFT JOIN "users" u ON gm."userId" = u.id
        ORDER BY gm."groupId", gm."createdAt" ASC
      `);

      // Group members by groupId and time windows (1 hour)
      const membersByGroupAndWindow = new Map<string, typeof members>();

      for (const member of members) {
        const joinTime = new Date(member.createdAt);
        const windowStart = new Date(joinTime);
        windowStart.setMinutes(0, 0, 0); // Round down to the hour

        const key = `${member.groupId}-${windowStart.toISOString()}`;

        if (!membersByGroupAndWindow.has(key)) {
          membersByGroupAndWindow.set(key, []);
        }
        membersByGroupAndWindow.get(key)!.push(member);
      }

      // Create aggregated activities
      for (const [_key, groupMembers] of membersByGroupAndWindow.entries()) {
        try {
          const firstMember = groupMembers[0];
          const visibility = mapVisibility(firstMember.groupVisibility);
          const actorIds = groupMembers.map((m) => m.userId).filter(Boolean);
          const actorNames = groupMembers.map(
            (m) =>
              `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Unknown',
          );

          const aggregationKey = `member.joined:group:${firstMember.groupId}:${new Date(firstMember.createdAt).toISOString().slice(0, 13)}`;

          await queryRunner.query(
            `
            INSERT INTO "activityFeed" (
              "ulid",
              "activityType",
              "feedScope",
              "groupId",
              "actorId",
              "actorIds",
              "visibility",
              "metadata",
              "aggregationStrategy",
              "aggregationKey",
              "aggregatedCount",
              "createdAt",
              "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT DO NOTHING
          `,
            [
              ulid(),
              'member.joined',
              'group',
              firstMember.groupId,
              firstMember.userId,
              actorIds,
              visibility,
              JSON.stringify({
                groupSlug: firstMember.groupSlug,
                groupName: firstMember.groupName,
                actorSlug: firstMember.userSlug,
                actorName: actorNames[0],
                actorNames: actorNames.slice(0, 10), // Limit to first 10
              }),
              'time_window',
              aggregationKey,
              groupMembers.length,
              firstMember.createdAt,
              groupMembers[groupMembers.length - 1].createdAt, // Last member's join time
            ],
          );

          stats.membersJoined += groupMembers.length;
        } catch (error) {
          console.error(`Error creating activity for member joins:`, error);
          stats.errors++;
        }
      }
      console.log(
        `   ✓ Created ${membersByGroupAndWindow.size} aggregated member join activities (${stats.membersJoined} members)`,
      );

      // 3. Backfill event creations
      console.log('3. Backfilling event creations...');
      const events = await queryRunner.query(`
        SELECT
          e.id,
          e.slug,
          e.name,
          e.visibility,
          e."createdAt",
          e."groupId",
          e."userId",
          g.slug as "groupSlug",
          g.name as "groupName",
          g.visibility as "groupVisibility",
          u.slug as "userSlug",
          u."firstName",
          u."lastName"
        FROM "events" e
        LEFT JOIN "groups" g ON e."groupId" = g.id
        LEFT JOIN "users" u ON e."userId" = u.id
        ORDER BY e."createdAt" ASC
      `);

      for (const event of events) {
        try {
          const visibility = mapVisibility(event.visibility);
          const actorName =
            `${event.firstName || ''} ${event.lastName || ''}`.trim() ||
            'Unknown';
          const feedScope = event.groupId ? 'group' : 'event';

          // Create group/event-scoped activity
          await queryRunner.query(
            `
            INSERT INTO "activityFeed" (
              "ulid",
              "activityType",
              "feedScope",
              "groupId",
              "eventId",
              "actorId",
              "actorIds",
              "visibility",
              "metadata",
              "aggregationStrategy",
              "aggregatedCount",
              "createdAt",
              "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT DO NOTHING
          `,
            [
              ulid(),
              'event.created',
              feedScope,
              event.groupId,
              event.id,
              event.userId,
              [event.userId],
              visibility,
              JSON.stringify({
                eventSlug: event.slug,
                eventName: event.name,
                groupSlug: event.groupSlug,
                groupName: event.groupName,
                actorSlug: event.userSlug,
                actorName,
              }),
              'none',
              1,
              event.createdAt,
              event.createdAt,
            ],
          );

          // Create sitewide activity
          if (event.visibility?.toLowerCase() === 'public') {
            // Check if we should show full details (standalone event or public group)
            const shouldShowFullDetails =
              !event.groupId ||
              event.groupVisibility?.toLowerCase() === 'public';

            if (shouldShowFullDetails) {
              // Public event (standalone or in public group): show full details
              await queryRunner.query(
                `
                INSERT INTO "activityFeed" (
                  "ulid",
                  "activityType",
                  "feedScope",
                  "groupId",
                  "eventId",
                  "actorId",
                  "actorIds",
                  "visibility",
                  "metadata",
                  "aggregationStrategy",
                  "aggregatedCount",
                  "createdAt",
                  "updatedAt"
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT DO NOTHING
              `,
                [
                  ulid(),
                  'event.created',
                  'sitewide',
                  event.groupId,
                  event.id,
                  event.userId,
                  [event.userId],
                  'public',
                  JSON.stringify({
                    eventSlug: event.slug,
                    eventName: event.name,
                    groupSlug: event.groupSlug,
                    groupName: event.groupName,
                    actorSlug: event.userSlug,
                    actorName,
                  }),
                  'none',
                  1,
                  event.createdAt,
                  event.createdAt,
                ],
              );
            } else {
              // Public event in non-public group: anonymized
              await queryRunner.query(
                `
                INSERT INTO "activityFeed" (
                  "ulid",
                  "activityType",
                  "feedScope",
                  "visibility",
                  "metadata",
                  "aggregationStrategy",
                  "aggregatedCount",
                  "createdAt",
                  "updatedAt"
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT DO NOTHING
              `,
                [
                  ulid(),
                  'group.activity',
                  'sitewide',
                  'public',
                  JSON.stringify({
                    activityCount: 1,
                    activityDescription: 'A new event was created',
                  }),
                  'time_window',
                  1,
                  event.createdAt,
                  event.createdAt,
                ],
              );
            }
          } else {
            // Non-public event: anonymized activity
            await queryRunner.query(
              `
              INSERT INTO "activityFeed" (
                "ulid",
                "activityType",
                "feedScope",
                "visibility",
                "metadata",
                "aggregationStrategy",
                "aggregatedCount",
                "createdAt",
                "updatedAt"
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT DO NOTHING
            `,
              [
                ulid(),
                'group.activity',
                'sitewide',
                'public',
                JSON.stringify({
                  activityCount: 1,
                  activityDescription: 'A new event was created',
                }),
                'time_window',
                1,
                event.createdAt,
                event.createdAt,
              ],
            );
          }

          stats.eventsCreated++;
        } catch (error) {
          console.error(
            `Error creating activity for event ${event.id}:`,
            error,
          );
          stats.errors++;
        }
      }
      console.log(
        `   ✓ Created ${stats.eventsCreated} event creation activities`,
      );

      // 4. Backfill RSVPs (with aggregation)
      console.log('4. Backfilling event RSVPs...');
      const rsvps = await queryRunner.query(`
        SELECT
          ea.id,
          ea."eventId",
          ea."userId",
          ea.status,
          ea."createdAt",
          e.slug as "eventSlug",
          e.name as "eventName",
          e."groupId",
          g.slug as "groupSlug",
          g.name as "groupName",
          u.slug as "userSlug",
          u."firstName",
          u."lastName"
        FROM "eventAttendees" ea
        JOIN "events" e ON ea."eventId" = e.id
        LEFT JOIN "groups" g ON e."groupId" = g.id
        LEFT JOIN "users" u ON ea."userId" = u.id
        WHERE ea.status IN ('confirmed', 'attended')
          AND e."groupId" IS NOT NULL
        ORDER BY ea."eventId", ea."createdAt" ASC
      `);

      // Group RSVPs by eventId and 30-minute windows
      const rsvpsByEventAndWindow = new Map<string, typeof rsvps>();

      for (const rsvp of rsvps) {
        const rsvpTime = new Date(rsvp.createdAt);
        const windowStart = new Date(rsvpTime);
        windowStart.setMinutes(
          Math.floor(windowStart.getMinutes() / 30) * 30,
          0,
          0,
        );

        const key = `${rsvp.eventId}-${windowStart.toISOString()}`;

        if (!rsvpsByEventAndWindow.has(key)) {
          rsvpsByEventAndWindow.set(key, []);
        }
        rsvpsByEventAndWindow.get(key)!.push(rsvp);
      }

      // Create aggregated RSVP activities
      for (const [_key, eventRsvps] of rsvpsByEventAndWindow.entries()) {
        try {
          const firstRsvp = eventRsvps[0];
          const actorIds = eventRsvps.map((r) => r.userId).filter(Boolean);
          const actorNames = eventRsvps.map(
            (r) =>
              `${r.firstName || ''} ${r.lastName || ''}`.trim() || 'Unknown',
          );

          const aggregationKey = `event.rsvp:group:${firstRsvp.groupId}:event:${firstRsvp.eventId}:${new Date(firstRsvp.createdAt).toISOString().slice(0, 16)}`;

          await queryRunner.query(
            `
            INSERT INTO "activityFeed" (
              "ulid",
              "activityType",
              "feedScope",
              "groupId",
              "eventId",
              "actorId",
              "actorIds",
              "visibility",
              "metadata",
              "aggregationStrategy",
              "aggregationKey",
              "aggregatedCount",
              "createdAt",
              "updatedAt"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT DO NOTHING
          `,
            [
              ulid(),
              'event.rsvp',
              'group',
              firstRsvp.groupId,
              firstRsvp.eventId,
              firstRsvp.userId,
              actorIds,
              'public', // RSVPs visibility based on event
              JSON.stringify({
                eventSlug: firstRsvp.eventSlug,
                eventName: firstRsvp.eventName,
                groupSlug: firstRsvp.groupSlug,
                groupName: firstRsvp.groupName,
                actorSlug: firstRsvp.userSlug,
                actorName: actorNames[0],
                actorNames: actorNames.slice(0, 10),
              }),
              'time_window',
              aggregationKey,
              eventRsvps.length,
              firstRsvp.createdAt,
              eventRsvps[eventRsvps.length - 1].createdAt,
            ],
          );

          stats.rsvpsAdded += eventRsvps.length;
        } catch (error) {
          console.error(`Error creating activity for RSVPs:`, error);
          stats.errors++;
        }
      }
      console.log(
        `   ✓ Created ${rsvpsByEventAndWindow.size} aggregated RSVP activities (${stats.rsvpsAdded} RSVPs)`,
      );

      await queryRunner.query(`SET search_path TO public`);

      console.log(`\n=== Summary for tenant ${tenantId} ===`);
      console.log(`Groups created: ${stats.groupsCreated}`);
      console.log(`Members joined: ${stats.membersJoined}`);
      console.log(`Events created: ${stats.eventsCreated}`);
      console.log(`RSVPs added: ${stats.rsvpsAdded}`);
      console.log(`Errors: ${stats.errors}`);
      console.log(
        `Total activities created: ${stats.groupsCreated + membersByGroupAndWindow.size + stats.eventsCreated + rsvpsByEventAndWindow.size}\n`,
      );
    } finally {
      await queryRunner.release();
    }

    await dataSource.destroy();
    return stats;
  } catch (error) {
    console.error(
      `Error backfilling activity feeds for tenant ${tenantId}:`,
      error,
    );
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    throw error;
  }
}

function mapVisibility(visibility: string): string {
  const map: Record<string, string> = {
    Public: 'public',
    public: 'public',
    Authenticated: 'authenticated',
    authenticated: 'authenticated',
    Private: 'members_only',
    private: 'members_only',
  };
  return map[visibility] || 'public';
}

async function backfillAllTenants() {
  const tenants = fetchTenants();
  console.log(
    `\n🚀 Starting activity feed backfill for ${tenants.length} tenant(s)\n`,
  );

  const allStats: BackfillStats = {
    groupsCreated: 0,
    membersJoined: 0,
    eventsCreated: 0,
    rsvpsAdded: 0,
    groupUpdates: 0,
    eventUpdates: 0,
    errors: 0,
  };

  for (const tenant of tenants) {
    try {
      const stats = await backfillActivityFeedsForTenant(tenant.id);

      allStats.groupsCreated += stats.groupsCreated;
      allStats.membersJoined += stats.membersJoined;
      allStats.eventsCreated += stats.eventsCreated;
      allStats.rsvpsAdded += stats.rsvpsAdded;
      allStats.groupUpdates += stats.groupUpdates;
      allStats.eventUpdates += stats.eventUpdates;
      allStats.errors += stats.errors;
    } catch (error) {
      console.error(`Failed to backfill tenant ${tenant.id}:`, error);
      allStats.errors++;
    }
  }

  console.log(`\n🎉 === Final Summary ===`);
  console.log(`Total groups created: ${allStats.groupsCreated}`);
  console.log(`Total members joined: ${allStats.membersJoined}`);
  console.log(`Total events created: ${allStats.eventsCreated}`);
  console.log(`Total RSVPs added: ${allStats.rsvpsAdded}`);
  console.log(`Total errors: ${allStats.errors}\n`);
}

// Run the backfill
backfillAllTenants()
  .then(() => {
    console.log('✅ Backfill complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  });

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to support hard deletion of users.
 *
 * Changes:
 * - events.userId: Make nullable and add ON DELETE SET NULL
 * - eventSeries.userId: Make nullable and change from CASCADE to SET NULL
 * - groups.createdById: Add ON DELETE SET NULL (handled via service logic for ownership transfer)
 * - groupMembers.userId: Add ON DELETE CASCADE
 * - groupUserPermissions.userId: Add ON DELETE CASCADE
 * - userPermissions.userId: Add ON DELETE CASCADE
 *
 * Note: sessions.userId already has CASCADE, eventAttendees.userId already has CASCADE,
 * userInterests.usersId already has CASCADE, activityFeed.actorId already has SET NULL.
 */
export class UserHardDeleteSupport1768507797000 implements MigrationInterface {
  name = 'UserHardDeleteSupport1768507797000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // 1. Make events.userId nullable and add ON DELETE SET NULL
    // First drop existing constraint
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events"
      DROP CONSTRAINT IF EXISTS "FK_${schema}_events_userId"
    `);

    // Make column nullable
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events"
      ALTER COLUMN "userId" DROP NOT NULL
    `);

    // Add new constraint with SET NULL
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events"
      ADD CONSTRAINT "FK_${schema}_events_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE SET NULL
    `);

    // 2. Make eventSeries.userId nullable and change from CASCADE to SET NULL
    await queryRunner.query(`
      ALTER TABLE "${schema}"."eventSeries"
      DROP CONSTRAINT IF EXISTS "FK_eventSeries_user"
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."eventSeries"
      ALTER COLUMN "userId" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."eventSeries"
      ADD CONSTRAINT "FK_eventSeries_user"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE SET NULL
    `);

    // 3. Update groups.createdById to have ON DELETE SET NULL
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groups"
      DROP CONSTRAINT IF EXISTS "FK_${schema}_groups_createdById"
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."groups"
      ALTER COLUMN "createdById" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."groups"
      ADD CONSTRAINT "FK_${schema}_groups_createdById"
      FOREIGN KEY ("createdById") REFERENCES "${schema}"."users"("id") ON DELETE SET NULL
    `);

    // 4. Update groupMembers.userId to have ON DELETE CASCADE
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupMembers"
      DROP CONSTRAINT IF EXISTS "FK_${schema}_groupMembers_userId"
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupMembers"
      ADD CONSTRAINT "FK_${schema}_groupMembers_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE
    `);

    // 5. Update groupUserPermissions.userId to have ON DELETE CASCADE
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupUserPermissions"
      DROP CONSTRAINT IF EXISTS "FK_${schema}_groupUserPermissions_userId"
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupUserPermissions"
      ADD CONSTRAINT "FK_${schema}_groupUserPermissions_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE
    `);

    // 6. Update userPermissions.userId to have ON DELETE CASCADE
    await queryRunner.query(`
      ALTER TABLE "${schema}"."userPermissions"
      DROP CONSTRAINT IF EXISTS "FK_${schema}_userPermissions_userId"
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."userPermissions"
      ADD CONSTRAINT "FK_${schema}_userPermissions_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Reverse all changes

    // 1. Restore events.userId constraint (remove SET NULL)
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events"
      DROP CONSTRAINT IF EXISTS "FK_${schema}_events_userId"
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."events"
      ADD CONSTRAINT "FK_${schema}_events_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")
    `);

    // Note: We don't make column NOT NULL again since there may be NULL values now

    // 2. Restore eventSeries.userId constraint (back to CASCADE)
    await queryRunner.query(`
      ALTER TABLE "${schema}"."eventSeries"
      DROP CONSTRAINT IF EXISTS "FK_eventSeries_user"
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."eventSeries"
      ADD CONSTRAINT "FK_eventSeries_user"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE
    `);

    // 3. Restore groups.createdById constraint (remove SET NULL)
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groups"
      DROP CONSTRAINT IF EXISTS "FK_${schema}_groups_createdById"
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."groups"
      ADD CONSTRAINT "FK_${schema}_groups_createdById"
      FOREIGN KEY ("createdById") REFERENCES "${schema}"."users"("id")
    `);

    // 4. Restore groupMembers.userId constraint (remove CASCADE)
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupMembers"
      DROP CONSTRAINT IF EXISTS "FK_${schema}_groupMembers_userId"
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupMembers"
      ADD CONSTRAINT "FK_${schema}_groupMembers_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")
    `);

    // 5. Restore groupUserPermissions.userId constraint (remove CASCADE)
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupUserPermissions"
      DROP CONSTRAINT IF EXISTS "FK_${schema}_groupUserPermissions_userId"
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupUserPermissions"
      ADD CONSTRAINT "FK_${schema}_groupUserPermissions_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")
    `);

    // 6. Restore userPermissions.userId constraint (remove CASCADE)
    await queryRunner.query(`
      ALTER TABLE "${schema}"."userPermissions"
      DROP CONSTRAINT IF EXISTS "FK_${schema}_userPermissions_userId"
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."userPermissions"
      ADD CONSTRAINT "FK_${schema}_userPermissions_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")
    `);
  }
}

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

  /**
   * Find the actual FK constraint name by querying information_schema.
   * Returns null if no constraint exists.
   */
  private async findForeignKeyName(
    queryRunner: QueryRunner,
    schema: string,
    tableName: string,
    columnName: string,
  ): Promise<string | null> {
    const result = await queryRunner.query(
      `
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
        AND kcu.column_name = $3
      LIMIT 1
      `,
      [schema, tableName, columnName],
    );
    return result.length > 0 ? result[0].constraint_name : null;
  }

  /**
   * Drop a FK constraint if it exists, using the actual name from the database.
   */
  private async dropForeignKeyIfExists(
    queryRunner: QueryRunner,
    schema: string,
    tableName: string,
    columnName: string,
  ): Promise<void> {
    const constraintName = await this.findForeignKeyName(
      queryRunner,
      schema,
      tableName,
      columnName,
    );
    if (constraintName) {
      await queryRunner.query(`
        ALTER TABLE "${schema}"."${tableName}"
        DROP CONSTRAINT "${constraintName}"
      `);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // 1. Make events.userId nullable and add ON DELETE SET NULL
    await this.dropForeignKeyIfExists(queryRunner, schema, 'events', 'userId');

    await queryRunner.query(`
      ALTER TABLE "${schema}"."events"
      ALTER COLUMN "userId" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."events"
      ADD CONSTRAINT "FK_${schema}_events_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE SET NULL
    `);

    // 2. Make eventSeries.userId nullable and change from CASCADE to SET NULL
    await this.dropForeignKeyIfExists(
      queryRunner,
      schema,
      'eventSeries',
      'userId',
    );

    await queryRunner.query(`
      ALTER TABLE "${schema}"."eventSeries"
      ALTER COLUMN "userId" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "${schema}"."eventSeries"
      ADD CONSTRAINT "FK_${schema}_eventSeries_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE SET NULL
    `);

    // 3. Update groups.createdById to have ON DELETE SET NULL
    await this.dropForeignKeyIfExists(
      queryRunner,
      schema,
      'groups',
      'createdById',
    );

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
    await this.dropForeignKeyIfExists(
      queryRunner,
      schema,
      'groupMembers',
      'userId',
    );

    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupMembers"
      ADD CONSTRAINT "FK_${schema}_groupMembers_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE
    `);

    // 5. Update groupUserPermissions.userId to have ON DELETE CASCADE
    await this.dropForeignKeyIfExists(
      queryRunner,
      schema,
      'groupUserPermissions',
      'userId',
    );

    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupUserPermissions"
      ADD CONSTRAINT "FK_${schema}_groupUserPermissions_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE
    `);

    // 6. Update userPermissions.userId to have ON DELETE CASCADE
    await this.dropForeignKeyIfExists(
      queryRunner,
      schema,
      'userPermissions',
      'userId',
    );

    await queryRunner.query(`
      ALTER TABLE "${schema}"."userPermissions"
      ADD CONSTRAINT "FK_${schema}_userPermissions_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Reverse all changes - drop the constraints we created and restore defaults

    // 1. Restore events.userId constraint (remove SET NULL)
    await this.dropForeignKeyIfExists(queryRunner, schema, 'events', 'userId');

    await queryRunner.query(`
      ALTER TABLE "${schema}"."events"
      ADD CONSTRAINT "FK_${schema}_events_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")
    `);

    // Note: We don't make column NOT NULL again since there may be NULL values now

    // 2. Restore eventSeries.userId constraint (back to CASCADE)
    await this.dropForeignKeyIfExists(
      queryRunner,
      schema,
      'eventSeries',
      'userId',
    );

    await queryRunner.query(`
      ALTER TABLE "${schema}"."eventSeries"
      ADD CONSTRAINT "FK_${schema}_eventSeries_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE
    `);

    // 3. Restore groups.createdById constraint (remove SET NULL)
    await this.dropForeignKeyIfExists(
      queryRunner,
      schema,
      'groups',
      'createdById',
    );

    await queryRunner.query(`
      ALTER TABLE "${schema}"."groups"
      ADD CONSTRAINT "FK_${schema}_groups_createdById"
      FOREIGN KEY ("createdById") REFERENCES "${schema}"."users"("id")
    `);

    // 4. Restore groupMembers.userId constraint (remove CASCADE)
    await this.dropForeignKeyIfExists(
      queryRunner,
      schema,
      'groupMembers',
      'userId',
    );

    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupMembers"
      ADD CONSTRAINT "FK_${schema}_groupMembers_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")
    `);

    // 5. Restore groupUserPermissions.userId constraint (remove CASCADE)
    await this.dropForeignKeyIfExists(
      queryRunner,
      schema,
      'groupUserPermissions',
      'userId',
    );

    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupUserPermissions"
      ADD CONSTRAINT "FK_${schema}_groupUserPermissions_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")
    `);

    // 6. Restore userPermissions.userId constraint (remove CASCADE)
    await this.dropForeignKeyIfExists(
      queryRunner,
      schema,
      'userPermissions',
      'userId',
    );

    await queryRunner.query(`
      ALTER TABLE "${schema}"."userPermissions"
      ADD CONSTRAINT "FK_${schema}_userPermissions_userId"
      FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")
    `);
  }
}

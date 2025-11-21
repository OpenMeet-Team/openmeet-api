import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnlistedVisibilityEnum1763659345000
  implements MigrationInterface
{
  name = 'AddUnlistedVisibilityEnum1763659345000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    console.log(
      `Renaming 'authenticated' to 'unlisted' visibility in ${schema}...`,
    );

    // Step 1: Check if 'unlisted' already exists in enums
    console.log(`  Step 1: Checking enum values...`);
    const eventsEnumCheck = await queryRunner.query(
      `
      SELECT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = $1
        AND t.typname = 'events_visibility_enum'
        AND e.enumlabel = 'unlisted'
      ) as exists
    `,
      [schema],
    );

    const groupsEnumCheck = await queryRunner.query(
      `
      SELECT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = $1
        AND t.typname = 'groups_visibility_enum'
        AND e.enumlabel = 'unlisted'
      ) as exists
    `,
      [schema],
    );

    const eventsNeedsAdd = !eventsEnumCheck[0].exists;
    const groupsNeedsAdd = !groupsEnumCheck[0].exists;

    // Step 2: Add 'unlisted' to enums if needed
    if (eventsNeedsAdd || groupsNeedsAdd) {
      console.log(`  Step 2: Adding 'unlisted' to enum types...`);

      if (eventsNeedsAdd) {
        await queryRunner.query(
          `ALTER TYPE "${schema}"."events_visibility_enum" ADD VALUE 'unlisted'`,
        );
        console.log(
          `    ✓ Added 'unlisted' to ${schema}.events_visibility_enum`,
        );
      }

      if (groupsNeedsAdd) {
        await queryRunner.query(
          `ALTER TYPE "${schema}"."groups_visibility_enum" ADD VALUE 'unlisted'`,
        );
        console.log(
          `    ✓ Added 'unlisted' to ${schema}.groups_visibility_enum`,
        );
      }

      // IMPORTANT: Commit this transaction and start a new one
      // This is required because PostgreSQL doesn't allow using a newly added enum value
      // in the same transaction where it was added
      console.log(`  Step 3: Committing enum changes...`);
      await queryRunner.commitTransaction();
      await queryRunner.startTransaction();
      console.log(`    ✓ Started new transaction for data migration`);
    } else {
      console.log(`  Step 2: Enum values already exist, skipping...`);
    }

    // Step 4: Check how many records need migration
    console.log(`  Step 4: Checking records to migrate...`);
    const eventsCount = await queryRunner.query(
      `SELECT COUNT(*) as count FROM "${schema}"."events" WHERE visibility = 'authenticated'`,
    );
    const groupsCount = await queryRunner.query(
      `SELECT COUNT(*) as count FROM "${schema}"."groups" WHERE visibility = 'authenticated'`,
    );

    console.log(
      `    Found ${eventsCount[0].count} events with 'authenticated'`,
    );
    console.log(
      `    Found ${groupsCount[0].count} groups with 'authenticated'`,
    );

    // Step 5: Migrate data
    if (
      parseInt(eventsCount[0].count) > 0 ||
      parseInt(groupsCount[0].count) > 0
    ) {
      console.log(`  Step 5: Migrating data...`);

      await queryRunner.query(
        `UPDATE "${schema}"."events" SET visibility = 'unlisted' WHERE visibility = 'authenticated'`,
      );
      console.log(`    ✓ Updated events table`);

      await queryRunner.query(
        `UPDATE "${schema}"."groups" SET visibility = 'unlisted' WHERE visibility = 'authenticated'`,
      );
      console.log(`    ✓ Updated groups table`);
    } else {
      console.log(`  Step 5: No data to migrate`);
    }

    // Step 6: Fix NULL visibility values
    console.log(`  Step 6: Fixing NULL visibility values...`);
    const nullEventsCount = await queryRunner.query(
      `SELECT COUNT(*) as count FROM "${schema}"."events" WHERE visibility IS NULL`,
    );

    if (parseInt(nullEventsCount[0].count) > 0) {
      console.log(
        `    Found ${nullEventsCount[0].count} events with NULL visibility`,
      );
      await queryRunner.query(
        `UPDATE "${schema}"."events" SET visibility = 'public' WHERE visibility IS NULL`,
      );
      console.log(`    ✓ Fixed NULL visibility in events`);
    } else {
      console.log(`    ⊘ No NULL visibility values found`);
    }

    console.log(
      `✅ Successfully migrated 'authenticated' → 'unlisted' in ${schema}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    console.log(
      `Rolling back: Migrating 'unlisted' → 'authenticated' in ${schema}...`,
    );

    // Roll back the data migration
    await queryRunner.query(
      `UPDATE "${schema}"."events" SET visibility = 'authenticated' WHERE visibility = 'unlisted'`,
    );
    console.log(`  ✓ Rolled back events table`);

    await queryRunner.query(
      `UPDATE "${schema}"."groups" SET visibility = 'authenticated' WHERE visibility = 'unlisted'`,
    );
    console.log(`  ✓ Rolled back groups table`);

    console.log(`✅ Successfully rolled back data in ${schema}`);
    console.log(
      `   Note: 'unlisted' enum value will remain (PostgreSQL doesn't support removing enum values).`,
    );
  }
}

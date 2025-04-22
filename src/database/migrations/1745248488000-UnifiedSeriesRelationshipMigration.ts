import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';

export class UnifiedSeriesRelationshipMigration1745248488000
  implements MigrationInterface
{
  name = 'UnifiedSeriesRelationshipMigration1745248488000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    console.log('Running UnifiedSeriesRelationshipMigration...');

    // Step 1: Add foreign key constraint if it doesn't exist already
    const checkConstraintSql = `
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE constraint_name = 'FK_events_series_slug' 
      AND table_schema = '${schema}';
    `;

    const existingConstraint = await queryRunner.query(checkConstraintSql);

    if (existingConstraint && existingConstraint.length > 0) {
      console.log(
        'Foreign key constraint FK_events_series_slug already exists, skipping creation',
      );
    } else {
      console.log('Creating foreign key constraint FK_events_series_slug');

      try {
        // Add the constraint
        await queryRunner.createForeignKey(
          `${schema}.events`,
          new TableForeignKey({
            name: 'FK_events_series_slug',
            columnNames: ['seriesSlug'],
            referencedTableName: `${schema}.eventSeries`,
            referencedColumnNames: ['slug'],
            onDelete: 'SET NULL',
          }),
        );

        console.log('Successfully created FK_events_series_slug constraint');
      } catch (error) {
        console.warn(
          'Error creating FK_events_series_slug constraint:',
          error.message,
        );

        // Alternative method to create the constraint if the first method fails
        try {
          await queryRunner.query(`
            ALTER TABLE "${schema}"."events"
            ADD CONSTRAINT "FK_events_series_slug"
            FOREIGN KEY ("seriesSlug")
            REFERENCES "${schema}"."eventSeries"("slug")
            ON DELETE SET NULL;
          `);

          console.log(
            'Successfully created FK_events_series_slug constraint (alternative method)',
          );
        } catch (altError) {
          console.warn(
            'Error creating FK_events_series_slug constraint (alternative method):',
            altError.message,
          );
        }
      }
    }

    // Step 2: Fix any orphaned seriesSlug references (that point to non-existent series)
    const orphanedCountResult = await queryRunner.query(`
      SELECT COUNT(*) as orphaned_count
      FROM "${schema}"."events" e
      LEFT JOIN "${schema}"."eventSeries" es ON e."seriesSlug" = es.slug
      WHERE e."seriesSlug" IS NOT NULL AND es.slug IS NULL;
    `);

    const orphanedCount = parseInt(orphanedCountResult[0].orphaned_count, 10);
    console.log(
      `Found ${orphanedCount} events with orphaned seriesSlug references`,
    );

    if (orphanedCount > 0) {
      // Fix orphaned references by setting seriesSlug to NULL
      await queryRunner.query(`
        UPDATE "${schema}"."events" e
        SET "seriesSlug" = NULL
        WHERE e."seriesSlug" IS NOT NULL 
        AND NOT EXISTS (
          SELECT 1 FROM "${schema}"."eventSeries" es 
          WHERE e."seriesSlug" = es.slug
        );
      `);

      console.log(`Fixed ${orphanedCount} orphaned seriesSlug references`);
    }

    console.log('UnifiedSeriesRelationshipMigration completed successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    console.log('Rolling back UnifiedSeriesRelationshipMigration...');

    // Remove the foreign key constraint if it exists
    try {
      await queryRunner.query(`
        ALTER TABLE "${schema}"."events" 
        DROP CONSTRAINT IF EXISTS "FK_events_series_slug";
      `);
      console.log('Dropped FK_events_series_slug constraint');
    } catch (error) {
      console.warn(
        'Error dropping FK_events_series_slug constraint:',
        error.message,
      );
    }

    console.log(
      'UnifiedSeriesRelationshipMigration rollback completed successfully',
    );
  }
}

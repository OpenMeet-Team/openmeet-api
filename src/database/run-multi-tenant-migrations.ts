import { AppDataSource } from './data-source';
import { QueryRunner } from 'typeorm';
import { fetchTenants } from '../utils/tenant-config';

async function runMigrationsForAllTenants() {
  const tenants = fetchTenants();
  console.log('Starting migrations for all tenants:', tenants.length);

  // First do a dry run to check if migrations would succeed
  try {
    console.log('Starting dry run of migrations...');
    for (const tenant of tenants) {
      console.log(`Dry run for tenant ${tenant.id}`);
      const dataSource = AppDataSource(tenant.id);
      try {
        await dataSource.initialize();
        const pendingMigrations = await dataSource.showMigrations();
        if (pendingMigrations) {
          console.log(
            `Tenant ${tenant.id} has pending migrations that would run`,
          );
        }
        await dataSource.destroy();
      } catch (error) {
        console.error(`Dry run failed for tenant ${tenant.id}:`, error);
        throw new Error(
          `Dry run failed for tenant ${tenant.id}. Aborting all migrations.`,
        );
      }
    }
    console.log('Dry run successful. Proceeding with actual migrations...');

    // Keep track of migrated tenants for potential rollback
    const migratedTenants: string[] = [];

    // Actual migration run
    for (const tenant of tenants) {
      console.log(`Starting migration for tenant ${tenant.id}`);
      const dataSource = AppDataSource(tenant.id);
      const schemaName = tenant.id ? `tenant_${tenant.id}` : 'public';

      try {
        await dataSource.initialize();
        console.log(`Initialized connection for ${schemaName}`);

        const queryRunner: QueryRunner = dataSource.createQueryRunner();
        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
        console.log(`Created schema ${schemaName}`);

        await queryRunner.query(`SET search_path TO "${schemaName}"`);
        console.log(`Starting migrations for ${schemaName}`);
        await dataSource.runMigrations();
        migratedTenants.push(tenant.id);
        console.log(`Migrations successfully applied to schema: ${schemaName}`);

        await queryRunner.query(`SET search_path TO public`);
        await queryRunner.release();
        await dataSource.destroy();
      } catch (error) {
        console.error(`Error with tenant ${tenant.id}:`, error);

        // Attempt to rollback all previously successful migrations
        console.log(
          'Rolling back migrations for previously migrated tenants...',
        );
        for (const migratedTenantId of migratedTenants) {
          try {
            const rollbackDataSource = AppDataSource(migratedTenantId);
            await rollbackDataSource.initialize();
            await rollbackDataSource.undoLastMigration();
            await rollbackDataSource.destroy();
            console.log(`Rolled back migration for tenant ${migratedTenantId}`);
          } catch (rollbackError) {
            console.error(
              `Failed to rollback tenant ${migratedTenantId}:`,
              rollbackError,
            );
          }
        }

        if (dataSource.isInitialized) {
          await dataSource.destroy();
        }
        throw new Error(
          'Migration failed. All successful migrations have been rolled back.',
        );
      }
    }
    console.log('All tenant migrations complete successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

runMigrationsForAllTenants().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

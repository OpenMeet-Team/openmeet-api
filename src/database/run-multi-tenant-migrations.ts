import { AppDataSource } from './data-source'; // adjust the path to your AppDataSource
import { QueryRunner } from 'typeorm';
import { fetchTenants } from '../utils/tenant-config';

async function runMigrationsForAllTenants() {
  const tenants = fetchTenants();
  for (const tenant of tenants) {
    const dataSource = AppDataSource(tenant.id);
    // If tenantId is not provided, we are running migrations for the public schema
    // This means '' must be a tenant id
    console.log('Running migrations for tenant', tenant.id);
    const schemaName = tenant.id ? `tenant_${tenant.id}` : 'public';
    console.log('Schema name', schemaName);
    try {
      await dataSource.initialize();

      console.log(`Applying migrations to schema: ${schemaName}`);
      if (schemaName) {
        await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      }
      // Create a query runner to execute SQL commands
      const queryRunner: QueryRunner = dataSource.createQueryRunner();
      // Set the search path to the tenant's schema
      await queryRunner.query(`SET search_path TO "${schemaName}"`);
      // Run migrations for the current schema
      await dataSource.runMigrations();
      console.log(`Migrations successfully applied to schema: ${schemaName}`);
      // Optionally reset search_path
      await queryRunner.query(`SET search_path TO public`);
    } catch (error) {
      console.error(`Error running migrations for tenant: ${tenant.id}`, error);
    } finally {
      await dataSource.destroy();
    }
  }
}

runMigrationsForAllTenants()
  .then(() => {
    console.log('All tenant migrations complete.');
  })
  .catch((error) => {
    console.error('Error running migrations for tenants:', error);
  });

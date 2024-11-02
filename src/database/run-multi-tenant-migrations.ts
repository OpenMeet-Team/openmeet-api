import { AppDataSource } from './data-source'; // adjust the path to your AppDataSource
import { QueryRunner } from 'typeorm';

interface Tenant {
  id: string;
  name: string;
}

async function runMigrationsForAllTenants() {
  const tenants = ['', '1'];
  for (const tenantId of tenants) {
    const dataSource = AppDataSource(tenantId);
    const schemaName = tenantId ? `tenant_${tenantId}` : 'public';
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
      console.error(`Error running migrations for tenant: ${tenantId}`, error);
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

export function fetchTenants(): Tenant[] {
  const tenantsJson = process.env.TENANTS;
  if (!tenantsJson) {
    throw new Error('TENANTS environment variable is not set');
  }

  try {
    const tenants = JSON.parse(tenantsJson);

    if (!Array.isArray(tenants)) {
      throw new Error('TENANTS must be a JSON array');
    }

    // Validate tenant structure
    tenants.forEach((tenant, index) => {
      if (!tenant.id || !tenant.name) {
        throw new Error(
          `Invalid tenant at index ${index}: missing required fields`,
        );
      }
    });

    return tenants;
  } catch (error) {
    throw new Error(
      `Failed to process TENANTS configuration: ${error.message}`,
    );
  }
}

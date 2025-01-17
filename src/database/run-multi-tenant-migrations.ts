import { AppDataSource } from './data-source';
import { QueryRunner } from 'typeorm';
import { fetchTenants } from '../utils/tenant-config';
import { DataSource } from 'typeorm';

async function runMigrationsForAllTenants() {
  const tenants = fetchTenants();
  console.log('Starting migrations for all tenants:', tenants.length);

  try {
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
        console.log(`Migrations successfully applied to schema: ${schemaName}`);
        
        await queryRunner.query(`SET search_path TO public`);
        console.log(`Reset search path for ${schemaName}`);
        
        await queryRunner.release();
        console.log(`Released query runner for ${schemaName}`);
        
        await dataSource.destroy();
        console.log(`Destroyed connection for ${schemaName}`);
        
      } catch (error) {
        console.error(`Error with tenant ${tenant.id}:`, error);
        if (dataSource.isInitialized) {
          await dataSource.destroy();
          console.log(`Destroyed connection after error for ${schemaName}`);
        }
      }
    }
    console.log('All tenant migrations complete.');
    console.log('Active handles:', (process as any)._getActiveHandles().length);
    console.log('Active requests:', (process as any)._getActiveRequests().length);
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

runMigrationsForAllTenants().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

import { AppDataSource } from './data-source';
import { QueryRunner } from 'typeorm';
import { fetchTenants } from '../utils/tenant-config';
import * as path from 'path';
import * as fs from 'fs';

async function revertLastMigrationForTenant(tenantId: string) {
  if (tenantId === undefined) {
    console.error('Error: Tenant ID is required');
    console.log(
      'Usage: npm run migration:revert:tenant -- --tenant=<tenantId>',
    );
    process.exit(1);
  }

  // Verify tenant exists
  const tenants = fetchTenants();
  const tenant = tenants.find((t) => t.id === tenantId);

  if (!tenant) {
    console.error(`Error: Tenant ${tenantId} not found`);
    process.exit(1);
  }

  console.log(`Starting reversion check for tenant: ${tenantId}`);
  const dataSource = AppDataSource(tenantId);
  const schemaName = tenantId ? `tenant_${tenantId}` : 'public';

  try {
    await dataSource.initialize();

    // Check if there are migrations to revert
    const migrations = await dataSource.query(
      'SELECT * FROM migrations ORDER BY "timestamp" DESC LIMIT 1',
    );

    if (!migrations || migrations.length === 0) {
      console.log(`Tenant ${tenantId} has no migrations to revert`);
      await dataSource.destroy();
      process.exit(0);
    }

    const lastMigration = migrations[0];
    console.log(`Found migration that can be reverted: ${lastMigration.name}`);

    // Check if migration file exists
    const migrationsDir = path.join(
      process.cwd(),
      'src',
      'database',
      'migrations',
    );
    const migrationFiles = fs.readdirSync(migrationsDir);

    // Extract timestamp and name from the database migration name
    // From: CreateExternalEventSources1738693920643
    // To: 1738693920643-CreateExternalEventSources.ts
    const matches = lastMigration.name.match(/(.+?)(\d+)$/);
    if (!matches) {
      console.error(
        `Error: Unable to parse migration name format: ${lastMigration.name}`,
      );
      await dataSource.destroy();
      process.exit(1);
    }

    const [, name, timestamp] = matches;
    const expectedFileName = `${timestamp}-${name}.ts`;
    const migrationFile = migrationFiles.find(
      (file) => file === expectedFileName,
    );

    if (!migrationFile) {
      console.error(
        `Error: Migration file ${expectedFileName} not found in ${migrationsDir}`,
      );
      console.error('Available migrations:', migrationFiles);
      console.error('\nPossible solutions:');
      console.error('1. Make sure you are on the correct git branch');
      console.error(
        '2. Check if the migration file exists in src/database/migrations',
      );
      console.error(
        '3. If running from production build, use migration:revert:tenant:prod instead',
      );
      console.error(
        '\nAlternatively, you can manually remove the migration record:',
      );
      console.error(
        `DELETE FROM ${schemaName}.migrations WHERE name = '${lastMigration.name}';`,
      );

      await dataSource.destroy();
      process.exit(1);
    }

    console.log('Proceeding with reversion...');

    const queryRunner: QueryRunner = dataSource.createQueryRunner();
    await queryRunner.query(`SET search_path TO "${schemaName}"`);

    await dataSource.undoLastMigration();
    console.log(`Successfully reverted last migration for tenant ${tenantId}`);

    await queryRunner.query(`SET search_path TO public`);
    await queryRunner.release();
    await dataSource.destroy();

    console.log('Reversion completed successfully');
    process.exit(0);
  } catch (error) {
    console.error(`Error reverting migration for tenant ${tenantId}:`, error);

    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const tenantArg = args.find((arg) => arg.startsWith('--tenant='));
if (tenantArg === undefined) {
  console.error('Error: Tenant flag (--tenant=<tenantId>) is required');
  console.log('Usage: npm run migration:revert:tenant -- --tenant=<tenantId>');
  process.exit(1);
}

// Handle empty string case by checking for --tenant= exactly
const tenantId = tenantArg === '--tenant=' ? '' : tenantArg.split('=')[1];

revertLastMigrationForTenant(tenantId).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

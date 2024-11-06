import { AppDataSource } from './data-source';
import { DataSource } from 'typeorm';

async function deleteAllSchemas() {
  let dataSource: DataSource | null = null;

  try {
    // Initialize connection with public schema
    dataSource = AppDataSource('');
    await dataSource.initialize();
    console.log('Database connection initialized');

    // Get all schemas including system schemas
    const schemas = await dataSource.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name != 'information_schema' 
        AND schema_name != 'pg_catalog'
        AND schema_name != 'pg_toast'
        AND schema_name != 'pg_temp_1'
        AND schema_name != 'pg_toast_temp_1'
    `);

    console.log(
      'Found schemas:',
      schemas.map((s: any) => s.schema_name),
    );

    // Drop each schema
    for (const schema of schemas) {
      const schemaName = schema.schema_name;

      try {
        console.log(`Dropping schema: ${schemaName}`);
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        console.log(`Successfully dropped schema: ${schemaName}`);
      } catch (error) {
        console.error(`Error dropping schema ${schemaName}:`, error);
      }
    }

    // Recreate public schema
    console.log('Recreating public schema...');
    await dataSource.query(`CREATE SCHEMA IF NOT EXISTS public`);

    console.log('All schemas have been deleted successfully');
  } catch (error) {
    console.error('Error during schema deletion:', error);
    throw error;
  } finally {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('Database connection closed');
    }
  }
}

// Execute the script
deleteAllSchemas()
  .then(() => {
    console.log('Schema deletion completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Schema deletion failed:', error);
    process.exit(1);
  });

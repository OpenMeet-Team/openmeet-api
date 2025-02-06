import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalEventFields1738871900000 implements MigrationInterface {
  name = 'AddExternalEventFields1738871900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Create the enum type first
    await queryRunner.query(`
      CREATE TYPE "${schema}"."events_externalsource_enum" AS ENUM (
        'bluesky',
        'eventbrite',
        'facebook',
        'luma',
        'meetup',
        'other',
        'web'
      )
    `);

    // Add the new columns
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events" 
      ADD COLUMN "externalSource" "${schema}"."events_externalsource_enum",
      ADD COLUMN "externalData" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Remove the columns
    await queryRunner.query(`
      ALTER TABLE "${schema}"."events" 
      DROP COLUMN "externalData",
      DROP COLUMN "externalSource"
    `);

    // Drop the enum type
    await queryRunner.query(`
      DROP TYPE "${schema}"."events_externalsource_enum"
    `);
  }
} 
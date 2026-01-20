import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to add a UNIQUE constraint to users.ulid.
 *
 * This is required before CreateUserAtprotoIdentities can create a foreign key
 * referencing users.ulid. PostgreSQL requires the referenced column to have
 * a unique constraint for foreign key relationships.
 */
export class AddUniqueConstraintToUsersUlid1768865690000
  implements MigrationInterface
{
  name = 'AddUniqueConstraintToUsersUlid1768865690000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Check if the constraint already exists before adding it
    const constraintExists = await queryRunner.query(`
      SELECT 1 FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.conname = 'UQ_${schema}_users_ulid'
        AND n.nspname = '${schema}'
    `);

    if (constraintExists.length === 0) {
      console.log(`Adding unique constraint to users.ulid in schema ${schema}`);
      await queryRunner.query(`
        ALTER TABLE "${schema}"."users"
        ADD CONSTRAINT "UQ_${schema}_users_ulid" UNIQUE ("ulid")
      `);
    } else {
      console.log(
        `Unique constraint UQ_${schema}_users_ulid already exists, skipping`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Check if the constraint exists before dropping it
    const constraintExists = await queryRunner.query(`
      SELECT 1 FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.conname = 'UQ_${schema}_users_ulid'
        AND n.nspname = '${schema}'
    `);

    if (constraintExists.length > 0) {
      console.log(
        `Dropping unique constraint from users.ulid in schema ${schema}`,
      );
      await queryRunner.query(`
        ALTER TABLE "${schema}"."users"
        DROP CONSTRAINT "UQ_${schema}_users_ulid"
      `);
    } else {
      console.log(
        `Unique constraint UQ_${schema}_users_ulid does not exist, skipping drop`,
      );
    }
  }
}

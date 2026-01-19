import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to create the userAtprotoIdentities table.
 *
 * This table links OpenMeet users to their AT Protocol identities,
 * supporting both custodial (OpenMeet-managed) and non-custodial
 * (user-owned) PDS accounts.
 *
 * Key design decisions:
 * - References users.ulid (not id) for portable user references
 * - Unique constraint on userUlid ensures one AT identity per user
 * - Unique constraint on did ensures DID uniqueness within tenant
 * - JSONB for pdsCredentials allows flexible credential storage
 * - ON DELETE CASCADE removes identity when user is deleted
 */
export class CreateUserAtprotoIdentities1768865691000
  implements MigrationInterface
{
  name = 'CreateUserAtprotoIdentities1768865691000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Create the table
    await queryRunner.query(`
      CREATE TABLE "${schema}"."userAtprotoIdentities" (
        "id" SERIAL PRIMARY KEY,
        "userUlid" CHAR(26) NOT NULL,
        "did" VARCHAR(255) NOT NULL,
        "handle" VARCHAR(255) NULL,
        "pdsUrl" VARCHAR(255) NOT NULL,
        "pdsCredentials" JSONB NULL,
        "isCustodial" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),

        CONSTRAINT "UQ_${schema}_userAtprotoIdentities_userUlid" UNIQUE ("userUlid"),
        CONSTRAINT "UQ_${schema}_userAtprotoIdentities_did" UNIQUE ("did"),
        CONSTRAINT "FK_${schema}_userAtprotoIdentities_userUlid"
          FOREIGN KEY ("userUlid") REFERENCES "${schema}"."users"("ulid") ON DELETE CASCADE
      )
    `);

    // Create index on DID for faster lookups
    await queryRunner.query(`
      CREATE INDEX "IDX_${schema}_userAtprotoIdentities_did"
      ON "${schema}"."userAtprotoIdentities"("did")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop index first
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_userAtprotoIdentities_did"
    `);

    // Drop the table (cascades constraints)
    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."userAtprotoIdentities"
    `);
  }
}

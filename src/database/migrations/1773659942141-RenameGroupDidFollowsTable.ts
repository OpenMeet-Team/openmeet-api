import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameGroupDidFollowsTable1773659942141
  implements MigrationInterface
{
  name = 'RenameGroupDidFollowsTable1773659942141';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop old constraints and index
    await queryRunner.query(`
      ALTER TABLE "${schema}"."group_did_follows"
        DROP CONSTRAINT IF EXISTS "FK_${schema}_group_did_follows_groupId"
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."group_did_follows"
        DROP CONSTRAINT IF EXISTS "FK_${schema}_group_did_follows_createdById"
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."group_did_follows"
        DROP CONSTRAINT IF EXISTS "UQ_${schema}_group_did_follows_group_did"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_group_did_follows_did"
    `);

    // Rename table
    await queryRunner.query(`
      ALTER TABLE "${schema}"."group_did_follows"
        RENAME TO "groupDidFollows"
    `);

    // Rename PK to match convention
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupDidFollows"
        RENAME CONSTRAINT "group_did_follows_pkey" TO "PK_${schema}_groupDidFollows_id"
    `);

    // Re-create constraints and index with corrected names
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupDidFollows"
        ADD CONSTRAINT "UQ_${schema}_groupDidFollows_groupId_did" UNIQUE ("groupId", "did")
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupDidFollows"
        ADD CONSTRAINT "FK_${schema}_groupDidFollows_groupId"
          FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupDidFollows"
        ADD CONSTRAINT "FK_${schema}_groupDidFollows_createdById"
          FOREIGN KEY ("createdById") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_${schema}_groupDidFollows_did"
      ON "${schema}"."groupDidFollows"("did")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop new constraints and index
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupDidFollows"
        DROP CONSTRAINT IF EXISTS "FK_${schema}_groupDidFollows_groupId"
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupDidFollows"
        DROP CONSTRAINT IF EXISTS "FK_${schema}_groupDidFollows_createdById"
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupDidFollows"
        DROP CONSTRAINT IF EXISTS "UQ_${schema}_groupDidFollows_groupId_did"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_groupDidFollows_did"
    `);

    // Rename table back
    await queryRunner.query(`
      ALTER TABLE "${schema}"."groupDidFollows"
        RENAME TO "group_did_follows"
    `);

    // Rename PK back
    await queryRunner.query(`
      ALTER TABLE "${schema}"."group_did_follows"
        RENAME CONSTRAINT "PK_${schema}_groupDidFollows_id" TO "group_did_follows_pkey"
    `);

    // Re-create original constraints and index
    await queryRunner.query(`
      ALTER TABLE "${schema}"."group_did_follows"
        ADD CONSTRAINT "UQ_${schema}_group_did_follows_group_did" UNIQUE ("groupId", "did")
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."group_did_follows"
        ADD CONSTRAINT "FK_${schema}_group_did_follows_groupId"
          FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "${schema}"."group_did_follows"
        ADD CONSTRAINT "FK_${schema}_group_did_follows_createdById"
          FOREIGN KEY ("createdById") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_${schema}_group_did_follows_did"
      ON "${schema}"."group_did_follows"("did")
    `);
  }
}

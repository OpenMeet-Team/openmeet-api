import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGroupDIDFollows1773584380861 implements MigrationInterface {
  name = 'CreateGroupDIDFollows1773584380861';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      CREATE TABLE "${schema}"."group_did_follows" (
        "id" SERIAL PRIMARY KEY,
        "groupId" INTEGER NOT NULL,
        "did" VARCHAR(255) NOT NULL,
        "createdById" INTEGER NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),

        CONSTRAINT "UQ_${schema}_group_did_follows_group_did" UNIQUE ("groupId", "did"),
        CONSTRAINT "FK_${schema}_group_did_follows_groupId"
          FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_${schema}_group_did_follows_createdById"
          FOREIGN KEY ("createdById") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_${schema}_group_did_follows_did"
      ON "${schema}"."group_did_follows"("did")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_group_did_follows_did"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "${schema}"."group_did_follows"
    `);
  }
}

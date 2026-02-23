import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropDuplicateIndexes1771850982597 implements MigrationInterface {
  name = 'DropDuplicateIndexes1771850982597';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop non-unique index on events.slug — redundant with UQ_events_slug UNIQUE constraint
    // The naming convention uses the schema name: IDX_{schema}_events_slug
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_${schema}_events_slug"`,
    );

    // Drop non-unique index on sessions.secureId — redundant with UQ_sessions_secureId UNIQUE constraint
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_sessions_secureId"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Recreate the non-unique indexes if rolling back
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_${schema}_events_slug" ON "${schema}"."events" ("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sessions_secureId" ON "${schema}"."sessions" ("secureId")`,
    );
  }
}

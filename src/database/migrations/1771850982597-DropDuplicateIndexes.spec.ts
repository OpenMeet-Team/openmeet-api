import { DropDuplicateIndexes1771850982597 } from './1771850982597-DropDuplicateIndexes';

describe('DropDuplicateIndexes1771850982597', () => {
  let migration: DropDuplicateIndexes1771850982597;
  let queryRunner: any;

  beforeEach(() => {
    migration = new DropDuplicateIndexes1771850982597();
    queryRunner = {
      connection: {
        options: {
          name: 'test_schema',
        },
      },
      query: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('should have the correct name', () => {
    expect(migration.name).toBe('DropDuplicateIndexes1771850982597');
  });

  describe('up', () => {
    it('should drop the redundant non-unique index on events.slug', async () => {
      await migration.up(queryRunner);

      expect(queryRunner.query).toHaveBeenCalledWith(
        `DROP INDEX IF EXISTS "test_schema"."IDX_test_schema_events_slug"`,
      );
    });

    it('should drop the redundant non-unique index on sessions.secureId', async () => {
      await migration.up(queryRunner);

      expect(queryRunner.query).toHaveBeenCalledWith(
        `DROP INDEX IF EXISTS "test_schema"."IDX_sessions_secureId"`,
      );
    });

    it('should use public schema when connection name is not set', async () => {
      queryRunner.connection.options.name = undefined;

      await migration.up(queryRunner);

      expect(queryRunner.query).toHaveBeenCalledWith(
        `DROP INDEX IF EXISTS "public"."IDX_public_events_slug"`,
      );
      expect(queryRunner.query).toHaveBeenCalledWith(
        `DROP INDEX IF EXISTS "public"."IDX_sessions_secureId"`,
      );
    });

    it('should call query exactly twice', async () => {
      await migration.up(queryRunner);

      expect(queryRunner.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('down', () => {
    it('should recreate the non-unique index on events.slug', async () => {
      await migration.down(queryRunner);

      expect(queryRunner.query).toHaveBeenCalledWith(
        `CREATE INDEX IF NOT EXISTS "IDX_test_schema_events_slug" ON "test_schema"."events" ("slug")`,
      );
    });

    it('should recreate the non-unique index on sessions.secureId', async () => {
      await migration.down(queryRunner);

      expect(queryRunner.query).toHaveBeenCalledWith(
        `CREATE INDEX IF NOT EXISTS "IDX_sessions_secureId" ON "test_schema"."sessions" ("secureId")`,
      );
    });

    it('should use public schema when connection name is not set', async () => {
      queryRunner.connection.options.name = undefined;

      await migration.down(queryRunner);

      expect(queryRunner.query).toHaveBeenCalledWith(
        `CREATE INDEX IF NOT EXISTS "IDX_public_events_slug" ON "public"."events" ("slug")`,
      );
      expect(queryRunner.query).toHaveBeenCalledWith(
        `CREATE INDEX IF NOT EXISTS "IDX_sessions_secureId" ON "public"."sessions" ("secureId")`,
      );
    });

    it('should call query exactly twice', async () => {
      await migration.down(queryRunner);

      expect(queryRunner.query).toHaveBeenCalledTimes(2);
    });
  });
});

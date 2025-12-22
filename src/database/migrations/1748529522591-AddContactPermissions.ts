import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactPermissions1748529522591 implements MigrationInterface {
  name = 'AddContactPermissions1748529522591';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add new enum values to the groupPermissions_name_enum
    await queryRunner.query(`
      ALTER TYPE "${schema}"."groupPermissions_name_enum"
      ADD VALUE IF NOT EXISTS 'CONTACT_MEMBERS'
    `);

    await queryRunner.query(`
      ALTER TYPE "${schema}"."groupPermissions_name_enum"
      ADD VALUE IF NOT EXISTS 'CONTACT_ADMINS'
    `);

    // Commit enum changes so they can be used by subsequent migrations
    // PostgreSQL requires enum values to be committed before use
    await queryRunner.commitTransaction();
    await queryRunner.startTransaction();
  }

  public down(_queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL doesn't support removing enum values directly
    // This would require recreating the enum type and updating all references
    // For now, we'll leave the enum values in place as they don't harm anything
    console.log(
      'Cannot remove enum values from PostgreSQL enum. Values will remain in database.',
    );
    return Promise.resolve();
  }
}

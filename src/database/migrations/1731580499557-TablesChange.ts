import { MigrationInterface, QueryRunner } from 'typeorm';

export class TablesChange1731580499557 implements MigrationInterface {
  name = 'TablesChange1731580499557';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Removing createdAt and updatedAt columns
    await queryRunner.query(
      `ALTER TABLE "${schema}"."permissions" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."permissions" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."roles" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."roles" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."statuses" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."statuses" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventPermissions" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventPermissions" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRoles" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRoles" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupPermissions" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupPermissions" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRoles" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRoles" DROP COLUMN "updatedAt"`,
    );

    // Adding createdAt and updatedAt to eventAttendees
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Adding createdAt and updatedAt columns back
    await queryRunner.query(
      `ALTER TABLE "${schema}"."permissions" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."permissions" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."roles" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."roles" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."statuses" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."statuses" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventPermissions" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventPermissions" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRoles" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRoles" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupPermissions" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupPermissions" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRoles" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRoles" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );

    // Removing createdAt and updatedAt from eventAttendees
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN "updatedAt"`,
    );
  }
}

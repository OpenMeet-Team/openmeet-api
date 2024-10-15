import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterGroupTable1728986196478 implements MigrationInterface {
  name = 'AlterGroupTable1728986196478';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Use schema or default to 'public'

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" DROP COLUMN "approved"`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."groups_visibility_enum" AS ENUM('public', 'authenticated', 'private')`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" ADD "visibility" "${schema}"."groups_visibility_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" ADD "createdById" integer`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."events_visibility_enum" AS ENUM('public', 'authenticated', 'private')`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD "visibility" "${schema}"."events_visibility_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" ADD CONSTRAINT "FK_e0522c4be8bab20520896919da0" FOREIGN KEY ("createdById") REFERENCES "${schema}"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Use schema or default to 'public'

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" DROP CONSTRAINT "FK_e0522c4be8bab20520896919da0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" DROP COLUMN "visibility"`,
    );
    await queryRunner.query(`DROP TYPE "${schema}"."events_visibility_enum"`);
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" DROP COLUMN "createdById"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" DROP COLUMN "visibility"`,
    );
    await queryRunner.query(`DROP TYPE "${schema}"."groups_visibility_enum"`);
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" ADD "approved" boolean NOT NULL DEFAULT false`,
    );
  }
}

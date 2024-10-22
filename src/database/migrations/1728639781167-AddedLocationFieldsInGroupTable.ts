import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddedLocationFieldsInGroupTable1728639781167
  implements MigrationInterface
{
  name = 'AddedLocationFieldsInGroupTable1728639781167';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Default schema

    await queryRunner.query(
      `ALTER TABLE  "${schema}"."groups" ADD "location" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE  "${schema}"."groups" ADD "lat" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE  "${schema}"."groups" ADD "lon" double precision`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Default schema

    await queryRunner.query(
      `ALTER TABLE  "${schema}"."groups" DROP COLUMN "lon"`,
    );
    await queryRunner.query(
      `ALTER TABLE  "${schema}"."groups" DROP COLUMN "lat"`,
    );
    await queryRunner.query(
      `ALTER TABLE  "${schema}"."groups" DROP COLUMN "location"`,
    );
  }
}

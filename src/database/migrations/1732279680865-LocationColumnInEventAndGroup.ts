import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLocationPointToEventAndGroup1732279680865
  implements MigrationInterface
{
  name = 'AddLocationPointToEventAndGroup1732279680865';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    // Adding locationPoint column to "groups"
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" ADD "locationPoint" geography(Point,4326)`,
    );

    // Adding locationPoint column to "events"
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD "locationPoint" geography(Point,4326)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';
    // Removing locationPoint column from "groups"
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" DROP COLUMN "locationPoint"`,
    );

    // Removing locationPoint column from "events"
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" DROP COLUMN "locationPoint"`,
    );
  }
}

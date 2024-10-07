import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventTableGroupIdOptional1728330716348
  implements MigrationInterface
{
  name = 'EventTableGroupIdOptional1728330716348';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Default schema
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" ALTER COLUMN "groupId" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Default schema

    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" ALTER COLUMN "groupId" SET NOT NULL`,
    );
  }
}

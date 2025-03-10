import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMatrixRoomId1741542763000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Add Matrix-specific fields to the Groups entity
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" ADD "matrixRoomId" character varying(255)`,
    );
    
    // Add Matrix-specific fields to the Events entity
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD "matrixRoomId" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Remove Matrix-specific fields from the Groups entity
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" DROP COLUMN "matrixRoomId"`,
    );
    
    // Remove Matrix-specific fields from the Events entity
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" DROP COLUMN "matrixRoomId"`,
    );
  }
}

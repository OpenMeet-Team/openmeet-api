import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveEventImageConstraint1744045818103
  implements MigrationInterface
{
  name = 'RemoveEventImageConstraint1744045818103';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop the unique constraint on events.imageId to allow image sharing across events
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" DROP CONSTRAINT IF EXISTS "UN_${schema}_events_imageId"`,
    );

    // Log for confirmation
    console.log(
      `Removed unique constraint from events.imageId in schema ${schema}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Recreate the constraint if needed to roll back
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD CONSTRAINT "UN_${schema}_events_imageId" UNIQUE ("imageId")`,
    );

    // Log for confirmation
    console.log(
      `Re-added unique constraint to events.imageId in schema ${schema}`,
    );
  }
}

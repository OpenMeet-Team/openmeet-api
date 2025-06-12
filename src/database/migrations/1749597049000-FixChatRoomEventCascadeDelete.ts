import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixChatRoomEventCascadeDelete1749597049000
  implements MigrationInterface
{
  name = 'FixChatRoomEventCascadeDelete1749597049000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop the existing foreign key constraint that doesn't have CASCADE DELETE
    await queryRunner.query(`
      ALTER TABLE "${schema}"."chatRooms" 
      DROP CONSTRAINT IF EXISTS "chatRooms_eventId_fkey"
    `);

    // Add the foreign key constraint with CASCADE DELETE
    await queryRunner.query(`
      ALTER TABLE "${schema}"."chatRooms" 
      ADD CONSTRAINT "chatRooms_eventId_fkey" 
      FOREIGN KEY ("eventId") REFERENCES "${schema}"."events"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop the CASCADE DELETE constraint
    await queryRunner.query(`
      ALTER TABLE "${schema}"."chatRooms" 
      DROP CONSTRAINT IF EXISTS "chatRooms_eventId_fkey"
    `);

    // Restore the original foreign key constraint without CASCADE DELETE
    await queryRunner.query(`
      ALTER TABLE "${schema}"."chatRooms" 
      ADD CONSTRAINT "chatRooms_eventId_fkey" 
      FOREIGN KEY ("eventId") REFERENCES "${schema}"."events"("id")
    `);
  }
}

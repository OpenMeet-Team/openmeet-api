import { MigrationInterface, QueryRunner } from "typeorm";

export class AlterUserCloumn1728039829127 implements MigrationInterface {
    name = 'AlterUserCloumn1728039829127'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const schema = queryRunner.connection.options.name || 'public'; // Default schema is 'public'
        
        // Drop existing constraints
        await queryRunner.query(`ALTER TABLE "${schema}"."user" DROP CONSTRAINT "FK_d72ea127f30e21753c9e229891e"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_856709098512cc0c7d3dc074852"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_e094457bdb54720a55043082fe4"`);

        // Rename column
        await queryRunner.query(`ALTER TABLE "${schema}"."user" RENAME COLUMN "userId" TO "roleId"`);

        // Add new constraints
        await queryRunner.query(`ALTER TABLE "${schema}"."user" ADD CONSTRAINT "FK_c28e52f758e7bbc53828db92194" FOREIGN KEY ("roleId") REFERENCES "${schema}"."role"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_e094457bdb54720a55043082fe4" FOREIGN KEY ("subCategoryId") REFERENCES "${schema}"."subCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_856709098512cc0c7d3dc074852" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const schema = queryRunner.connection.options.name || 'public'; // Default schema is 'public'

        // Drop constraints in reverse order
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_856709098512cc0c7d3dc074852"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_e094457bdb54720a55043082fe4"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."user" DROP CONSTRAINT "FK_c28e52f758e7bbc53828db92194"`);

        // Rename column back to original
        await queryRunner.query(`ALTER TABLE "${schema}"."user" RENAME COLUMN "roleId" TO "userId"`);

        // Re-add original constraints
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_e094457bdb54720a55043082fe4" FOREIGN KEY ("subCategoryId") REFERENCES "${schema}"."subCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_856709098512cc0c7d3dc074852" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "${schema}"."user" ADD CONSTRAINT "FK_d72ea127f30e21753c9e229891e" FOREIGN KEY ("userId") REFERENCES "${schema}"."role"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }
}

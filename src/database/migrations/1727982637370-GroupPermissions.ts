import { MigrationInterface, QueryRunner } from "typeorm";

export class GroupPermissions1727982637370 implements MigrationInterface {
    name = 'GroupPermissions1727982637370'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const schema = queryRunner.connection.options.name || 'public';
        
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_856709098512cc0c7d3dc074852"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_e094457bdb54720a55043082fe4"`);
        await queryRunner.query(`CREATE TABLE "${schema}"."group_user_permissions" ("id" SERIAL NOT NULL, "granted" boolean NOT NULL DEFAULT true, "userId" integer, "groupId" integer, "groupPermissionId" integer, CONSTRAINT "PK_3a1723496e73d70c3ddb9a3641a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "${schema}"."groupPermission" ("id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_795f7bde758c2ab6812b6328773" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "${schema}"."groupRole" ("id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_0f23b79b924cbc04056bdbe95e5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "${schema}"."groupRolePermissions" ("groupRoleId" integer NOT NULL, "groupPermissionId" integer NOT NULL, CONSTRAINT "PK_94b1b1a9f9de31ff9194917e780" PRIMARY KEY ("groupRoleId", "groupPermissionId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5d51857bafbbd071698f736578" ON "${schema}"."groupRolePermissions" ("groupRoleId") `);
        await queryRunner.query(`CREATE INDEX "IDX_46e6c75432e2666666becab4fe" ON "${schema}"."groupRolePermissions" ("groupPermissionId") `);
        await queryRunner.query(`ALTER TABLE "${schema}"."groupMember" ADD "userId" integer`);
        await queryRunner.query(`ALTER TABLE "${schema}"."groupMember" ADD "groupRoleId" integer`);
        await queryRunner.query(`ALTER TABLE "${schema}"."group_user_permissions" ADD CONSTRAINT "FK_d4e5b369122a128adbeba907d2d" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "${schema}"."group_user_permissions" ADD CONSTRAINT "FK_8238590de6e70a455b53c40e022" FOREIGN KEY ("groupId") REFERENCES "${schema}"."Group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "${schema}"."group_user_permissions" ADD CONSTRAINT "FK_d2c261ecee3c19903a8a04d515e" FOREIGN KEY ("groupPermissionId") REFERENCES "${schema}"."groupPermission"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "${schema}"."groupMember" ADD CONSTRAINT "FK_0f4e49b07ff553e99e9ba402221" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "${schema}"."groupMember" ADD CONSTRAINT "FK_455babd1b1ece84bfbeae795652" FOREIGN KEY ("groupRoleId") REFERENCES "${schema}"."groupRole"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_e094457bdb54720a55043082fe4" FOREIGN KEY ("subCategoryId") REFERENCES "${schema}"."subCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_856709098512cc0c7d3dc074852" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "${schema}"."groupRolePermissions" ADD CONSTRAINT "FK_5d51857bafbbd071698f7365787" FOREIGN KEY ("groupRoleId") REFERENCES "${schema}"."groupRole"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "${schema}"."groupRolePermissions" ADD CONSTRAINT "FK_46e6c75432e2666666becab4fec" FOREIGN KEY ("groupPermissionId") REFERENCES "${schema}"."groupPermission"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const schema = queryRunner.connection.options.name || 'public';

        await queryRunner.query(`ALTER TABLE "${schema}"."groupRolePermissions" DROP CONSTRAINT "FK_46e6c75432e2666666becab4fec"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."groupRolePermissions" DROP CONSTRAINT "FK_5d51857bafbbd071698f7365787"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_856709098512cc0c7d3dc074852"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_e094457bdb54720a55043082fe4"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."groupMember" DROP CONSTRAINT "FK_455babd1b1ece84bfbeae795652"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."groupMember" DROP CONSTRAINT "FK_0f4e49b07ff553e99e9ba402221"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."group_user_permissions" DROP CONSTRAINT "FK_d2c261ecee3c19903a8a04d515e"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."group_user_permissions" DROP CONSTRAINT "FK_8238590de6e70a455b53c40e022"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."group_user_permissions" DROP CONSTRAINT "FK_d4e5b369122a128adbeba907d2d"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."groupMember" DROP COLUMN "groupRoleId"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."groupMember" DROP COLUMN "userId"`);
        await queryRunner.query(`DROP INDEX "${schema}"."IDX_46e6c75432e2666666becab4fe"`);
        await queryRunner.query(`DROP INDEX "${schema}"."IDX_5d51857bafbbd071698f736578"`);
        await queryRunner.query(`DROP TABLE "${schema}"."groupRolePermissions"`);
        await queryRunner.query(`DROP TABLE "${schema}"."groupRole"`);
        await queryRunner.query(`DROP TABLE "${schema}"."groupPermission"`);
        await queryRunner.query(`DROP TABLE "${schema}"."group_user_permissions"`);
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_e094457bdb54720a55043082fe4" FOREIGN KEY ("subCategoryId") REFERENCES "${schema}"."subCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_856709098512cc0c7d3dc074852" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }
}

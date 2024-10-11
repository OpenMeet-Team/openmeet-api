import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaseTables1728567349846 implements MigrationInterface {
  name = 'BaseTables1728567349846';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Default schema

    await queryRunner.query(
      `CREATE TABLE "${schema}"."userPermissions" ("id" SERIAL NOT NULL, "granted" boolean NOT NULL DEFAULT false, "userId" integer, "permissionId" integer, CONSTRAINT "PK_5cbba686fa42e45a2914c590261" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."permissions" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."role" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" integer NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_b36bcfe02fc8de3c57a8b2391c2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."status" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" integer NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_e12743a7086ec826733f54e1d95" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."file" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "path" character varying NOT NULL, CONSTRAINT "PK_36b46d232307066b3a2c9ea3a1d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventAttendees" ("eventId" integer NOT NULL, "userId" integer NOT NULL, "rsvpStatus" text NOT NULL, "isHost" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_e47b1fedacf94185d9310d135e0" PRIMARY KEY ("eventId", "userId"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupPermission" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_795f7bde758c2ab6812b6328773" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupRole" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_0f23b79b924cbc04056bdbe95e5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupMember" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "userId" integer, "groupRoleId" integer, "groupId" integer, CONSTRAINT "PK_dbf23f6a7b4374ae57b50d262f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."group_status_enum" AS ENUM('draft', 'pending', 'published')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."group" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "description" text NOT NULL, "approved" boolean NOT NULL DEFAULT false, "status" "group_status_enum", CONSTRAINT "PK_256aa0fda9b1de1a73ee0b7106b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupUserPermissions" ("id" SERIAL NOT NULL, "granted" boolean NOT NULL DEFAULT true, "userId" integer, "groupId" integer, "groupPermissionId" integer, CONSTRAINT "PK_30cda485108935e7b1ab2fc17a7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."user" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "email" character varying, "password" character varying, "provider" character varying NOT NULL DEFAULT 'email', "socialId" character varying, "firstName" character varying, "lastName" character varying, "deletedAt" TIMESTAMP, "photoId" uuid, "statusId" integer, "roleId" integer, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "REL_75e2be4ce11d447ef43be0e374" UNIQUE ("photoId"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9bd2fe7a8e694dedc4ec2f666f" ON "${schema}"."user" ("socialId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_58e4dbff0e1a32a9bdc861bb29" ON "${schema}"."user" ("firstName")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f0e1b4ecdca13b177e2e3a0613" ON "${schema}"."user" ("lastName")`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."event_status_enum" AS ENUM('draft', 'pending', 'published')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."event" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "image" character varying(255), "type" character varying(255) NOT NULL, "locationOnline" character varying(255), "description" text NOT NULL, "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP, "maxAttendees" integer, "location" character varying(255), "lat" double precision, "lon" double precision, "status" "event_status_enum", "userId" integer, "groupId" integer, CONSTRAINT "PK_30c2f3bbaf6d34a55f8ae6e4614" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."category" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "slug" character varying(255), CONSTRAINT "PK_9c4e4a89e3674fc9f382d733f03" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."subCategory_type_enum" AS ENUM('EVENT', 'GROUP')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."subCategory" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "title" character varying(255) NOT NULL, "description" text NOT NULL, "type" "subCategory_type_enum", "categoryId" integer, CONSTRAINT "PK_58ac195f4b1005721f6e844daee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."session" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "hash" character varying NOT NULL, "deletedAt" TIMESTAMP, "userId" integer, CONSTRAINT "PK_f55da76ac1c3ac420f444d2ff11" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3d2f174ef04fb312fdebd0ddc5" ON "${schema}"."session" ("userId")`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."rolePermissions" ("roleId" integer NOT NULL, "permissionId" integer NOT NULL, CONSTRAINT "PK_9e7ab7e8aec914fa1886f6fa632" PRIMARY KEY ("roleId", "permissionId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b20f4ad2fcaa0d311f92516267" ON "${schema}"."rolePermissions" ("roleId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5cb213a16a7b5204c8aff88151" ON "${schema}"."rolePermissions" ("permissionId")`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupRolePermissions" ("groupRoleId" integer NOT NULL, "groupPermissionId" integer NOT NULL, CONSTRAINT "PK_94b1b1a9f9de31ff9194917e780" PRIMARY KEY ("groupRoleId", "groupPermissionId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5d51857bafbbd071698f736578" ON "${schema}"."groupRolePermissions" ("groupRoleId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_46e6c75432e2666666becab4fe" ON "${schema}"."groupRolePermissions" ("groupPermissionId")`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupCategories" ("groupId" integer NOT NULL, "categoryId" integer NOT NULL, CONSTRAINT "PK_c359b1d97e42b492e070323052c" PRIMARY KEY ("groupId", "categoryId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c510b553cc043b896bb4978137" ON "${schema}"."groupCategories" ("groupId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a7e4e0b30b63776099205b1592" ON "${schema}"."groupCategories" ("categoryId")`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."userInterests" ("userId" integer NOT NULL, "subCategoryId" integer NOT NULL, CONSTRAINT "PK_d6106c6b5f03813d166abe6e9b9" PRIMARY KEY ("userId", "subCategoryId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_856709098512cc0c7d3dc07485" ON "${schema}"."userInterests" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e094457bdb54720a55043082fe" ON "${schema}"."userInterests" ("subCategoryId")`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventCategories" ("categoryId" integer NOT NULL, "eventId" integer NOT NULL, CONSTRAINT "PK_78ef94d612fddc21167a7561a3b" PRIMARY KEY ("categoryId", "eventId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dc068501e56c37f17ad7b35b06" ON "${schema}"."eventCategories" ("categoryId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d51bbedb963a7d4d1f6b526b4a" ON "${schema}"."eventCategories" ("eventId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" ADD CONSTRAINT "FK_f9a54628e2dcdb14a6df1da8d3b" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" ADD CONSTRAINT "FK_5fcff32fd1e0d2ad9e179c06ec6" FOREIGN KEY ("permissionId") REFERENCES "${schema}"."permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_d01e8bdc1bf70c757dfa11597b4" FOREIGN KEY ("eventId") REFERENCES "${schema}"."event"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_ab75812b6349113ca79b9856995" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMember" ADD CONSTRAINT "FK_0f4e49b07ff553e99e9ba402221" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMember" ADD CONSTRAINT "FK_455babd1b1ece84bfbeae795652" FOREIGN KEY ("groupRoleId") REFERENCES "${schema}"."groupRole"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMember" ADD CONSTRAINT "FK_28166f82e7f80ccf53d396182e1" FOREIGN KEY ("groupId") REFERENCES "${schema}"."group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" ADD CONSTRAINT "FK_31074d0b1b3d84d0e5b59862ed0" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" ADD CONSTRAINT "FK_f3cec163dabd9ee6e307ad32f04" FOREIGN KEY ("groupId") REFERENCES "${schema}"."group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" ADD CONSTRAINT "FK_9eea741c480d52d836b3bc5a879" FOREIGN KEY ("groupPermissionId") REFERENCES "${schema}"."groupPermission"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."user" ADD CONSTRAINT "FK_75e2be4ce11d447ef43be0e374f" FOREIGN KEY ("photoId") REFERENCES "${schema}"."file"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."user" ADD CONSTRAINT "FK_dc18daa696860586ba4667a9d31" FOREIGN KEY ("statusId") REFERENCES "${schema}"."status"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."user" ADD CONSTRAINT "FK_c28e52f758e7bbc53828db92194" FOREIGN KEY ("roleId") REFERENCES "${schema}"."role"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."event" ADD CONSTRAINT "FK_01cd2b829e0263917bf570cb672" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."event" ADD CONSTRAINT "FK_0a28dcf5832d1068df34fc59e46" FOREIGN KEY ("groupId") REFERENCES "${schema}"."group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."subCategory" ADD CONSTRAINT "FK_e84f5e6499f4f3e12aef86d6c3f" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."session" ADD CONSTRAINT "FK_3d2f174ef04fb312fdebd0ddc53" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" ADD CONSTRAINT "FK_b20f4ad2fcaa0d311f925162675" FOREIGN KEY ("roleId") REFERENCES "${schema}"."role"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" ADD CONSTRAINT "FK_5cb213a16a7b5204c8aff881518" FOREIGN KEY ("permissionId") REFERENCES "${schema}"."permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" ADD CONSTRAINT "FK_5d51857bafbbd071698f7365787" FOREIGN KEY ("groupRoleId") REFERENCES "${schema}"."groupRole"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" ADD CONSTRAINT "FK_46e6c75432e2666666becab4fec" FOREIGN KEY ("groupPermissionId") REFERENCES "${schema}"."groupPermission"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "FK_c510b553cc043b896bb49781375" FOREIGN KEY ("groupId") REFERENCES "${schema}"."group"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "FK_a7e4e0b30b63776099205b15925" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_856709098512cc0c7d3dc074852" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_e094457bdb54720a55043082fe4" FOREIGN KEY ("subCategoryId") REFERENCES "${schema}"."subCategory"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" ADD CONSTRAINT "FK_dc068501e56c37f17ad7b35b068" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."category"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" ADD CONSTRAINT "FK_d51bbedb963a7d4d1f6b526b4a9" FOREIGN KEY ("eventId") REFERENCES "${schema}"."event"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Default schema

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" DROP CONSTRAINT "FK_d51bbedb963a7d4d1f6b526b4a9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" DROP CONSTRAINT "FK_dc068501e56c37f17ad7b35b068"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_e094457bdb54720a55043082fe4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_856709098512cc0c7d3dc074852"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "FK_a7e4e0b30b63776099205b15925"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "FK_c510b553cc043b896bb49781375"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" DROP CONSTRAINT "FK_46e6c75432e2666666becab4fec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" DROP CONSTRAINT "FK_5d51857bafbbd071698f7365787"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" DROP CONSTRAINT "FK_5cb213a16a7b5204c8aff881518"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" DROP CONSTRAINT "FK_b20f4ad2fcaa0d311f925162675"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."session" DROP CONSTRAINT "FK_3d2f174ef04fb312fdebd0ddc53"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."subCategory" DROP CONSTRAINT "FK_e84f5e6499f4f3e12aef86d6c3f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."event" DROP CONSTRAINT "FK_0a28dcf5832d1068df34fc59e46"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."event" DROP CONSTRAINT "FK_01cd2b829e0263917bf570cb672"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."user" DROP CONSTRAINT "FK_c28e52f758e7bbc53828db92194"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."user" DROP CONSTRAINT "FK_dc18daa696860586ba4667a9d31"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."user" DROP CONSTRAINT "FK_75e2be4ce11d447ef43be0e374f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" DROP CONSTRAINT "FK_9eea741c480d52d836b3bc5a879"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" DROP CONSTRAINT "FK_f3cec163dabd9ee6e307ad32f04"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" DROP CONSTRAINT "FK_31074d0b1b3d84d0e5b59862ed0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMember" DROP CONSTRAINT "FK_28166f82e7f80ccf53d396182e1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMember" DROP CONSTRAINT "FK_455babd1b1ece84bfbeae795652"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMember" DROP CONSTRAINT "FK_0f4e49b07ff553e99e9ba402221"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP CONSTRAINT "FK_ab75812b6349113ca79b9856995"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP CONSTRAINT "FK_d01e8bdc1bf70c757dfa11597b4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" DROP CONSTRAINT "FK_5fcff32fd1e0d2ad9e179c06ec6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" DROP CONSTRAINT "FK_f9a54628e2dcdb14a6df1da8d3b"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_d51bbedb963a7d4d1f6b526b4a"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_dc068501e56c37f17ad7b35b06"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."eventCategories"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_e094457bdb54720a55043082fe"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_856709098512cc0c7d3dc07485"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."userInterests"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_a7e4e0b30b63776099205b1592"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_c510b553cc043b896bb4978137"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."groupCategories"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_46e6c75432e2666666becab4fe"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5d51857bafbbd071698f736578"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."groupRolePermissions"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5cb213a16a7b5204c8aff88151"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_b20f4ad2fcaa0d311f92516267"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."rolePermissions"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_3d2f174ef04fb312fdebd0ddc5"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."session"`);
    await queryRunner.query(`DROP TABLE "${schema}"."subCategory"`);
    await queryRunner.query(`DROP TYPE "${schema}"."subCategory_type_enum"`);
    await queryRunner.query(`DROP TABLE "${schema}"."category"`);
    await queryRunner.query(`DROP TABLE "${schema}"."event"`);
    await queryRunner.query(`DROP TYPE "${schema}"."event_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_f0e1b4ecdca13b177e2e3a0613"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_58e4dbff0e1a32a9bdc861bb29"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_9bd2fe7a8e694dedc4ec2f666f"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."user"`);
    await queryRunner.query(`DROP TABLE "${schema}"."groupUserPermissions"`);
    await queryRunner.query(`DROP TABLE "${schema}"."group"`);
    await queryRunner.query(`DROP TYPE "${schema}"."group_status_enum"`);
    await queryRunner.query(`DROP TABLE "${schema}"."groupMember"`);
    await queryRunner.query(`DROP TABLE "${schema}"."groupRole"`);
    await queryRunner.query(`DROP TABLE "${schema}"."groupPermission"`);
    await queryRunner.query(`DROP TABLE "${schema}"."eventAttendees"`);
    await queryRunner.query(`DROP TABLE "${schema}"."file"`);
    await queryRunner.query(`DROP TABLE "${schema}"."status"`);
    await queryRunner.query(`DROP TABLE "${schema}"."role"`);
    await queryRunner.query(`DROP TABLE "${schema}"."permissions"`);
    await queryRunner.query(`DROP TABLE "${schema}"."userPermissions"`);
  }
}

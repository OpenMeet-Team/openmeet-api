import { MigrationInterface, QueryRunner } from 'typeorm';

export class CategoriesAndUserAndGroupPermissionsTable1728249762325
  implements MigrationInterface
{
  name = 'CategoriesAndUserAndGroupPermissionsTable1728249762325';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Default schema is 'public', replace if needed

    await queryRunner.query(
      `CREATE TABLE "${schema}"."Permissions" ("id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_e83fa8a46bd5a3bfaa095d40812" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."subCategory_type_enum" AS ENUM('EVENT', 'GROUP')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."subCategory" ("id" SERIAL NOT NULL, "title" character varying(255) NOT NULL, "description" text NOT NULL, "type" "${schema}"."subCategory_type_enum", "categoryId" integer, CONSTRAINT "PK_58ac195f4b1005721f6e844daee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."group_user_permissions" ("id" SERIAL NOT NULL, "granted" boolean NOT NULL DEFAULT true, "userId" integer, "groupId" integer, "groupPermissionId" integer, CONSTRAINT "PK_3a1723496e73d70c3ddb9a3641a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupPermission" ("id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_795f7bde758c2ab6812b6328773" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupRole" ("id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_0f23b79b924cbc04056bdbe95e5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupMember" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "userId" integer, "groupRoleId" integer, "groupId" integer, CONSTRAINT "PK_dbf23f6a7b4374ae57b50d262f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."Group_status_enum" AS ENUM('PUBLIC', 'PRIVATE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."Group" ("id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "description" text NOT NULL, "approved" boolean NOT NULL DEFAULT false, "status" "${schema}"."Group_status_enum", CONSTRAINT "PK_d064bd160defed65823032ee547" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."Category" ("id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, CONSTRAINT "PK_c2727780c5b9b0c564c29a4977c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."userPermissions" ("id" SERIAL NOT NULL, "granted" boolean NOT NULL DEFAULT false, "userId" integer, "permissionId" integer, CONSTRAINT "PK_5cbba686fa42e45a2914c590261" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."rolePermissions" ("roleId" integer NOT NULL, "permissionId" integer NOT NULL, CONSTRAINT "PK_9e7ab7e8aec914fa1886f6fa632" PRIMARY KEY ("roleId", "permissionId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b20f4ad2fcaa0d311f92516267" ON "${schema}"."rolePermissions" ("roleId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5cb213a16a7b5204c8aff88151" ON "${schema}"."rolePermissions" ("permissionId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."userInterests" ("subCategoryId" integer NOT NULL, "userId" integer NOT NULL, CONSTRAINT "PK_d6106c6b5f03813d166abe6e9b9" PRIMARY KEY ("subCategoryId", "userId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e094457bdb54720a55043082fe" ON "${schema}"."userInterests" ("subCategoryId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_856709098512cc0c7d3dc07485" ON "${schema}"."userInterests" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupRolePermissions" ("groupRoleId" integer NOT NULL, "groupPermissionId" integer NOT NULL, CONSTRAINT "PK_94b1b1a9f9de31ff9194917e780" PRIMARY KEY ("groupRoleId", "groupPermissionId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5d51857bafbbd071698f736578" ON "${schema}"."groupRolePermissions" ("groupRoleId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_46e6c75432e2666666becab4fe" ON "${schema}"."groupRolePermissions" ("groupPermissionId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."group_categories_category" ("groupId" integer NOT NULL, "categoryId" integer NOT NULL, CONSTRAINT "PK_bb606b9ed239a6f1de8b30ae3f6" PRIMARY KEY ("groupId", "categoryId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_55ec55270cbd701570ee9ad979" ON "${schema}"."group_categories_category" ("groupId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c03a1e84ff1bd7302451647fd6" ON "${schema}"."group_categories_category" ("categoryId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."category_events_event" ("categoryId" integer NOT NULL, "eventId" integer NOT NULL, CONSTRAINT "PK_328e675814f9cbc0734af108542" PRIMARY KEY ("categoryId", "eventId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5ec511506f673c4d2f9e6a6581" ON "${schema}"."category_events_event" ("categoryId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_99ad0d8882edac5001e8fffaed" ON "${schema}"."category_events_event" ("eventId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."category_groups_group" ("categoryId" integer NOT NULL, "groupId" integer NOT NULL, CONSTRAINT "PK_34618c934aa42269ac3df440b50" PRIMARY KEY ("categoryId", "groupId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_300e9942ce51ca84d7aea6ab29" ON "${schema}"."category_groups_group" ("categoryId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e5a897361fcbb74c800fe105c" ON "${schema}"."category_groups_group" ("groupId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."event_categories_category" ("eventId" integer NOT NULL, "categoryId" integer NOT NULL, CONSTRAINT "PK_be85f4d4f79d2e4f53685ed7f96" PRIMARY KEY ("eventId", "categoryId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9fc5e5dab789917cc33940c08a" ON "${schema}"."event_categories_category" ("eventId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0c38526fad528c70c7c5baaa08" ON "${schema}"."event_categories_category" ("categoryId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" ADD "type" character varying(255) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" ADD "locationOnline" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" ADD "maxAttendees" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" ADD "groupId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" ALTER COLUMN "endDate" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" ALTER COLUMN "location" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."subCategory" ADD CONSTRAINT "FK_e84f5e6499f4f3e12aef86d6c3f" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."Category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."group_user_permissions" ADD CONSTRAINT "FK_d4e5b369122a128adbeba907d2d" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."group_user_permissions" ADD CONSTRAINT "FK_8238590de6e70a455b53c40e022" FOREIGN KEY ("groupId") REFERENCES "${schema}"."Group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."group_user_permissions" ADD CONSTRAINT "FK_d2c261ecee3c19903a8a04d515e" FOREIGN KEY ("groupPermissionId") REFERENCES "${schema}"."groupPermission"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMember" ADD CONSTRAINT "FK_0f4e49b07ff553e99e9ba402221" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMember" ADD CONSTRAINT "FK_455babd1b1ece84bfbeae795652" FOREIGN KEY ("groupRoleId") REFERENCES "${schema}"."groupRole"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMember" ADD CONSTRAINT "FK_28166f82e7f80ccf53d396182e1" FOREIGN KEY ("groupId") REFERENCES "${schema}"."Group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" ADD CONSTRAINT "FK_43b3517c34a5630da5083cb2fe9" FOREIGN KEY ("groupId") REFERENCES "${schema}"."Group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" ADD CONSTRAINT "FK_f9a54628e2dcdb14a6df1da8d3b" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" ADD CONSTRAINT "FK_5fcff32fd1e0d2ad9e179c06ec6" FOREIGN KEY ("permissionId") REFERENCES "${schema}"."Permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" ADD CONSTRAINT "FK_b20f4ad2fcaa0d311f925162675" FOREIGN KEY ("roleId") REFERENCES "${schema}"."role"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" ADD CONSTRAINT "FK_5cb213a16a7b5204c8aff881518" FOREIGN KEY ("permissionId") REFERENCES "${schema}"."Permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_e094457bdb54720a55043082fe4" FOREIGN KEY ("subCategoryId") REFERENCES "${schema}"."subCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_856709098512cc0c7d3dc074852" FOREIGN KEY ("userId") REFERENCES "${schema}"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" ADD CONSTRAINT "FK_5d51857bafbbd071698f7365787" FOREIGN KEY ("groupRoleId") REFERENCES "${schema}"."groupRole"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" ADD CONSTRAINT "FK_46e6c75432e2666666becab4fec" FOREIGN KEY ("groupPermissionId") REFERENCES "${schema}"."groupPermission"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."group_categories_category" ADD CONSTRAINT "FK_55ec55270cbd701570ee9ad9799" FOREIGN KEY ("groupId") REFERENCES "${schema}"."Group"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."group_categories_category" ADD CONSTRAINT "FK_c03a1e84ff1bd7302451647fd60" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."Category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_events_event" ADD CONSTRAINT "FK_5ec511506f673c4d2f9e6a65815" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."Category"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_events_event" ADD CONSTRAINT "FK_99ad0d8882edac5001e8fffaed0" FOREIGN KEY ("eventId") REFERENCES "${schema}"."Event"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_groups_group" ADD CONSTRAINT "FK_300e9942ce51ca84d7aea6ab29e" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."Category"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_groups_group" ADD CONSTRAINT "FK_5e5a897361fcbb74c800fe105c8" FOREIGN KEY ("groupId") REFERENCES "${schema}"."Group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."event_categories_category" ADD CONSTRAINT "FK_9fc5e5dab789917cc33940c08a9" FOREIGN KEY ("eventId") REFERENCES "${schema}"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."event_categories_category" ADD CONSTRAINT "FK_0c38526fad528c70c7c5baaa081" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."Category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(
      `ALTER TABLE "${schema}"."event_categories_category" DROP CONSTRAINT "FK_0c38526fad528c70c7c5baaa081"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."event_categories_category" DROP CONSTRAINT "FK_9fc5e5dab789917cc33940c08a9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_groups_group" DROP CONSTRAINT "FK_5e5a897361fcbb74c800fe105c8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_groups_group" DROP CONSTRAINT "FK_300e9942ce51ca84d7aea6ab29e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_events_event" DROP CONSTRAINT "FK_99ad0d8882edac5001e8fffaed0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."category_events_event" DROP CONSTRAINT "FK_5ec511506f673c4d2f9e6a65815"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."group_categories_category" DROP CONSTRAINT "FK_c03a1e84ff1bd7302451647fd60"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."group_categories_category" DROP CONSTRAINT "FK_55ec55270cbd701570ee9ad9799"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" DROP CONSTRAINT "FK_46e6c75432e2666666becab4fec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" DROP CONSTRAINT "FK_5d51857bafbbd071698f7365787"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_856709098512cc0c7d3dc074852"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_e094457bdb54720a55043082fe4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" DROP CONSTRAINT "FK_5cb213a16a7b5204c8aff881518"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" DROP CONSTRAINT "FK_b20f4ad2fcaa0d311f925162675"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" DROP CONSTRAINT "FK_5fcff32fd1e0d2ad9e179c06ec6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" DROP CONSTRAINT "FK_f9a54628e2dcdb14a6df1da8d3b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" DROP CONSTRAINT "FK_43b3517c34a5630da5083cb2fe9"`,
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
      `ALTER TABLE "${schema}"."group_user_permissions" DROP CONSTRAINT "FK_d2c261ecee3c19903a8a04d515e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."group_user_permissions" DROP CONSTRAINT "FK_8238590de6e70a455b53c40e022"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."group_user_permissions" DROP CONSTRAINT "FK_d4e5b369122a128adbeba907d2d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."subCategory" DROP CONSTRAINT "FK_e84f5e6499f4f3e12aef86d6c3f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" ALTER COLUMN "location" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" ALTER COLUMN "endDate" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" DROP COLUMN "groupId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" DROP COLUMN "maxAttendees"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" DROP COLUMN "locationOnline"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."Event" DROP COLUMN "type"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_0c38526fad528c70c7c5baaa08"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_9fc5e5dab789917cc33940c08a"`,
    );
    await queryRunner.query(
      `DROP TABLE "${schema}"."event_categories_category"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5e5a897361fcbb74c800fe105c"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_300e9942ce51ca84d7aea6ab29"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."category_groups_group"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_99ad0d8882edac5001e8fffaed"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5ec511506f673c4d2f9e6a6581"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."category_events_event"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_c03a1e84ff1bd7302451647fd6"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_55ec55270cbd701570ee9ad979"`,
    );
    await queryRunner.query(
      `DROP TABLE "${schema}"."group_categories_category"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_46e6c75432e2666666becab4fe"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5d51857bafbbd071698f736578"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."groupRolePermissions"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_856709098512cc0c7d3dc07485"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_e094457bdb54720a55043082fe"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."userInterests"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5cb213a16a7b5204c8aff88151"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_b20f4ad2fcaa0d311f92516267"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."rolePermissions"`);
    await queryRunner.query(`DROP TABLE "${schema}"."userPermissions"`);
    await queryRunner.query(`DROP TABLE "${schema}"."Category"`);
    await queryRunner.query(`DROP TABLE "${schema}"."Group"`);
    await queryRunner.query(`DROP TYPE "${schema}"."Group_status_enum"`);
    await queryRunner.query(`DROP TABLE "${schema}"."groupMember"`);
    await queryRunner.query(`DROP TABLE "${schema}"."groupRole"`);
    await queryRunner.query(`DROP TABLE "${schema}"."groupPermission"`);
    await queryRunner.query(`DROP TABLE "${schema}"."group_user_permissions"`);
    await queryRunner.query(`DROP TABLE "${schema}"."subCategory"`);
    await queryRunner.query(`DROP TYPE "${schema}"."subCategory_type_enum"`);
    await queryRunner.query(`DROP TABLE "${schema}"."Permissions"`);
  }
}

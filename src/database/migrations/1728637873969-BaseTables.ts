import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaseTables1728637873969 implements MigrationInterface {
  name = 'BaseTables1728637873969';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Default schema

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(
      `CREATE TABLE "${schema}"."userPermissions" ("id" SERIAL NOT NULL, "granted" boolean NOT NULL DEFAULT false, "userId" integer, "permissionId" integer, CONSTRAINT "PK_5cbba686fa42e45a2914c590261" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."permissions" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."roles" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" integer NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."statuses" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" integer NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_2fd3770acdb67736f1a3e3d5399" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."files" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "path" character varying NOT NULL, "fileName" character varying NOT NULL, "fileSize" integer NOT NULL, "mimeType" character varying NOT NULL, CONSTRAINT "PK_6c16b9093a142e0e7613b04a3d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."eventAttendees_status_enum" AS ENUM('invited', 'confirmed', 'attended', 'cancelled', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."eventAttendees_role_enum" AS ENUM('participant', 'host', 'speaker', 'moderator', 'guest')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventAttendees" ("eventId" integer NOT NULL, "userId" integer NOT NULL, "role" "${schema}"."eventAttendees_role_enum", "status" "${schema}"."eventAttendees_status_enum", CONSTRAINT "PK_e47b1fedacf94185d9310d135e0" PRIMARY KEY ("eventId", "userId"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."subcategories_type_enum" AS ENUM('EVENT', 'GROUP')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."subcategories" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "title" character varying(255) NOT NULL, "description" text NOT NULL, "type" "${schema}"."subcategories_type_enum", "categoryId" integer, CONSTRAINT "PK_793ef34ad0a3f86f09d4837007c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupUserPermissions" ("id" SERIAL NOT NULL, "granted" boolean NOT NULL DEFAULT true, "userId" integer, "groupId" integer, "groupPermissionId" integer, CONSTRAINT "PK_30cda485108935e7b1ab2fc17a7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupPermissions" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_e501cb9db2ccf705c2ebf31d230" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."groups_visibility_enum" AS ENUM('public', 'authenticated', 'private')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupRoles" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_b31b0a0a1d4bbfa5f1a01509c61" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupMembers" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "userId" integer, "groupRoleId" integer, "groupId" integer, CONSTRAINT "PK_f10d230346d87dccbaf0caeba5c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."groups_status_enum" AS ENUM('draft', 'pending', 'published')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groups" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "location" character varying(255), "lat" double precision, "lon" double precision, "description" text NOT NULL, "requireApproval" boolean NOT NULL DEFAULT false, "createdById" integer, "imageId" integer, "status" "${schema}"."groups_status_enum", "visibility" "${schema}"."groups_visibility_enum", CONSTRAINT "PK_659d1483316afb28afd3a90646e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."categories" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "slug" character varying(255), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."events_status_enum" AS ENUM('draft', 'pending', 'published')`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."events_visibility_enum" AS ENUM('public', 'authenticated', 'private')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."events" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "type" character varying(255) NOT NULL, "imageId" integer, "locationOnline" character varying(255), "slug" character varying(255) NOT NULL, "description" text NOT NULL, "visibility" "${schema}"."events_visibility_enum", "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP, "maxAttendees" integer, "location" character varying(255), "lat" double precision, "lon" double precision, "status" "${schema}"."events_status_enum", "userId" integer, "groupId" integer, CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."users" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "email" character varying, "password" character varying, "provider" character varying NOT NULL DEFAULT 'email', "bio" text, "location" character varying(255), "lat" double precision, "lon" double precision, "socialId" character varying, "firstName" character varying, "lastName" character varying, "deletedAt" TIMESTAMP, "photoId" integer, "statusId" integer, "roleId" integer, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "REL_f856a4818b32c69dbc8811f3d2" UNIQUE ("photoId"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2025eaefc4e1b443c84f6ca9b2" ON "${schema}"."users" ("socialId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5372672fbfd1677205e0ce3ece" ON "${schema}"."users" ("firstName") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_af99afb7cf88ce20aff6977e68" ON "${schema}"."users" ("lastName") `,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."sessions" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "hash" character varying NOT NULL, "deletedAt" TIMESTAMP, "userId" integer, CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_57de40bc620f456c7311aa3a1e" ON "${schema}"."sessions" ("userId") `,
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
      `CREATE TABLE "${schema}"."groupRolePermissions" ("groupRoleId" integer NOT NULL, "groupPermissionId" integer NOT NULL, CONSTRAINT "PK_94b1b1a9f9de31ff9194917e780" PRIMARY KEY ("groupRoleId", "groupPermissionId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5d51857bafbbd071698f736578" ON "${schema}"."groupRolePermissions" ("groupRoleId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_46e6c75432e2666666becab4fe" ON "${schema}"."groupRolePermissions" ("groupPermissionId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupCategories" ("groupsId" integer NOT NULL, "categoriesId" integer NOT NULL, CONSTRAINT "PK_febacc92b4f386777f08e7d1b8e" PRIMARY KEY ("groupsId", "categoriesId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_464b2f0143de9ea9725a24956d" ON "${schema}"."groupCategories" ("groupsId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_733b91e79dc09e35d555175768" ON "${schema}"."groupCategories" ("categoriesId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventCategories" ("categoriesId" integer NOT NULL, "eventsId" integer NOT NULL, CONSTRAINT "PK_3fbec7bd0afec0bb5aed1d7f9a3" PRIMARY KEY ("categoriesId", "eventsId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5f9d73047c3849c5b1495a8011" ON "${schema}"."eventCategories" ("categoriesId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3e703b5162d4195681549dfc3e" ON "${schema}"."eventCategories" ("eventsId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."userInterests" ("usersId" integer NOT NULL, "subcategoriesId" integer NOT NULL, CONSTRAINT "PK_0a021a19dbadecae6d249244d49" PRIMARY KEY ("usersId", "subcategoriesId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6e00deadfd5a3570da93150fd6" ON "${schema}"."userInterests" ("usersId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bb202c7e077ec68377af96ca42" ON "${schema}"."userInterests" ("subcategoriesId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" ADD CONSTRAINT "FK_f9a54628e2dcdb14a6df1da8d3b" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" ADD CONSTRAINT "FK_5fcff32fd1e0d2ad9e179c06ec6" FOREIGN KEY ("permissionId") REFERENCES "${schema}"."permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_d01e8bdc1bf70c757dfa11597b4" FOREIGN KEY ("eventId") REFERENCES "${schema}"."events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_ab75812b6349113ca79b9856995" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."subcategories" ADD CONSTRAINT "FK_d1fe096726c3c5b8a500950e448" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" ADD CONSTRAINT "FK_31074d0b1b3d84d0e5b59862ed0" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" ADD CONSTRAINT "FK_f3cec163dabd9ee6e307ad32f04" FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" ADD CONSTRAINT "FK_9eea741c480d52d836b3bc5a879" FOREIGN KEY ("groupPermissionId") REFERENCES "${schema}"."groupPermissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" ADD CONSTRAINT "FK_707e2d7e186d11bf587210223ab" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" ADD CONSTRAINT "FK_f594fe1e68daaf3299b538fb31c" FOREIGN KEY ("groupRoleId") REFERENCES "${schema}"."groupRoles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" ADD CONSTRAINT "FK_08cacea15f2aef324f78fddebff" FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" ADD CONSTRAINT "FK_e0522c4be8bab20520896919da0" FOREIGN KEY ("createdById") REFERENCES "${schema}"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" ADD CONSTRAINT "FK_f856a4818b32c69dbc8811f3d4s" FOREIGN KEY ("imageId") REFERENCES "${schema}"."files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD CONSTRAINT "FK_9929fa8516afa13f87b41abb263" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD CONSTRAINT "FK_73672459b90f4b48f43d72681cc" FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD CONSTRAINT "FK_f856a4818b32c69dbc8811f3d4e" FOREIGN KEY ("imageId") REFERENCES "${schema}"."files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD CONSTRAINT "FK_f856a4818b32c69dbc8811f3d2c" FOREIGN KEY ("photoId") REFERENCES "${schema}"."files"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD CONSTRAINT "FK_fffa7945e50138103659f6326b7" FOREIGN KEY ("statusId") REFERENCES "${schema}"."statuses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD CONSTRAINT "FK_368e146b785b574f42ae9e53d5e" FOREIGN KEY ("roleId") REFERENCES "${schema}"."roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."sessions" ADD CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" ADD CONSTRAINT "FK_b20f4ad2fcaa0d311f925162675" FOREIGN KEY ("roleId") REFERENCES "${schema}"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" ADD CONSTRAINT "FK_5cb213a16a7b5204c8aff881518" FOREIGN KEY ("permissionId") REFERENCES "${schema}"."permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" ADD CONSTRAINT "FK_5d51857bafbbd071698f7365787" FOREIGN KEY ("groupRoleId") REFERENCES "${schema}"."groupRoles"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" ADD CONSTRAINT "FK_46e6c75432e2666666becab4fec" FOREIGN KEY ("groupPermissionId") REFERENCES "${schema}"."groupPermissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "FK_464b2f0143de9ea9725a24956d2" FOREIGN KEY ("groupsId") REFERENCES "${schema}"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "FK_733b91e79dc09e35d5551757683" FOREIGN KEY ("categoriesId") REFERENCES "${schema}"."categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" ADD CONSTRAINT "FK_5f9d73047c3849c5b1495a80113" FOREIGN KEY ("categoriesId") REFERENCES "${schema}"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" ADD CONSTRAINT "FK_3e703b5162d4195681549dfc3e4" FOREIGN KEY ("eventsId") REFERENCES "${schema}"."events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_6e00deadfd5a3570da93150fd6b" FOREIGN KEY ("usersId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_bb202c7e077ec68377af96ca423" FOREIGN KEY ("subcategoriesId") REFERENCES "${schema}"."subcategories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public'; // Default schema

    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_bb202c7e077ec68377af96ca423"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_6e00deadfd5a3570da93150fd6b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" DROP CONSTRAINT "FK_3e703b5162d4195681549dfc3e4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" DROP CONSTRAINT "FK_5f9d73047c3849c5b1495a80113"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "FK_733b91e79dc09e35d5551757683"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "FK_464b2f0143de9ea9725a24956d2"`,
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
      `ALTER TABLE "${schema}"."sessions" DROP CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP CONSTRAINT "FK_368e146b785b574f42ae9e53d5e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP CONSTRAINT "FK_fffa7945e50138103659f6326b7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP CONSTRAINT "FK_f856a4818b32c69dbc8811f3d2c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" DROP CONSTRAINT "FK_73672459b90f4b48f43d72681cc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" DROP CONSTRAINT "FK_9929fa8516afa13f87b41abb263"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" DROP CONSTRAINT "FK_08cacea15f2aef324f78fddebff"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" DROP CONSTRAINT "FK_f594fe1e68daaf3299b538fb31c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" DROP CONSTRAINT "FK_707e2d7e186d11bf587210223ab"`,
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
      `ALTER TABLE "${schema}"."subcategories" DROP CONSTRAINT "FK_d1fe096726c3c5b8a500950e448"`,
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
      `DROP INDEX "${schema}"."IDX_bb202c7e077ec68377af96ca42"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_6e00deadfd5a3570da93150fd6"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."userInterests"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_3e703b5162d4195681549dfc3e"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5f9d73047c3849c5b1495a8011"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."eventCategories"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_733b91e79dc09e35d555175768"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_464b2f0143de9ea9725a24956d"`,
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
      `DROP INDEX "${schema}"."IDX_57de40bc620f456c7311aa3a1e"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."sessions"`);
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_af99afb7cf88ce20aff6977e68"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5372672fbfd1677205e0ce3ece"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_2025eaefc4e1b443c84f6ca9b2"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."users"`);
    await queryRunner.query(`DROP TABLE "${schema}"."events"`);
    await queryRunner.query(`DROP TYPE "${schema}"."events_status_enum"`);
    await queryRunner.query(`DROP TABLE "${schema}"."categories"`);
    await queryRunner.query(`DROP TABLE "${schema}"."groups"`);
    await queryRunner.query(`DROP TYPE "${schema}"."groups_status_enum"`);
    await queryRunner.query(`DROP TABLE "${schema}"."groupMembers"`);
    await queryRunner.query(`DROP TABLE "${schema}"."groupRoles"`);
    await queryRunner.query(`DROP TABLE "${schema}"."groupPermissions"`);
    await queryRunner.query(`DROP TABLE "${schema}"."groupUserPermissions"`);
    await queryRunner.query(`DROP TABLE "${schema}"."subcategories"`);
    await queryRunner.query(`DROP TYPE "${schema}"."subcategories_type_enum"`);
    await queryRunner.query(`DROP TABLE "${schema}"."eventAttendees"`);
    await queryRunner.query(`DROP TABLE "${schema}"."files"`);
    await queryRunner.query(`DROP TABLE "${schema}"."statuses"`);
    await queryRunner.query(`DROP TABLE "${schema}"."roles"`);
    await queryRunner.query(`DROP TABLE "${schema}"."permissions"`);
    await queryRunner.query(`DROP TABLE "${schema}"."userPermissions"`);
  }
}

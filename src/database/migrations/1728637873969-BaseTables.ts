import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaseTables1728637873969 implements MigrationInterface {
  name = 'BaseTables1728637873969';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Create tables and types with schema prefix
    await queryRunner.query(
      `CREATE TABLE "${schema}"."permissions" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."roles" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."statuses" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" integer NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_2fd3770acdb67736f1a3e3d5399" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."files" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "ulid" character varying, "fileName" character varying NOT NULL, "fileSize" integer NOT NULL, "mimeType" character varying NOT NULL, "path" character varying NOT NULL, CONSTRAINT "PK_6c16b9093a142e0e7613b04a3d9" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TYPE "${schema}"."eventAttendees_status_enum" AS ENUM('invited', 'confirmed', 'attended', 'cancelled', 'rejected', 'maybe', 'pending', 'waitlist')`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."eventAttendees_role_enum" AS ENUM('participant', 'host', 'speaker', 'moderator', 'guest')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventAttendees" ("id" SERIAL NOT NULL, "approvalAnswer" text, "roleId" integer NOT NULL, "eventId" integer NOT NULL, "userId" integer NOT NULL, "role" "${schema}"."eventAttendees_role_enum", "status" "${schema}"."eventAttendees_status_enum", CONSTRAINT "PK_e47b1fedacf94185d9310d135e0" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TYPE "${schema}"."subcategories_type_enum" AS ENUM('EVENT', 'GROUP')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."subcategories" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "title" character varying(255) NOT NULL, "description" text NOT NULL, "type" "${schema}"."subcategories_type_enum", "categoryId" integer, CONSTRAINT "PK_793ef34ad0a3f86f09d4837007c" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupUserPermissions" ("id" SERIAL NOT NULL, "userId" integer, "groupId" integer, "groupPermissionId" integer, CONSTRAINT "PK_30cda485108935e7b1ab2fc17a7" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TYPE "${schema}"."groupPermissions_name_enum" AS ENUM('MANAGE_GROUP', 'DELETE_GROUP', 'MANAGE_MEMBERS', 'MANAGE_EVENTS', 'MANAGE_DISCUSSIONS', 'MANAGE_REPORTS', 'MANAGE_BILLING', 'CREATE_EVENT', 'MESSAGE_DISCUSSION', 'MESSAGE_MEMBER', 'SEE_MEMBERS', 'SEE_EVENTS', 'SEE_DISCUSSIONS', 'SEE_GROUP')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupPermissions" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" "${schema}"."groupPermissions_name_enum" NOT NULL, CONSTRAINT "PK_e501cb9db2ccf705c2ebf31d230" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TYPE "${schema}"."groupRoles_name_enum" AS ENUM('owner', 'admin', 'moderator', 'member', 'guest')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupRoles" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" "${schema}"."groupRoles_name_enum" NOT NULL, CONSTRAINT "PK_b31b0a0a1d4bbfa5f1a01509c61" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupMembers" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "userId" integer, "groupRoleId" integer, "groupId" integer, CONSTRAINT "PK_f10d230346d87dccbaf0caeba5c" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TYPE "${schema}"."groups_status_enum" AS ENUM('draft', 'pending', 'published')`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."groups_visibility_enum" AS ENUM('public', 'authenticated', 'private')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groups" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "description" text NOT NULL, "status" "${schema}"."groups_status_enum", "visibility" "${schema}"."groups_visibility_enum", "requireApproval" boolean NOT NULL DEFAULT true, "location" character varying(255), "lat" double precision, "lon" double precision, "createdById" integer, "imageId" integer, CONSTRAINT "REL_44626591821828ce1d26311312" UNIQUE ("imageId"), CONSTRAINT "PK_659d1483316afb28afd3a90646e" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."categories" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "slug" character varying(255), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TYPE "${schema}"."events_type_enum" AS ENUM('in-person', 'online', 'hybrid')`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."events_status_enum" AS ENUM('draft', 'pending', 'published', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."events_visibility_enum" AS ENUM('public', 'authenticated', 'private')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."events" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "ulid" character varying, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "type" "${schema}"."events_type_enum" NOT NULL, "locationOnline" character varying(255), "description" text NOT NULL, "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP, "maxAttendees" integer, "requireApproval" boolean NOT NULL DEFAULT false, "approvalQuestion" character varying(255), "requireGroupMembership" boolean NOT NULL DEFAULT false, "location" character varying(255), "lat" double precision, "lon" double precision, "status" "${schema}"."events_status_enum", "visibility" "${schema}"."events_visibility_enum", "allowWaitlist" boolean NOT NULL DEFAULT false, "imageId" integer, "userId" integer, "groupId" integer, CONSTRAINT "REL_35515e57a42f4fd00a4172371b" UNIQUE ("imageId"), CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."users" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "ulid" character varying NOT NULL, "email" character varying, "password" character varying, "provider" character varying NOT NULL DEFAULT 'email', "socialId" character varying, "firstName" character varying, "lastName" character varying, "deletedAt" TIMESTAMP, "bio" text, "zulipUserId" integer, "zulipUsername" character varying, "zulipApiKey" character varying, "photoId" integer, "statusId" integer, "roleId" integer, CONSTRAINT "UQ_0aa955856df38a0cb6a33b16525" UNIQUE ("ulid"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "REL_f856a4818b32c69dbc8811f3d2" UNIQUE ("photoId"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_users_socialId" ON "${schema}"."users" ("socialId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_users_firstName" ON "${schema}"."users" ("firstName")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_users_lastName" ON "${schema}"."users" ("lastName")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."chats" ("id" SERIAL NOT NULL, "ulid" character varying, "participants" integer[], "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5cbba686fa42e45a2914c590ads" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_chats_participants" ON "${schema}"."chats" ("participants")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_chats_ulid" ON "${schema}"."chats" ("ulid")`,
    );

    // userChats join table
    await queryRunner.query(
      `CREATE TABLE "${schema}"."userChats" ("userId" integer NOT NULL, "chatId" integer NOT NULL, CONSTRAINT "PK_5cbba686fa42e45a2914c590asd" PRIMARY KEY ("userId", "chatId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_userChats_userId" ON "${schema}"."userChats" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_userChats_chatId" ON "${schema}"."userChats" ("chatId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."sessions" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "hash" character varying NOT NULL, "deletedAt" TIMESTAMP, "userId" integer, CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_sessions_userId" ON "${schema}"."sessions" ("userId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."rolePermissions" ("roleId" integer NOT NULL, "permissionId" integer NOT NULL, CONSTRAINT "PK_9e7ab7e8aec914fa1886f6fa632" PRIMARY KEY ("roleId", "permissionId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_rolePermissions_roleId" ON "${schema}"."rolePermissions" ("roleId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_rolePermissions_permissionId" ON "${schema}"."rolePermissions" ("permissionId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventRoles" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_b31b0a0a1d4bbfa5f1a01509sdf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventPermissions" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_e501cb9db2ccf705c2ebf31d231" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventRolePermissions" ("eventRoleId" integer NOT NULL, "eventPermissionId" integer NOT NULL, CONSTRAINT "PK_9e7ab7e8aec914fa1886f6asdf" PRIMARY KEY ("eventRoleId", "eventPermissionId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_eventRolePermissionsEvent_eventRoleId" ON "${schema}"."eventRolePermissions" ("eventRoleId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_eventRolePermissionsEvent_eventPermissionId" ON "${schema}"."eventRolePermissions" ("eventPermissionId") `,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupRolePermissions" ("groupRoleId" integer NOT NULL, "groupPermissionId" integer NOT NULL, CONSTRAINT "PK_94b1b1a9f9de31ff9194917e780" PRIMARY KEY ("groupRoleId", "groupPermissionId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groupRolePermissions_groupRoleId" ON "${schema}"."groupRolePermissions" ("groupRoleId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groupRolePermissions_groupPermissionId" ON "${schema}"."groupRolePermissions" ("groupPermissionId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupCategories" ("groupId" integer NOT NULL, "categoryId" integer NOT NULL, CONSTRAINT "PK_c359b1d97e42b492e070323052c" PRIMARY KEY ("groupId", "categoryId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groupCategories_groupId" ON "${schema}"."groupCategories" ("groupId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groupCategories_categoryId" ON "${schema}"."groupCategories" ("categoryId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventCategories" ("categoriesId" integer NOT NULL, "eventsId" integer NOT NULL, CONSTRAINT "PK_3fbec7bd0afec0bb5aed1d7f9a3" PRIMARY KEY ("categoriesId", "eventsId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_eventCategories_categoriesId" ON "${schema}"."eventCategories" ("categoriesId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_eventCategories_eventsId" ON "${schema}"."eventCategories" ("eventsId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."userInterests" ("usersId" integer NOT NULL, "subcategoriesId" integer NOT NULL, CONSTRAINT "PK_0a021a19dbadecae6d249244d49" PRIMARY KEY ("usersId", "subcategoriesId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_userInterests_usersId" ON "${schema}"."userInterests" ("usersId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_userInterests_subcategoriesId" ON "${schema}"."userInterests" ("subcategoriesId")`,
    );

    // Add foreign key constraints with schema prefix
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_d01e8bdc1bf70c757dfa11597b4" FOREIGN KEY ("eventId") REFERENCES "${schema}"."events"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_ab75812b6349113ca79b9856995" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."subcategories" ADD CONSTRAINT "FK_d1fe096726c3c5b8a500950e448" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."categories"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" ADD CONSTRAINT "FK_31074d0b1b3d84d0e5b59862ed0" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" ADD CONSTRAINT "FK_f3cec163dabd9ee6e307ad32f04" FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" ADD CONSTRAINT "FK_9eea741c480d52d836b3bc5a879" FOREIGN KEY ("groupPermissionId") REFERENCES "${schema}"."groupPermissions"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" ADD CONSTRAINT "FK_707e2d7e186d11bf587210223ab" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" ADD CONSTRAINT "FK_f594fe1e68daaf3299b538fb31c" FOREIGN KEY ("groupRoleId") REFERENCES "${schema}"."groupRoles"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" ADD CONSTRAINT "FK_08cacea15f2aef324f78fddebff" FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" ADD CONSTRAINT "FK_e0522c4be8bab20520896919da0" FOREIGN KEY ("createdById") REFERENCES "${schema}"."users"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" ADD CONSTRAINT "FK_44626591821828ce1d263113128" FOREIGN KEY ("imageId") REFERENCES "${schema}"."files"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD CONSTRAINT "FK_35515e57a42f4fd00a4172371bb" FOREIGN KEY ("imageId") REFERENCES "${schema}"."files"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD CONSTRAINT "FK_9929fa8516afa13f87b41abb263" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD CONSTRAINT "FK_73672459b90f4b48f43d72681cc" FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD CONSTRAINT "FK_f856a4818b32c69dbc8811f3d2c" FOREIGN KEY ("photoId") REFERENCES "${schema}"."files"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD CONSTRAINT "FK_fffa7945e50138103659f6326b7" FOREIGN KEY ("statusId") REFERENCES "${schema}"."statuses"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD CONSTRAINT "FK_368e146b785b574f42ae9e53d5e" FOREIGN KEY ("roleId") REFERENCES "${schema}"."roles"("id")`,
    );

    // userPermissions
    await queryRunner.query(
      `CREATE TABLE "${schema}"."userPermissions" ("id" SERIAL NOT NULL, "userId" integer, "permissionId" integer, CONSTRAINT "PK_5cbba686fa42e45a2914c590261" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" ADD CONSTRAINT "FK_f9a54628e2dcdb14a6df1da8d3b" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" ADD CONSTRAINT "FK_5fcff32fd1e0d2ad9e179c06ec6" FOREIGN KEY ("permissionId") REFERENCES "${schema}"."permissions"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."sessions" ADD CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" ADD CONSTRAINT "FK_b20f4ad2fcaa0d311f925162675" FOREIGN KEY ("roleId") REFERENCES "${schema}"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" ADD CONSTRAINT "FK_5cb213a16a7b5204c8aff881518" FOREIGN KEY ("permissionId") REFERENCES "${schema}"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" ADD CONSTRAINT "FK_5d51857bafbbd071698f7365787" FOREIGN KEY ("groupRoleId") REFERENCES "${schema}"."groupRoles"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" ADD CONSTRAINT "FK_46e6c75432e2666666becab4fec" FOREIGN KEY ("groupPermissionId") REFERENCES "${schema}"."groupPermissions"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "FK_c510b553cc043b896bb49781375" FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "FK_a7e4e0b30b63776099205b15925" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."categories"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" ADD CONSTRAINT "FK_5f9d73047c3849c5b1495a80113" FOREIGN KEY ("categoriesId") REFERENCES "${schema}"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" ADD CONSTRAINT "FK_3e703b5162d4195681549dfc3e4" FOREIGN KEY ("eventsId") REFERENCES "${schema}"."events"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_6e00deadfd5a3570da93150fd6b" FOREIGN KEY ("usersId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_bb202c7e077ec68377af96ca423" FOREIGN KEY ("subcategoriesId") REFERENCES "${schema}"."subcategories"("id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop foreign key constraints
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
      `ALTER TABLE "${schema}"."sessions" DROP CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" DROP CONSTRAINT "FK_5fcff32fd1e0d2ad9e179c06ec6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" DROP CONSTRAINT "FK_f9a54628e2dcdb14a6df1da8d3b"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."chats" DROP CONSTRAINT "FK_5cbba686fa42e45a2914c590ads"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_${schema}_chats_participants"`);
    await queryRunner.query(`DROP INDEX "IDX_${schema}_chats_ulid"`);

    await queryRunner.query(
      `ALTER TABLE "${schema}"."userChats" DROP CONSTRAINT "PK_5cbba686fa42e45a2914c590ads"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_${schema}_userChats_chatId"`);
    await queryRunner.query(`DROP INDEX "IDX_${schema}_userChats_userId"`);

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
      `ALTER TABLE "${schema}"."events" DROP CONSTRAINT "FK_35515e57a42f4fd00a4172371bb"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" DROP CONSTRAINT "FK_44626591821828ce1d263113128"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" DROP CONSTRAINT "FK_e0522c4be8bab20520896919da0"`,
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

    // Drop tables, types, and indexes with schema prefix
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_userInterests_subcategoriesId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_userInterests_usersId"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."userInterests"`);

    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_eventCategories_eventsId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_eventCategories_categoriesId"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."eventCategories"`);

    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_groupCategories_categoryId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_groupCategories_groupId"`,
    );
    await queryRunner.query(`DROP TABLE "${schema}"."groupCategories"`);

    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_groupRolePermissions_groupRoleId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_groupRolePermissions_groupPermissionId"`,
    );

    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_eventRolePermissionsEvent_eventRoleId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_eventRolePermissionsEvent_eventPermissionId"`,
    );

    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_rolePermissions_permissionId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_rolePermissions_roleId"`,
    );

    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_sessions_userId"`,
    );

    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_users_lastName"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_users_firstName"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_users_socialId"`,
    );

    await queryRunner.query(`DROP TABLE "${schema}"."eventRoles"`);
    await queryRunner.query(`DROP TABLE "${schema}"."eventPermissions"`);
    await queryRunner.query(`DROP TABLE "${schema}"."eventRolePermissions"`);
    await queryRunner.query(`DROP TABLE "${schema}"."users"`);

    await queryRunner.query(`DROP TABLE "${schema}"."events"`);
    await queryRunner.query(`DROP TYPE "${schema}"."events_visibility_enum"`);
    await queryRunner.query(`DROP TYPE "${schema}"."events_status_enum"`);
    await queryRunner.query(`DROP TYPE "${schema}"."events_type_enum"`);

    await queryRunner.query(`DROP TABLE "${schema}"."categories"`);

    await queryRunner.query(`DROP TABLE "${schema}"."groups"`);
    await queryRunner.query(`DROP TYPE "${schema}"."groups_visibility_enum"`);
    await queryRunner.query(`DROP TYPE "${schema}"."groups_status_enum"`);

    await queryRunner.query(`DROP TABLE "${schema}"."groupMembers"`);

    await queryRunner.query(`DROP TABLE "${schema}"."groupRoles"`);
    await queryRunner.query(`DROP TYPE "${schema}"."groupRoles_name_enum"`);

    await queryRunner.query(`DROP TABLE "${schema}"."groupPermissions"`);

    await queryRunner.query(`DROP TABLE "${schema}"."groupRolePermissions"`);

    await queryRunner.query(`DROP TABLE "${schema}"."groupUserPermissions"`);

    await queryRunner.query(`DROP TABLE "${schema}"."subcategories"`);
    await queryRunner.query(`DROP TYPE "${schema}"."subcategories_type_enum"`);

    await queryRunner.query(`DROP TABLE "${schema}"."eventAttendees"`);
    await queryRunner.query(`DROP TYPE "${schema}"."eventAttendees_role_enum"`);
    await queryRunner.query(
      `DROP TYPE "${schema}"."eventAttendees_status_enum"`,
    );

    await queryRunner.query(`DROP TABLE "${schema}"."files"`);

    await queryRunner.query(`DROP TABLE "${schema}"."statuses"`);

    await queryRunner.query(`DROP TABLE "${schema}"."roles"`);

    await queryRunner.query(`DROP TABLE "${schema}"."permissions"`);

    await queryRunner.query(`DROP TABLE "${schema}"."rolePermissions"`);

    await queryRunner.query(`DROP TABLE "${schema}"."userPermissions"`);

    await queryRunner.query(`DROP TABLE "${schema}"."sessions"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';
import { PostgisSrid } from '../../core/constants/constant';

export class BaseTables1728637873969 implements MigrationInterface {
  name = 'BaseTables1728637873969';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Create tables and types with schema prefix
    await queryRunner.query(
      `CREATE TABLE "${schema}"."permissions" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_${schema}_permissions_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."roles" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_${schema}_roles_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."statuses" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" integer NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_${schema}_statuses_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."files" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "ulid" character varying NOT NULL, "fileName" character varying NOT NULL, "fileSize" integer NOT NULL, "mimeType" character varying NOT NULL, "path" character varying NOT NULL, CONSTRAINT "PK_${schema}_files_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TYPE "${schema}"."eventAttendees_status_enum" AS ENUM('invited', 'confirmed', 'attended', 'cancelled', 'rejected', 'maybe', 'pending', 'waitlist')`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."eventAttendees_role_enum" AS ENUM('participant', 'host', 'speaker', 'moderator', 'guest')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventAttendees" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "approvalAnswer" text, "roleId" integer NOT NULL, "eventId" integer NOT NULL, "userId" integer NOT NULL, "role" "${schema}"."eventAttendees_role_enum", "status" "${schema}"."eventAttendees_status_enum", CONSTRAINT "PK_${schema}_eventAttendees_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TYPE "${schema}"."subcategories_type_enum" AS ENUM('EVENT', 'GROUP')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."subcategories" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "title" character varying(255) NOT NULL, "description" text NOT NULL, "type" "${schema}"."subcategories_type_enum", "categoryId" integer, CONSTRAINT "PK_${schema}_subcategories_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupUserPermissions" ("id" SERIAL NOT NULL, "userId" integer, "groupId" integer, "groupPermissionId" integer, CONSTRAINT "PK_${schema}_groupUserPermissions_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TYPE "${schema}"."groupPermissions_name_enum" AS ENUM('MANAGE_GROUP', 'DELETE_GROUP', 'MANAGE_MEMBERS', 'MANAGE_EVENTS', 'MANAGE_DISCUSSIONS', 'MANAGE_REPORTS', 'MANAGE_BILLING', 'CREATE_EVENT', 'MESSAGE_DISCUSSION', 'MESSAGE_MEMBER', 'SEE_MEMBERS', 'SEE_EVENTS', 'SEE_DISCUSSIONS', 'SEE_GROUP')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupPermissions" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" "${schema}"."groupPermissions_name_enum" NOT NULL, CONSTRAINT "PK_${schema}_groupPermissions_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TYPE "${schema}"."groupRoles_name_enum" AS ENUM('owner', 'admin', 'moderator', 'member', 'guest')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupRoles" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" "${schema}"."groupRoles_name_enum" NOT NULL, CONSTRAINT "PK_${schema}_groupRoles_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupMembers" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "userId" integer, "groupRoleId" integer, "groupId" integer, CONSTRAINT "PK_${schema}_groupMembers_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TYPE "${schema}"."groups_status_enum" AS ENUM('draft', 'pending', 'published')`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."groups_visibility_enum" AS ENUM('public', 'authenticated', 'private')`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."groups" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "ulid" character varying(26) NOT NULL, "zulipChannelId" integer, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "description" text NOT NULL, "status" "${schema}"."groups_status_enum", "visibility" "${schema}"."groups_visibility_enum", "requireApproval" boolean NOT NULL DEFAULT true, "location" character varying(255), "lat" double precision, "lon" double precision, "createdById" integer, "imageId" integer, "locationPoint" geography(Point, ${PostgisSrid.SRID}), CONSTRAINT "UQ_${schema}_groups_imageId" UNIQUE ("imageId"), CONSTRAINT "PK_${schema}_groups_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groups_slug" ON "${schema}"."groups" ("slug")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."categories" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, CONSTRAINT "PK_${schema}_categories_id" PRIMARY KEY ("id"))`,
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
      `CREATE TABLE "${schema}"."events" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "ulid" character varying(26) NOT NULL, "zulipChannelId" integer, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "type" "${schema}"."events_type_enum" NOT NULL, "locationOnline" character varying(255), "description" text NOT NULL, "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP, "maxAttendees" integer, "requireApproval" boolean NOT NULL DEFAULT false, "approvalQuestion" character varying(255), "requireGroupMembership" boolean NOT NULL DEFAULT false, "location" character varying(255), "lat" double precision, "lon" double precision, "status" "${schema}"."events_status_enum", "visibility" "${schema}"."events_visibility_enum", "allowWaitlist" boolean NOT NULL DEFAULT false, "imageId" integer, "userId" integer, "groupId" integer, "locationPoint" geography(Point, ${PostgisSrid.SRID}), CONSTRAINT "UN_${schema}_events_imageId" UNIQUE ("imageId"), CONSTRAINT "PK_${schema}_events_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_events_slug" ON "${schema}"."events" ("slug")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."users" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "slug" character varying(255) NOT NULL, "ulid" character varying(26) NOT NULL, "email" character varying, "password" character varying, "provider" character varying NOT NULL DEFAULT 'email', "socialId" character varying, "firstName" character varying, "lastName" character varying, "deletedAt" TIMESTAMP, "bio" text, "zulipUserId" integer, "zulipUsername" character varying, "zulipApiKey" character varying, "photoId" integer, "statusId" integer, "roleId" integer, CONSTRAINT "UQ_${schema}_users_email" UNIQUE ("email"), CONSTRAINT "UQ_${schema}_users_photoId" UNIQUE ("photoId"), CONSTRAINT "PK_${schema}_users_id" PRIMARY KEY ("id"))`,
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
      `CREATE INDEX "IDX_${schema}_users_slug" ON "${schema}"."users" ("slug")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."chats" ("id" SERIAL NOT NULL, "ulid" character varying(26) NOT NULL, "participants" integer[], "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_${schema}_chats_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_chats_participants" ON "${schema}"."chats" ("participants")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_chats_ulid" ON "${schema}"."chats" ("ulid")`,
    );

    // userChats join table
    await queryRunner.query(
      `CREATE TABLE "${schema}"."userChats" ("userId" integer NOT NULL, "chatId" integer NOT NULL, CONSTRAINT "PK_${schema}_userChats_id" PRIMARY KEY ("userId", "chatId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_userChats_userId" ON "${schema}"."userChats" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_userChats_chatId" ON "${schema}"."userChats" ("chatId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."sessions" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "hash" character varying NOT NULL, "deletedAt" TIMESTAMP, "userId" integer, CONSTRAINT "PK_${schema}_sessions_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_sessions_userId" ON "${schema}"."sessions" ("userId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."rolePermissions" ("roleId" integer NOT NULL, "permissionId" integer NOT NULL, CONSTRAINT "PK_${schema}_rolePermissions_id" PRIMARY KEY ("roleId", "permissionId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_rolePermissions_roleId" ON "${schema}"."rolePermissions" ("roleId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_rolePermissions_permissionId" ON "${schema}"."rolePermissions" ("permissionId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventRoles" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_${schema}_eventRoles_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventPermissions" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_${schema}_eventPermissions_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventRolePermissions" ("eventRoleId" integer NOT NULL, "eventPermissionId" integer NOT NULL, CONSTRAINT "PK_${schema}_eventRolePermissions_id" PRIMARY KEY ("eventRoleId", "eventPermissionId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_eventRolePermissions_eventRoleId" ON "${schema}"."eventRolePermissions" ("eventRoleId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_eventRolePermissions_eventPermissionId" ON "${schema}"."eventRolePermissions" ("eventPermissionId") `,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupRolePermissions" ("groupRoleId" integer NOT NULL, "groupPermissionId" integer NOT NULL, CONSTRAINT "PK_${schema}_groupRolePermissions_id" PRIMARY KEY ("groupRoleId", "groupPermissionId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groupRolePermissions_groupRoleId" ON "${schema}"."groupRolePermissions" ("groupRoleId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groupRolePermissions_groupPermissionId" ON "${schema}"."groupRolePermissions" ("groupPermissionId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."groupCategories" ("groupId" integer NOT NULL, "categoryId" integer NOT NULL, CONSTRAINT "PK_${schema}_groupCategories_id" PRIMARY KEY ("groupId", "categoryId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groupCategories_groupId" ON "${schema}"."groupCategories" ("groupId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groupCategories_categoryId" ON "${schema}"."groupCategories" ("categoryId")`,
    );

    await queryRunner.query(
      `CREATE TABLE "${schema}"."eventCategories" ("categoriesId" integer NOT NULL, "eventsId" integer NOT NULL, CONSTRAINT "PK_${schema}_eventCategories_id" PRIMARY KEY ("categoriesId", "eventsId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_eventCategories_categoriesId" ON "${schema}"."eventCategories" ("categoriesId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_eventCategories_eventsId" ON "${schema}"."eventCategories" ("eventsId")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_events_name" ON "${schema}"."events" ("name")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groups_name" ON "${schema}"."groups" ("name")`,
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

    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_events_location" ON "${schema}"."events" ("location")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_events_locationPoint" ON "${schema}"."events" USING GIST ("locationPoint")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groups_location" ON "${schema}"."groups" ("location")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groups_locationPoint" ON "${schema}"."groups" USING GIST ("locationPoint")`,
    );

    // Add foreign key constraints with schema prefix
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_${schema}_eventAttendees_eventId" FOREIGN KEY ("eventId") REFERENCES "${schema}"."events"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_${schema}_eventAttendees_userId" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."subcategories" ADD CONSTRAINT "FK_${schema}_subcategories_categoryId" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."categories"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" ADD CONSTRAINT "FK_${schema}_groupUserPermissions_userId" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" ADD CONSTRAINT "FK_${schema}_groupUserPermissions_groupId" FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" ADD CONSTRAINT "FK_${schema}_groupUserPermissions_groupPermissionId" FOREIGN KEY ("groupPermissionId") REFERENCES "${schema}"."groupPermissions"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" ADD CONSTRAINT "FK_${schema}_groupMembers_userId" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" ADD CONSTRAINT "FK_${schema}_groupMembers_groupRoleId" FOREIGN KEY ("groupRoleId") REFERENCES "${schema}"."groupRoles"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" ADD CONSTRAINT "FK_${schema}_groupMembers_groupId" FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" ADD CONSTRAINT "FK_${schema}_groups_createdById" FOREIGN KEY ("createdById") REFERENCES "${schema}"."users"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" ADD CONSTRAINT "FK_${schema}_groups_imageId" FOREIGN KEY ("imageId") REFERENCES "${schema}"."files"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD CONSTRAINT "FK_${schema}_events_imageId" FOREIGN KEY ("imageId") REFERENCES "${schema}"."files"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD CONSTRAINT "FK_${schema}_events_userId" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD CONSTRAINT "FK_${schema}_events_groupId" FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD CONSTRAINT "FK_${schema}_users_photoId" FOREIGN KEY ("photoId") REFERENCES "${schema}"."files"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD CONSTRAINT "FK_${schema}_users_statusId" FOREIGN KEY ("statusId") REFERENCES "${schema}"."statuses"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" ADD CONSTRAINT "FK_${schema}_users_roleId" FOREIGN KEY ("roleId") REFERENCES "${schema}"."roles"("id")`,
    );

    // userPermissions
    await queryRunner.query(
      `CREATE TABLE "${schema}"."userPermissions" ("id" SERIAL NOT NULL, "userId" integer, "permissionId" integer, CONSTRAINT "PK_${schema}_userPermissions_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" ADD CONSTRAINT "FK_${schema}_userPermissions_userId" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" ADD CONSTRAINT "FK_${schema}_userPermissions_permissionId" FOREIGN KEY ("permissionId") REFERENCES "${schema}"."permissions"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."sessions" ADD CONSTRAINT "FK_${schema}_sessions_userId" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" ADD CONSTRAINT "FK_${schema}_rolePermissions_roleId" FOREIGN KEY ("roleId") REFERENCES "${schema}"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" ADD CONSTRAINT "FK_${schema}_rolePermissions_permissionId" FOREIGN KEY ("permissionId") REFERENCES "${schema}"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" ADD CONSTRAINT "FK_${schema}_groupRolePermissions_groupRoleId" FOREIGN KEY ("groupRoleId") REFERENCES "${schema}"."groupRoles"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" ADD CONSTRAINT "FK_${schema}_groupRolePermissions_groupPermissionId" FOREIGN KEY ("groupPermissionId") REFERENCES "${schema}"."groupPermissions"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "FK_${schema}_groupCategories_groupId" FOREIGN KEY ("groupId") REFERENCES "${schema}"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" ADD CONSTRAINT "FK_${schema}_groupCategories_categoryId" FOREIGN KEY ("categoryId") REFERENCES "${schema}"."categories"("id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" ADD CONSTRAINT "FK_${schema}_eventCategories_categoriesId" FOREIGN KEY ("categoriesId") REFERENCES "${schema}"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" ADD CONSTRAINT "FK_${schema}_eventCategories_eventsId" FOREIGN KEY ("eventsId") REFERENCES "${schema}"."events"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_${schema}_userInterests_usersId" FOREIGN KEY ("usersId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" ADD CONSTRAINT "FK_${schema}_userInterests_subcategoriesId" FOREIGN KEY ("subcategoriesId") REFERENCES "${schema}"."subcategories"("id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // Drop foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_${schema}_userInterests_subcategoriesId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userInterests" DROP CONSTRAINT "FK_${schema}_userInterests_usersId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" DROP CONSTRAINT "FK_${schema}_eventCategories_eventsId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventCategories" DROP CONSTRAINT "FK_${schema}_eventCategories_categoriesId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "FK_${schema}_groupCategories_categoryId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupCategories" DROP CONSTRAINT "FK_${schema}_groupCategories_groupId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" DROP CONSTRAINT "FK_${schema}_groupRolePermissions_groupPermissionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRolePermissions" DROP CONSTRAINT "FK_${schema}_groupRolePermissions_groupRoleId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" DROP CONSTRAINT "FK_${schema}_rolePermissions_permissionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."rolePermissions" DROP CONSTRAINT "FK_${schema}_rolePermissions_roleId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."sessions" DROP CONSTRAINT "FK_${schema}_sessions_userId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" DROP CONSTRAINT "FK_${schema}_userPermissions_permissionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userPermissions" DROP CONSTRAINT "FK_${schema}_userPermissions_userId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."chats" DROP CONSTRAINT "FK_${schema}_chats_participants"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_${schema}_chats_participants"`);
    await queryRunner.query(`DROP INDEX "IDX_${schema}_chats_ulid"`);

    await queryRunner.query(
      `ALTER TABLE "${schema}"."userChats" DROP CONSTRAINT "FK_${schema}_userChats_chatId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."userChats" DROP CONSTRAINT "FK_${schema}_userChats_userId"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_${schema}_userChats_chatId"`);
    await queryRunner.query(`DROP INDEX "IDX_${schema}_userChats_userId"`);

    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP CONSTRAINT "FK_${schema}_users_photoId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP CONSTRAINT "FK_${schema}_users_statusId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."users" DROP CONSTRAINT "FK_${schema}_users_roleId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" DROP CONSTRAINT "FK_${schema}_events_imageId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" DROP CONSTRAINT "FK_${schema}_events_groupId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" DROP CONSTRAINT "FK_${schema}_events_userId"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_${schema}_events_slug"`);

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" DROP CONSTRAINT "FK_${schema}_groups_imageId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groups" DROP CONSTRAINT "FK_${schema}_groups_createdById"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_${schema}_groups_slug"`);

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" DROP CONSTRAINT "FK_${schema}_groupMembers_userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" DROP CONSTRAINT "FK_${schema}_groupMembers_groupRoleId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupMembers" DROP CONSTRAINT "FK_${schema}_groupMembers_groupId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" DROP CONSTRAINT "FK_${schema}_groupUserPermissions_groupId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" DROP CONSTRAINT "FK_${schema}_groupUserPermissions_groupId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupUserPermissions" DROP CONSTRAINT "FK_${schema}_groupUserPermissions_groupPermissionId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."subcategories" DROP CONSTRAINT "FK_${schema}_subcategories_categoryId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP CONSTRAINT "FK_${schema}_eventAttendees_eventId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP CONSTRAINT "FK_${schema}_eventAttendees_userId"`,
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

    await queryRunner.query(`DROP INDEX "IDX_${schema}_events_location"`);

    await queryRunner.query(`DROP INDEX "IDX_${schema}_events_locationPoint"`);

    await queryRunner.query(`DROP INDEX "IDX_${schema}_groups_location"`);

    await queryRunner.query(`DROP INDEX "IDX_${schema}_groups_locationPoint"`);

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
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_users_slug"`,
    );

    await queryRunner.query(`DROP INDEX "IDX_${schema}_events_name"`);

    await queryRunner.query(`DROP INDEX "IDX_${schema}_groups_name"`);

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

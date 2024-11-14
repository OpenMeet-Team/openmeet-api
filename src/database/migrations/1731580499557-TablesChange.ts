import { MigrationInterface, QueryRunner } from 'typeorm';

export class TablesChange1731580499557 implements MigrationInterface {
  name = 'TablesChange1731580499557';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP CONSTRAINT "FK_d01e8bdc1bf70c757dfa11597b4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP CONSTRAINT "FK_ab75812b6349113ca79b9856995"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_users_socialId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_users_firstName"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_users_lastName"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_sessions_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_rolePermissions_roleId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_rolePermissions_permissionId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_eventRolePermissionsEvent_eventRoleId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_eventRolePermissionsEvent_eventPermissionId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_groupRolePermissions_groupRoleId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_groupRolePermissions_groupPermissionId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_groupCategories_groupId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_groupCategories_categoryId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_eventCategories_categoriesId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_eventCategories_eventsId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_userInterests_usersId"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_${schema}_userInterests_subcategoriesId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."permissions" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."permissions" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."roles" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."roles" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."statuses" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."statuses" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventPermissions" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventPermissions" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRoles" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRoles" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN "role"`,
    );
    await queryRunner.query(`DROP TYPE "${schema}"."eventAttendees_role_enum"`);
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupPermissions" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupPermissions" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRoles" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRoles" DROP COLUMN "createdAt"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ALTER COLUMN "ulid" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ADD CONSTRAINT "UQ_e1daabaa90700a2785c5da43218" UNIQUE ("ulid")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventPermissions" DROP COLUMN "name"`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."eventPermissions_name_enum" AS ENUM('DELETE_EVENT', 'CANCEL_EVENT', 'MANAGE_EVENT', 'APPROVE_ATTENDEES', 'DELETE_ATTENDEES', 'MANAGE_ATTENDEES', 'MANAGE_DISCUSSIONS', 'VIEW_EVENT', 'ATTEND_EVENT', 'MESSAGE_ATTENDEES', 'CREATE_DISCUSSION')`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventPermissions" ADD "name" "${schema}"."eventPermissions_name_enum" NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRoles" DROP COLUMN "name"`,
    );
    await queryRunner.query(
      `CREATE TYPE "${schema}"."eventRoles_name_enum" AS ENUM('participant', 'host', 'speaker', 'moderator', 'guest')`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRoles" ADD "name" "${schema}"."eventRoles_name_enum" NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ALTER COLUMN "roleId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ALTER COLUMN "eventId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ALTER COLUMN "userId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ALTER COLUMN "ulid" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD CONSTRAINT "UQ_c716a0aae814bb19b8288e4a456" UNIQUE ("ulid")`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ADD CONSTRAINT "UQ_05bd884c03d3f424e2204bd14cd" UNIQUE ("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_05bd884c03d3f424e2204bd14c" ON "${schema}"."events" ("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2025eaefc4e1b443c84f6ca9b2" ON "${schema}"."users" ("socialId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5372672fbfd1677205e0ce3ece" ON "${schema}"."users" ("firstName")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_af99afb7cf88ce20aff6977e68" ON "${schema}"."users" ("lastName")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_57de40bc620f456c7311aa3a1e" ON "${schema}"."sessions" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b20f4ad2fcaa0d311f92516267" ON "${schema}"."rolePermissions" ("roleId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5cb213a16a7b5204c8aff88151" ON "${schema}"."rolePermissions" ("permissionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0dfd32e24c40102e09fc721c83" ON "${schema}"."eventRolePermissions" ("eventRoleId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f35c31824cbe48e13c91f27990" ON "${schema}"."eventRolePermissions" ("eventPermissionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5d51857bafbbd071698f736578" ON "${schema}"."groupRolePermissions" ("groupRoleId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_46e6c75432e2666666becab4fe" ON "${schema}"."groupRolePermissions" ("groupPermissionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c510b553cc043b896bb4978137" ON "${schema}"."groupCategories" ("groupId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a7e4e0b30b63776099205b1592" ON "${schema}"."groupCategories" ("categoryId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5f9d73047c3849c5b1495a8011" ON "${schema}"."eventCategories" ("categoriesId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3e703b5162d4195681549dfc3e" ON "${schema}"."eventCategories" ("eventsId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6e00deadfd5a3570da93150fd6" ON "${schema}"."userInterests" ("usersId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bb202c7e077ec68377af96ca42" ON "${schema}"."userInterests" ("subcategoriesId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_6daa82c66f03182e2ab57dc589b" FOREIGN KEY ("roleId") REFERENCES "${schema}"."eventRoles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_d01e8bdc1bf70c757dfa11597b4" FOREIGN KEY ("eventId") REFERENCES "${schema}"."events"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_ab75812b6349113ca79b9856995" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRolePermissions" ADD CONSTRAINT "FK_0dfd32e24c40102e09fc721c833" FOREIGN KEY ("eventRoleId") REFERENCES "${schema}"."eventRoles"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRolePermissions" ADD CONSTRAINT "FK_f35c31824cbe48e13c91f279905" FOREIGN KEY ("eventPermissionId") REFERENCES "${schema}"."eventPermissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    // Adding the schema in this migration as in your query
    // await queryRunner.query(`CREATE TABLE "${schema}"."statuses" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" integer NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_2fd3770acdb67736f1a3e3d5399" PRIMARY KEY ("id"))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = queryRunner.connection.options.name || 'public';

    // await queryRunner.query(`DROP TABLE "${schema}"."statuses"`);

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRolePermissions" DROP CONSTRAINT "FK_f35c31824cbe48e13c91f279905"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRolePermissions" DROP CONSTRAINT "FK_0dfd32e24c40102e09fc721c833"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP CONSTRAINT "FK_ab75812b6349113ca79b9856995"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP CONSTRAINT "FK_d01e8bdc1bf70c757dfa11597b4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP CONSTRAINT "FK_6daa82c66f03182e2ab57dc589b"`,
    );

    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_bb202c7e077ec68377af96ca42"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_6e00deadfd5a3570da93150fd6"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_3e703b5162d4195681549dfc3e"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5f9d73047c3849c5b1495a8011"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_a7e4e0b30b63776099205b1592"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_c510b553cc043b896bb4978137"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_46e6c75432e2666666becab4fe"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5d51857bafbbd071698f736578"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_f35c31824cbe48e13c91f27990"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_0dfd32e24c40102e09fc721c83"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5cb213a16a7b5204c8aff88151"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_b20f4ad2fcaa0d311f92516267"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_57de40bc620f456c7311aa3a1e"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_af99afb7cf88ce20aff6977e68"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_5372672fbfd1677205e0ce3ece"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_2025eaefc4e1b443c84f6ca9b2"`,
    );
    await queryRunner.query(
      `DROP INDEX "${schema}"."IDX_05bd884c03d3f424e2204bd14c"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" DROP CONSTRAINT "UQ_05bd884c03d3f424e2204bd14cd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" DROP CONSTRAINT "UQ_c716a0aae814bb19b8288e4a456"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."events" ALTER COLUMN "ulid" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ALTER COLUMN "userId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ALTER COLUMN "eventId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ALTER COLUMN "roleId" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRoles" DROP COLUMN "name"`,
    );
    await queryRunner.query(`DROP TYPE "${schema}"."eventRoles_name_enum"`);
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRoles" ADD "name" character varying(255) NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventPermissions" DROP COLUMN "name"`,
    );
    await queryRunner.query(
      `DROP TYPE "${schema}"."eventPermissions_name_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventPermissions" ADD "name" character varying(255) NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" DROP CONSTRAINT "UQ_e1daabaa90700a2785c5da43218"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."files" ALTER COLUMN "ulid" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" DROP COLUMN "createdAt"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRoles" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupRoles" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupPermissions" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."groupPermissions" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );

    await queryRunner.query(
      `CREATE TYPE "${schema}"."eventAttendees_role_enum" AS ENUM('participant', 'host', 'speaker', 'moderator', 'guest')`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD "role" "${schema}"."eventAttendees_role_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRoles" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventRoles" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventPermissions" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventPermissions" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."statuses" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."statuses" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."roles" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."roles" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."permissions" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."permissions" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_userInterests_subcategoriesId" ON "${schema}"."userInterests" ("subcategoriesId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_userInterests_usersId" ON "${schema}"."userInterests" ("usersId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_eventCategories_eventsId" ON "${schema}"."eventCategories" ("eventsId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_eventCategories_categoriesId" ON "${schema}"."eventCategories" ("categoriesId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groupCategories_categoryId" ON "${schema}"."groupCategories" ("categoryId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groupCategories_groupId" ON "${schema}"."groupCategories" ("groupId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groupRolePermissions_groupPermissionId" ON "${schema}"."groupRolePermissions" ("groupPermissionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_groupRolePermissions_groupRoleId" ON "${schema}"."groupRolePermissions" ("groupRoleId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_eventRolePermissionsEvent_eventPermissionId" ON "${schema}"."eventRolePermissions" ("eventPermissionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_eventRolePermissionsEvent_eventRoleId" ON "${schema}"."eventRolePermissions" ("eventRoleId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_rolePermissions_permissionId" ON "${schema}"."rolePermissions" ("permissionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_rolePermissions_roleId" ON "${schema}"."rolePermissions" ("roleId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_sessions_userId" ON "${schema}"."sessions" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_users_lastName" ON "${schema}"."users" ("lastName")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_users_firstName" ON "${schema}"."users" ("firstName")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_${schema}_users_socialId" ON "${schema}"."users" ("socialId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_ab75812b6349113ca79b9856995" FOREIGN KEY ("userId") REFERENCES "${schema}"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "${schema}"."eventAttendees" ADD CONSTRAINT "FK_d01e8bdc1bf70c757dfa11597b4" FOREIGN KEY ("eventId") REFERENCES "${schema}"."events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}

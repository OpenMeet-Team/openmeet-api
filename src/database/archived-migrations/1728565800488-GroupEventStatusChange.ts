import { MigrationInterface, QueryRunner } from 'typeorm';

export class GroupEventStatusChange1728565800488 implements MigrationInterface {
  name = 'GroupEventStatusChange1728565800488';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "userPermissions" DROP CONSTRAINT "FK_5fcff32fd1e0d2ad9e179c06ec6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "eventAttendees" DROP CONSTRAINT "FK_d01e8bdc1bf70c757dfa11597b4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subCategory" DROP CONSTRAINT "FK_e84f5e6499f4f3e12aef86d6c3f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_user_permissions" DROP CONSTRAINT "FK_8238590de6e70a455b53c40e022"`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupMember" DROP CONSTRAINT "FK_28166f82e7f80ccf53d396182e1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rolePermissions" DROP CONSTRAINT "FK_5cb213a16a7b5204c8aff881518"`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupCategories" DROP CONSTRAINT "FK_a7e4e0b30b63776099205b15925"`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupCategories" DROP CONSTRAINT "FK_c510b553cc043b896bb49781375"`,
    );
    await queryRunner.query(
      `ALTER TABLE "eventCategories" DROP CONSTRAINT "FK_d51bbedb963a7d4d1f6b526b4a9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "eventCategories" DROP CONSTRAINT "FK_dc068501e56c37f17ad7b35b068"`,
    );
    await queryRunner.query(
      `CREATE TABLE "permissions" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."group_status_enum" AS ENUM('draft', 'pending', 'published')`,
    );
    await queryRunner.query(
      `CREATE TABLE "group" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "description" text NOT NULL, "approved" boolean NOT NULL DEFAULT false, "status" "public"."group_status_enum", CONSTRAINT "PK_256aa0fda9b1de1a73ee0b7106b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "category" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "slug" character varying(255), CONSTRAINT "PK_9c4e4a89e3674fc9f382d733f03" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."event_status_enum" AS ENUM('draft', 'pending', 'published')`,
    );
    await queryRunner.query(
      `CREATE TABLE "event" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "image" character varying(255), "type" character varying(255) NOT NULL, "locationOnline" character varying(255), "description" text NOT NULL, "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP, "maxAttendees" integer, "location" character varying(255), "lat" double precision, "lon" double precision, "is_public" boolean NOT NULL DEFAULT false, "status" "public"."event_status_enum", "userId" integer, "groupId" integer, CONSTRAINT "PK_30c2f3bbaf6d34a55f8ae6e4614" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "role" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "role" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "status" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "status" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "file" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "file" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "subCategory" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "subCategory" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupPermission" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupPermission" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupRole" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupRole" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupMember" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupMember" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "userPermissions" ADD CONSTRAINT "FK_5fcff32fd1e0d2ad9e179c06ec6" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "eventAttendees" ADD CONSTRAINT "FK_d01e8bdc1bf70c757dfa11597b4" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subCategory" ADD CONSTRAINT "FK_e84f5e6499f4f3e12aef86d6c3f" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_user_permissions" ADD CONSTRAINT "FK_8238590de6e70a455b53c40e022" FOREIGN KEY ("groupId") REFERENCES "group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupMember" ADD CONSTRAINT "FK_28166f82e7f80ccf53d396182e1" FOREIGN KEY ("groupId") REFERENCES "group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "event" ADD CONSTRAINT "FK_01cd2b829e0263917bf570cb672" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "event" ADD CONSTRAINT "FK_0a28dcf5832d1068df34fc59e46" FOREIGN KEY ("groupId") REFERENCES "group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rolePermissions" ADD CONSTRAINT "FK_5cb213a16a7b5204c8aff881518" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupCategories" ADD CONSTRAINT "FK_c510b553cc043b896bb49781375" FOREIGN KEY ("groupId") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupCategories" ADD CONSTRAINT "FK_a7e4e0b30b63776099205b15925" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "eventCategories" ADD CONSTRAINT "FK_dc068501e56c37f17ad7b35b068" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "eventCategories" ADD CONSTRAINT "FK_d51bbedb963a7d4d1f6b526b4a9" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "eventCategories" DROP CONSTRAINT "FK_d51bbedb963a7d4d1f6b526b4a9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "eventCategories" DROP CONSTRAINT "FK_dc068501e56c37f17ad7b35b068"`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupCategories" DROP CONSTRAINT "FK_a7e4e0b30b63776099205b15925"`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupCategories" DROP CONSTRAINT "FK_c510b553cc043b896bb49781375"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rolePermissions" DROP CONSTRAINT "FK_5cb213a16a7b5204c8aff881518"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event" DROP CONSTRAINT "FK_0a28dcf5832d1068df34fc59e46"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event" DROP CONSTRAINT "FK_01cd2b829e0263917bf570cb672"`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupMember" DROP CONSTRAINT "FK_28166f82e7f80ccf53d396182e1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_user_permissions" DROP CONSTRAINT "FK_8238590de6e70a455b53c40e022"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subCategory" DROP CONSTRAINT "FK_e84f5e6499f4f3e12aef86d6c3f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "eventAttendees" DROP CONSTRAINT "FK_d01e8bdc1bf70c757dfa11597b4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "userPermissions" DROP CONSTRAINT "FK_5fcff32fd1e0d2ad9e179c06ec6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupMember" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupMember" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(`ALTER TABLE "groupRole" DROP COLUMN "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "groupRole" DROP COLUMN "createdAt"`);
    await queryRunner.query(
      `ALTER TABLE "groupPermission" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupPermission" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subCategory" DROP COLUMN "updatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subCategory" DROP COLUMN "createdAt"`,
    );
    await queryRunner.query(`ALTER TABLE "file" DROP COLUMN "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "file" DROP COLUMN "createdAt"`);
    await queryRunner.query(`ALTER TABLE "status" DROP COLUMN "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "status" DROP COLUMN "createdAt"`);
    await queryRunner.query(`ALTER TABLE "role" DROP COLUMN "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "role" DROP COLUMN "createdAt"`);
    await queryRunner.query(`DROP TABLE "event"`);
    await queryRunner.query(`DROP TYPE "public"."event_status_enum"`);
    await queryRunner.query(`DROP TABLE "category"`);
    await queryRunner.query(`DROP TABLE "group"`);
    await queryRunner.query(`DROP TYPE "public"."group_status_enum"`);
    await queryRunner.query(`DROP TABLE "permissions"`);
    await queryRunner.query(
      `ALTER TABLE "eventCategories" ADD CONSTRAINT "FK_dc068501e56c37f17ad7b35b068" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "eventCategories" ADD CONSTRAINT "FK_d51bbedb963a7d4d1f6b526b4a9" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupCategories" ADD CONSTRAINT "FK_c510b553cc043b896bb49781375" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupCategories" ADD CONSTRAINT "FK_a7e4e0b30b63776099205b15925" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rolePermissions" ADD CONSTRAINT "FK_5cb213a16a7b5204c8aff881518" FOREIGN KEY ("permissionId") REFERENCES "Permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "groupMember" ADD CONSTRAINT "FK_28166f82e7f80ccf53d396182e1" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "group_user_permissions" ADD CONSTRAINT "FK_8238590de6e70a455b53c40e022" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "subCategory" ADD CONSTRAINT "FK_e84f5e6499f4f3e12aef86d6c3f" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "eventAttendees" ADD CONSTRAINT "FK_d01e8bdc1bf70c757dfa11597b4" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "userPermissions" ADD CONSTRAINT "FK_5fcff32fd1e0d2ad9e179c06ec6" FOREIGN KEY ("permissionId") REFERENCES "Permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}

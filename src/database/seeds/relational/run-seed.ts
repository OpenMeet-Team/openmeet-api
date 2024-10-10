import { NestFactory } from '@nestjs/core';
import { RoleSeedService } from './role/role-seed.service';
import { SeedModule } from './seed.module';
import { StatusSeedService } from './status/status-seed.service';
import { UserSeedService } from './user/user-seed.service';
import { CategorySeedService } from './category/category-seed.service';
import { PermissionSeedService } from './permission/permission-seed.service';
import { UserPermissionSeedService } from './user-permission/user-permission-seed.service';
import { GroupRoleSeedService } from './group-role/group-role.service';
// import { InterestSeedService } from './interest/interest-seed.service';

const tenantIds = ['1']; // List of tenant IDs

const runSeed = async () => {
  const app = await NestFactory.create(SeedModule);
  for (const tenantId of tenantIds) {
    // run
    await app.get(RoleSeedService).run(tenantId);
    await app.get(StatusSeedService).run(tenantId);
    await app.get(UserSeedService).run(tenantId);
    await app.get(CategorySeedService).run(tenantId);
    await app.get(PermissionSeedService).run(tenantId);
    await app.get(UserPermissionSeedService).run(tenantId);
    await app.get(GroupRoleSeedService).run(tenantId);
  }
  await app.close();
};

void runSeed();

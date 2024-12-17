import { NestFactory } from '@nestjs/core';
import { EventPermissionSeedService } from './event-permission/event-permission-seed.service';
import { EventRoleSeedService } from './event-role/event-role-seed.service';
import { GroupPermissionSeedService } from './group-permission/group-permission-seed.service';
import { EventSeedService } from './event/event-seed.service';
import { GroupSeedService } from './group/group-seed.service';
import { RoleSeedService } from './role/role-seed.service';
import { SeedModule } from './seed.module';
import { StatusSeedService } from './status/status-seed.service';
import { UserSeedService } from './user/user-seed.service';
import { CategorySeedService } from './category/category-seed.service';
import { PermissionSeedService } from './permission/permission-seed.service';
import { UserPermissionSeedService } from './user-permission/user-permission-seed.service';
import { GroupRoleSeedService } from './group-role/group-role.service';
import { fetchTenants } from '../../../utils/tenant-config';
import { env } from 'process';
import { TenantConfig } from '../../../core/constants/constant';
const runSeed = async () => {
  const tenants: TenantConfig[] = fetchTenants();
  const tenantIds = tenants.map((t) => t.id).filter((id) => !!id); // filter out 'public'

  const app = await NestFactory.create(SeedModule);
  for (const tenantId of tenantIds) {
    console.log('Running seeds for tenant:', tenantId);

    await app.get(StatusSeedService).run(tenantId);
    await app.get(PermissionSeedService).run(tenantId);
    await app.get(UserPermissionSeedService).run(tenantId);
    await app.get(RoleSeedService).run(tenantId);
    await app.get(GroupPermissionSeedService).run(tenantId);
    await app.get(GroupRoleSeedService).run(tenantId);
    await app.get(EventPermissionSeedService).run(tenantId);
    await app.get(EventRoleSeedService).run(tenantId);
    await app.get(UserSeedService).run(tenantId);
    await app.get(CategorySeedService).run(tenantId);

    if (env.NODE_ENV !== 'production') {
      await app.get(GroupSeedService).run(tenantId);
      await app.get(EventSeedService).run(tenantId);
    }
  }

  await app.close();
};

void runSeed();

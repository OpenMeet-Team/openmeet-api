import { Global, Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { UsersService } from '../users/users.service';
import { GroupService } from '../groups/groups.service';
import { UsersModule } from '../users/users.module';
import { GroupModule } from '../groups/groups.module';

@Module({
  // imports: [UsersModule, GroupModule],
  providers: [UsersService, GroupService],
  exports: [UsersService, GroupService],
  // exports: [UsersModule, GroupModule], // Export the services
})
export class AuthModule {}

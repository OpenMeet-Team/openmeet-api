import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { GroupController } from './groups.controller';
import { GroupService } from './groups.service';
import { CategoryService } from '../categories/categories.service';
import { GroupMemberEntity } from '../group-members/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupUserPermissionEntity } from './infrastructure/persistence/relational/entities/group-user-permission.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupEntity,
      GroupMemberEntity,
      GroupUserPermissionEntity,
    ]),
    UsersModule,
  ],
  controllers: [GroupController],
  providers: [GroupService, TenantConnectionService, CategoryService],
  exports: [GroupService],
})
export class GroupModule {}

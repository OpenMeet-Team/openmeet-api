import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { CategoryService } from '../category/category.service';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupUserPermissionEntity } from './infrastructure/persistence/relational/entities/group-user-permission.entity';
import { UsersModule } from '../user/user.module';
import { GroupMemberModule } from '../group-member/group-member.module';
import { EventsModule } from '../event/event.module';
import { AuthModule } from '../auth/auth.module';
import { EventService } from '../event/event.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupEntity,
      GroupMemberEntity,
      GroupUserPermissionEntity,
    ]),
    UsersModule,
    GroupMemberModule,
  ],
  controllers: [GroupController],
  providers: [GroupService, TenantConnectionService, CategoryService, EventService],
  exports: [GroupService],
})
export class GroupModule {}

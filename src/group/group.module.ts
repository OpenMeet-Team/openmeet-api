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
import { EventService } from '../event/event.service';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupEntity,
      GroupMemberEntity,
      GroupUserPermissionEntity,
    ]),
    UsersModule,
    GroupMemberModule,
    EventAttendeeModule,
  ],
  controllers: [GroupController],
  providers: [
    GroupService,
    TenantConnectionService,
    CategoryService,
    EventService,
    EventEmitter2,
  ],
  exports: [GroupService],
})
export class GroupModule {}

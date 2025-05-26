import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupUserPermissionEntity } from './infrastructure/persistence/relational/entities/group-user-permission.entity';
import { UserModule } from '../user/user.module';
import { CategoryModule } from '../category/category.module';
import { GroupMemberModule } from '../group-member/group-member.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { GroupRoleModule } from '../group-role/group-role.module';
import { EventRoleModule } from '../event-role/event-role.module';
import { FileModule } from '../file/file.module';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FileEntity } from '../file/infrastructure/persistence/relational/entities/file.entity';
import { AuthModule } from '../auth/auth.module';
import { GroupListener } from './group.listener';
import { EventModule } from '../event/event.module';
import { BlueskyModule } from '../bluesky/bluesky.module';
import { ChatModule } from '../chat/chat.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      GroupEntity,
      GroupMemberEntity,
      GroupUserPermissionEntity,
      FileEntity,
    ]),
    UserModule,
    CategoryModule,
    forwardRef(() => GroupMemberModule),
    forwardRef(() => EventAttendeeModule),
    GroupRoleModule,
    EventRoleModule,
    FileModule,
    forwardRef(() => AuthModule),
    forwardRef(() => EventModule),
    BlueskyModule,
    forwardRef(() => ChatModule),
  ],
  controllers: [GroupController],
  providers: [
    GroupService,
    TenantConnectionService,
    EventEmitter2,
    GroupListener,
  ],
  exports: [GroupService],
})
export class GroupModule {}

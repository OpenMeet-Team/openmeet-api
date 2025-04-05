import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { CategoryService } from '../category/category.service';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupUserPermissionEntity } from './infrastructure/persistence/relational/entities/group-user-permission.entity';
import { UserModule } from '../user/user.module';
import { GroupMemberModule } from '../group-member/group-member.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FileEntity } from '../file/infrastructure/persistence/relational/entities/file.entity';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { GroupRoleService } from '../group-role/group-role.service';
import { MailModule } from '../mail/mail.module';
import { EventRoleService } from '../event-role/event-role.service';
import { AuthModule } from '../auth/auth.module';
import { GroupListener } from './group.listener';
import { GroupMailService } from '../group-mail/group-mail.service';
import { GroupMailModule } from '../group-mail/group-mail.module';
import { EventModule } from '../event/event.module';
import { EventMailModule } from '../event-mail/event-mail.module';
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
    MailModule,
    GroupMemberModule,
    EventAttendeeModule,
    forwardRef(() => AuthModule),
    GroupMailModule,
    forwardRef(() => EventModule),
    EventMailModule,
    BlueskyModule,
    forwardRef(() => ChatModule),
  ],
  controllers: [GroupController],
  providers: [
    GroupService,
    TenantConnectionService,
    CategoryService,
    EventEmitter2,
    FilesS3PresignedService,
    GroupRoleService,
    EventRoleService,
    GroupListener,
    GroupMailService,
  ],
  exports: [GroupService],
})
export class GroupModule {}

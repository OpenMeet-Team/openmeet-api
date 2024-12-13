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
import { EventService } from '../event/event.service';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FileEntity } from '../file/infrastructure/persistence/relational/entities/file.entity';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { GroupRoleService } from '../group-role/group-role.service';
import { ZulipService } from '../zulip/zulip.service';
import { MailModule } from '../mail/mail.module';
import { EventRoleService } from 'src/event-role/event-role.service';
import { ZulipModule } from 'src/zulip/zulip.module';
import { AuthModule } from '../auth/auth.module';
import { GroupListener } from './group.listener';
import { GroupMailService } from '../group-mail/group-mail.service';
import { GroupMailModule } from 'src/group-mail/group-mail.module';
import { EventModule } from '../event/event.module';

@Module({
  imports: [
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
    ZulipModule,
    forwardRef(() => AuthModule),
    GroupMailModule,
    forwardRef(() => EventModule),
  ],
  controllers: [GroupController],
  providers: [
    GroupService,
    TenantConnectionService,
    CategoryService,
    EventService,
    EventEmitter2,
    FilesS3PresignedService,
    GroupRoleService,
    ZulipService,
    EventRoleService,
    GroupListener,
    GroupMailService,
  ],
  exports: [GroupService],
})
export class GroupModule {}

import { forwardRef, Module } from '@nestjs/common';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { TenantModule } from '../tenant/tenant.module';
import { CategoryModule } from '../category/category.module';
import { AuthModule } from '../auth/auth.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { EventListener } from './event.listener';
import { GroupMemberModule } from '../group-member/group-member.module';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { FileModule } from '../file/file.module';
import { ZulipService } from '../zulip/zulip.service';
import { EventRoleService } from '../event-role/event-role.service';
import { UserModule } from '../user/user.module';
import { GroupModule } from '../group/group.module';
import { EventMailModule } from 'src/event-mail/event-mail.module';
import { JsonLogger } from '../logger/json.logger';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity]),
    TenantModule,
    GroupMemberModule,
    CategoryModule,
    forwardRef(() => AuthModule),
    EventAttendeeModule,
    FileModule,
    UserModule,
    forwardRef(() => GroupModule),
    EventMailModule,
  ],
  controllers: [EventController],
  providers: [
    EventService,
    FilesS3PresignedService,
    EventListener,
    ZulipService,
    EventRoleService,
    {
      provide: 'Logger',
      useClass: JsonLogger,
    },
  ],
  exports: [EventService],
})
export class EventModule {}

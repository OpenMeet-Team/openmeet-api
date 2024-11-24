import { forwardRef, Module } from '@nestjs/common';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { TenantModule } from '../tenant/tenant.module';
import { CategoryModule } from '../category/category.module';
import { AuthModule } from '../auth/auth.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { ChannelCreatedListener } from './event.listener';
import { GroupMemberModule } from '../group-member/group-member.module';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { FileModule } from '../file/file.module';
import { ZulipService } from '../zulip/zulip.service';
import { EventRoleService } from 'src/event-role/event-role.service';
import { UserModule } from 'src/user/user.module';

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
  ],
  controllers: [EventController],
  providers: [
    EventService,
    FilesS3PresignedService,
    ChannelCreatedListener,
    ZulipService,
    EventRoleService,
  ],
  exports: [EventService],
})
export class EventModule {}

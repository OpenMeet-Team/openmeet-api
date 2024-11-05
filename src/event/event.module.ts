import { Module } from '@nestjs/common';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { TenantModule } from '../tenant/tenant.module';
import { CategoryModule } from '../category/category.module';
import { AuthModule } from '../auth/auth.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { ChannelCreatedListener } from './channel-created.listener';
import { GroupMemberModule } from '../group-member/group-member.module';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { FileModule } from '../file/file.module';
import { ZulipService } from '../zulip/zulip.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity]),
    TenantModule,
    GroupMemberModule,
    CategoryModule,
    AuthModule,
    EventAttendeeModule,
    FileModule,
  ],
  controllers: [EventController],
  providers: [
    EventService,
    FilesS3PresignedService,
    ChannelCreatedListener,
    ZulipService,
  ],
  exports: [EventService],
})
export class EventModule {}

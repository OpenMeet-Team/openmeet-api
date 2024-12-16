import { Module } from '@nestjs/common';
import { EventIngestionService } from './event-ingestion.service';
import { ConfigModule } from '@nestjs/config';
import { EventModule } from '../event/event.module';
import { FileModule } from '../file/file.module';
import { TenantModule } from '../tenant/tenant.module';
import { CategoryModule } from '../category/category.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { GroupMemberModule } from '../group-member/group-member.module';
import { FilesS3PresignedModule } from '../file/infrastructure/uploader/s3-presigned/file.module';
import { ZulipModule } from '../zulip/zulip.module';
import { EventRoleModule } from '../event-role/event-role.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    ConfigModule,
    GroupMemberModule,
    EventModule,
    FileModule,
    TenantModule,
    CategoryModule,
    EventAttendeeModule,
    FilesS3PresignedModule,
    ZulipModule,
    EventRoleModule,
    UserModule,
  ],
  providers: [EventIngestionService],
  exports: [EventIngestionService],
})
export class EventIngestionModule {}

import { forwardRef, Module, Provider } from '@nestjs/common';
import { EventController } from './event.controller';
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
import { EventRoleService } from '../event-role/event-role.service';
import { UserModule } from '../user/user.module';
import { GroupModule } from '../group/group.module';
import { EventMailModule } from '../event-mail/event-mail.module';
import { BlueskyModule } from '../bluesky/bluesky.module';
import { ShadowAccountModule } from '../shadow-account/shadow-account.module';
import { EventManagementService } from './services/event-management.service';
import { EventQueryService } from './services/event-query.service';
import { EventRecommendationService } from './services/event-recommendation.service';
import { ChatModule } from '../chat/chat.module';
import { ICalendarService } from './services/ical/ical.service';
import { EventSeriesModule } from '../event-series/event-series.module';
import { ConfigModule } from '@nestjs/config';
import { EventIntegrationController } from './event-integration.controller';
import { EventIntegrationService } from './services/event-integration.service';

// Create a provider for the DiscussionService
const discussionServiceProvider: Provider = {
  provide: 'DiscussionService',
  useValue: {}, // Providing an empty object since it's optional
};

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([EventEntity]),
    TenantModule,
    forwardRef(() => GroupMemberModule),
    CategoryModule,
    forwardRef(() => AuthModule),
    forwardRef(() => EventAttendeeModule),
    FileModule,
    UserModule,
    forwardRef(() => GroupModule),
    EventMailModule,
    BlueskyModule,
    ShadowAccountModule,
    forwardRef(() => ChatModule),
    forwardRef(() => EventSeriesModule),
  ],
  controllers: [EventController, EventIntegrationController],
  providers: [
    EventManagementService,
    EventQueryService,
    EventRecommendationService,
    FilesS3PresignedService,
    EventListener,
    EventRoleService,
    ICalendarService,
    EventIntegrationService,
    discussionServiceProvider,
  ],
  exports: [
    EventManagementService,
    EventQueryService,
    EventRecommendationService,
    EventIntegrationService,
  ],
})
export class EventModule {}

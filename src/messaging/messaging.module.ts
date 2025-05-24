import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// Entities
import { MessageDraftEntity } from './entities/message-draft.entity';
import { MessageLogEntity } from './entities/message-log.entity';
import { MessageAuditEntity } from './entities/message-audit.entity';

// Services
import { UnifiedMessagingService } from './services/unified-messaging.service';
import { MessageDraftService } from './services/message-draft.service';
import { MessageAuditService } from './services/message-audit.service';
import { MessagePauseService } from './services/message-pause.service';
import { MailAdapterService } from './services/mail-adapter.service';

// Controllers
import { MessagingController } from './messaging.controller';

// External modules
import { TenantModule } from '../tenant/tenant.module';
import { MailModule } from '../mail/mail.module';
import { GroupMemberModule } from '../group-member/group-member.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { GroupModule } from '../group/group.module';
import { EventModule } from '../event/event.module';
import { UserModule } from '../user/user.module';
import { ElastiCacheModule } from '../elasticache/elasticache.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      MessageDraftEntity,
      MessageLogEntity,
      MessageAuditEntity,
    ]),
    TenantModule,
    MailModule,
    forwardRef(() => GroupMemberModule),
    forwardRef(() => EventAttendeeModule),
    forwardRef(() => GroupModule),
    forwardRef(() => EventModule),
    forwardRef(() => UserModule),
    forwardRef(() => AuthModule),
    ElastiCacheModule,
  ],
  providers: [
    UnifiedMessagingService,
    MessageDraftService,
    MessageAuditService,
    MessagePauseService,
    MailAdapterService,
  ],
  controllers: [MessagingController],
  exports: [
    UnifiedMessagingService,
    MessageDraftService,
    MessageAuditService,
    MessagePauseService,
    MailAdapterService,
  ],
})
export class MessagingModule {}

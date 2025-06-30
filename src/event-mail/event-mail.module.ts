import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventMailService } from './event-mail.service';
import { EventAnnouncementService } from './services/event-announcement.service';
import { MailModule } from '../mail/mail.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { MailService } from '../mail/mail.service';
import { MailerModule } from '../mailer/mailer.module';
import { TenantModule } from '../tenant/tenant.module';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from '../user/user.module';
import { EventModule } from '../event/event.module';
import { GroupMemberModule } from '../group-member/group-member.module';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([EventEntity, GroupMemberEntity]),
    MailModule,
    forwardRef(() => UserModule),
    forwardRef(() => EventAttendeeModule),
    MailerModule,
    TenantModule,
    forwardRef(() => EventModule),
    forwardRef(() => GroupMemberModule),
  ],
  providers: [EventMailService, EventAnnouncementService, MailService],
  exports: [EventMailService, EventAnnouncementService],
})
export class EventMailModule {}

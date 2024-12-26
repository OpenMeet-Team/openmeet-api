import { Module } from '@nestjs/common';
import { EventMailService } from './event-mail.service';
import { MailModule } from '../mail/mail.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { MailService } from '../mail/mail.service';
import { MailerModule } from '../mailer/mailer.module';
import { TenantModule } from '../tenant/tenant.module';
@Module({
  imports: [MailModule, EventAttendeeModule, MailerModule, TenantModule],
  providers: [EventMailService, MailService],
  exports: [EventMailService],
})
export class EventMailModule {}

import { Module } from '@nestjs/common';
import { EventMailService } from './event-mail.service';
import { MailModule } from 'src/mail/mail.module';
import { EventAttendeeModule } from 'src/event-attendee/event-attendee.module';

@Module({
  providers: [EventMailService],
  exports: [EventMailService],
  imports: [MailModule, EventAttendeeModule],
})
export class EventMailModule {}

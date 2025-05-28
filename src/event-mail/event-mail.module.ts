import { Module, forwardRef } from '@nestjs/common';
import { EventMailService } from './event-mail.service';
import { MailModule } from '../mail/mail.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { MailService } from '../mail/mail.service';
import { MailerModule } from '../mailer/mailer.module';
import { TenantModule } from '../tenant/tenant.module';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    ConfigModule,
    MailModule,
    UserModule,
    forwardRef(() => EventAttendeeModule),
    MailerModule,
    TenantModule,
  ],
  providers: [EventMailService, MailService],
  exports: [EventMailService],
})
export class EventMailModule {}

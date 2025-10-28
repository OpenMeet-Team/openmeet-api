import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailService } from './mail.service';
import { MailerModule } from '../mailer/mailer.module';
import { TenantModule } from '../tenant/tenant.module';
import { MailController } from './mail.controller';
import { CalendarInviteService } from './services/calendar-invite.service';

@Module({
  imports: [ConfigModule, MailerModule, TenantModule],
  providers: [MailService, MailController, CalendarInviteService],
  exports: [MailService, CalendarInviteService],
  controllers: [MailController],
})
export class MailModule {}

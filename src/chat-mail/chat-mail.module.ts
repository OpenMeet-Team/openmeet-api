import { Module } from '@nestjs/common';
import { ChatMailService } from './chat-mail.service';
import { MailService } from '../mail/mail.service';
import { MailerModule } from '../mailer/mailer.module';
import { TenantModule } from '../tenant/tenant.module';
@Module({
  imports: [MailerModule, TenantModule],
  providers: [ChatMailService, MailService],
  exports: [ChatMailService],
})
export class ChatMailModule {}

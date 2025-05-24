import { Module } from '@nestjs/common';
import { EmailSenderService } from './email-sender.service';
import { MailerModule } from '../mailer/mailer.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [MailerModule, TenantModule],
  providers: [EmailSenderService],
  exports: [EmailSenderService],
})
export class EmailSenderModule {}

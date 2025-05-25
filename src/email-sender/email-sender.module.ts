import { Module } from '@nestjs/common';
import { EmailSenderService } from './email-sender.service';
import { MailerService } from './mailer.service';
import { TenantModule } from '../tenant/tenant.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [TenantModule, ConfigModule],
  providers: [EmailSenderService, MailerService],
  exports: [EmailSenderService],
})
export class EmailSenderModule {}

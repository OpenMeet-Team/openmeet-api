import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailService } from './mail.service';
import { MailerModule } from '../mailer/mailer.module';
import { TenantModule } from 'src/tenant/tenant.module';

@Module({
  imports: [ConfigModule, MailerModule, TenantModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailService } from './mail.service';
import { MailerModule } from '../mailer/mailer.module';
import { TenantModule } from '../tenant/tenant.module';
import { MailController } from './mail.controller';

@Module({
  imports: [ConfigModule, MailerModule, TenantModule],
  providers: [MailService, MailController],
  exports: [MailService],
  controllers: [MailController],
})
export class MailModule {}

import { Module } from '@nestjs/common';
import { ChatMailService } from './chat-mail.service';
import { MailModule } from 'src/mail/mail.module';

@Module({
  providers: [ChatMailService],
  exports: [ChatMailService],
  imports: [MailModule],
})
export class ChatMailModule {}

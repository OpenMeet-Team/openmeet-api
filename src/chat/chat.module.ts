import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { UserModule } from '../user/user.module';
import { ZulipService } from '../zulip/zulip.service';
import { TenantModule } from '../tenant/tenant.module';
import { ChatMailModule } from '../chat-mail/chat-mail.module';

@Module({
  imports: [UserModule, TenantModule, ChatMailModule],
  controllers: [ChatController],
  providers: [ChatService, ZulipService],
  exports: [ChatService],
})
export class ChatModule {}

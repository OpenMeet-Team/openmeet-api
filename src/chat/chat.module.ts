import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { UserModule } from '../user/user.module';
import { ZulipService } from '../zulip/zulip.service';
import { ChatService } from './chat.service';

@Module({
  imports: [UserModule],
  controllers: [ChatController],
  providers: [ChatService, ZulipService],
  exports: [ChatService],
})
export class ChatModule {}

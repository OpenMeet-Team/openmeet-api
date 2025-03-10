import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { UserModule } from '../user/user.module';
import { MatrixModule } from '../matrix/matrix.module';
import { TenantModule } from '../tenant/tenant.module';
import { ChatMailModule } from '../chat-mail/chat-mail.module';

@Module({
  imports: [UserModule, TenantModule, ChatMailModule, MatrixModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}

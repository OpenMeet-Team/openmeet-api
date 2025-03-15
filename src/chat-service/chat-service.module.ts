import { Module } from '@nestjs/common';
import { MatrixChatService } from './adapters/matrix-chat.service';
import { MatrixModule } from '../matrix/matrix.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [MatrixModule, UserModule],
  providers: [
    {
      provide: 'CHAT_SERVICE',
      useClass: MatrixChatService,
    },
    MatrixChatService,
  ],
  exports: ['CHAT_SERVICE', MatrixChatService],
})
export class ChatServiceModule {}

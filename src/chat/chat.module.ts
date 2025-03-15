import { Module, forwardRef } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { UserModule } from '../user/user.module';
import { TenantModule } from '../tenant/tenant.module';
import { DiscussionService } from './services/discussion.service';
import { MatrixChatProviderAdapter } from './adapters/matrix-chat-provider.adapter';
import { MatrixModule } from '../matrix/matrix.module';
import { EventModule } from '../event/event.module';
import { GroupModule } from '../group/group.module';
import { ChatRoomModule } from '../chat-room/chat-room.module';
import { ChatListener } from './chat.listener';

@Module({
  imports: [
    UserModule,
    TenantModule,
    MatrixModule,
    forwardRef(() => EventModule),
    forwardRef(() => GroupModule),
    ChatRoomModule,
  ],
  controllers: [ChatController],
  providers: [
    DiscussionService,
    {
      provide: 'CHAT_PROVIDER',
      useClass: MatrixChatProviderAdapter,
    },
    ChatListener,
  ],
  exports: [DiscussionService, 'CHAT_PROVIDER'],
})
export class ChatModule {}

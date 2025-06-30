import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';
import { UserModule } from '../user/user.module';
import { TenantModule } from '../tenant/tenant.module';
import { DiscussionService } from './services/discussion.service';
import { MatrixChatProviderAdapter } from './adapters/matrix-chat-provider.adapter';
import { MatrixChatServiceAdapter } from './adapters/matrix-chat-service.adapter';
import { MatrixChatRoomManagerAdapter } from './adapters/matrix-chat-room-manager.adapter';
import { MatrixModule } from '../matrix/matrix.module';
import { EventModule } from '../event/event.module';
import { GroupModule } from '../group/group.module';
import { ChatListener } from './chat.listener';
import { ChatRoomService } from './rooms/chat-room.service';
import { ChatRoomEntity } from './infrastructure/persistence/relational/entities/chat-room.entity';
import { GroupMemberModule } from '../group-member/group-member.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { ElastiCacheModule } from '../elasticache/elasticache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatRoomEntity]),
    forwardRef(() => UserModule),
    TenantModule,
    forwardRef(() => MatrixModule),
    ElastiCacheModule,
    forwardRef(() => EventModule),
    forwardRef(() => GroupModule),
    forwardRef(() => GroupMemberModule),
    forwardRef(() => EventAttendeeModule),
  ],
  controllers: [ChatController],
  providers: [
    DiscussionService,
    {
      provide: 'DiscussionService',
      useExisting: DiscussionService,
    },
    ChatRoomService,
    MatrixChatRoomManagerAdapter,
    {
      provide: 'ChatRoomManagerInterface',
      useExisting: MatrixChatRoomManagerAdapter,
    },
    {
      provide: 'CHAT_PROVIDER',
      useClass: MatrixChatProviderAdapter,
    },
    {
      provide: 'CHAT_SERVICE',
      useClass: MatrixChatServiceAdapter,
    },
    MatrixChatServiceAdapter,
    ChatListener,
  ],
  exports: [
    DiscussionService,
    'DiscussionService',
    MatrixChatRoomManagerAdapter,
    'ChatRoomManagerInterface',
    'CHAT_PROVIDER',
    'CHAT_SERVICE',
    MatrixChatServiceAdapter,
    ChatRoomService,
    TypeOrmModule,
  ],
})
export class ChatModule {}

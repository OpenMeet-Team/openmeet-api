import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatRoomEntity } from './infrastructure/persistence/relational/entities/chat-room.entity';
import { ChatRoomService } from './chat-room.service';
import { MatrixModule } from '../matrix/matrix.module';
import { UserModule } from '../user/user.module';
import { TenantModule } from '../tenant/tenant.module';
import { GroupMemberModule } from '../group-member/group-member.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatRoomEntity]),
    MatrixModule,
    UserModule,
    TenantModule,
    forwardRef(() => GroupMemberModule),
  ],
  providers: [ChatRoomService],
  exports: [ChatRoomService, TypeOrmModule],
})
export class ChatRoomModule {}

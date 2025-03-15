import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatRoomEntity } from './infrastructure/persistence/relational/entities/chat-room.entity';
import { ChatRoomService } from './chat-room.service';
import { MatrixModule } from '../matrix/matrix.module';
import { UserModule } from '../user/user.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatRoomEntity]),
    MatrixModule,
    UserModule,
    TenantModule,
  ],
  providers: [ChatRoomService],
  exports: [ChatRoomService, TypeOrmModule],
})
export class ChatRoomModule {}

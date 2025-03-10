import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatRoomEntity } from './infrastructure/persistence/relational/entities/chat-room.entity';
import { MatrixModule } from '../matrix/matrix.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatRoomEntity]),
    MatrixModule,
  ],
  providers: [],
  exports: [TypeOrmModule],
})
export class ChatRoomModule {}
import { Module } from '@nestjs/common';
import { BlueskyController } from './bluesky.controller';
import { BlueskyService } from './bluesky.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [BlueskyController],
  providers: [BlueskyService],
  exports: [BlueskyService],
})
export class BlueskyModule {}

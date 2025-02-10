import { Module, forwardRef } from '@nestjs/common';
import { BlueskyController } from './bluesky.controller';
import { BlueskyService } from './bluesky.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { AuthBlueskyModule } from '../auth-bluesky/auth-bluesky.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    forwardRef(() => AuthBlueskyModule),
  ],
  controllers: [BlueskyController],
  providers: [BlueskyService],
  exports: [BlueskyService],
})
export class BlueskyModule {}

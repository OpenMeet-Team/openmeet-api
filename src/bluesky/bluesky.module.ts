import { Module } from '@nestjs/common';
import { BlueskyController } from './bluesky.controller';
import { BlueskyService } from './bluesky.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  controllers: [BlueskyController],
  providers: [BlueskyService],
  exports: [BlueskyService],
})
export class BlueskyModule {}

import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ElastiCacheService } from './elasticache.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ElastiCacheService],
  exports: [ElastiCacheService],
})
export class ElastiCacheModule {}

import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { ElastiCacheService } from './elasticache.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'ELASTICACHE_CLIENT',
      useFactory: async (configService: ConfigService) => {
        const client = createClient({
          socket: {
            host: configService.get('ELASTICACHE_HOST', { infer: true }),
            port: configService.get('ELASTICACHE_PORT', { infer: true }),
            tls: true,
            rejectUnauthorized: configService.get(
                'ELASTICACHE_REJECT_UNAUTHORIZED',
                { infer: true },
              ),
          },
          // ElastiCache uses AUTH token instead of username/password
          ...(configService.get('ELASTICACHE_AUTH', { infer: true }) ===
            'true' && {
            password: configService.get('ELASTICACHE_TOKEN', { infer: true }),
          }),
        });

        await client.connect();
        return client;
      },
      inject: [ConfigService],
    },
    ElastiCacheService,
  ],
  exports: [ElastiCacheService],
})
export class ElastiCacheModule {}

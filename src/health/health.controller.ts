import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { TypeOrmHealthIndicator } from '@nestjs/terminus';

import {
  HealthCheckService,
  HttpHealthIndicator,
  HealthCheck,
} from '@nestjs/terminus';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private db: TypeOrmHealthIndicator,
  ) {}

  @HealthCheck()
  @Public()
  @Get('liveness')
  @ApiOperation({ summary: 'Liveness probe' })
  async liveness() {
    const result = await this.health.check([
      () =>
        this.http.pingCheck('api-root', 'https://api.openmeet.net', {
          headers: {
            'Tenant-Id': '1',
          },
        }),
      () => this.http.pingCheck('docs-root', 'https://api.openmeet.net/docs'),
    ]);
    return result;
  }

  @HealthCheck()
  @Public()
  @Get('readiness')
  @ApiOperation({ summary: 'Readiness probe' })
  async readiness() {
    try {
      return await this.health.check([() => this.db.pingCheck('database')]);
    } catch (error) {
      return {
        status: 'error',
        database: 'disconnected',
        error: error.message,
      };
    }
  }
}

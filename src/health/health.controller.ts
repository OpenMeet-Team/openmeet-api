import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TenantPublic } from '../tenant/tenant-public.decorator';
import { TypeOrmHealthIndicator } from '@nestjs/terminus';
import {
  HealthCheckService,
  HttpHealthIndicator,
  HealthCheck,
} from '@nestjs/terminus';

@ApiTags('Health')
@Controller('health')
@TenantPublic()
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private db: TypeOrmHealthIndicator,
  ) {}

  @HealthCheck()
  @Get('liveness')
  @ApiOperation({ summary: 'Liveness probe' })
  liveness() {
    // Always return OK for liveness probe
    // This prevents the pod from being killed when external services are unreachable
    return {
      status: 'ok',
      info: {
        api: { status: 'up' },
      },
    };
  }

  @HealthCheck()
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

import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TenantPublic } from '../tenant/tenant-public.decorator';
import { TypeOrmHealthIndicator } from '@nestjs/terminus';
import {
  HealthCheckService,
  HttpHealthIndicator,
  HealthCheck,
} from '@nestjs/terminus';
import { MatrixHealthIndicator } from '../matrix/health/matrix.health';

@ApiTags('Health')
@Controller('health')
@TenantPublic()
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private db: TypeOrmHealthIndicator,
    private matrix: MatrixHealthIndicator,
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
    // Let the ServiceUnavailableException propagate: the 503 is how the probe
    // learns the pod cannot serve, so Kubernetes pulls it from the Service.
    // Database only — a Matrix outage degrades chat, not the API, and must not
    // take every api pod out of rotation (see /health/matrix for that signal).
    return await this.health.check([() => this.db.pingCheck('database')]);
  }

  @HealthCheck()
  @Get('matrix')
  @ApiOperation({ summary: 'Matrix health check' })
  async matrixHealth() {
    try {
      return await this.health.check([() => this.matrix.isHealthy('matrix')]);
    } catch (error) {
      return {
        status: 'error',
        matrix: 'disconnected',
        error: error.message,
      };
    }
  }
}

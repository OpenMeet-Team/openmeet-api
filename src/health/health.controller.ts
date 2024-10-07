import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Req } from '@nestjs/common';
import { Request } from 'express';

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
  async liveness(@Req() req: Request) {
    const api_url = process.env.LIVENESS_PROBE_API_URL;
    const docs_url = process.env.LIVENESS_PROBE_DOCS_URL;
    // get the tenant_id from the request
    const tenant_id = req.headers['tenant-id'] as string;

    if (!api_url || !docs_url) {
      throw new Error('Liveness probe URLs are not set');
    }

    const result = await this.health.check([
      () =>
        this.http.pingCheck('api-root', api_url, {
          headers: {
            'Tenant-Id': tenant_id,
          },
        }),
      () => this.http.pingCheck('docs-root', docs_url),
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

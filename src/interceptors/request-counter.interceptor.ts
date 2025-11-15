import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import { getApiArea } from '../common/utils/metrics.util';

@Injectable()
export class RequestCounterInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestCounterInterceptor.name);

  constructor(
    @InjectMetric('http_requests_total')
    private counter: Counter<string>,
    @InjectMetric('http_request_duration_seconds')
    private requestDuration: Histogram<string>,
    @InjectMetric('http_request_errors_total')
    private errorCounter: Counter<string>,
  ) {}
  private requestCount = 0;

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url, headers } = request;

    // Simplified labels: just method and API area (low cardinality)
    const area = getApiArea(url);
    const labels = { method, area };

    // Track total requests
    this.counter.inc(labels);

    const start = Date.now();
    const startTime = new Date().toISOString();

    // Extract context for logging
    const tenantId = headers['x-tenant-id'] as string;
    const userId = request.user?.id;

    return new Promise((resolve) => {
      // Handle successful requests and capture duration
      const successHandler = tap(() => {
        const duration = (Date.now() - start) / 1000; // Convert to seconds
        this.requestDuration.observe(labels, duration);

        // Structured logging for detailed per-endpoint analysis
        this.logger.log(
          JSON.stringify({
            event: 'http_request',
            timestamp: startTime,
            method,
            path: url.split('?')[0],
            status: response.statusCode,
            duration_ms: Math.round(duration * 1000),
            area,
            tenant_id: tenantId || null,
            user_id: userId || null,
          }),
        );
      });

      // Handle errors
      const errorHandler = catchError((error) => {
        const duration = (Date.now() - start) / 1000; // Convert to seconds
        this.requestDuration.observe(labels, duration);

        // Simplified error labels: method, status group (2xx, 4xx, 5xx), area
        const statusGroup = Math.floor((error.status || 500) / 100) * 100;
        const errorLabels = {
          method,
          status: statusGroup.toString(),
          area,
        };
        this.errorCounter.inc(errorLabels);

        // Detailed error logging
        this.logger.error(
          JSON.stringify({
            event: 'http_request_error',
            timestamp: startTime,
            method,
            path: url.split('?')[0],
            status: error.status || 500,
            duration_ms: Math.round(duration * 1000),
            error_name: error.name || 'UnknownError',
            error_message: error.message,
            area,
            tenant_id: tenantId || null,
            user_id: userId || null,
          }),
        );

        return throwError(() => error);
      });

      resolve(next.handle().pipe(successHandler, errorHandler));
    });
  }

  getRequestCount(): number {
    return this.requestCount;
  }
}

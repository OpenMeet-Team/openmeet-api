import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';

@Injectable()
export class RequestCounterInterceptor implements NestInterceptor {
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
    const { method, url } = request;
    const labels = { method, path: this.normalizePath(url) };

    // Track total requests with method and path labels
    this.counter.inc(labels);

    const start = Date.now();

    return new Promise((resolve) => {
      // Handle successful requests and capture duration
      const successHandler = tap(() => {
        const duration = (Date.now() - start) / 1000; // Convert to seconds
        this.requestDuration.observe(labels, duration);
      });

      // Handle errors
      const errorHandler = catchError((error) => {
        const duration = (Date.now() - start) / 1000; // Convert to seconds
        this.requestDuration.observe(labels, duration);

        // Track errors with method, path, and status code labels
        const errorLabels = {
          ...labels,
          status: error.status || 500,
          error: error.name || 'UnknownError',
        };
        this.errorCounter.inc(errorLabels);

        return throwError(() => error);
      });

      resolve(next.handle().pipe(successHandler, errorHandler));
    });
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  // Normalize path to avoid high cardinality in metrics
  // e.g. /users/123 -> /users/:id, /groups/my-group-name -> /groups/:slug
  private normalizePath(path: string): string {
    // Strip query parameters
    const baseUrl = path.split('?')[0];

    // Define patterns to normalize with their replacements
    const patterns = [
      // UUID pattern
      {
        regex: /\/[0-9a-f]{8,}(?:-[0-9a-f]{4,}){3,}-[0-9a-f]{12,}/g,
        replacement: '/:uuid',
      },

      // Slug patterns for common resources
      { regex: /\/events\/[^\/]+/g, replacement: '/events/:slug' },
      { regex: /\/groups\/[^\/]+/g, replacement: '/groups/:slug' },
      { regex: /\/categories\/[^\/]+/g, replacement: '/categories/:slug' },
      {
        regex: /\/sub-categories\/[^\/]+/g,
        replacement: '/sub-categories/:slug',
      },
      { regex: /\/users\/[^\/]+/g, replacement: '/users/:slug' },
      { regex: /\/chat\/group\/[^\/]+/g, replacement: '/chat/group/:slug' },
      { regex: /\/chat\/event\/[^\/]+/g, replacement: '/chat/event/:slug' },

      // /api/chat/event/:slug/members/tom-from-openmeet-yp4sub
      {
        regex: /\/api\/chat\/event\/[^\/]+\/members\/[^\/]+/g,
        replacement: '/api/chat/event/:slug/members/:slug',
      },

      // API versioned paths
      {
        regex: /\/api\/v\d+\/events\/[^\/]+/g,
        replacement: '/api/v:version/events/:slug',
      },
      {
        regex: /\/api\/v\d+\/groups\/[^\/]+/g,
        replacement: '/api/v:version/groups/:slug',
      },

      // Numeric IDs (only apply this last as a fallback)
      { regex: /\/\d+/g, replacement: '/:id' },
    ];

    // Apply each pattern in sequence
    let normalizedPath = baseUrl;
    patterns.forEach((pattern) => {
      normalizedPath = normalizedPath.replace(
        pattern.regex,
        pattern.replacement,
      );
    });

    return normalizedPath;
  }
}

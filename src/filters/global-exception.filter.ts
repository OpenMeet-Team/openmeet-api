import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import { getApiArea } from '../common/utils/metrics.util';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly tracer = trace.getTracer('exception-filter');

  constructor(
    @InjectMetric('unhandled_exceptions_total')
    private exceptionCounter: Counter<string>,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Extract information from the request
    const { method, url, headers } = request;
    const tenantId = headers['x-tenant-id'] as string;
    const path = url.split('?')[0];

    // Get status code and error message
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorName =
      exception instanceof Error ? exception.name : 'UnknownError';
    const errorMessage =
      exception instanceof Error ? exception.message : 'Unknown error occurred';

    // Increment exception counter with simplified labels (low cardinality)
    const area = getApiArea(path);
    const statusGroup = Math.floor(status / 100) * 100;
    this.exceptionCounter.inc({
      method,
      area,
      status: statusGroup.toString(),
    });

    // Create a span for the exception
    this.tracer.startActiveSpan('handle_exception', (span) => {
      try {
        // Add attributes to the span
        span.setAttribute('http.method', method);
        span.setAttribute('http.url', url);
        span.setAttribute('http.status_code', status);
        span.setAttribute('error.type', errorName);
        span.setAttribute('error.message', errorMessage);
        span.setAttribute('tenant.id', tenantId || 'unknown');

        // Set the span status to error
        span.setStatus({
          code: SpanStatusCode.ERROR,
        });

        // Record the exception in the span
        if (exception instanceof Error) {
          span.recordException(exception);
        }

        // Log the error for internal debugging
        this.logger.error(
          `Request ${method} ${url} failed with status ${status}: ${errorMessage}`,
          exception instanceof Error ? exception.stack : '',
        );

        // Send the error response to the client
        const errorResponse = {
          statusCode: status,
          message:
            status === HttpStatus.INTERNAL_SERVER_ERROR
              ? 'Internal server error'
              : errorMessage,
          path,
          timestamp: new Date().toISOString(),
        };

        // If it's a UnprocessableEntityException, add the original error data
        if (
          exception instanceof HttpException &&
          status === HttpStatus.UNPROCESSABLE_ENTITY
        ) {
          try {
            const exceptionResponse = exception.getResponse();
            if (
              typeof exceptionResponse === 'object' &&
              exceptionResponse !== null
            ) {
              // If the exception contains an 'errors' field, include it in the response
              if ('errors' in exceptionResponse) {
                Object.assign(errorResponse, {
                  errors: exceptionResponse['errors'],
                });
              }
            }
          } catch {
            // Silently fail if we can't extract additional data
          }
        }

        // If it's a PayloadTooLargeException (413), provide a user-friendly message
        if (
          exception instanceof HttpException &&
          status === HttpStatus.PAYLOAD_TOO_LARGE
        ) {
          errorResponse.message =
            'File is too large. Please choose a smaller file.';
        }

        response.status(status).json(errorResponse);
      } finally {
        span.end();
      }
    });
  }
}

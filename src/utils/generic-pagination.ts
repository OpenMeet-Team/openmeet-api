import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export async function paginate<T extends ObjectLiteral>(
  query: SelectQueryBuilder<T>,
  { page = 1, limit = 10 }: PaginationOptions,
): Promise<PaginationResult<T>> {
  const tracer = trace.getTracer('pagination-util');

  return await tracer.startActiveSpan(
    'paginate',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'pagination.page': page,
        'pagination.limit': limit,
        'pagination.offset': (page - 1) * limit,
        'query.entity': query.expressionMap.mainAlias?.metadata.name,
        'query.type': 'paginated',
      },
    },
    async (span) => {
      try {
        // Use getManyAndCount for optimized single-roundtrip query
        const [results, countResult] = await tracer.startActiveSpan(
          'get_paginated_results',
          {
            kind: SpanKind.INTERNAL,
            attributes: {
              'query.type': 'select_with_count',
              'query.offset': (page - 1) * limit,
              'query.limit': limit,
            },
          },
          async (resultsSpan) => {
            const startTime = Date.now();
            const [data, total] = await query
              .skip((page - 1) * limit)
              .take(limit)
              .getManyAndCount();
            const duration = Date.now() - startTime;

            resultsSpan.setAttribute('records_retrieved', data.length);
            resultsSpan.setAttribute('total_records', total);
            resultsSpan.setAttribute('query.duration_ms', duration);
            resultsSpan.setAttribute('query.sql', query.getQuery());
            resultsSpan.setAttribute(
              'query.parameters',
              JSON.stringify(query.getParameters()),
            );
            resultsSpan.end();
            return [data, total] as const;
          },
        );

        const totalPages = Math.ceil(countResult / limit);

        // Add final metrics to parent span
        span.setAttribute('pagination.total_pages', totalPages);
        span.setAttribute('pagination.total_records', countResult);
        span.setAttribute('pagination.records_returned', results.length);
        span.setAttribute('pagination.has_more', page < totalPages);

        return {
          data: results,
          total: countResult,
          page,
          totalPages,
        };
      } catch (error) {
        span.recordException(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message:
            error instanceof Error
              ? error.message
              : 'Unknown error in pagination',
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

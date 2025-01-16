import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { trace, SpanStatusCode } from '@opentelemetry/api';

export interface PaginationOptions {
  page: number;
  limit: number;
}

interface PaginationResult<T> {
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

  return await tracer.startActiveSpan('paginate', async (span) => {
    try {
      // Add pagination parameters as span attributes
      span.setAttribute('pagination.page', page);
      span.setAttribute('pagination.limit', limit);
      span.setAttribute('pagination.offset', (page - 1) * limit);

      // Create child span for count query
      const countResult = await tracer.startActiveSpan(
        'get_total_count',
        async (countSpan) => {
          const total = await query.getCount();
          countSpan.setAttribute('total_records', total);
          countSpan.end();
          return total;
        },
      );

      // Create child span for fetching results
      const results = await tracer.startActiveSpan(
        'get_paginated_results',
        async (resultsSpan) => {
          const data = await query
            .skip((page - 1) * limit)
            .take(limit)
            .getMany();
          resultsSpan.setAttribute('records_retrieved', data.length);
          resultsSpan.end();
          return data;
        },
      );

      const totalPages = Math.ceil(countResult / limit);
      span.setAttribute('pagination.total_pages', totalPages);

      return {
        data: results,
        total: countResult,
        page,
        totalPages,
      };
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      console.error('Error in paginate', error);
      throw error;
    } finally {
      span.end();
    }
  });
}

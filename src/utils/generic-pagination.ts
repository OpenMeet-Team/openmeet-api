import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';

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
  const total = await query.getCount(); // Get total items count
  const results = await query
    .skip((page - 1) * limit) // Skip rows for the current page
    .take(limit) // Take only 'limit' rows
    .getMany(); // Fetch results

  return {
    data: results,
    total,
    page,
    totalPages: Math.ceil(total / limit), // Calculate total pages
  };
}

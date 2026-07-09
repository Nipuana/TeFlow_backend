import { config } from '../config';

export interface PageParams {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Parse and CLAMP pagination params (API4: Unrestricted Resource Consumption).
 * A client can never request an unbounded page — `limit` is hard-capped by
 * MAX_PAGE_SIZE regardless of what they ask for.
 */
export function parsePagination(query: Record<string, unknown> = {}): PageParams {
  const max = config.limits.maxPageSize;
  let limit = Number.parseInt(String(query.limit), 10);
  let page = Number.parseInt(String(query.page), 10);

  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  if (limit > max) limit = max;
  if (!Number.isFinite(page) || page < 1) page = 1;

  return { page, limit, offset: (page - 1) * limit };
}

export function paginate<T>(items: T[], { page, limit, offset }: PageParams) {
  const total = items.length;
  return {
    data: items.slice(offset, offset + limit),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

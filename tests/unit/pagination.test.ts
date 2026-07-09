import { describe, it, expect } from 'vitest';
import { parsePagination, paginate } from '../../src/shared/utils/pagination';
import { config } from '../../src/shared/config';

describe('parsePagination', () => {
  it('applies sensible defaults for empty query', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('computes the offset from page and limit', () => {
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it('clamps an oversized limit to the configured maximum (API4)', () => {
    const { limit } = parsePagination({ limit: '99999' });
    expect(limit).toBe(config.limits.maxPageSize);
    expect(limit).toBeLessThanOrEqual(config.limits.maxPageSize);
  });

  it('falls back to defaults for invalid/negative values', () => {
    expect(parsePagination({ page: '-5', limit: '0' })).toEqual({ page: 1, limit: 20, offset: 0 });
    expect(parsePagination({ page: 'abc', limit: 'xyz' })).toEqual({ page: 1, limit: 20, offset: 0 });
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('slices the current page and reports totals', () => {
    const result = paginate(items, { page: 1, limit: 10, offset: 0 });
    expect(result.data).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.pagination).toEqual({ page: 1, limit: 10, total: 25, totalPages: 3 });
  });

  it('returns the trailing partial page', () => {
    const result = paginate(items, { page: 3, limit: 10, offset: 20 });
    expect(result.data).toEqual([21, 22, 23, 24, 25]);
    expect(result.pagination.totalPages).toBe(3);
  });

  it('always reports at least one page, even when empty', () => {
    expect(paginate([], { page: 1, limit: 10, offset: 0 }).pagination.totalPages).toBe(1);
  });
});

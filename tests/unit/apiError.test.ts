import { describe, it, expect } from 'vitest';
import { ApiError } from '../../src/shared/utils/ApiError';

describe('ApiError factories', () => {
  it('sets the right status and code for each helper', () => {
    expect(ApiError.badRequest()).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
    expect(ApiError.unauthorized()).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(ApiError.forbidden()).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(ApiError.notFound()).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(ApiError.conflict()).toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(ApiError.tooLarge()).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
    expect(ApiError.tooMany()).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
  });

  it('carries a custom message and details', () => {
    const details = [{ path: 'email', message: 'required' }];
    const err = ApiError.badRequest('Validation failed', details);
    expect(err.message).toBe('Validation failed');
    expect(err.details).toEqual(details);
    expect(err).toBeInstanceOf(Error);
  });
});

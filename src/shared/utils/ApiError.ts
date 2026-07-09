/**
 * Operational error carrying an HTTP status.
 *
 * The centralised error handler (API8) turns these into generic client-facing
 * messages and never leaks stack traces or internal detail.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly expose = true;

  constructor(status: number, message: string, opts: { code?: string; details?: unknown } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = opts.code || httpCode(status);
    this.details = opts.details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(msg = 'Bad request', details?: unknown): ApiError {
    return new ApiError(400, msg, { code: 'BAD_REQUEST', details });
  }
  static unauthorized(msg = 'Authentication required'): ApiError {
    return new ApiError(401, msg, { code: 'UNAUTHORIZED' });
  }
  static forbidden(msg = 'Forbidden'): ApiError {
    return new ApiError(403, msg, { code: 'FORBIDDEN' });
  }
  static notFound(msg = 'Not found'): ApiError {
    return new ApiError(404, msg, { code: 'NOT_FOUND' });
  }
  static conflict(msg = 'Conflict'): ApiError {
    return new ApiError(409, msg, { code: 'CONFLICT' });
  }
  static tooLarge(msg = 'Payload too large'): ApiError {
    return new ApiError(413, msg, { code: 'PAYLOAD_TOO_LARGE' });
  }
  static tooMany(msg = 'Too many requests'): ApiError {
    return new ApiError(429, msg, { code: 'RATE_LIMITED' });
  }
}

function httpCode(status: number): string {
  const map: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    429: 'RATE_LIMITED',
  };
  return map[status] || 'ERROR';
}

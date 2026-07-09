import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import logger from '../utils/logger';
import { config } from '../config';

/**
 * Centralised error handler (API8: Security Misconfiguration).
 *
 * - Operational `ApiError`s produce a generic, client-safe JSON body.
 * - ANY other (unexpected) error is logged in full server-side but the client
 *   only ever receives a generic 500 with NO stack trace and NO internal detail.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): Response {
  const requestId = req.id;

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
  }

  const anyErr = err as { type?: string; status?: number; message?: string; stack?: string };

  // Body-parser / payload-size errors from express.json()
  if (anyErr.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large', requestId },
    });
  }
  if (anyErr.status === 400 && err instanceof SyntaxError) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Malformed request body', requestId },
    });
  }

  // Unexpected: log full detail server-side, return generic 500 to the client.
  logger.error('unhandled_error', {
    requestId,
    message: anyErr.message,
    stack: config.isProd ? undefined : anyErr.stack,
  });

  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId },
  });
}

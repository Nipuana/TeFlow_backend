import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Assigns each request a correlation id and emits a structured access-log line
 * on completion (no sensitive data — supports the observability requirement).
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  req.id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info('request', {
      requestId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durMs),
      userId: req.user?.id,
      ip: req.ip,
    });
  });

  next();
}

/** 404 for unmatched routes — avoids leaking which routes exist vs 500s. */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found', requestId: req.id },
  });
}

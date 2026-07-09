import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { ApiError } from '../utils/ApiError';

/**
 * Host header validation (API8: Security Misconfiguration).
 *
 * Rejects requests whose Host header is not on the allow-list. Blocks
 * Host-header poisoning (cache poisoning, password-reset link spoofing). In
 * development the allow-list may be empty, in which case the check is skipped.
 */
export function hostCheck(req: Request, _res: Response, next: NextFunction): void {
  const allowed = config.allowedHosts;
  if (allowed.length === 0) return next(); // dev convenience only

  const host = req.headers.host;
  if (!host || !allowed.includes(host)) {
    return next(ApiError.badRequest('Invalid Host header'));
  }
  return next();
}

import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { ApiError } from '../utils/ApiError';
import logger from '../utils/logger';

/**
 * Rate limiting (API4: Unrestricted Resource Consumption,
 * API6: Unrestricted Access to Sensitive Business Flows).
 *
 * - `globalLimiter` caps total traffic per IP.
 * - `makeLimiter` builds tighter per-route limiters for sensitive flows.
 *
 * In production the store should be Redis-backed so limits hold across
 * instances; the in-memory default is fine for a single-node demo.
 */
function handler(req: Request, _res: Response, next: NextFunction): void {
  logger.warn('rate_limit_exceeded', { ip: req.ip, path: req.path });
  next(ApiError.tooMany());
}

const base = {
  standardHeaders: true as const,
  legacyHeaders: false as const,
  handler,
};

export const globalLimiter = rateLimit({
  ...base,
  windowMs: config.limits.rateWindowMs,
  max: config.limits.rateMax,
});

export function makeLimiter(opts: { windowMs?: number; max: number; key?: (req: Request) => string }) {
  return rateLimit({
    ...base,
    windowMs: opts.windowMs ?? config.limits.rateWindowMs,
    max: opts.max,
    keyGenerator: opts.key,
  });
}

// Pre-baked limiters for the sensitive flows called out in the spec.
export const authLimiter = makeLimiter({ windowMs: 15 * 60_000, max: 10 }); // login/register brute-force
export const sensitiveFlowLimiter = makeLimiter({ windowMs: 60 * 60_000, max: 20 }); // invites, exports, billing

import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/tokens';
import { ApiError } from '../utils/ApiError';
import type { Role } from '../types';

/**
 * Authentication middleware (API2).
 *
 * Extracts the bearer access token, verifies its SIGNATURE (pinned algorithm,
 * issuer, audience) and attaches the trusted claims to `req.user`. A request
 * with a missing/expired/tampered token is rejected here, before any controller
 * runs. Unsigned or `alg:none` tokens can never pass `verifyAccessToken`.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Missing bearer token'));
  }

  try {
    const claims = verifyAccessToken(token);
    req.user = {
      id: claims.sub,
      orgId: claims.orgId,
      role: claims.role as Role,
      amr: claims.amr || [],
      stepUpAt: claims.stepUpAt || 0,
    };
    return next();
  } catch {
    return next(ApiError.unauthorized('Invalid or expired token'));
  }
}

/**
 * Step-up re-authentication guard (API6) for sensitive business flows.
 * Requires the caller to have performed MFA/re-auth within `maxAgeSec`.
 */
export function requireStepUp(maxAgeSec = 300) {
  return function stepUp(req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) return next(ApiError.unauthorized());
    const fresh = req.user.stepUpAt > 0 && Date.now() / 1000 - req.user.stepUpAt <= maxAgeSec;
    // A recent MFA verification OR a recent password re-auth both satisfy
    // step-up. (MFA-enrolled users carry 'mfa'; others carry 'reauth'.)
    const reauthed = req.user.amr.includes('mfa') || req.user.amr.includes('reauth');
    if (!reauthed || !fresh) {
      return next(ApiError.forbidden('Step-up re-authentication required for this action'));
    }
    return next();
  };
}

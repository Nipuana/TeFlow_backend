import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import type { Role } from '../types';

/**
 * Role-Based Access Control (API5: Broken Function Level Authorization).
 *
 * Route-level guard that rejects with 403 BEFORE the controller runs if the
 * caller's role is not permitted for the function. This is FUNCTION-level authz
 * (can this role call this endpoint at all?), distinct from OBJECT-level authz
 * (does this user own THIS record?) which lives in the service layer (API1).
 *
 * Role hierarchy: owner > admin > manager > employee.
 */
export const ROLE_RANK: Record<Role, number> = { employee: 0, manager: 1, admin: 2, owner: 3 };

/**
 * Legacy aliases: memberships created before the role changes may still carry
 * retired identifiers (viewer/member/intern). Resolve them to the base rank so
 * old data never crashes an authz check (it just maps onto `employee`).
 */
const LEGACY_RANK: Record<string, number> = { viewer: 0, member: 0, intern: 0 };

/** Rank lookup that tolerates legacy role identifiers. */
export function rankOf(role: string | undefined): number {
  if (role == null) return -1;
  const r = (ROLE_RANK as Record<string, number>)[role];
  return r != null ? r : LEGACY_RANK[role] ?? -1;
}

/** Require the caller's role to be at least `minRole`. */
export function requireRole(minRole: Role) {
  const min = ROLE_RANK[minRole];
  return function guard(req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) return next(ApiError.unauthorized());
    const rank = rankOf(req.user.role);
    if (rank < 0 || rank < min) {
      return next(ApiError.forbidden('Insufficient role for this action'));
    }
    return next();
  };
}

/** Require the caller's role to be exactly one of `roles`. */
export function requireAnyRole(...roles: Role[]) {
  const set = new Set(roles);
  return function guard(req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) return next(ApiError.unauthorized());
    if (!set.has(req.user.role)) {
      return next(ApiError.forbidden('Insufficient role for this action'));
    }
    return next();
  };
}

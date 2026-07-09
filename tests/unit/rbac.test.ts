import { describe, it, expect } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { rankOf, requireRole } from '../../src/shared/middleware/rbac';
import { ApiError } from '../../src/shared/utils/ApiError';

describe('rankOf', () => {
  it('ranks the canonical role hierarchy', () => {
    expect(rankOf('owner')).toBe(3);
    expect(rankOf('admin')).toBe(2);
    expect(rankOf('manager')).toBe(1);
    expect(rankOf('employee')).toBe(0);
  });

  it('maps legacy identifiers onto the base rank', () => {
    expect(rankOf('viewer')).toBe(0);
    expect(rankOf('member')).toBe(0);
    expect(rankOf('intern')).toBe(0);
  });

  it('returns -1 for unknown or missing roles', () => {
    expect(rankOf('sysadmin')).toBe(-1);
    expect(rankOf(undefined)).toBe(-1);
  });
});

/** Build a fake (req, next) pair and capture what `next` was called with. */
function run(role: string | undefined, min: Parameters<typeof requireRole>[0]) {
  const req = { user: role ? { role } : undefined } as unknown as Request;
  let calledWith: unknown = 'NOT_CALLED';
  const next = ((...args: unknown[]) => {
    calledWith = args.length === 0 ? undefined : args[0];
  }) as NextFunction;
  requireRole(min)(req, {} as Response, next);
  return calledWith;
}

describe('requireRole (API5)', () => {
  it('passes a caller whose role meets the minimum', () => {
    expect(run('owner', 'manager')).toBeUndefined();
    expect(run('manager', 'manager')).toBeUndefined();
  });

  it('rejects a caller below the minimum with 403', () => {
    const err = run('employee', 'manager');
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
  });

  it('rejects an unauthenticated caller with 401', () => {
    const err = run(undefined, 'employee');
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
  });
});

import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  newRefreshToken,
  hashRefreshToken,
  type AccessTokenClaims,
} from '../../src/shared/utils/tokens';

const claims: AccessTokenClaims = {
  sub: 'user-1',
  orgId: 'org-1',
  role: 'owner',
  amr: ['pwd'],
  stepUpAt: 0,
};

describe('access tokens', () => {
  it('signs and verifies a round-trip, preserving claims', () => {
    const token = signAccessToken(claims);
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe('user-1');
    expect(decoded.orgId).toBe('org-1');
    expect(decoded.role).toBe('owner');
    expect(decoded.amr).toEqual(['pwd']);
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken(claims);
    const tampered = token.slice(0, -3) + 'aaa';
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('rejects a completely invalid / unsigned token', () => {
    expect(() => verifyAccessToken('not-a-real-jwt')).toThrow();
  });
});

describe('refresh tokens', () => {
  it('hashes deterministically', () => {
    expect(hashRefreshToken('abc')).toBe(hashRefreshToken('abc'));
    expect(hashRefreshToken('abc')).not.toBe(hashRefreshToken('abd'));
  });

  it('produces a raw token whose stored hash matches', () => {
    const { raw, hash } = newRefreshToken();
    expect(raw).toBeTruthy();
    expect(hash).toBe(hashRefreshToken(raw));
    expect(hash).not.toBe(raw); // only the hash is ever persisted
  });
});

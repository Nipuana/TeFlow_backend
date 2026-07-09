import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

/**
 * Token utilities (API2: Broken Authentication).
 *
 * - Access tokens are short-lived, signed JWTs. They are ALWAYS verified by
 *   signature + issuer + audience — unsigned/`alg:none` claims are never trusted.
 * - Refresh tokens are opaque, high-entropy random strings. Only a SHA-256 hash
 *   is stored server-side, and they are rotated on every use (see auth.service).
 */
const ACCESS_ALG = 'HS256' as const;

export interface AccessTokenClaims {
  sub: string;
  orgId: string;
  role: string;
  amr: string[];
  stepUpAt: number;
}

export function signAccessToken(payload: AccessTokenClaims): string {
  return jwt.sign(payload, config.jwt.accessSecret, {
    algorithm: ACCESS_ALG,
    expiresIn: config.jwt.accessTtl,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims & jwt.JwtPayload {
  // `algorithms` is pinned so a forged token claiming `alg:none` is rejected.
  return jwt.verify(token, config.jwt.accessSecret, {
    algorithms: [ACCESS_ALG],
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  }) as AccessTokenClaims & jwt.JwtPayload;
}

/** Generate an opaque refresh token and its storable hash. */
export function newRefreshToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(48).toString('base64url');
  return { raw, hash: hashRefreshToken(raw) };
}

export function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

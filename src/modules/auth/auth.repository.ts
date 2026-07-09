import { createCollection } from '../../shared/adapters/db';
import type { BaseDoc, Role } from '../../shared/types';

/**
 * Auth repository (port implementation).
 *
 * Owns the `users` and `refreshTokens` collections. All persistence for the
 * auth module funnels through here; the service layer never touches the store
 * directly. Swap the underlying adapter (db.ts) for Postgres without changing
 * the service.
 */
export interface User extends BaseDoc {
  email: string;
  passwordHash: string;
  name: string;
  orgId: string | null;
  role: Role;
  mfaEnabled: boolean;
  mfaSecret?: string;
  bio?: string;
  /** Storage key of the avatar fetched through the SSRF-guarded flow. */
  avatarKey?: string;
  /**
   * True while the account is still on the owner-issued temporary password. The
   * user is forced to set their own password before doing anything else, and the
   * flag is cleared the moment they do (see auth.service.changePassword).
   */
  mustChangePassword?: boolean;
  /**
   * AES-GCM-sealed copy of the current temporary password, so the owner can
   * re-view it while it is still unused. Cleared (null) the instant the user
   * sets their own password — never present for an account that has changed it.
   */
  tempPasswordEnc?: string | null;
}

export interface RefreshToken extends BaseDoc {
  userId: string;
  tokenHash: string;
  expiresAt: number;
  revoked: boolean;
  replacedBy: string | null;
  // Session metadata (safe to surface to the user in the sessions list).
  userAgent?: string;
  ip?: string;
  lastUsedAt?: string;
}

const users = createCollection<User>('users');
const refreshTokens = createCollection<RefreshToken>('refreshTokens');

export const authRepository = {
  // ── Users ────────────────────────────────────────────────────────────
  createUser(data: Partial<User>): User {
    return users.insert(data as Record<string, unknown>);
  },
  findUserById(id: string): User | undefined {
    return users.findById(id);
  },
  findUserByEmail(email: string): User | undefined {
    const normalized = String(email).toLowerCase();
    return users.findOne((u) => u.email === normalized);
  },
  updateUser(id: string, patch: Partial<User>): User | undefined {
    return users.update(id, patch as Record<string, unknown>);
  },

  // ── Refresh tokens ───────────────────────────────────────────────────
  createRefreshToken(data: Partial<RefreshToken>): RefreshToken {
    return refreshTokens.insert(data as Record<string, unknown>);
  },
  findRefreshByHash(tokenHash: string): RefreshToken | undefined {
    return refreshTokens.findOne((t) => t.tokenHash === tokenHash);
  },
  updateRefreshToken(id: string, patch: Partial<RefreshToken>): RefreshToken | undefined {
    return refreshTokens.update(id, patch as Record<string, unknown>);
  },
  findRefreshById(id: string): RefreshToken | undefined {
    return refreshTokens.findById(id);
  },
  /** All currently-valid (non-revoked, non-expired) sessions for a user. */
  listActiveForUser(userId: string): RefreshToken[] {
    const now = Date.now();
    return refreshTokens.find((t) => t.userId === userId && !t.revoked && t.expiresAt > now);
  },
  /** Revoke every refresh token in a user's family (used on reuse detection). */
  revokeAllForUser(userId: string): void {
    for (const t of refreshTokens.find((t) => t.userId === userId && !t.revoked)) {
      refreshTokens.update(t.id, { revoked: true });
    }
  },

  _reset(): void {
    users.clear();
    refreshTokens.clear();
  },
};

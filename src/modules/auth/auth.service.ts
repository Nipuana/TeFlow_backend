import { authRepository as repo, type User } from './auth.repository';
import * as orgsService from '../orgs/orgs.service';
import { hashPassword, verifyPassword } from '../../shared/utils/password';
import { signAccessToken, newRefreshToken, hashRefreshToken } from '../../shared/utils/tokens';
import * as totp from '../../shared/utils/totp';
import { config } from '../../shared/config';
import { ApiError } from '../../shared/utils/ApiError';
import logger from '../../shared/utils/logger';
import { safeFetch } from '../../shared/adapters/outboundHttp';
import * as fileStorage from '../../shared/adapters/fileStorage';
import * as notifications from '../notifications/notifications.service';
import type { AuthUser } from '../../shared/types';
import type { RegisterInput, LoginInput, StepUpInput, ChangePasswordInput, UpdateProfileInput } from './auth.schema';

/**
 * Auth domain/service (API2: Broken Authentication).
 *
 * Responsibilities: registration (creates the user AND provisions their org as
 * owner), login with non-enumerating errors + optional MFA, refresh-token
 * ROTATION with theft (reuse) detection, step-up re-auth (API6), MFA enrolment.
 */
interface PublicUser {
  id: string;
  email: string;
  name: string;
  orgId: string | null;
  role: string;
  mfaEnabled: boolean;
  bio: string;
  hasAvatar: boolean;
  mustChangePassword: boolean;
}

function issueAccessToken(user: User, opts: { amr: string[]; stepUpAt: number }): string {
  return signAccessToken({
    sub: user.id,
    orgId: user.orgId ?? '',
    role: user.role,
    amr: opts.amr,
    stepUpAt: opts.stepUpAt,
  });
}

/** Request context captured for the session/device (from the controller). */
export interface RequestContext {
  userAgent?: string;
  ip?: string;
}

async function issueRefreshToken(userId: string, ctx: RequestContext = {}): Promise<string> {
  const { raw, hash } = newRefreshToken();
  const expiresAt = Date.now() + config.jwt.refreshTtl * 1000;
  repo.createRefreshToken({
    userId,
    tokenHash: hash,
    expiresAt,
    revoked: false,
    replacedBy: null,
    userAgent: ctx.userAgent?.slice(0, 300),
    ip: ctx.ip,
    lastUsedAt: new Date().toISOString(),
  });
  return raw;
}

function publicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    orgId: u.orgId,
    role: u.role,
    mfaEnabled: !!u.mfaEnabled,
    bio: u.bio ?? '',
    hasAvatar: Boolean(u.avatarKey),
    mustChangePassword: Boolean(u.mustChangePassword),
  };
}

// ── Registration ─────────────────────────────────────────────────────────
export async function register(input: RegisterInput, ctx: RequestContext = {}) {
  if (repo.findUserByEmail(input.email)) {
    throw ApiError.conflict('Unable to register with the provided details');
  }
  const passwordHash = await hashPassword(input.password);
  let user = repo.createUser({
    email: input.email,
    passwordHash,
    name: input.name,
    orgId: null,
    role: 'owner',
    mfaEnabled: false,
  });

  const org = orgsService.provisionOrgForOwner({ ownerId: user.id, name: input.orgName });
  user = repo.updateUser(user.id, { orgId: org.id })!;

  const accessToken = issueAccessToken(user, { amr: ['pwd'], stepUpAt: 0 });
  const refreshToken = await issueRefreshToken(user.id, ctx);
  notifications.emit({
    userId: user.id,
    orgId: org.id,
    type: 'welcome',
    text: 'Welcome to Teflow — your workspace is ready.',
  });
  logger.info('user_registered', { userId: user.id, orgId: org.id });
  return { user: publicUser(user), org, accessToken, refreshToken };
}

// ── Login ──────────────────────────────────────────────────────────────
export async function login(input: LoginInput, ctx: RequestContext = {}) {
  const user = repo.findUserByEmail(input.email);
  // Always run a hash comparison to keep timing roughly uniform whether or not
  // the user exists (mitigates user enumeration).
  const ok = await verifyPassword(input.password, user?.passwordHash);
  if (!user || !ok) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  let amr = ['pwd'];
  let stepUpAt = 0;
  if (user.mfaEnabled) {
    if (!input.mfaCode) throw new ApiError(401, 'MFA code required', { code: 'MFA_REQUIRED' });
    if (!totp.verify(user.mfaSecret ?? '', input.mfaCode)) throw ApiError.unauthorized('Invalid MFA code');
    amr = ['pwd', 'mfa'];
    stepUpAt = Math.floor(Date.now() / 1000);
  }

  const accessToken = issueAccessToken(user, { amr, stepUpAt });
  const refreshToken = await issueRefreshToken(user.id, ctx);
  logger.info('user_login', { userId: user.id, mfa: user.mfaEnabled });
  return { user: publicUser(user), accessToken, refreshToken };
}

// ── Refresh (rotation + reuse detection) ─────────────────────────────────
export async function refresh(rawToken: string | undefined, ctx: RequestContext = {}) {
  if (!rawToken) throw ApiError.unauthorized('Missing refresh token');
  const record = repo.findRefreshByHash(hashRefreshToken(rawToken));
  if (!record) throw ApiError.unauthorized('Invalid refresh token');

  // Reuse detection: a token that was already rotated (revoked) being presented
  // again signals theft. Revoke the entire family and refuse.
  if (record.revoked) {
    logger.warn('refresh_token_reuse_detected', { userId: record.userId });
    repo.revokeAllForUser(record.userId);
    throw ApiError.unauthorized('Refresh token reuse detected; session revoked');
  }
  if (record.expiresAt < Date.now()) {
    throw ApiError.unauthorized('Refresh token expired');
  }

  const user = repo.findUserById(record.userId);
  if (!user) throw ApiError.unauthorized('Invalid refresh token');

  // Carry the device/session metadata forward across rotation so a session
  // keeps a stable identity in the sessions list.
  const newRaw = await issueRefreshToken(user.id, {
    userAgent: ctx.userAgent ?? record.userAgent,
    ip: ctx.ip ?? record.ip,
  });
  const newRecord = repo.findRefreshByHash(hashRefreshToken(newRaw))!;
  repo.updateRefreshToken(record.id, { revoked: true, replacedBy: newRecord.id });

  const amr = user.mfaEnabled ? ['pwd', 'mfa'] : ['pwd'];
  const accessToken = issueAccessToken(user, { amr, stepUpAt: 0 });
  return { accessToken, refreshToken: newRaw };
}

// ── Session management (user-facing) ─────────────────────────────────────
export interface SessionView {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  userAgent: string;
  ip: string;
  current: boolean;
}

/** List the caller's active sessions, flagging the one making this request. */
export function listSessions(requester: AuthUser, currentRawToken?: string): SessionView[] {
  const currentHash = currentRawToken ? hashRefreshToken(currentRawToken) : undefined;
  return repo
    .listActiveForUser(requester.id)
    .sort((a, b) => +new Date(b.lastUsedAt ?? b.createdAt) - +new Date(a.lastUsedAt ?? a.createdAt))
    .map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt ?? t.createdAt,
      userAgent: t.userAgent || 'Unknown device',
      ip: t.ip || '—',
      current: currentHash ? t.tokenHash === currentHash : false,
    }));
}

/** Revoke ONE session — object-level authz: must belong to the caller (API1). */
export function revokeSession(requester: AuthUser, id: string): void {
  const t = repo.findRefreshById(id);
  if (!t || t.userId !== requester.id) throw ApiError.notFound('Session not found');
  if (!t.revoked) repo.updateRefreshToken(id, { revoked: true });
}

/** "Sign out everywhere else" — revoke all of the caller's sessions but this one. */
export function signOutOthers(requester: AuthUser, currentRawToken?: string): { revoked: number } {
  const currentHash = currentRawToken ? hashRefreshToken(currentRawToken) : undefined;
  let revoked = 0;
  for (const t of repo.listActiveForUser(requester.id)) {
    if (currentHash && t.tokenHash === currentHash) continue; // keep the current session
    repo.updateRefreshToken(t.id, { revoked: true });
    revoked += 1;
  }
  return { revoked };
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const record = repo.findRefreshByHash(hashRefreshToken(rawToken));
  if (record && !record.revoked) repo.updateRefreshToken(record.id, { revoked: true });
}

// ── Step-up re-auth (API6) ───────────────────────────────────────────────
export async function stepUp(userId: string, input: StepUpInput) {
  const user = repo.findUserById(userId);
  if (!user) throw ApiError.unauthorized();
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');
  if (user.mfaEnabled) {
    if (!input.mfaCode || !totp.verify(user.mfaSecret ?? '', input.mfaCode)) {
      throw ApiError.unauthorized('Invalid MFA code');
    }
  }
  const stepUpAt = Math.floor(Date.now() / 1000);
  const amr = user.mfaEnabled ? ['pwd', 'mfa'] : ['pwd', 'reauth'];
  const accessToken = issueAccessToken(user, { amr, stepUpAt });
  return { accessToken, stepUpAt };
}

// ── MFA enrolment ────────────────────────────────────────────────────────
export function beginMfaEnrolment(userId: string) {
  const user = repo.findUserById(userId);
  if (!user) throw ApiError.unauthorized();
  const secret = totp.generateSecret();
  repo.updateUser(userId, { mfaSecret: secret, mfaEnabled: false });
  return { secret, otpauthUri: totp.otpauthUri(secret, { account: user.email }) };
}

export function confirmMfaEnrolment(userId: string, code: string) {
  const user = repo.findUserById(userId);
  if (!user || !user.mfaSecret) throw ApiError.badRequest('MFA enrolment not started');
  if (!totp.verify(user.mfaSecret, code)) throw ApiError.badRequest('Invalid MFA code');
  repo.updateUser(userId, { mfaEnabled: true });
  return { mfaEnabled: true };
}

/**
 * Change the caller's own password. Works both for a normal rotation AND for the
 * forced first-login change off an owner-issued temporary password (the user
 * supplies that temp password as `currentPassword`). On success we:
 *   - clear the `mustChangePassword` flag,
 *   - revoke EVERY existing session (a compromised temp password can't linger),
 *   - immediately mint a fresh session for the current device so the user isn't
 *     bounced back to the login screen right after changing it.
 */
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  ctx: RequestContext = {},
): Promise<{ accessToken: string; refreshToken: string }> {
  const user = repo.findUserById(userId);
  if (!user) throw ApiError.unauthorized();
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw ApiError.unauthorized('Current password is incorrect');
  }
  if (await verifyPassword(input.newPassword, user.passwordHash)) {
    throw ApiError.badRequest('New password must be different from the current one');
  }
  const updated = repo.updateUser(userId, {
    passwordHash: await hashPassword(input.newPassword),
    mustChangePassword: false,
    tempPasswordEnc: null, // the temp password is now void — destroy the recoverable copy
  })!;
  repo.revokeAllForUser(userId); // invalidate every old session (incl. other devices)

  const amr = updated.mfaEnabled ? ['pwd', 'mfa'] : ['pwd'];
  const accessToken = issueAccessToken(updated, { amr, stepUpAt: 0 });
  const refreshToken = await issueRefreshToken(updated.id, ctx);
  logger.info('password_changed', { userId });
  return { accessToken, refreshToken };
}

export function getMe(userId: string): PublicUser {
  const user = repo.findUserById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return publicUser(user);
}

/**
 * Store an uploaded profile picture (multipart via multer). The buffer is
 * re-validated by magic bytes in the storage adapter (the client MIME is never
 * trusted), a random object key is generated, and only that key is persisted.
 */
export function setAvatarFromUpload(userId: string, file: { buffer: Buffer; mimetype: string } | undefined): PublicUser {
  const user = repo.findUserById(userId);
  if (!user) throw ApiError.unauthorized();
  if (!file || !file.buffer?.length) throw ApiError.badRequest('No image file provided');

  const stored = fileStorage.store({ buffer: file.buffer, declaredType: file.mimetype, ownerId: userId });
  const updated = repo.updateUser(userId, { avatarKey: stored.key })!;
  logger.info('avatar_uploaded', { userId, size: stored.size, type: stored.contentType });
  return publicUser(updated);
}

/** Fetch the caller's stored avatar blob for serving (object-level: own only). */
export function getAvatarBlob(userId: string): { contentType: string; data: Buffer } {
  const user = repo.findUserById(userId);
  if (!user?.avatarKey) throw ApiError.notFound('No avatar set');
  const blob = fileStorage.get(user.avatarKey);
  if (!blob) throw ApiError.notFound('No avatar set');
  return { contentType: blob.contentType, data: blob.data };
}

/**
 * Update the caller's own profile (API3: only an allow-list of fields is
 * accepted — the schema already strips everything else, and we build the DB
 * patch by hand so role/orgId/email/passwordHash can never be reassigned here).
 *
 * If an avatar URL is supplied it is fetched SERVER-SIDE through the SSRF guard
 * (API7): private/internal addresses and non-image responses are rejected, and
 * only the resulting storage key is persisted — never the raw external URL.
 */
export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
  const user = repo.findUserById(userId);
  if (!user) throw ApiError.unauthorized();

  const patch: Partial<User> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.bio !== undefined) patch.bio = input.bio;

  if (input.avatarUrl) {
    const res = await safeFetch(input.avatarUrl, { method: 'GET' });
    const contentType = String(res.headers['content-type'] || '').split(';')[0].trim();
    if (!contentType.startsWith('image/')) throw ApiError.badRequest('URL did not return an image');
    const stored = fileStorage.store({ buffer: res.body, declaredType: contentType, ownerId: userId });
    patch.avatarKey = stored.key;
  }

  const updated = repo.updateUser(userId, patch);
  if (!updated) throw ApiError.notFound('User not found');
  logger.info('profile_updated', { userId, fields: Object.keys(patch) });
  return publicUser(updated);
}

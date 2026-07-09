import type { Request, Response } from 'express';
import * as service from './auth.service';
import { config } from '../../shared/config';

/**
 * HTTP adapter for the auth module. Thin: translates HTTP <-> service calls,
 * holds no business logic. The refresh token is additionally set as an
 * httpOnly, SameSite=strict, Secure cookie so browser clients never expose it
 * to JavaScript (mitigates XSS token theft).
 */
function setRefreshCookie(res: Response, token: string): void {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: config.jwt.refreshTtl * 1000,
  });
}

/** Capture device/session context for the sessions list. */
function ctxOf(req: Request): { userAgent?: string; ip?: string } {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

export async function register(req: Request, res: Response): Promise<void> {
  const result = await service.register(req.body, ctxOf(req));
  setRefreshCookie(res, result.refreshToken);
  res.status(201).json({
    user: result.user,
    org: result.org,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await service.login(req.body, ctxOf(req));
  setRefreshCookie(res, result.refreshToken);
  res.json({ user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const raw = req.cookies?.refreshToken || req.body.refreshToken;
  const result = await service.refresh(raw, ctxOf(req));
  setRefreshCookie(res, result.refreshToken);
  res.json({ accessToken: result.accessToken, refreshToken: result.refreshToken });
}

// ── Sessions ─────────────────────────────────────────────────────────────
export function listSessions(req: Request, res: Response): void {
  const raw = req.cookies?.refreshToken;
  res.json({ data: service.listSessions(req.user!, raw) });
}

export function revokeSession(req: Request, res: Response): void {
  service.revokeSession(req.user!, req.params.id);
  res.status(204).end();
}

export function signOutOthers(req: Request, res: Response): void {
  const raw = req.cookies?.refreshToken;
  res.json(service.signOutOthers(req.user!, raw));
}

export async function logout(req: Request, res: Response): Promise<void> {
  const raw = req.cookies?.refreshToken || req.body.refreshToken;
  await service.logout(raw);
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
  res.status(204).end();
}

export async function stepUp(req: Request, res: Response): Promise<void> {
  const result = await service.stepUp(req.user!.id, req.body);
  res.json(result);
}

export function me(req: Request, res: Response): void {
  res.json({ user: service.getMe(req.user!.id) });
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  res.json({ user: await service.updateProfile(req.user!.id, req.body) });
}

export function uploadAvatar(req: Request, res: Response): void {
  // multer put the parsed file on req.file (memory storage).
  const file = (req as Request & { file?: { buffer: Buffer; mimetype: string } }).file;
  res.json({ user: service.setAvatarFromUpload(req.user!.id, file) });
}

export function getAvatar(req: Request, res: Response): void {
  const blob = service.getAvatarBlob(req.user!.id);
  res.setHeader('Content-Type', blob.contentType);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.send(blob.data);
}

export function beginMfa(req: Request, res: Response): void {
  res.json(service.beginMfaEnrolment(req.user!.id));
}

export function confirmMfa(req: Request, res: Response): void {
  res.json(service.confirmMfaEnrolment(req.user!.id, req.body.mfaCode));
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const result = await service.changePassword(req.user!.id, req.body, ctxOf(req));
  // Rotate the current session's refresh cookie so the caller stays signed in
  // even though every previous session (this one included) was just revoked.
  setRefreshCookie(res, result.refreshToken);
  res.json({ accessToken: result.accessToken, refreshToken: result.refreshToken });
}

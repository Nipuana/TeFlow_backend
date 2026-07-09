import { notificationsRepository as repo, type Notification } from './notifications.repository';
import { authRepository } from '../auth/auth.repository';
import { ApiError } from '../../shared/utils/ApiError';
import logger from '../../shared/utils/logger';
import type { AuthUser } from '../../shared/types';

/**
 * Notifications domain/service.
 *
 * Notifications are strictly PER-USER. Object-level authorization (API1) is
 * enforced on every read/mutation: a caller only ever sees or mutates rows where
 * `notification.userId === requester.id`. Touching someone else's notification
 * returns 404 (we don't reveal it exists).
 *
 * `emit()` is the internal entry point other modules call when a real event
 * happens (comment added, task assigned, welcome). It never throws into the
 * caller — a failed notification must not break the action that triggered it.
 */
export interface EmitInput {
  userId: string; // recipient
  type: string;
  text: string;
  orgId?: string | null;
  actorId?: string; // whose name to attribute; resolved server-side
  resourceType?: string;
  resourceId?: string;
}

export function emit(input: EmitInput): void {
  try {
    if (!input.userId) return;
    let actorName: string | undefined;
    if (input.actorId) {
      actorName = authRepository.findUserById(input.actorId)?.name;
    }
    repo.create({
      userId: input.userId,
      orgId: input.orgId ?? null,
      type: input.type,
      text: input.text,
      actorName,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      read: false,
    });
  } catch (err) {
    logger.warn('notification_emit_failed', { err: (err as Error).message });
  }
}

/** Emit the same notification to several recipients, skipping the actor. */
export function emitMany(recipientIds: Iterable<string>, base: Omit<EmitInput, 'userId'>, skipUserId?: string): void {
  const seen = new Set<string>();
  for (const uid of recipientIds) {
    if (!uid || uid === skipUserId || seen.has(uid)) continue;
    seen.add(uid);
    emit({ ...base, userId: uid });
  }
}

export function list(requester: AuthUser): Notification[] {
  return repo
    .listForUser(requester.id)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function markRead(requester: AuthUser, id: string): Notification | undefined {
  const n = repo.findById(id);
  if (!n || n.userId !== requester.id) throw ApiError.notFound('Notification not found');
  return repo.update(id, { read: true });
}

export function markAllRead(requester: AuthUser): { updated: number } {
  let updated = 0;
  for (const n of repo.listForUser(requester.id)) {
    if (!n.read) {
      repo.update(n.id, { read: true });
      updated += 1;
    }
  }
  return { updated };
}

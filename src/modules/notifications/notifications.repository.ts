import { createCollection } from '../../shared/adapters/db';
import type { BaseDoc } from '../../shared/types';

export interface Notification extends BaseDoc {
  userId: string; // the RECIPIENT — notifications are strictly per-user
  orgId: string | null;
  type: string;
  actorName?: string;
  text: string;
  resourceType?: string;
  resourceId?: string;
  read: boolean;
}

const notifications = createCollection<Notification>('notifications');

export const notificationsRepository = {
  create(data: Partial<Notification>): Notification {
    return notifications.insert(data as Record<string, unknown>);
  },
  findById(id: string): Notification | undefined {
    return notifications.findById(id);
  },
  listForUser(userId: string): Notification[] {
    return notifications.find((n) => n.userId === userId);
  },
  update(id: string, patch: Partial<Notification>): Notification | undefined {
    return notifications.update(id, patch as Record<string, unknown>);
  },
  _reset(): void {
    notifications.clear();
  },
};

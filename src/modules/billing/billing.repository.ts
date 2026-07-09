import { createCollection } from '../../shared/adapters/db';
import type { BaseDoc, Role } from '../../shared/types';

export interface Invite extends BaseDoc {
  orgId: string;
  email: string;
  role: Role;
  invitedBy: string;
  status: string;
}

const invites = createCollection<Invite>('invites');

export const billingRepository = {
  createInvite(data: Partial<Invite>): Invite {
    return invites.insert(data as Record<string, unknown>);
  },
  findInvitesByOrg(orgId: string): Invite[] {
    return invites.find((i) => i.orgId === orgId);
  },
  countRecentInvites(orgId: string, sinceMs: number): number {
    return invites.find((i) => i.orgId === orgId && new Date(i.createdAt).getTime() >= sinceMs).length;
  },
  _reset(): void {
    invites.clear();
  },
};

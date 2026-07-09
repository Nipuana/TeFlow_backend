import { createCollection } from '../../shared/adapters/db';
import type { BaseDoc, Role } from '../../shared/types';

/**
 * Orgs repository — owns `orgs` and `memberships`.
 * Membership is the source of truth for who may act inside an org and in what
 * role, and underpins both function-level (API5) and object-level (API1) authz.
 */
export interface Org extends BaseDoc {
  name: string;
  ownerId: string;
  plan: string;
  seats: number;
  status?: string;
  deletedAt?: string;
}

export interface Membership extends BaseDoc {
  orgId: string;
  userId: string;
  role: Role;
}

const orgs = createCollection<Org>('orgs');
const memberships = createCollection<Membership>('memberships');

export const orgsRepository = {
  createOrg(data: Partial<Org>): Org {
    return orgs.insert(data as Record<string, unknown>);
  },
  findOrgById(id: string): Org | undefined {
    return orgs.findById(id);
  },
  updateOrg(id: string, patch: Partial<Org>): Org | undefined {
    return orgs.update(id, patch as Record<string, unknown>);
  },

  addMembership(data: Partial<Membership>): Membership {
    return memberships.insert(data as Record<string, unknown>);
  },
  findMembership(orgId: string, userId: string): Membership | undefined {
    return memberships.findOne((m) => m.orgId === orgId && m.userId === userId);
  },
  updateMembership(id: string, patch: Partial<Membership>): Membership | undefined {
    return memberships.update(id, patch as Record<string, unknown>);
  },
  removeMembership(id: string): boolean {
    return memberships.delete(id);
  },
  listMembers(orgId: string): Membership[] {
    return memberships.find((m) => m.orgId === orgId);
  },
  listMembershipsForUser(userId: string): Membership[] {
    return memberships.find((m) => m.userId === userId);
  },

  _reset(): void {
    orgs.clear();
    memberships.clear();
  },
};

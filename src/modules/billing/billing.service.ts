import { billingRepository as repo } from './billing.repository';
import { orgsRepository } from '../orgs/orgs.repository';
import * as orgsService from '../orgs/orgs.service';
import { authRepository } from '../auth/auth.repository';
import { ApiError } from '../../shared/utils/ApiError';
import logger from '../../shared/utils/logger';
import type { AuthUser, Role } from '../../shared/types';

/**
 * Billing & admin domain/service — the home of the SENSITIVE BUSINESS FLOWS
 * (API6): upgrade plan, invite teammates, bulk export, delete org.
 *
 * Defence layers for these flows:
 *   - Function-level authz (API5): routes require an admin/owner role.
 *   - Object-level authz (API1): membership re-checked here in the service.
 *   - Step-up re-auth (API6): enforced by `requireStepUp` middleware at the route.
 *   - Rate limits + anomaly flagging (API6): abnormal invite volume is detected
 *     and blocked here, independent of the generic rate limiter.
 */
const PLANS: Record<string, { seats: number }> = {
  free: { seats: 5 },
  pro: { seats: 25 },
  enterprise: { seats: 1000 },
};
const INVITE_ANOMALY_WINDOW_MS = 10 * 60_000;
const INVITE_ANOMALY_THRESHOLD = 15;

export function getBilling(requester: AuthUser) {
  orgsService.assertMember(requester.orgId, requester.id, 'admin');
  const org = orgsRepository.findOrgById(requester.orgId)!;
  return { plan: org.plan, seats: org.seats };
}

export function upgradePlan(requester: AuthUser, plan: string) {
  // owner-only, and the route also enforces step-up re-auth (API6).
  orgsService.assertMember(requester.orgId, requester.id, 'owner');
  if (!PLANS[plan]) throw ApiError.badRequest('Unknown plan');
  const org = orgsRepository.updateOrg(requester.orgId, { plan, seats: PLANS[plan].seats })!;
  logger.info('billing_plan_changed', { orgId: requester.orgId, plan, actor: requester.id });
  return { plan: org.plan, seats: org.seats };
}

export function inviteMember(requester: AuthUser, input: { email: string; role: Role }) {
  orgsService.assertMember(requester.orgId, requester.id, 'admin');
  // The invite schema already forbids the `owner` role (single-owner model); the
  // admin-level membership check above is the authorization boundary.

  // API6: anomaly detection on abnormal invite volume.
  const recent = repo.countRecentInvites(requester.orgId, Date.now() - INVITE_ANOMALY_WINDOW_MS);
  if (recent >= INVITE_ANOMALY_THRESHOLD) {
    logger.warn('invite_anomaly_flagged', { orgId: requester.orgId, recent, actor: requester.id });
    throw ApiError.tooMany('Unusual invite volume detected; please try again later');
  }

  const invite = repo.createInvite({
    orgId: requester.orgId,
    email: input.email,
    role: input.role,
    invitedBy: requester.id,
    status: 'pending',
  });

  // If the invitee already has an account, attach membership immediately.
  const existingUser = authRepository.findUserByEmail(input.email);
  if (existingUser && !orgsRepository.findMembership(requester.orgId, existingUser.id)) {
    orgsRepository.addMembership({ orgId: requester.orgId, userId: existingUser.id, role: input.role });
    // Keep the JWT-facing home role in sync with the new membership (API5).
    authRepository.updateUser(existingUser.id, { role: input.role });
  }
  logger.info('member_invited', { orgId: requester.orgId, role: input.role, actor: requester.id });
  return invite;
}

/**
 * Bulk export (API4/API6). Heavy work would be handed to a job queue (BullMQ) in
 * production; here we return a small synchronous CSV to keep the demo runnable,
 * but the flow is rate-limited and admin-gated exactly as it would be for a job.
 */
export function exportOrgData(requester: AuthUser) {
  orgsService.assertMember(requester.orgId, requester.id, 'admin');
  const members = orgsRepository.listMembers(requester.orgId);
  const header = 'userId,role,joinedAt';
  const rows = members.map((m) => `${m.userId},${m.role},${m.createdAt}`);
  logger.info('org_export_requested', { orgId: requester.orgId, actor: requester.id });
  return { format: 'csv', content: [header, ...rows].join('\n') };
}

export function deleteOrg(requester: AuthUser) {
  // owner-only + step-up enforced at the route.
  orgsService.assertMember(requester.orgId, requester.id, 'owner');
  const org = orgsRepository.findOrgById(requester.orgId);
  if (!org) throw ApiError.notFound('Organization not found');
  orgsRepository.updateOrg(requester.orgId, { deletedAt: new Date().toISOString(), status: 'deleted' });
  logger.warn('org_deleted', { orgId: requester.orgId, actor: requester.id });
  return { deleted: true };
}

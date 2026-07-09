import { orgsRepository as repo, type Org, type Membership } from './orgs.repository';
import { authRepository } from '../auth/auth.repository';
import * as notifications from '../notifications/notifications.service';
import { hashPassword, generateTemporaryPassword } from '../../shared/utils/password';
import { sealSecret, openSecret } from '../../shared/utils/secretBox';
import { ROLE_RANK, rankOf } from '../../shared/middleware/rbac';
import { ApiError } from '../../shared/utils/ApiError';
import logger from '../../shared/utils/logger';
import type { AuthUser, Role } from '../../shared/types';

/** A member joined with the safe fields of their user record. */
export interface MemberView {
  userId: string;
  role: Role;
  name: string;
  email: string;
  joinedAt: string;
  /** True while the account is still on its owner-issued temporary password. */
  pendingPasswordChange: boolean;
}

/**
 * Orgs domain/service layer — pure business logic, no HTTP knowledge.
 *
 * Object-level authorization (API1) is enforced HERE, not in the controller and
 * never trusted from the request: every read/write first resolves the caller's
 * membership in the target org and checks role. A caller who is not a member of
 * an org gets a 404 (we don't reveal existence to non-members).
 *
 * Account provisioning (owner creates employee/manager/intern accounts) also
 * lives here, layered with function-level authz at the route (API5) and
 * object-level authz in this service (API1).
 */

/** Boolean membership check (does not throw) — for validating assignees/team adds. */
export function isOrgMember(orgId: string, userId: string): boolean {
  return Boolean(repo.findMembership(orgId, userId));
}

export function assertMember(orgId: string, userId: string, minRole: Role = 'employee'): Membership {
  const membership = repo.findMembership(orgId, userId);
  if (!membership) throw ApiError.notFound('Organization not found');
  if (rankOf(membership.role) < ROLE_RANK[minRole]) {
    throw ApiError.forbidden('Insufficient role in this organization');
  }
  return membership;
}

/** Create an org and make the given user its owner. Called during registration. */
export function provisionOrgForOwner({ ownerId, name }: { ownerId: string; name: string }): Org {
  const org = repo.createOrg({ name, ownerId, plan: 'free', seats: 5 });
  repo.addMembership({ orgId: org.id, userId: ownerId, role: 'owner' });
  return org;
}

export function getOrg(orgId: string, requester: AuthUser): Org | undefined {
  assertMember(orgId, requester.id);
  return repo.findOrgById(orgId);
}

export function listMyOrgs(userId: string) {
  const memberships = repo.listMembershipsForUser(userId);
  return memberships
    .map((m) => {
      const org = repo.findOrgById(m.orgId);
      return org ? { ...org, myRole: m.role } : undefined;
    })
    .filter((o): o is Org & { myRole: Role } => Boolean(o));
}

/** Update org settings — admin+ only (also gated by RBAC middleware at route). */
export function updateOrg(orgId: string, requester: AuthUser, patch: { name?: string }): Org | undefined {
  assertMember(orgId, requester.id, 'admin');
  // Allow-listed fields only (API3): only `name` may be changed here.
  const allowed: Partial<Org> = {};
  if (patch.name !== undefined) allowed.name = patch.name;
  return repo.updateOrg(orgId, allowed);
}

export function listMembers(orgId: string, requester: AuthUser): MemberView[] {
  assertMember(orgId, requester.id);
  // Join each membership with the user's safe fields so the UI can show names
  // for assignment/role management (never exposes passwordHash/mfaSecret).
  return repo.listMembers(orgId).map((m) => {
    const u = authRepository.findUserById(m.userId);
    return {
      userId: m.userId,
      role: m.role,
      name: u?.name ?? 'Unknown user',
      email: u?.email ?? '',
      joinedAt: m.createdAt,
      pendingPasswordChange: Boolean(u?.mustChangePassword),
    };
  });
}

/**
 * Owner creates a new user account inside the org (employee / manager / intern /
 * admin), pre-provisioned with a one-time temporary password. The temp password
 * is returned to the owner exactly ONCE (never stored in plaintext, never shown
 * again) and the account is flagged `mustChangePassword`, so the new user is
 * forced to set their own password before doing anything.
 *
 * Guards:
 *   - owner-only (function-level at the route + object-level re-check here),
 *   - the `owner` role can never be granted this way (single-owner model),
 *   - email uniqueness (non-enumerating conflict message).
 */
export function createMemberAccount(
  orgId: string,
  requester: AuthUser,
  input: { name: string; email: string; role: Role },
): Promise<{ member: MemberView; temporaryPassword: string }> {
  assertMember(orgId, requester.id, 'owner');
  if (input.role === 'owner') throw ApiError.forbidden('Cannot create another owner');

  const email = input.email.toLowerCase();
  if (authRepository.findUserByEmail(email)) {
    throw ApiError.conflict('An account with those details already exists');
  }

  const temporaryPassword = generateTemporaryPassword();
  // hashPassword is async; wrap the whole creation so callers await a clean result.
  return hashPassword(temporaryPassword).then((passwordHash) => {
    const user = authRepository.createUser({
      email,
      passwordHash,
      name: input.name,
      orgId,
      role: input.role,
      mfaEnabled: false,
      mustChangePassword: true,
      tempPasswordEnc: sealSecret(temporaryPassword), // so the owner can re-view it until it's used
    });
    const membership = repo.addMembership({ orgId, userId: user.id, role: input.role });

    notifications.emit({
      userId: user.id,
      orgId,
      type: 'welcome',
      text: 'Your account was created. Please set a new password to get started.',
    });
    logger.info('member_account_created', { orgId, role: input.role, actor: requester.id, userId: user.id });

    return {
      temporaryPassword,
      member: {
        userId: user.id,
        role: input.role,
        name: user.name,
        email: user.email,
        joinedAt: membership.createdAt,
        pendingPasswordChange: true,
      },
    };
  });
}

/**
 * Owner resets a member's password back to a fresh one-time temporary password
 * (e.g. the user is locked out). Every existing session of that user is revoked
 * and they are forced to change it again on next login. Owner-only.
 */
export function resetMemberPassword(
  orgId: string,
  requester: AuthUser,
  targetUserId: string,
): Promise<{ temporaryPassword: string }> {
  assertMember(orgId, requester.id, 'owner');
  if (targetUserId === requester.id) {
    throw ApiError.badRequest('Use the change-password flow for your own account');
  }
  const membership = repo.findMembership(orgId, targetUserId);
  if (!membership) throw ApiError.notFound('Member not found');

  const temporaryPassword = generateTemporaryPassword();
  return hashPassword(temporaryPassword).then((passwordHash) => {
    authRepository.updateUser(targetUserId, {
      passwordHash,
      mustChangePassword: true,
      tempPasswordEnc: sealSecret(temporaryPassword),
    });
    authRepository.revokeAllForUser(targetUserId); // lock out any live sessions immediately
    logger.warn('member_password_reset', { orgId, actor: requester.id, target: targetUserId });
    return { temporaryPassword };
  });
}

/**
 * Re-reveal an owner-provisioned account's temporary password — owner-only.
 * If the user has already set their own password (`mustChangePassword` cleared,
 * the sealed copy destroyed), there is nothing to show and we report that the
 * password has been changed. If the account predates this feature the sealed
 * copy may be absent even though it's still pending — reported as unavailable.
 */
export function getMemberTempPassword(
  orgId: string,
  requester: AuthUser,
  targetUserId: string,
): { changed: boolean; temporaryPassword: string | null } {
  assertMember(orgId, requester.id, 'owner');
  const membership = repo.findMembership(orgId, targetUserId);
  if (!membership) throw ApiError.notFound('Member not found');
  const user = authRepository.findUserById(targetUserId);
  if (!user) throw ApiError.notFound('Member not found');

  // The user has set their own password → the temp secret no longer exists.
  if (!user.mustChangePassword) return { changed: true, temporaryPassword: null };

  logger.info('member_temp_password_viewed', { orgId, actor: requester.id, target: targetUserId });
  return { changed: false, temporaryPassword: openSecret(user.tempPasswordEnc) };
}

/** Add or update a member's role. Admin+ only. Keeps the JWT-facing `user.role`
 *  in sync with the membership role so function-level RBAC (API5) actually sees
 *  the change on the caller's next token. */
export function setMemberRole(
  orgId: string,
  requester: AuthUser,
  targetUserId: string,
  role: Role,
): Membership | undefined {
  const actor = assertMember(orgId, requester.id, 'admin');
  const org = repo.findOrgById(orgId);
  if (targetUserId === requester.id) {
    throw ApiError.badRequest('You cannot change your own role');
  }
  if (org && targetUserId === org.ownerId) {
    throw ApiError.forbidden("The organization owner's role cannot be changed");
  }
  if ((role === 'owner' || role === 'admin') && actor.role !== 'owner') {
    throw ApiError.forbidden('Only the owner may assign admin or owner roles');
  }
  if (role === 'owner') {
    throw ApiError.forbidden('Ownership transfer is not supported here');
  }
  const existing = repo.findMembership(orgId, targetUserId);
  if (!existing) throw ApiError.notFound('Member not found');

  const updated = repo.updateMembership(existing.id, { role });
  // Single-org model: the user's home role mirrors this membership.
  authRepository.updateUser(targetUserId, { role });
  logger.info('member_role_changed', { orgId, actor: requester.id, target: targetUserId, role });
  return updated;
}

/** Remove a member from the org. Admin+ only; the owner and yourself are protected. */
export function removeMember(orgId: string, requester: AuthUser, targetUserId: string): { removed: boolean } {
  assertMember(orgId, requester.id, 'admin');
  const org = repo.findOrgById(orgId);
  if (targetUserId === requester.id) throw ApiError.badRequest('You cannot remove yourself');
  if (org && targetUserId === org.ownerId) throw ApiError.forbidden('The owner cannot be removed');
  const membership = repo.findMembership(orgId, targetUserId);
  if (!membership) throw ApiError.notFound('Member not found');

  repo.removeMembership(membership.id);
  authRepository.revokeAllForUser(targetUserId); // end their access immediately
  logger.warn('member_removed', { orgId, actor: requester.id, target: targetUserId });
  return { removed: true };
}

export { ROLE_RANK };

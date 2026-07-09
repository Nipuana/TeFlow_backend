import { projectsRepository as repo, type Project } from './projects.repository';
import * as orgsService from '../orgs/orgs.service';
import { ROLE_RANK, rankOf } from '../../shared/middleware/rbac';
import { ApiError } from '../../shared/utils/ApiError';
import type { AuthUser, Role } from '../../shared/types';

/**
 * Projects domain/service.
 *
 * API1 (Broken Object Level Authorization) is the primary concern here. Every
 * single-resource operation calls `loadOwned`, which:
 *   1. loads the project by id,
 *   2. verifies `project.orgId` matches the caller's org,
 *   3. verifies the caller is actually a member of that org (with a min role), AND
 *   4. for non-managers, verifies the caller is on THIS project's team.
 * The object id from the URL is NEVER trusted on its own — a valid id belonging
 * to another org (or one the caller isn't on) yields 404, not the record.
 *
 * VISIBILITY RULE (the core business rule): a manager+ sees and manages every
 * project in the org; everyone below manager only ever sees the projects whose
 * team they are on. This is enforced server-side here — the client's role is
 * never trusted for it.
 */

/** True if the caller's role is manager or above (org-wide project visibility). */
function seesAllProjects(requester: AuthUser): boolean {
  return rankOf(requester.role) >= ROLE_RANK.manager;
}

export function loadOwned(projectId: string, requester: AuthUser, minRole: Role = 'employee'): Project {
  const project = repo.findById(projectId);
  // Uniform 404 whether it doesn't exist or belongs to another org — do not
  // leak the existence of other orgs' resources.
  if (!project || project.orgId !== requester.orgId) {
    throw ApiError.notFound('Project not found');
  }
  orgsService.assertMember(project.orgId, requester.id, minRole);
  // Non-managers may only touch projects they are actually a member of. Same
  // uniform 404 so we don't reveal that a project they can't access exists.
  if (!seesAllProjects(requester) && !(project.memberIds ?? []).includes(requester.id)) {
    throw ApiError.notFound('Project not found');
  }
  return project;
}

export function list(requester: AuthUser): Project[] {
  orgsService.assertMember(requester.orgId, requester.id);
  const all = repo.findByOrg(requester.orgId);
  if (seesAllProjects(requester)) return all;
  return all.filter((p) => (p.memberIds ?? []).includes(requester.id));
}

export function get(projectId: string, requester: AuthUser): Project {
  return loadOwned(projectId, requester);
}

export function create(requester: AuthUser, input: { name: string; description?: string }): Project {
  // Creating and owning projects is a manager+ responsibility.
  orgsService.assertMember(requester.orgId, requester.id, 'manager');
  return repo.create({
    orgId: requester.orgId, // server-set from the authenticated context, never from the body
    name: input.name,
    description: input.description || '',
    createdBy: requester.id,
    memberIds: [requester.id], // creator is the first project member
  });
}

/** Add an ORG member to the project team. The userId must belong to the org —
 *  you can only add people who are in your organization (never arbitrary ids). */
export function addMember(projectId: string, requester: AuthUser, userId: string): Project {
  const project = loadOwned(projectId, requester, 'manager');
  if (!orgsService.isOrgMember(project.orgId, userId)) {
    throw ApiError.badRequest('User is not a member of this organization');
  }
  const memberIds = Array.from(new Set([...(project.memberIds ?? []), userId]));
  return repo.update(projectId, { memberIds })!;
}

export function removeMember(projectId: string, requester: AuthUser, userId: string): Project {
  const project = loadOwned(projectId, requester, 'manager');
  if (userId === project.createdBy) {
    throw ApiError.badRequest('The project creator cannot be removed from the team');
  }
  const memberIds = (project.memberIds ?? []).filter((id) => id !== userId);
  return repo.update(projectId, { memberIds })!;
}

/** Guard used by the tasks module: an assignee must be on the project team. */
export function assertAssignable(project: Project, userId: string): void {
  if (!(project.memberIds ?? []).includes(userId)) {
    throw ApiError.badRequest('Assignee must be a member of this project');
  }
}

export function update(
  projectId: string,
  requester: AuthUser,
  patch: { name?: string; description?: string },
): Project | undefined {
  loadOwned(projectId, requester, 'manager');
  // Allow-listed fields only (API3) — orgId / createdBy can never be reassigned.
  const allowed: Partial<Project> = {};
  if (patch.name !== undefined) allowed.name = patch.name;
  if (patch.description !== undefined) allowed.description = patch.description;
  return repo.update(projectId, allowed);
}

export function remove(projectId: string, requester: AuthUser): void {
  loadOwned(projectId, requester, 'admin');
  repo.remove(projectId);
}

import { tasksRepository as repo, type Task, type Comment, type Attachment } from './tasks.repository';
import * as projectsService from '../projects/projects.service';
import * as notifications from '../notifications/notifications.service';
import * as fileStorage from '../../shared/adapters/fileStorage';
import { ApiError } from '../../shared/utils/ApiError';
import { config } from '../../shared/config';
import type { AuthUser, Role } from '../../shared/types';

/**
 * Tasks domain/service.
 *
 * Security highlights:
 *   - API1: every task/comment/attachment is reached only after confirming the
 *     parent project belongs to the caller's org (via projectsService.loadOwned)
 *     AND that the loaded task's own orgId matches.
 *   - API3: writes go through an explicit field ALLOW-LIST. We never
 *     `Object.assign(task, req.body)`; server-owned fields (orgId, createdBy,
 *     projectId) cannot be set or moved by the client.
 *   - API4: bulk creation is length-capped and attachments are size/type-capped
 *     by the file-storage adapter.
 */
const WRITABLE_TASK_FIELDS: (keyof Task)[] = [
  'title',
  'description',
  'status',
  'priority',
  'assigneeId',
  'startDate',
  'dueDate',
];
const MAX_BULK = 50;

/** Reject a schedule where the start is after the end (compares the effective
 *  values, i.e. patch merged over what the task already has). */
function assertDateOrder(startDate?: string | null, dueDate?: string | null): void {
  if (startDate && dueDate && new Date(startDate).getTime() > new Date(dueDate).getTime()) {
    throw ApiError.badRequest('Start date must be on or before the end date');
  }
}

function loadProject(projectId: string, requester: AuthUser, minRole: Role = 'employee') {
  return projectsService.loadOwned(projectId, requester, minRole);
}

function loadTask(projectId: string, taskId: string, requester: AuthUser, minRole: Role = 'employee'): Task {
  loadProject(projectId, requester, minRole);
  const task = repo.findTaskById(taskId);
  if (!task || task.projectId !== projectId || task.orgId !== requester.orgId) {
    throw ApiError.notFound('Task not found');
  }
  return task;
}

function pickAllowed(body: Record<string, unknown>): Partial<Task> {
  const out: Partial<Task> = {};
  for (const field of WRITABLE_TASK_FIELDS) {
    if (body[field] !== undefined) {
      (out as Record<string, unknown>)[field] = body[field];
    }
  }
  return out;
}

export function listTasks(projectId: string, requester: AuthUser): Task[] {
  loadProject(projectId, requester);
  return repo.findTasksByProject(projectId);
}

export function getTask(projectId: string, taskId: string, requester: AuthUser): Task {
  return loadTask(projectId, taskId, requester);
}

export function createTask(projectId: string, requester: AuthUser, body: Record<string, unknown>): Task {
  const project = loadProject(projectId, requester, 'employee');
  const fields = pickAllowed(body);
  if (fields.assigneeId) projectsService.assertAssignable(project, fields.assigneeId as string);
  assertDateOrder(fields.startDate, fields.dueDate);
  const task = repo.createTask({
    ...fields,
    status: fields.status || 'todo',
    priority: fields.priority || 'normal',
    projectId, // server-set
    orgId: requester.orgId, // server-set from auth context
    createdBy: requester.id,
  });
  // Notify the assignee if the task was created already assigned to someone else.
  if (task.assigneeId && task.assigneeId !== requester.id) {
    notifications.emit({
      userId: task.assigneeId,
      orgId: requester.orgId,
      type: 'assigned',
      actorId: requester.id,
      text: `assigned you "${task.title}"`,
      resourceType: 'task',
      resourceId: task.id,
    });
  }
  return task;
}

export function bulkCreate(projectId: string, requester: AuthUser, items: Record<string, unknown>[]): Task[] {
  const project = loadProject(projectId, requester, 'employee');
  if (!Array.isArray(items) || items.length === 0) throw ApiError.badRequest('No tasks provided');
  if (items.length > MAX_BULK) {
    throw ApiError.badRequest(`Cannot create more than ${MAX_BULK} tasks at once`);
  }
  return items.map((item) => {
    const fields = pickAllowed(item);
    if (fields.assigneeId) projectsService.assertAssignable(project, fields.assigneeId as string);
    assertDateOrder(fields.startDate, fields.dueDate);
    return repo.createTask({
      ...fields,
      status: fields.status || 'todo',
      priority: fields.priority || 'normal',
      projectId,
      orgId: requester.orgId,
      createdBy: requester.id,
    });
  });
}

export function updateTask(
  projectId: string,
  taskId: string,
  requester: AuthUser,
  body: Record<string, unknown>,
): Task | undefined {
  const before = loadTask(projectId, taskId, requester, 'employee');
  const patch = pickAllowed(body); // allow-listed patch only
  // A (re)assignment must target a member of this project's team.
  if (patch.assigneeId) {
    const project = projectsService.loadOwned(projectId, requester, 'employee');
    projectsService.assertAssignable(project, patch.assigneeId as string);
  }
  // Validate the EFFECTIVE schedule (incoming patch merged over current values).
  assertDateOrder(
    patch.startDate !== undefined ? patch.startDate : before.startDate,
    patch.dueDate !== undefined ? patch.dueDate : before.dueDate,
  );
  const updated = repo.updateTask(taskId, patch);
  // Notify a newly-assigned user (assignee changed to someone other than the actor).
  if (updated && patch.assigneeId && patch.assigneeId !== before.assigneeId && patch.assigneeId !== requester.id) {
    notifications.emit({
      userId: patch.assigneeId,
      orgId: requester.orgId,
      type: 'assigned',
      actorId: requester.id,
      text: `assigned you "${updated.title}"`,
      resourceType: 'task',
      resourceId: updated.id,
    });
  }
  return updated;
}

export function removeTask(projectId: string, taskId: string, requester: AuthUser): void {
  loadTask(projectId, taskId, requester, 'employee');
  repo.removeTask(taskId);
}

// ── Comments ──────────────────────────────────────────────────────────────
export function listComments(projectId: string, taskId: string, requester: AuthUser): Comment[] {
  loadTask(projectId, taskId, requester);
  return repo.findCommentsByTask(taskId);
}

export function addComment(
  projectId: string,
  taskId: string,
  requester: AuthUser,
  body: { body: string },
): Comment {
  const task = loadTask(projectId, taskId, requester, 'employee');
  const comment = repo.createComment({ taskId, orgId: requester.orgId, authorId: requester.id, body: body.body });
  // Notify the task's creator and its assignee (excluding whoever commented).
  notifications.emitMany(
    [task.createdBy, task.assigneeId].filter((id): id is string => Boolean(id)),
    {
      orgId: requester.orgId,
      type: 'comment',
      actorId: requester.id,
      text: `commented on "${task.title}"`,
      resourceType: 'task',
      resourceId: task.id,
    },
    requester.id,
  );
  return comment;
}

// ── Attachments (API4: size/type caps enforced in fileStorage) ─────────────
export function addAttachment(
  projectId: string,
  taskId: string,
  requester: AuthUser,
  input: { filename: string; contentBase64: string; declaredType: string },
): Attachment {
  loadTask(projectId, taskId, requester, 'employee');

  let buffer: Buffer;
  try {
    buffer = Buffer.from(input.contentBase64, 'base64');
  } catch {
    throw ApiError.badRequest('Invalid file encoding');
  }
  if (buffer.length > config.limits.maxUploadBytes) {
    throw ApiError.tooLarge('File exceeds the maximum allowed size');
  }

  const stored = fileStorage.store({ buffer, declaredType: input.declaredType, ownerId: requester.id });
  return repo.createAttachment({
    taskId,
    orgId: requester.orgId,
    key: stored.key,
    contentType: stored.contentType,
    size: stored.size,
    filename: String(input.filename).slice(0, 200),
    uploadedBy: requester.id,
  });
}

export function listAttachments(projectId: string, taskId: string, requester: AuthUser): Attachment[] {
  loadTask(projectId, taskId, requester);
  return repo.findAttachmentsByTask(taskId);
}

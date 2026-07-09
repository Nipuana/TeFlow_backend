import { createCollection } from '../../shared/adapters/db';
import type { BaseDoc } from '../../shared/types';

export interface Task extends BaseDoc {
  projectId: string;
  orgId: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assigneeId?: string;
  /** Scheduled start of the task (calendar date, stored as UTC midnight). */
  startDate?: string;
  /** Deadline / end date (calendar date, stored as UTC midnight). */
  dueDate?: string;
  createdBy: string;
}

export interface Comment extends BaseDoc {
  taskId: string;
  orgId: string;
  authorId: string;
  body: string;
}

export interface Attachment extends BaseDoc {
  taskId: string;
  orgId: string;
  key: string;
  contentType: string;
  size: number;
  filename: string;
  uploadedBy: string;
}

const tasks = createCollection<Task>('tasks');
const comments = createCollection<Comment>('comments');
const attachments = createCollection<Attachment>('attachments');

export const tasksRepository = {
  createTask(data: Partial<Task>): Task {
    return tasks.insert(data as Record<string, unknown>);
  },
  findTaskById(id: string): Task | undefined {
    return tasks.findById(id);
  },
  findTasksByProject(projectId: string): Task[] {
    return tasks.find((t) => t.projectId === projectId);
  },
  updateTask(id: string, patch: Partial<Task>): Task | undefined {
    return tasks.update(id, patch as Record<string, unknown>);
  },
  removeTask(id: string): boolean {
    return tasks.delete(id);
  },

  createComment(data: Partial<Comment>): Comment {
    return comments.insert(data as Record<string, unknown>);
  },
  findCommentsByTask(taskId: string): Comment[] {
    return comments.find((c) => c.taskId === taskId);
  },

  createAttachment(data: Partial<Attachment>): Attachment {
    return attachments.insert(data as Record<string, unknown>);
  },
  findAttachmentsByTask(taskId: string): Attachment[] {
    return attachments.find((a) => a.taskId === taskId);
  },
  findAttachmentById(id: string): Attachment | undefined {
    return attachments.findById(id);
  },

  _reset(): void {
    tasks.clear();
    comments.clear();
    attachments.clear();
  },
};

import { z } from 'zod';

const status = z.enum(['todo', 'in_progress', 'blocked', 'done']);
const priority = z.enum(['low', 'normal', 'high', 'critical']);

export const params = z
  .object({
    projectId: z.string().uuid(),
    taskId: z.string().uuid().optional(),
  })
  .strict();

const taskFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  status: status.optional(),
  priority: priority.optional(),
  assigneeId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
};

export const createSchema = z.object(taskFields).strict();

export const updateSchema = z
  .object({
    title: taskFields.title.optional(),
    description: taskFields.description,
    status: taskFields.status,
    priority: taskFields.priority,
    // nullable so the client can UNASSIGN or clear a start / end date
    assigneeId: z.string().uuid().nullable().optional(),
    startDate: z.string().datetime().nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
  })
  .strict();

// API4: bulk creation is bounded in size; the service enforces the 50-item cap too.
export const bulkSchema = z
  .object({
    tasks: z.array(createSchema).min(1).max(50),
  })
  .strict();

export const commentSchema = z.object({ body: z.string().trim().min(1).max(5000) }).strict();

export const attachmentSchema = z
  .object({
    filename: z.string().trim().min(1).max(200),
    declaredType: z.string().trim().min(1).max(100),
    contentBase64: z.string().min(1),
  })
  .strict();

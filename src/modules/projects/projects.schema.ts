import { z } from 'zod';

export const idParam = z.object({ projectId: z.string().uuid() }).strict();

export const createSchema = z
  .object({
    name: z.string().trim().min(1).max(140),
    description: z.string().trim().max(2000).optional(),
    // NOTE: no `orgId` here — it is set from the authenticated context, never
    // accepted from the client (API3 / API1).
  })
  .strict();

export const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(140).optional(),
    description: z.string().trim().max(2000).optional(),
  })
  .strict();

export const addMemberSchema = z.object({ userId: z.string().uuid() }).strict();

export const memberParam = z.object({ projectId: z.string().uuid(), userId: z.string().uuid() }).strict();

export const listQuery = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  })
  .strict();

import { z } from 'zod';

export const idParam = z.object({ orgId: z.string().uuid() }).strict();

export const memberParam = z.object({ orgId: z.string().uuid(), userId: z.string().uuid() }).strict();

export const updateOrgSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

// Roles an owner/admin may assign to a member. `owner` is intentionally excluded
// (single-owner model — no ownership transfer through this surface).
const assignableRole = z.enum(['employee', 'manager', 'admin']);

export const setRoleSchema = z
  .object({
    userId: z.string().uuid(),
    role: assignableRole,
  })
  .strict();

// Owner-provisioned account. `.strict()` blocks mass-assignment (API3): a client
// cannot smuggle in a password, orgId, mfa state, etc. — the server sets those.
export const createMemberSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(254),
    role: assignableRole,
  })
  .strict();

import { z } from 'zod';

export const upgradeSchema = z.object({ plan: z.enum(['free', 'pro', 'enterprise']) }).strict();

export const inviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(['employee', 'manager', 'admin']),
  })
  .strict();

import { z } from 'zod';

// A permissive http(s) URL at the schema level; the SSRF guard does the real
// safety validation (private ranges, DNS) in the service/adapter layer.
const httpUrl = z
  .string()
  .max(2048)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL');

export const registerWebhookSchema = z
  .object({
    url: httpUrl,
    event: z.enum(['task.created', 'task.updated', 'project.created', 'member.invited']),
  })
  .strict();

export const webhookIdParam = z.object({ webhookId: z.string().uuid() }).strict();

export const avatarFromUrlSchema = z.object({ url: httpUrl }).strict();

export const consumeSchema = z
  .object({
    provider: z.enum(['exchangeRates']),
    params: z.record(z.string(), z.string()).optional(),
  })
  .strict();

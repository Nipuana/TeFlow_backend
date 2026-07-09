import { z } from 'zod';

/**
 * Zod schemas for the auth module. Every write uses `.strict()` so unknown keys
 * are rejected — a client cannot inject `role`, `orgId`, `mfaEnabled`, etc.
 * (API3: Mass Assignment defence).
 */
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10).max(200);
const mfaCode = z.string().regex(/^\d{6}$/, 'MFA code must be 6 digits');

export const registerSchema = z
  .object({
    email,
    password,
    name: z.string().trim().min(1).max(120),
    orgName: z.string().trim().min(1).max(120),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(200),
    mfaCode: mfaCode.optional(),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1).optional(), // may instead come from cookie
  })
  .strict();

export const stepUpSchema = z
  .object({
    password: z.string().min(1).max(200),
    mfaCode: mfaCode.optional(),
  })
  .strict();

export const enableMfaConfirmSchema = z.object({ mfaCode }).strict();

export const sessionIdParam = z.object({ id: z.string().uuid() }).strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: password,
  })
  .strict();

// Only these three fields may be changed via profile update. `.strict()` rejects
// anything else (role, orgId, email, mfaEnabled, …) — API3 mass-assignment guard.
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    bio: z.string().trim().max(500).optional(),
    avatarUrl: z
      .string()
      .max(2048)
      .url()
      .refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL')
      .optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type StepUpInput = z.infer<typeof stepUpSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

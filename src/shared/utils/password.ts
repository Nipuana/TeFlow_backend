import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Password hashing (API2). bcrypt with a per-hash salt and a work factor that
 * makes offline cracking expensive. Comparison is constant-time via bcrypt.
 */
const WORK_FACTOR = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, WORK_FACTOR);
}

export async function verifyPassword(plain: string, hash: string | undefined): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * Enforce a reasonable password policy. Intentionally length-first (NIST 800-63B
 * style) rather than arbitrary composition rules.
 */
export function isStrongPassword(pw: unknown): boolean {
  return typeof pw === 'string' && pw.length >= 10 && pw.length <= 200;
}

/**
 * Generate a high-entropy temporary password for an owner-provisioned account.
 * The user must change it on first login (see `mustChangePassword`). Uses a
 * readable, ambiguity-free alphabet so it can be shared over a side channel,
 * but is long enough (~14 chars from a 58-symbol set) to resist guessing while
 * it is in use.
 */
export function generateTemporaryPassword(length = 14): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

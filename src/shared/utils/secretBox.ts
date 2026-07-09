import crypto from 'crypto';
import { config } from '../config';

/**
 * Authenticated symmetric encryption (AES-256-GCM) for small, server-held
 * secrets — specifically the owner-issued TEMPORARY passwords.
 *
 * Why encryption and not "just store it"? An owner may need to re-read a temp
 * password they haven't shared yet, but we must never keep a credential in
 * plaintext at rest. So we seal it: the ciphertext is useless without the key,
 * the key is derived (domain-separated) from a server-only secret, and the value
 * is DESTROYED the moment the user sets their own password. bcrypt still guards
 * the actual login hash; this only backs the "show default password again" UX.
 */
const KEY = crypto.createHash('sha256').update(`${config.jwt.refreshSecret}::temp-pw-v1`).digest(); // 32 bytes

/** Encrypt a short secret → base64(iv | authTag | ciphertext). */
export function sealSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Decrypt a sealed secret, or null if missing/tampered/undecryptable. */
export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  isStrongPassword,
  generateTemporaryPassword,
} from '../../src/shared/utils/password';

describe('password hashing', () => {
  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash).not.toBe('correct-horse-battery'); // never stored in plaintext
    expect(await verifyPassword('correct-horse-battery', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('treats a missing hash as a failed verification', async () => {
    expect(await verifyPassword('anything', undefined)).toBe(false);
  });

  it('produces a different hash each call (per-hash salt)', async () => {
    const [a, b] = await Promise.all([hashPassword('same-input'), hashPassword('same-input')]);
    expect(a).not.toBe(b);
  });
});

describe('isStrongPassword', () => {
  it('requires at least 10 characters', () => {
    expect(isStrongPassword('123456789')).toBe(false); // 9
    expect(isStrongPassword('1234567890')).toBe(true); // 10
  });

  it('rejects over-long and non-string values', () => {
    expect(isStrongPassword('a'.repeat(201))).toBe(false);
    expect(isStrongPassword(12345678901 as unknown)).toBe(false);
    expect(isStrongPassword(undefined)).toBe(false);
  });
});

describe('generateTemporaryPassword', () => {
  it('has the requested length and uses only the safe alphabet', () => {
    const pw = generateTemporaryPassword();
    expect(pw).toHaveLength(14);
    expect(pw).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]+$/);
    expect(generateTemporaryPassword(20)).toHaveLength(20);
  });
});

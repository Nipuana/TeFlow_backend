import { describe, it, expect } from 'vitest';
import { isBlockedAddress, assertSafeUrl } from '../../src/shared/utils/ssrfGuard';

describe('isBlockedAddress (API7)', () => {
  it('blocks loopback, private, link-local, CGNAT and reserved ranges', () => {
    for (const addr of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0']) {
      expect(isBlockedAddress(addr), addr).toBe(true);
    }
  });

  it('blocks IPv6 loopback, unique-local and link-local, incl. mapped v4', () => {
    for (const addr of ['::1', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isBlockedAddress(addr), addr).toBe(true);
    }
  });

  it('allows ordinary public addresses', () => {
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
    expect(isBlockedAddress('1.1.1.1')).toBe(false);
  });

  it('blocks anything it cannot parse as an IP', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});

describe('assertSafeUrl (API7)', () => {
  it('rejects a non-allowed protocol (http)', async () => {
    await expect(assertSafeUrl('http://example.com')).rejects.toThrow();
  });

  it('rejects embedded credentials', async () => {
    await expect(assertSafeUrl('https://user:pass@example.com')).rejects.toThrow();
  });

  it('rejects a malformed URL', async () => {
    await expect(assertSafeUrl('definitely not a url')).rejects.toThrow();
  });

  it('rejects a URL pointing straight at a blocked IP literal', async () => {
    await expect(assertSafeUrl('https://127.0.0.1/hook')).rejects.toThrow();
    await expect(assertSafeUrl('https://[::1]/hook')).rejects.toThrow();
  });

  it('accepts a public IP literal and pins the resolved address', async () => {
    const target = await assertSafeUrl('https://8.8.8.8/path');
    expect(target.address).toBe('8.8.8.8');
    expect(target.family).toBe(4);
    expect(target.url.pathname).toBe('/path');
  });
});

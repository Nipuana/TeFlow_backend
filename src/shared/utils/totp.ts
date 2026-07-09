import crypto from 'crypto';

/**
 * RFC 6238 TOTP (time-based one-time password) for optional MFA (API2),
 * implemented on Node's crypto so there is no extra dependency.
 *
 * Secrets are base32-encoded so they are compatible with authenticator apps
 * (Google Authenticator, Authy, 1Password, …).
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30; // seconds
const DIGITS = 6;

export function generateSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

/** Build the otpauth:// URI an authenticator app scans as a QR code. */
export function otpauthUri(secret: string, opts: { issuer?: string; account: string }): string {
  const issuer = opts.issuer ?? 'Teflow';
  const label = encodeURIComponent(`${issuer}:${opts.account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generate(secret: string, forTime = Date.now()): string {
  const counter = Math.floor(forTime / 1000 / STEP);
  return hotp(secret, counter);
}

/** Verify a submitted code allowing ±1 time step of clock drift. */
export function verify(secret: string, token: string | number | undefined, forTime = Date.now()): boolean {
  if (!/^\d{6}$/.test(String(token ?? ''))) return false;
  const counter = Math.floor(forTime / 1000 / STEP);
  for (let w = -1; w <= 1; w += 1) {
    const candidate = hotp(secret, counter + w);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(String(token)))) {
      return true;
    }
  }
  return false;
}

function hotp(secretB32: string, counter: number): string {
  const key = base32Decode(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str: string): Buffer {
  const clean = str.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

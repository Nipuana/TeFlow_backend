import { promises as dns } from 'dns';
import net from 'net';
import { config } from '../config';
import { ApiError } from './ApiError';

/**
 * SSRF guard (API7: Server-Side Request Forgery).
 *
 * Any user-supplied URL that the server will fetch (webhooks, "avatar from URL",
 * third-party API base URLs) must pass through here. It:
 *   1. enforces a protocol allow-list (default: https only),
 *   2. rejects credentials / raw IPs in unsafe ranges,
 *   3. resolves DNS server-side and rejects if ANY resolved address is
 *      private / loopback / link-local / CGNAT / reserved,
 *   4. returns the pinned IP so the caller can connect to the exact address it
 *      validated — closing the DNS-rebinding (TOCTOU) hole.
 */

type V4Range = [string, number];

const BLOCKED_V4: V4Range[] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incl. 169.254.169.254 cloud metadata)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
];

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function inV4Range(ip: string, [base, bits]: V4Range): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(base) & mask);
}

export function isBlockedAddress(addr: string): boolean {
  if (net.isIPv4(addr)) {
    return BLOCKED_V4.some((range) => inV4Range(addr, range));
  }
  if (net.isIPv6(addr)) {
    const a = addr.toLowerCase();
    if (a === '::1' || a === '::') return true;
    if (a.startsWith('fc') || a.startsWith('fd')) return true; // unique-local
    if (a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb')) return true;
    const mapped = a.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return false;
  }
  return true; // unknown format => block
}

export interface SafeTarget {
  url: URL;
  address: string;
  family: number;
}

/**
 * Validate a user-supplied URL and resolve it to a safe, pinned IP.
 * @throws {ApiError} 400 if the URL is not allowed
 */
export async function assertSafeUrl(rawUrl: string): Promise<SafeTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw ApiError.badRequest('Invalid URL');
  }

  if (!config.outbound.allowedProtocols.includes(url.protocol)) {
    throw ApiError.badRequest(`Protocol not allowed: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw ApiError.badRequest('URL credentials are not allowed');
  }

  const hostname = url.hostname;
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw ApiError.badRequest('Destination address is not allowed');
    return { url, address: hostname, family: net.isIPv6(hostname) ? 6 : 4 };
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw ApiError.badRequest('Could not resolve host');
  }
  if (!records.length) throw ApiError.badRequest('Could not resolve host');

  for (const rec of records) {
    if (isBlockedAddress(rec.address)) {
      throw ApiError.badRequest('Destination resolves to a blocked address range');
    }
  }

  const chosen = records[0];
  return { url, address: chosen.address, family: chosen.family };
}

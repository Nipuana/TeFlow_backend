import http from 'http';
import https from 'https';
import type { IncomingHttpHeaders } from 'http';
import { config } from '../config';
import { assertSafeUrl } from '../utils/ssrfGuard';
import { ApiError } from '../utils/ApiError';
import logger from '../utils/logger';

/**
 * The ONE outbound HTTP adapter (port: OutboundHttpClient).
 *
 * Every server-initiated request to a user-influenced URL goes through here, so
 * the SSRF guard (API7), the response-size cap (API4) and the timeout are
 * applied in exactly one place instead of ad hoc in each controller.
 *
 * Key hardening detail: after `assertSafeUrl` validates DNS, we connect to the
 * PINNED IP (via `lookup`) and send the original Host header. This prevents a
 * DNS-rebinding attack from swapping in an internal address between validation
 * and connection.
 */
export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  maxBytes?: number;
  timeoutMs?: number;
}

export interface SafeFetchResult {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { url, address, family } = await assertSafeUrl(rawUrl);
  const agentLib = url.protocol === 'https:' ? https : http;
  const cap = opts.maxBytes || config.outbound.maxBytes;
  const timeout = opts.timeoutMs || config.outbound.timeoutMs;

  const options: https.RequestOptions = {
    method: opts.method || 'GET',
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    headers: { Host: url.host, 'User-Agent': 'Teflow/1.0', ...opts.headers },
    // Pin the connection to the exact validated IP (defeats DNS rebinding).
    lookup: (_hostname, _lookupOpts, cb) => cb(null, address, family),
    timeout,
  };

  return new Promise<SafeFetchResult>((resolve, reject) => {
    const req = agentLib.request(options, (res) => {
      const statusCode = res.statusCode ?? 0;
      if (statusCode >= 300 && statusCode < 400) {
        res.resume();
        reject(ApiError.badRequest('Redirects are not followed for outbound requests'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > cap) {
          req.destroy();
          reject(ApiError.tooLarge('Upstream response exceeded size cap'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ status: statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(ApiError.badRequest('Outbound request timed out'));
    });
    req.on('error', (err: Error) => {
      logger.warn('outbound_request_failed', { host: url.host, err: err.message });
      reject(ApiError.badRequest('Outbound request failed'));
    });
    req.end();
  });
}

import { z } from 'zod';
import { integrationsRepository as repo } from './integrations.repository';
import * as orgsService from '../orgs/orgs.service';
import { safeFetch } from '../../shared/adapters/outboundHttp';
import { assertSafeUrl } from '../../shared/utils/ssrfGuard';
import * as fileStorage from '../../shared/adapters/fileStorage';
import { ApiError } from '../../shared/utils/ApiError';
import logger from '../../shared/utils/logger';
import type { AuthUser } from '../../shared/types';

/**
 * Integrations domain/service — the module where the app makes OUTBOUND calls,
 * so it is where API7 (SSRF) and API10 (unsafe consumption of APIs) are defended.
 *
 * Every outbound request goes through `safeFetch`, which runs the SSRF guard
 * (protocol allow-list, private-range block, DNS pinning) and caps response
 * size. Third-party JSON is validated against a strict schema before ANY of it
 * is stored or returned — untrusted payloads are never blindly forwarded.
 */

// ── Webhooks (API7) ─────────────────────────────────────────────────────────
export async function registerWebhook(requester: AuthUser, input: { url: string; event: string }) {
  orgsService.assertMember(requester.orgId, requester.id, 'admin');
  // Validate at registration time so a bad/internal URL is rejected up front...
  await assertSafeUrl(input.url);
  return repo.createWebhook({ orgId: requester.orgId, url: input.url, event: input.event, createdBy: requester.id });
}

export function listWebhooks(requester: AuthUser) {
  orgsService.assertMember(requester.orgId, requester.id);
  return repo.findWebhooksByOrg(requester.orgId);
}

export async function triggerWebhook(requester: AuthUser, webhookId: string) {
  orgsService.assertMember(requester.orgId, requester.id, 'admin');
  const webhook = repo.findWebhookById(webhookId);
  if (!webhook || webhook.orgId !== requester.orgId) throw ApiError.notFound('Webhook not found');

  // ...and re-validate at send time (safeFetch re-runs the SSRF guard, guarding
  // against a URL that now resolves to an internal address, i.e. DNS rebinding).
  const res = await safeFetch(webhook.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }).catch((err: Error) => {
    logger.warn('webhook_delivery_failed', { webhookId, err: err.message });
    throw err;
  });
  return { delivered: true, status: res.status };
}

// ── Avatar from URL (API7) ───────────────────────────────────────────────────
export async function setAvatarFromUrl(requester: AuthUser, url: string) {
  const res = await safeFetch(url, { method: 'GET' });
  const contentType = String(res.headers['content-type'] || '').split(';')[0].trim();
  if (!contentType.startsWith('image/')) {
    throw ApiError.badRequest('URL did not return an image');
  }
  // fileStorage independently sniffs magic bytes, so a lying Content-Type is
  // caught here too.
  const stored = fileStorage.store({ buffer: res.body, declaredType: contentType, ownerId: requester.id });
  return { avatarKey: stored.key, contentType: stored.contentType, size: stored.size };
}

// ── Third-party consumption with response validation (API10) ─────────────────
interface Provider {
  buildUrl: (params: Record<string, string>) => string;
  schema: z.ZodTypeAny;
}

const PROVIDERS: Record<string, Provider> = {
  // Example: an FX-rates provider. In a real app the base URL comes from config.
  exchangeRates: {
    buildUrl: (params) => `https://api.example-fx.com/latest?base=${encodeURIComponent(params.base || 'USD')}`,
    schema: z
      .object({
        base: z.string().length(3),
        rates: z.record(z.string(), z.number()),
      })
      .strip(),
  },
};

export async function consumeThirdParty(
  requester: AuthUser,
  providerKey: string,
  params: Record<string, string> = {},
) {
  orgsService.assertMember(requester.orgId, requester.id);
  const provider = PROVIDERS[providerKey];
  if (!provider) throw ApiError.badRequest('Unknown provider');

  const res = await safeFetch(provider.buildUrl(params), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  let json: unknown;
  try {
    json = JSON.parse(res.body.toString('utf8'));
  } catch {
    throw ApiError.badRequest('Upstream returned invalid JSON');
  }

  // API10: validate the shape BEFORE trusting/returning it. A malformed or
  // hostile payload is rejected rather than forwarded to the client or DB.
  const parsed = provider.schema.safeParse(json);
  if (!parsed.success) {
    logger.warn('third_party_schema_mismatch', { providerKey });
    throw ApiError.badRequest('Upstream response failed validation');
  }
  return parsed.data;
}

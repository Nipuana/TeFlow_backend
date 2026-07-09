import { createCollection } from '../../shared/adapters/db';
import type { BaseDoc } from '../../shared/types';

export interface Webhook extends BaseDoc {
  orgId: string;
  url: string;
  event: string;
  createdBy: string;
}

const webhooks = createCollection<Webhook>('webhooks');

export const integrationsRepository = {
  createWebhook(data: Partial<Webhook>): Webhook {
    return webhooks.insert(data as Record<string, unknown>);
  },
  findWebhookById(id: string): Webhook | undefined {
    return webhooks.findById(id);
  },
  findWebhooksByOrg(orgId: string): Webhook[] {
    return webhooks.find((w) => w.orgId === orgId);
  },
  removeWebhook(id: string): boolean {
    return webhooks.delete(id);
  },
  _reset(): void {
    webhooks.clear();
  },
};

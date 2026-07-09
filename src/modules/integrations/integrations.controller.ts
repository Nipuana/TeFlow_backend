import type { Request, Response } from 'express';
import * as service from './integrations.service';

export async function registerWebhook(req: Request, res: Response): Promise<void> {
  res.status(201).json({ webhook: await service.registerWebhook(req.user!, req.body) });
}
export function listWebhooks(req: Request, res: Response): void {
  res.json({ data: service.listWebhooks(req.user!) });
}
export async function triggerWebhook(req: Request, res: Response): Promise<void> {
  res.json(await service.triggerWebhook(req.user!, req.params.webhookId));
}
export async function setAvatar(req: Request, res: Response): Promise<void> {
  res.json(await service.setAvatarFromUrl(req.user!, req.body.url));
}
export async function consume(req: Request, res: Response): Promise<void> {
  res.json({ data: await service.consumeThirdParty(req.user!, req.body.provider, req.body.params) });
}

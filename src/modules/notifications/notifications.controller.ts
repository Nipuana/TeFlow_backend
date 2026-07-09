import type { Request, Response } from 'express';
import * as service from './notifications.service';

export function list(req: Request, res: Response): void {
  res.json({ data: service.list(req.user!) });
}

export function readOne(req: Request, res: Response): void {
  res.json({ notification: service.markRead(req.user!, req.params.id) });
}

export function readAll(req: Request, res: Response): void {
  res.json(service.markAllRead(req.user!));
}

import type { Request, Response } from 'express';
import * as service from './billing.service';

export function get(req: Request, res: Response): void {
  res.json(service.getBilling(req.user!));
}
export function upgrade(req: Request, res: Response): void {
  res.json(service.upgradePlan(req.user!, req.body.plan));
}
export function invite(req: Request, res: Response): void {
  res.status(201).json({ invite: service.inviteMember(req.user!, req.body) });
}
export function exportData(req: Request, res: Response): void {
  const out = service.exportOrgData(req.user!);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="org-export.csv"');
  res.send(out.content);
}
export function deleteOrg(req: Request, res: Response): void {
  res.json(service.deleteOrg(req.user!));
}

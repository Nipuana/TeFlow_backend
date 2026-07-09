import type { Request, Response } from 'express';
import * as service from './orgs.service';

export function listMine(req: Request, res: Response): void {
  res.json({ data: service.listMyOrgs(req.user!.id) });
}

export function get(req: Request, res: Response): void {
  res.json({ org: service.getOrg(req.params.orgId, req.user!) });
}

export function update(req: Request, res: Response): void {
  res.json({ org: service.updateOrg(req.params.orgId, req.user!, req.body) });
}

export function members(req: Request, res: Response): void {
  res.json({ data: service.listMembers(req.params.orgId, req.user!) });
}

export async function createMember(req: Request, res: Response): Promise<void> {
  const result = await service.createMemberAccount(req.params.orgId, req.user!, req.body);
  res.status(201).json(result);
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const result = await service.resetMemberPassword(req.params.orgId, req.user!, req.params.userId);
  res.json(result);
}

export function tempPassword(req: Request, res: Response): void {
  res.json(service.getMemberTempPassword(req.params.orgId, req.user!, req.params.userId));
}

export function removeMember(req: Request, res: Response): void {
  res.json(service.removeMember(req.params.orgId, req.user!, req.params.userId));
}

export function setRole(req: Request, res: Response): void {
  const { userId, role } = req.body;
  res.json({ membership: service.setMemberRole(req.params.orgId, req.user!, userId, role) });
}

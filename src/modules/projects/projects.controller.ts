import type { Request, Response } from 'express';
import * as service from './projects.service';
import { parsePagination, paginate } from '../../shared/utils/pagination';

export function list(req: Request, res: Response): void {
  const all = service.list(req.user!);
  res.json(paginate(all, parsePagination(req.validatedQuery as Record<string, unknown>)));
}

export function get(req: Request, res: Response): void {
  res.json({ project: service.get(req.params.projectId, req.user!) });
}

export function create(req: Request, res: Response): void {
  res.status(201).json({ project: service.create(req.user!, req.body) });
}

export function update(req: Request, res: Response): void {
  res.json({ project: service.update(req.params.projectId, req.user!, req.body) });
}

export function remove(req: Request, res: Response): void {
  service.remove(req.params.projectId, req.user!);
  res.status(204).end();
}

export function addMember(req: Request, res: Response): void {
  res.status(201).json({ project: service.addMember(req.params.projectId, req.user!, req.body.userId) });
}

export function removeMember(req: Request, res: Response): void {
  res.json({ project: service.removeMember(req.params.projectId, req.user!, req.params.userId) });
}

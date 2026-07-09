import type { Request, Response } from 'express';
import * as service from './tasks.service';

export function list(req: Request, res: Response): void {
  res.json({ data: service.listTasks(req.params.projectId, req.user!) });
}
export function get(req: Request, res: Response): void {
  res.json({ task: service.getTask(req.params.projectId, req.params.taskId, req.user!) });
}
export function create(req: Request, res: Response): void {
  res.status(201).json({ task: service.createTask(req.params.projectId, req.user!, req.body) });
}
export function bulkCreate(req: Request, res: Response): void {
  res.status(201).json({ data: service.bulkCreate(req.params.projectId, req.user!, req.body.tasks) });
}
export function update(req: Request, res: Response): void {
  res.json({ task: service.updateTask(req.params.projectId, req.params.taskId, req.user!, req.body) });
}
export function remove(req: Request, res: Response): void {
  service.removeTask(req.params.projectId, req.params.taskId, req.user!);
  res.status(204).end();
}
export function listComments(req: Request, res: Response): void {
  res.json({ data: service.listComments(req.params.projectId, req.params.taskId, req.user!) });
}
export function addComment(req: Request, res: Response): void {
  res.status(201).json({ comment: service.addComment(req.params.projectId, req.params.taskId, req.user!, req.body) });
}
export function listAttachments(req: Request, res: Response): void {
  res.json({ data: service.listAttachments(req.params.projectId, req.params.taskId, req.user!) });
}
export function addAttachment(req: Request, res: Response): void {
  res
    .status(201)
    .json({ attachment: service.addAttachment(req.params.projectId, req.params.taskId, req.user!, req.body) });
}

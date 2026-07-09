import { createCollection } from '../../shared/adapters/db';
import type { BaseDoc } from '../../shared/types';

export interface Project extends BaseDoc {
  orgId: string;
  name: string;
  description: string;
  createdBy: string;
  /** Org members who are on this project's team (task assignees come from here). */
  memberIds: string[];
}

const projects = createCollection<Project>('projects');

export const projectsRepository = {
  create(data: Partial<Project>): Project {
    return projects.insert(data as Record<string, unknown>);
  },
  findById(id: string): Project | undefined {
    return projects.findById(id);
  },
  findByOrg(orgId: string): Project[] {
    return projects.find((p) => p.orgId === orgId);
  },
  update(id: string, patch: Partial<Project>): Project | undefined {
    return projects.update(id, patch as Record<string, unknown>);
  },
  remove(id: string): boolean {
    return projects.delete(id);
  },
  _reset(): void {
    projects.clear();
  },
};

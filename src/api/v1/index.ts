import { Router } from 'express';

import authRoutes from '../../modules/auth/auth.routes';
import orgsRoutes from '../../modules/orgs/orgs.routes';
import projectsRoutes from '../../modules/projects/projects.routes';
import tasksRoutes from '../../modules/tasks/tasks.routes';
import integrationsRoutes from '../../modules/integrations/integrations.routes';
import billingRoutes from '../../modules/billing/billing.routes';
import notificationsRoutes from '../../modules/notifications/notifications.routes';

/**
 * API v1 registration (API9: Improper Inventory Management).
 *
 * Every route is mounted under an explicit, versioned prefix here — there are no
 * orphaned or undocumented endpoints. `openapi.yaml` is the source of truth and
 * mirrors exactly what is registered below. Old versions (e.g. /api/v0) would be
 * gated and monitored separately rather than left silently exposed.
 */
const router = Router();

router.use('/auth', authRoutes);
router.use('/orgs', orgsRoutes);
router.use('/projects', projectsRoutes);
// Tasks are nested resources of a project (keeps ownership/authz obvious).
router.use('/projects/:projectId/tasks', tasksRoutes);
router.use('/integrations', integrationsRoutes);
router.use('/billing', billingRoutes);
router.use('/notifications', notificationsRoutes);

export default router;

import { Router } from 'express';
import * as ctrl from './notifications.controller';
import { idParam } from './notifications.schema';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { requireAuth } from '../../shared/middleware/auth';

/**
 * Notification routes. All require authentication and are scoped to the caller
 * (per-user object-level authz enforced in the service, API1).
 */
const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(ctrl.list));
router.post('/read-all', asyncHandler(ctrl.readAll));
router.post('/:id/read', validate({ params: idParam }), asyncHandler(ctrl.readOne));

export default router;

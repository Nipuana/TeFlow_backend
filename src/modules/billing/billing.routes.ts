import { Router } from 'express';
import * as ctrl from './billing.controller';
import * as schema from './billing.schema';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { requireAuth, requireStepUp } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/rbac';
import { sensitiveFlowLimiter } from '../../shared/middleware/rateLimit';

/**
 * Admin / billing routes — the "sensitive business flows" (API6) and the
 * clearest example of function-level authorization (API5).
 *
 * Layered guards, outermost first:
 *   requireAuth            → must be authenticated (API2)
 *   requireRole('admin')   → function-level RBAC rejects before the controller (API5)
 *   sensitiveFlowLimiter   → tight rate limit on abuse-prone flows (API4/API6)
 *   requireStepUp()        → recent MFA/re-auth for irreversible actions (API6)
 */
const router = Router();
router.use(requireAuth);

router.get('/', requireRole('admin'), asyncHandler(ctrl.get));

router.post(
  '/upgrade',
  requireRole('owner'),
  sensitiveFlowLimiter,
  requireStepUp(300),
  validate({ body: schema.upgradeSchema }),
  asyncHandler(ctrl.upgrade),
);

router.post(
  '/invite',
  requireRole('admin'),
  sensitiveFlowLimiter,
  validate({ body: schema.inviteSchema }),
  asyncHandler(ctrl.invite),
);

router.post('/export', requireRole('admin'), sensitiveFlowLimiter, asyncHandler(ctrl.exportData));

router.delete('/org', requireRole('owner'), sensitiveFlowLimiter, requireStepUp(300), asyncHandler(ctrl.deleteOrg));

export default router;

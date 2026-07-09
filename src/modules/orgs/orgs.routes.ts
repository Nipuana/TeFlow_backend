import { Router } from 'express';
import * as ctrl from './orgs.controller';
import * as schema from './orgs.schema';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { requireAuth } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/rbac';
import { sensitiveFlowLimiter } from '../../shared/middleware/rateLimit';

/**
 * Org routes. All require authentication. Object-level authz (is the caller a
 * member, and in what role?) is enforced in the service layer (API1), so these
 * routes stay declarative. Account-provisioning / role-changing writes are
 * additionally gated by function-level RBAC (API5), rate-limited as sensitive
 * flows (API6), and validate a strict body schema (API3).
 */
const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(ctrl.listMine));
router.get('/:orgId', validate({ params: schema.idParam }), asyncHandler(ctrl.get));
router.patch('/:orgId', validate({ params: schema.idParam, body: schema.updateOrgSchema }), asyncHandler(ctrl.update));

router.get('/:orgId/members', validate({ params: schema.idParam }), asyncHandler(ctrl.members));

// Owner provisions a brand-new account with a one-time temporary password.
router.post(
  '/:orgId/members',
  requireRole('owner'),
  sensitiveFlowLimiter,
  validate({ params: schema.idParam, body: schema.createMemberSchema }),
  asyncHandler(ctrl.createMember),
);

// Owner re-views an account's still-unused temporary password (or learns it was
// already changed). Owner-only + rate-limited: it exposes a live credential.
router.get(
  '/:orgId/members/:userId/temp-password',
  requireRole('owner'),
  sensitiveFlowLimiter,
  validate({ params: schema.memberParam }),
  asyncHandler(ctrl.tempPassword),
);

// Owner resets a member's password (issues a fresh temporary password).
router.post(
  '/:orgId/members/:userId/reset-password',
  requireRole('owner'),
  sensitiveFlowLimiter,
  validate({ params: schema.memberParam }),
  asyncHandler(ctrl.resetPassword),
);

// Admin+ changes a member's role or removes them from the org.
router.put(
  '/:orgId/members/role',
  requireRole('admin'),
  validate({ params: schema.idParam, body: schema.setRoleSchema }),
  asyncHandler(ctrl.setRole),
);
router.delete(
  '/:orgId/members/:userId',
  requireRole('admin'),
  validate({ params: schema.memberParam }),
  asyncHandler(ctrl.removeMember),
);

export default router;

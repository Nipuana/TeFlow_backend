import { Router } from 'express';
import * as ctrl from './auth.controller';
import * as schema from './auth.schema';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { requireAuth } from '../../shared/middleware/auth';
import { authLimiter, sensitiveFlowLimiter } from '../../shared/middleware/rateLimit';
import { avatarUpload } from '../../shared/middleware/upload';

/**
 * Auth routes. Note the tight `authLimiter` on credential endpoints (API4/API6:
 * brute-force / credential-stuffing protection) and that every write validates
 * against a strict schema (API3) before reaching the controller.
 */
const router = Router();

router.post('/register', authLimiter, validate({ body: schema.registerSchema }), asyncHandler(ctrl.register));
router.post('/login', authLimiter, validate({ body: schema.loginSchema }), asyncHandler(ctrl.login));
router.post('/refresh', validate({ body: schema.refreshSchema }), asyncHandler(ctrl.refresh));
router.post('/logout', validate({ body: schema.refreshSchema }), asyncHandler(ctrl.logout));

// Authenticated account operations
router.get('/me', requireAuth, asyncHandler(ctrl.me));
router.patch('/me', requireAuth, validate({ body: schema.updateProfileSchema }), asyncHandler(ctrl.updateMe));

// Profile picture: multipart upload (multer) + serve the caller's own image.
router.post('/me/avatar', requireAuth, sensitiveFlowLimiter, avatarUpload, asyncHandler(ctrl.uploadAvatar));
router.get('/me/avatar', requireAuth, asyncHandler(ctrl.getAvatar));
router.post('/step-up', requireAuth, authLimiter, validate({ body: schema.stepUpSchema }), asyncHandler(ctrl.stepUp));
router.post('/mfa/enrol', requireAuth, asyncHandler(ctrl.beginMfa));
router.post('/mfa/confirm', requireAuth, validate({ body: schema.enableMfaConfirmSchema }), asyncHandler(ctrl.confirmMfa));
router.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate({ body: schema.changePasswordSchema }),
  asyncHandler(ctrl.changePassword),
);

// Session management
router.get('/sessions', requireAuth, asyncHandler(ctrl.listSessions));
router.post('/sessions/sign-out-others', requireAuth, asyncHandler(ctrl.signOutOthers));
router.delete('/sessions/:id', requireAuth, validate({ params: schema.sessionIdParam }), asyncHandler(ctrl.revokeSession));

export default router;

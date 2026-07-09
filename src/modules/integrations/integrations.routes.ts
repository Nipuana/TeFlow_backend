import { Router } from 'express';
import * as ctrl from './integrations.controller';
import * as schema from './integrations.schema';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { requireAuth } from '../../shared/middleware/auth';
import { sensitiveFlowLimiter } from '../../shared/middleware/rateLimit';

/**
 * Integration routes. Outbound-fetching endpoints carry the sensitiveFlow rate
 * limiter (API6) since they can be abused to probe the network, and every URL
 * is SSRF-validated in the service before any request leaves the process (API7).
 */
const router = Router();
router.use(requireAuth);

router.get('/webhooks', asyncHandler(ctrl.listWebhooks));
router.post(
  '/webhooks',
  sensitiveFlowLimiter,
  validate({ body: schema.registerWebhookSchema }),
  asyncHandler(ctrl.registerWebhook),
);
router.post(
  '/webhooks/:webhookId/test',
  sensitiveFlowLimiter,
  validate({ params: schema.webhookIdParam }),
  asyncHandler(ctrl.triggerWebhook),
);

router.post(
  '/avatar-from-url',
  sensitiveFlowLimiter,
  validate({ body: schema.avatarFromUrlSchema }),
  asyncHandler(ctrl.setAvatar),
);

router.post('/consume', sensitiveFlowLimiter, validate({ body: schema.consumeSchema }), asyncHandler(ctrl.consume));

export default router;

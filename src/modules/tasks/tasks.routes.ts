import express, { Router } from 'express';
import * as ctrl from './tasks.controller';
import * as schema from './tasks.schema';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { requireAuth } from '../../shared/middleware/auth';
import { config } from '../../shared/config';

/**
 * Task routes, mounted at /projects/:projectId/tasks (mergeParams keeps the
 * parent projectId). Attachment uploads get a dedicated JSON body parser with a
 * bounded limit (API4) sized for base64 overhead — the global parser stays
 * small so ordinary endpoints can't be flooded with large bodies.
 */
const router = Router({ mergeParams: true });
router.use(requireAuth);

const attachmentBodyLimit = Math.ceil(config.limits.maxUploadBytes * 1.4) + 1024; // base64 ~+33%
const attachmentParser = express.json({ limit: attachmentBodyLimit });

router.get('/', validate({ params: schema.params }), asyncHandler(ctrl.list));
router.post('/', validate({ params: schema.params, body: schema.createSchema }), asyncHandler(ctrl.create));
router.post('/bulk', validate({ params: schema.params, body: schema.bulkSchema }), asyncHandler(ctrl.bulkCreate));

router.get('/:taskId', validate({ params: schema.params }), asyncHandler(ctrl.get));
router.patch('/:taskId', validate({ params: schema.params, body: schema.updateSchema }), asyncHandler(ctrl.update));
router.delete('/:taskId', validate({ params: schema.params }), asyncHandler(ctrl.remove));

router.get('/:taskId/comments', validate({ params: schema.params }), asyncHandler(ctrl.listComments));
router.post(
  '/:taskId/comments',
  validate({ params: schema.params, body: schema.commentSchema }),
  asyncHandler(ctrl.addComment),
);

router.get('/:taskId/attachments', validate({ params: schema.params }), asyncHandler(ctrl.listAttachments));
router.post(
  '/:taskId/attachments',
  attachmentParser,
  validate({ params: schema.params, body: schema.attachmentSchema }),
  asyncHandler(ctrl.addAttachment),
);

export default router;

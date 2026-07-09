import { Router } from 'express';
import * as ctrl from './projects.controller';
import * as schema from './projects.schema';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { requireAuth } from '../../shared/middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', validate({ query: schema.listQuery }), asyncHandler(ctrl.list));
router.post('/', validate({ body: schema.createSchema }), asyncHandler(ctrl.create));
router.get('/:projectId', validate({ params: schema.idParam }), asyncHandler(ctrl.get));
router.patch('/:projectId', validate({ params: schema.idParam, body: schema.updateSchema }), asyncHandler(ctrl.update));
router.delete('/:projectId', validate({ params: schema.idParam }), asyncHandler(ctrl.remove));

// Project team — add/remove org members onto the project
router.post('/:projectId/members', validate({ params: schema.idParam, body: schema.addMemberSchema }), asyncHandler(ctrl.addMember));
router.delete('/:projectId/members/:userId', validate({ params: schema.memberParam }), asyncHandler(ctrl.removeMember));

export default router;

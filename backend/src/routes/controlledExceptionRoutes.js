import express from 'express';
import { protect, applyOutletScope } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import {
  getExceptions,
  getExceptionById,
  createException,
  submitException,
  verifyException,
  approveException,
  rejectException,
  executeException,
} from '../controllers/controlledExceptionController.js';

const router = express.Router();

router.get('/', protect, applyOutletScope, checkPermission('controlled_exceptions', 'can_view'), getExceptions);
router.get('/:id', protect, applyOutletScope, checkPermission('controlled_exceptions', 'can_view'), getExceptionById);
router.post('/', protect, applyOutletScope, checkPermission('controlled_exceptions', 'can_create'), createException);
router.post('/:id/submit', protect, applyOutletScope, checkPermission('controlled_exceptions', 'can_submit'), submitException);
router.post('/:id/verify', protect, applyOutletScope, checkPermission('controlled_exceptions', 'can_verify'), verifyException);
router.post('/:id/approve', protect, applyOutletScope, checkPermission('controlled_exceptions', 'can_approve'), approveException);
router.post('/:id/reject', protect, applyOutletScope, checkPermission('controlled_exceptions', 'can_reject'), rejectException);
router.post('/:id/execute', protect, applyOutletScope, checkPermission('controlled_exceptions', 'can_lock'), executeException);

export default router;

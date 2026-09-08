import express from 'express';
import { protect, applyOutletScope } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import {
  getDashboardSummary,
  getSalesBreakdown,
  getTarget,
  setTarget,
} from '../controllers/salesTargetController.js';

const router = express.Router();

router.get('/summary', protect, applyOutletScope, checkPermission('sales_target', 'can_view'), getDashboardSummary);
router.get('/sales-breakdown', protect, applyOutletScope, checkPermission('sales_target', 'can_view'), getSalesBreakdown);
router.get('/target', protect, applyOutletScope, checkPermission('sales_target', 'can_view'), getTarget);
// A single upsert route covers both create and edit - every role granted
// write access to sales_target gets can_create and can_edit together (see
// rolePermissionModules.js), so gating on can_edit alone is sufficient here.
router.post('/target', protect, applyOutletScope, checkPermission('sales_target', 'can_edit'), setTarget);

export default router;

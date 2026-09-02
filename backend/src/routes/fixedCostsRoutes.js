import express from 'express';
import { protect, applyOutletScope, loadScopedRecord } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import {
  getFixedCosts,
  createFixedCost,
  updateFixedCost,
  deleteFixedCost
} from '../controllers/fixedCostsController.js';

const router = express.Router();

router.get('/', protect, applyOutletScope, checkPermission('fixed_costs', 'can_view'), getFixedCosts);
router.post('/', protect, applyOutletScope, checkPermission('fixed_costs', 'can_create'), createFixedCost);
router.put('/:id', protect, applyOutletScope, checkPermission('fixed_costs', 'can_edit'), loadScopedRecord('outlet_fixed_costs'), updateFixedCost);
router.delete('/:id', protect, applyOutletScope, checkPermission('fixed_costs', 'can_delete'), loadScopedRecord('outlet_fixed_costs'), deleteFixedCost);

export default router;

import express from 'express';
import { protect, applyOutletScope, loadScopedRecord, preventLockedModification } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import { upload } from '../config/multer.js';
import {
  getUtilityBills,
  createUtilityBill,
  updateUtilityBill,
  deleteUtilityBill,
  verifyUtilityBill
} from '../controllers/utilityBillController.js';

const router = express.Router();

router.get('/', protect, applyOutletScope, checkPermission('utility_bills', 'can_view'), getUtilityBills);
router.post('/', protect, applyOutletScope, checkPermission('utility_bills', 'can_create'), upload.single('bill'), createUtilityBill);
router.put('/:id', protect, applyOutletScope, checkPermission('utility_bills', 'can_edit'), loadScopedRecord('utility_bills'), preventLockedModification, upload.single('bill'), updateUtilityBill);
router.delete('/:id', protect, applyOutletScope, checkPermission('utility_bills', 'can_delete'), loadScopedRecord('utility_bills'), deleteUtilityBill);
router.post('/:id/verify', protect, applyOutletScope, checkPermission('utility_bills', 'can_verify'), loadScopedRecord('utility_bills'), verifyUtilityBill);

export default router;

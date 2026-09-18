import express from 'express';
import { protect, applyOutletScope, loadScopedRecord } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import { upload } from '../config/multer.js';
import {
  getSupplierPayments,
  getSupplierLedger,
  createSupplierPayment,
  updateSupplierPayment,
  submitSupplierPayment,
  verifySupplierPayment,
  rejectSupplierPayment
} from '../controllers/supplierPaymentController.js';

const router = express.Router();

router.get('/', protect, applyOutletScope, checkPermission('supplier_payments', 'can_view'), getSupplierPayments);
router.get('/ledger-summary', protect, applyOutletScope, checkPermission('supplier_payments', 'can_view'), getSupplierLedger);
router.post('/', protect, applyOutletScope, checkPermission('supplier_payments', 'can_create'), upload.single('proof'), createSupplierPayment);
router.put('/:id', protect, applyOutletScope, checkPermission('supplier_payments', 'can_edit'), loadScopedRecord('supplier_payments'), updateSupplierPayment);
router.post('/:id/submit', protect, applyOutletScope, checkPermission('supplier_payments', 'can_submit'), loadScopedRecord('supplier_payments'), submitSupplierPayment);
router.post('/:id/verify', protect, applyOutletScope, checkPermission('supplier_payments', 'can_verify'), loadScopedRecord('supplier_payments'), verifySupplierPayment);
router.post('/:id/reject', protect, applyOutletScope, checkPermission('supplier_payments', 'can_reject'), loadScopedRecord('supplier_payments'), rejectSupplierPayment);

export default router;

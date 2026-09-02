import express from 'express';
import { protect, applyOutletScope, loadScopedRecord } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import { upload } from '../config/multer.js';
import {
  getSupplierPayments,
  getSupplierLedger,
  createSupplierPayment,
  updateSupplierPayment
} from '../controllers/supplierPaymentController.js';

const router = express.Router();

router.get('/', protect, applyOutletScope, checkPermission('supplier_payments', 'can_view'), getSupplierPayments);
router.get('/ledger-summary', protect, applyOutletScope, checkPermission('supplier_payments', 'can_view'), getSupplierLedger);
router.post('/', protect, applyOutletScope, checkPermission('supplier_payments', 'can_create'), upload.single('proof'), createSupplierPayment);
router.put('/:id', protect, applyOutletScope, checkPermission('supplier_payments', 'can_edit'), loadScopedRecord('supplier_payments'), updateSupplierPayment);

export default router;

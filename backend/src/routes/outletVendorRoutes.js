import express from 'express';
import { protect, applyOutletScope, loadScopedRecord } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import {
  getVendors, getVendorById, createVendor, updateVendor, deleteVendor,
  getVendorPurchases, createVendorPurchase, createVendorPurchasesBatch, deleteVendorPurchase,
  getVendorPayments, createVendorPayment, updateVendorPayment,
  submitVendorPayment, verifyVendorPayment, rejectVendorPayment,
  getVendorLedger, getVendorOutstandingReport,
} from '../controllers/outletVendorController.js';

const router = express.Router();

router.get('/', protect, checkPermission('outlet_vendors', 'can_view'), getVendors);
router.get('/outstanding-report', protect, applyOutletScope, checkPermission('outlet_vendors', 'can_view'), getVendorOutstandingReport);
router.get('/ledger', protect, applyOutletScope, checkPermission('outlet_vendors', 'can_view'), getVendorLedger);
router.get('/:id', protect, checkPermission('outlet_vendors', 'can_view'), getVendorById);
router.post('/', protect, checkPermission('outlet_vendors', 'can_create'), createVendor);
router.put('/:id', protect, checkPermission('outlet_vendors', 'can_edit'), updateVendor);
router.delete('/:id', protect, checkPermission('outlet_vendors', 'can_delete'), deleteVendor);

router.get('/purchases/list', protect, applyOutletScope, checkPermission('outlet_vendors', 'can_view'), getVendorPurchases);
router.post('/purchases', protect, applyOutletScope, checkPermission('outlet_vendors', 'can_create'), createVendorPurchase);
router.post('/purchases/batch', protect, applyOutletScope, checkPermission('outlet_vendors', 'can_create'), createVendorPurchasesBatch);
router.delete('/purchases/:id', protect, applyOutletScope, checkPermission('outlet_vendors', 'can_delete'), deleteVendorPurchase);

router.get('/payments/list', protect, applyOutletScope, checkPermission('outlet_vendors', 'can_view'), getVendorPayments);
router.post('/payments', protect, applyOutletScope, checkPermission('outlet_vendors', 'can_create'), createVendorPayment);
// Maker-edit uses can_create (not can_edit): makers must be able to fix a
// Rejected payment, and can_edit also gates vendor-master edits which stay
// restricted to checker roles. Draft/Rejected status gate lives in the
// controller, scope via loadScopedRecord.
router.put('/payments/:id', protect, applyOutletScope, checkPermission('outlet_vendors', 'can_create'), loadScopedRecord('outlet_vendor_payments'), updateVendorPayment);
router.post('/payments/:id/submit', protect, applyOutletScope, checkPermission('outlet_vendors', 'can_submit'), loadScopedRecord('outlet_vendor_payments'), submitVendorPayment);
router.post('/payments/:id/verify', protect, applyOutletScope, checkPermission('outlet_vendors', 'can_verify'), loadScopedRecord('outlet_vendor_payments'), verifyVendorPayment);
router.post('/payments/:id/reject', protect, applyOutletScope, checkPermission('outlet_vendors', 'can_reject'), loadScopedRecord('outlet_vendor_payments'), rejectVendorPayment);

export default router;

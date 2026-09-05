import express from 'express';
import { protect, applyOutletScope } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import {
  getVendors, getVendorById, createVendor, updateVendor, deleteVendor,
  getVendorPurchases, createVendorPurchase, createVendorPurchasesBatch, deleteVendorPurchase,
  getVendorPayments, createVendorPayment,
  getVendorLedger, getVendorOutstandingReport,
} from '../controllers/outletVendorController.js';

const router = express.Router();

router.get('/', protect, checkPermission('outlet_vendors', 'can_view'), getVendors);
router.get('/outstanding-report', protect, checkPermission('outlet_vendors', 'can_view'), getVendorOutstandingReport);
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

export default router;

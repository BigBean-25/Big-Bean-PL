import express from 'express';
import { protect, applyOutletScope } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import { upload } from '../config/multer.js';
import {
  uploadOpeningStock,
  uploadClosingStock,
  uploadMaterialPurchase,
  uploadItemSales,
  getUploadHistory,
  getUploadErrors
} from '../controllers/uploadController.js';

const router = express.Router();

router.post('/opening-stock', protect, upload.single('file'), applyOutletScope, checkPermission('opening_stock', 'can_upload'), uploadOpeningStock);
router.post('/closing-stock', protect, upload.single('file'), applyOutletScope, checkPermission('closing_stock', 'can_upload'), uploadClosingStock);
router.post('/material-purchase', protect, upload.single('file'), applyOutletScope, checkPermission('material_purchase', 'can_upload'), uploadMaterialPurchase);
router.post('/item-sales', protect, upload.single('file'), applyOutletScope, checkPermission('item_sales', 'can_upload'), uploadItemSales);

router.get('/history/:type', protect, applyOutletScope, getUploadHistory);
router.get('/history', protect, applyOutletScope, getUploadHistory);
router.get('/errors/:upload_id', protect, getUploadErrors);

export default router;

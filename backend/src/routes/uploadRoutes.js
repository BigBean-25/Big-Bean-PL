import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
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

router.post('/opening-stock', protect, authorize('Admin', 'Super Admin'), upload.single('file'), uploadOpeningStock);
router.post('/closing-stock', protect, authorize('Admin', 'Super Admin'), upload.single('file'), uploadClosingStock);
router.post('/material-purchase', protect, authorize('Admin', 'Super Admin'), upload.single('file'), uploadMaterialPurchase);
router.post('/item-sales', protect, authorize('Admin', 'Super Admin'), upload.single('file'), uploadItemSales);

router.get('/history/:type', protect, getUploadHistory);
router.get('/history', protect, getUploadHistory);
router.get('/errors/:upload_id', protect, getUploadErrors);

export default router;

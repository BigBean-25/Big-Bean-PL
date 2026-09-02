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
  getUploadErrors,
  getItemSalesUploadById,
  downloadItemSalesTemplate,
  deleteUpload,
  downloadOpeningStockOriginal,
  downloadOpeningStockProcessed,
  downloadOpeningStockErrors,
  downloadOpeningStockTemplate,
  downloadClosingStockOriginal,
  downloadClosingStockProcessed,
  downloadClosingStockErrors,
  downloadClosingStockTemplate,
  downloadMaterialPurchaseOriginal,
  downloadMaterialPurchaseProcessed,
  downloadMaterialPurchaseErrors,
  downloadMaterialPurchaseTemplate,
} from '../controllers/uploadController.js';

const router = express.Router();

const checkDeleteUploadPermission = async (req, res, next) => {
  const { type } = req.params;
  if (!['opening_stock', 'closing_stock', 'material_purchase', 'item_sales'].includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid upload type' });
  }
  const middleware = checkPermission(type, 'can_delete');
  await middleware(req, res, next);
};

// checkPermission must run BEFORE multer's upload.single() touches disk -
// otherwise a request from a user with no upload permission at all still
// gets its file written to the uploads directory before being rejected.
// checkPermission only needs req.user (already set by protect), so it can
// safely run pre-multer. applyOutletScope, however, reads outlet_id out of
// req.body - for these routes the client sends outlet_id as a multipart
// form field alongside the file, which does not exist until multer has
// parsed the request body, so it must stay after upload.single().
router.post('/opening-stock', protect, checkPermission('opening_stock', 'can_upload'), upload.single('file'), applyOutletScope, uploadOpeningStock);
router.post('/closing-stock', protect, checkPermission('closing_stock', 'can_upload'), upload.single('file'), applyOutletScope, uploadClosingStock);
router.post('/material-purchase', protect, checkPermission('material_purchase', 'can_upload'), upload.single('file'), applyOutletScope, uploadMaterialPurchase);
router.post('/item-sales', protect, checkPermission('item_sales', 'can_upload'), upload.single('file'), applyOutletScope, uploadItemSales);

router.get('/history/:type', protect, applyOutletScope, getUploadHistory);
router.get('/history', protect, applyOutletScope, getUploadHistory);
router.get('/errors/:upload_id', protect, applyOutletScope, getUploadErrors);

router.get('/item-sales/template', protect, checkPermission('item_sales', 'can_upload'), downloadItemSalesTemplate);

router.get('/item-sales/:id', protect, applyOutletScope, checkPermission('item_sales', 'can_view'), getItemSalesUploadById);

router.delete('/:type/:id', protect, applyOutletScope, checkDeleteUploadPermission, deleteUpload);

router.get('/opening_stock/template', protect, downloadOpeningStockTemplate);

router.get('/opening_stock/:id/download-original', protect, applyOutletScope, checkPermission('opening_stock', 'can_view'), downloadOpeningStockOriginal);
router.get('/opening_stock/:id/download-processed', protect, applyOutletScope, checkPermission('opening_stock', 'can_view'), downloadOpeningStockProcessed);
router.get('/opening_stock/:id/download-errors', protect, applyOutletScope, checkPermission('opening_stock', 'can_view'), downloadOpeningStockErrors);

router.get('/closing_stock/template', protect, downloadClosingStockTemplate);

router.get('/closing_stock/:id/download-original', protect, applyOutletScope, checkPermission('closing_stock', 'can_view'), downloadClosingStockOriginal);
router.get('/closing_stock/:id/download-processed', protect, applyOutletScope, checkPermission('closing_stock', 'can_view'), downloadClosingStockProcessed);
router.get('/closing_stock/:id/download-errors', protect, applyOutletScope, checkPermission('closing_stock', 'can_view'), downloadClosingStockErrors);

router.get('/material_purchase/template', protect, downloadMaterialPurchaseTemplate);

router.get('/material_purchase/:id/download-original', protect, applyOutletScope, checkPermission('material_purchase', 'can_view'), downloadMaterialPurchaseOriginal);
router.get('/material_purchase/:id/download-processed', protect, applyOutletScope, checkPermission('material_purchase', 'can_view'), downloadMaterialPurchaseProcessed);
router.get('/material_purchase/:id/download-errors', protect, applyOutletScope, checkPermission('material_purchase', 'can_view'), downloadMaterialPurchaseErrors);

export default router;

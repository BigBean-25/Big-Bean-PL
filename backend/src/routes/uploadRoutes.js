import express from 'express';
import { protect, applyOutletScope } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import { upload } from '../config/multer.js';
import { query } from '../config/database.js';
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
  UPLOAD_TYPE_CONFIG,
  submitStockUpload,
  verifyStockUpload,
  rejectStockUpload,
} from '../controllers/uploadController.js';

const router = express.Router();

const UPLOAD_TYPES = ['opening_stock', 'closing_stock', 'material_purchase', 'item_sales'];

const checkDeleteUploadPermission = async (req, res, next) => {
  const { type } = req.params;
  if (!UPLOAD_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid upload type' });
  }
  const middleware = checkPermission(type, 'can_delete');
  await middleware(req, res, next);
};

// getUploadHistory requires `type` from either the :type param or the
// ?type= query (its no-param /history route), and always operates on
// exactly one upload type per call - every other data-exposing route in
// this file gates on that type's own can_view (e.g. GET /item-sales/:id,
// the download-* routes below), but this pair only checked outlet scope,
// letting a user list history (including item-sales financial aggregates)
// for a type they have no view permission for.
const checkHistoryViewPermission = async (req, res, next) => {
  const type = req.params.type || req.query.type;
  if (!UPLOAD_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid upload type' });
  }
  const middleware = checkPermission(type, 'can_view');
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

router.get('/history/:type', protect, applyOutletScope, checkHistoryViewPermission, getUploadHistory);
router.get('/history', protect, applyOutletScope, checkHistoryViewPermission, getUploadHistory);
router.get('/errors/:upload_id', protect, applyOutletScope, getUploadErrors);

router.get('/item-sales/template', protect, checkPermission('item_sales', 'can_upload'), downloadItemSalesTemplate);

router.get('/item-sales/:id', protect, applyOutletScope, checkPermission('item_sales', 'can_view'), getItemSalesUploadById);

router.delete('/:type/:id', protect, applyOutletScope, checkDeleteUploadPermission, deleteUpload);

// Phase 5D2B1/5D2B2: maker-checker workflow endpoints for the accounting
// uploads (opening stock, closing stock, material purchase). The same
// handler family serves all three because the upload tables share the same
// workflow columns; :type resolves the table through UPLOAD_TYPE_CONFIG and
// the controller picks the right period guard (month/year for stock,
// item-date range for purchases). Verified is terminal - there is
// intentionally no route that moves a Verified upload anywhere.
const STOCK_UPLOAD_TYPES = ['opening_stock', 'closing_stock', 'material_purchase'];

const checkStockWorkflowPermission = (action) => async (req, res, next) => {
  const { type } = req.params;
  if (!STOCK_UPLOAD_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid upload type' });
  }
  const middleware = checkPermission(type, `can_${action}`);
  await middleware(req, res, next);
};

const loadStockUploadRecord = async (req, res, next) => {
  try {
    const config = UPLOAD_TYPE_CONFIG[req.params.type];
    const rows = await query(`SELECT * FROM ${config.masterTable} WHERE id = ? LIMIT 1`, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Upload record not found' });
    }
    const record = rows[0];
    if (req.outletScope && !req.outletScope.all && !req.outletScope.outletIds.includes(Number(record.outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this record outlet' });
    }
    req.record = record;
    req.uploadConfig = config;
    next();
  } catch (error) {
    console.error('Load stock upload record error:', error);
    res.status(500).json({ success: false, message: 'Error loading upload record' });
  }
};

router.post('/:type/:id/submit', protect, applyOutletScope, checkStockWorkflowPermission('submit'), loadStockUploadRecord, submitStockUpload);
router.post('/:type/:id/verify', protect, applyOutletScope, checkStockWorkflowPermission('verify'), loadStockUploadRecord, verifyStockUpload);
router.post('/:type/:id/reject', protect, applyOutletScope, checkStockWorkflowPermission('reject'), loadStockUploadRecord, rejectStockUpload);

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

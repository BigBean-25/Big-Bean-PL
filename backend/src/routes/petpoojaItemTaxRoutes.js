import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { protect, applyOutletScope } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import {
  downloadItemTaxTemplate,
  uploadItemTaxReport,
  getItemTaxUploads,
  getItemTaxUploadById,
  deleteItemTaxUpload,
  submitItemTaxUpload,
  verifyItemTaxUpload,
  rejectItemTaxUpload
} from '../controllers/petpoojaItemTaxController.js';

const router = express.Router();

const itemTaxUploadDir = 'uploads/petpooja-item-tax/';
if (!fs.existsSync(itemTaxUploadDir)) {
  fs.mkdirSync(itemTaxUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, itemTaxUploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'item-tax-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(xlsx)$/i.test(file.originalname)) return cb(null, true);
    cb(new Error('Please upload a .xlsx PetPooja export'));
  }
});

router.get('/item-tax-template', protect, applyOutletScope, checkPermission('item_sales_tax', 'can_export'), downloadItemTaxTemplate);
router.post('/item-tax-upload', protect, applyOutletScope, checkPermission('item_sales_tax', 'can_upload'), upload.single('file'), uploadItemTaxReport);
router.get('/item-tax-uploads', protect, applyOutletScope, checkPermission('item_sales_tax', 'can_view'), getItemTaxUploads);
router.get('/item-tax-uploads/:id', protect, applyOutletScope, checkPermission('item_sales_tax', 'can_view'), getItemTaxUploadById);
router.delete('/item-tax-uploads/:id', protect, applyOutletScope, checkPermission('item_sales_tax', 'can_delete'), deleteItemTaxUpload);

// Phase 5D2B4: maker-checker workflow. Verified is terminal - there is
// intentionally no route that moves a Verified upload anywhere.
router.post('/item-tax-uploads/:id/submit', protect, applyOutletScope, checkPermission('item_sales_tax', 'can_submit'), submitItemTaxUpload);
router.post('/item-tax-uploads/:id/verify', protect, applyOutletScope, checkPermission('item_sales_tax', 'can_verify'), verifyItemTaxUpload);
router.post('/item-tax-uploads/:id/reject', protect, applyOutletScope, checkPermission('item_sales_tax', 'can_reject'), rejectItemTaxUpload);

export default router;

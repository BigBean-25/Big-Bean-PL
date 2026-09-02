import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { protect, applyOutletScope } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import {
  downloadPetPoojaTemplate,
  uploadPetPoojaSalesDaily,
  uploadPetPoojaSalesMonthly,
  getReconciliations,
  getReconciliationById,
  downloadErrorReport,
  downloadOriginalFile,
  downloadProcessedFile,
  approveSalesUpload,
  rejectSalesUpload,
  rollbackPetPoojaUpload
} from '../controllers/petpoojaSalesController.js';

const router = express.Router();

// Configure multer for file uploads
const petpoojaUploadDir = 'uploads/petpooja-sales/';
if (!fs.existsSync(petpoojaUploadDir)) {
  fs.mkdirSync(petpoojaUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, petpoojaUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'petpooja-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(xlsx)$/i;
    if (allowedTypes.test(file.originalname)) {
      return cb(null, true);
    }
    cb(new Error('Please upload a .xlsx PetPooja export'));
  }
});

// PetPooja Sales Routes
router.get('/petpooja-template', protect, applyOutletScope, checkPermission('item_sales', 'can_export'), downloadPetPoojaTemplate);

router.post('/petpooja-upload/daily', protect, applyOutletScope, checkPermission('item_sales_daily', 'can_upload'), upload.single('file'), uploadPetPoojaSalesDaily);
router.post('/petpooja-upload/monthly', protect, applyOutletScope, checkPermission('item_sales_monthly', 'can_upload'), upload.single('file'), uploadPetPoojaSalesMonthly);

router.get('/petpooja-upload/:id/original', protect, applyOutletScope, checkPermission('item_sales', 'can_export'), downloadOriginalFile);
router.get('/petpooja-upload/:id/processed', protect, applyOutletScope, checkPermission('item_sales', 'can_export'), downloadProcessedFile);

// Reconciliation Routes
router.get('/reconciliation', protect, applyOutletScope, checkPermission('item_sales', 'can_view'), getReconciliations);
router.get('/reconciliation/:id', protect, applyOutletScope, checkPermission('item_sales', 'can_view'), getReconciliationById);
router.get('/reconciliation/:id/error-report-excel', protect, applyOutletScope, checkPermission('item_sales', 'can_export'), downloadErrorReport);
router.post('/reconciliation/:id/approve', protect, applyOutletScope, checkPermission('item_sales', 'can_approve'), approveSalesUpload);
router.post('/reconciliation/:id/reject', protect, applyOutletScope, checkPermission('item_sales', 'can_reject'), rejectSalesUpload);
router.delete('/petpooja-upload/:id', protect, applyOutletScope, checkPermission('item_sales', 'can_delete'), rollbackPetPoojaUpload);

export default router;

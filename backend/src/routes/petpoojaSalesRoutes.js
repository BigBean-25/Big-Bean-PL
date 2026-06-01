import express from 'express';
import multer from 'multer';
import path from 'path';
import { protect, authorize } from '../middleware/auth.js';
import {
  downloadPetPoojaTemplate,
  uploadPetPoojaSales,
  getReconciliations,
  getReconciliationById,
  downloadErrorReport,
  approveSalesUpload,
  rejectSalesUpload
} from '../controllers/petpoojaSalesController.js';

import {
  getAdvancedMonthlyPL,
  updatePLComponents,
  finalizePL
} from '../controllers/advancedPLController.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/petpooja-sales/');
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
    const allowedTypes = /xlsx|xls/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  }
});

// PetPooja Sales Routes
router.get('/petpooja-template', protect, downloadPetPoojaTemplate);
router.post('/petpooja-upload', protect, authorize('Admin', 'Super Admin', 'Outlet Admin'), upload.single('file'), uploadPetPoojaSales);

// Reconciliation Routes
router.get('/reconciliation', protect, getReconciliations);
router.get('/reconciliation/:id', protect, getReconciliationById);
router.get('/reconciliation/:id/error-report-excel', protect, downloadErrorReport);
router.post('/reconciliation/:id/approve', protect, authorize('Admin', 'Super Admin'), approveSalesUpload);
router.post('/reconciliation/:id/reject', protect, authorize('Admin', 'Super Admin'), rejectSalesUpload);

// Advanced P&L Routes
router.get('/advanced-monthly-pl', protect, getAdvancedMonthlyPL);
router.post('/update-pl-components', protect, authorize('Admin', 'Super Admin'), updatePLComponents);
router.post('/finalize-pl', protect, authorize('Super Admin'), finalizePL);

export default router;

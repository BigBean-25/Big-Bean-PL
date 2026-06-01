import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { upload } from '../config/multer.js';
import {
  getDailyCashbooks,
  createDailyCashbook,
  updateDailyCashbook,
  verifyDailyCashbook,
  getDailyCashExpenses,
  createDailyCashExpense,
  approveDailyCashExpense,
  createBankDeposit,
  getDayClosings,
  submitDayClosing,
  verifyDayClosing
} from '../controllers/dailyAccountsController.js';

const router = express.Router();

router.get('/cashbooks', protect, getDailyCashbooks);
router.post('/cashbooks', protect, authorize('Outlet Admin', 'Admin', 'Super Admin'), createDailyCashbook);
router.put('/cashbooks/:id', protect, authorize('Outlet Admin', 'Admin', 'Super Admin'), updateDailyCashbook);
router.post('/cashbooks/:id/verify', protect, authorize('Admin', 'Super Admin'), verifyDailyCashbook);

router.get('/expenses', protect, getDailyCashExpenses);
router.post('/expenses', protect, upload.single('proof'), createDailyCashExpense);
router.post('/expenses/:id/approve', protect, authorize('Admin', 'Super Admin'), approveDailyCashExpense);

router.post('/bank-deposits', protect, upload.single('proof'), createBankDeposit);

router.get('/day-closing', protect, getDayClosings);
router.post('/day-closing', protect, authorize('Outlet Admin', 'Outlet Staff', 'Admin', 'Super Admin'), submitDayClosing);
router.post('/day-closing/:id/verify', protect, authorize('Admin', 'Super Admin'), verifyDayClosing);

export default router;

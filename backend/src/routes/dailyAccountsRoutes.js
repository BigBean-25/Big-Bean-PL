import express from 'express';
import { protect, applyOutletScope, loadScopedRecord, preventLockedModification } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
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

router.get('/cashbooks', protect, applyOutletScope, getDailyCashbooks);
router.post('/cashbooks', protect, applyOutletScope, checkPermission('daily_cashbook', 'can_create'), createDailyCashbook);
router.put('/cashbooks/:id', protect, applyOutletScope, checkPermission('daily_cashbook', 'can_edit'), loadScopedRecord('daily_cashbooks'), preventLockedModification, updateDailyCashbook);
router.post('/cashbooks/:id/verify', protect, applyOutletScope, checkPermission('daily_cashbook', 'can_verify'), loadScopedRecord('daily_cashbooks'), verifyDailyCashbook);

router.get('/expenses', protect, applyOutletScope, getDailyCashExpenses);
router.post('/expenses', protect, applyOutletScope, checkPermission('daily_expenses', 'can_create'), upload.single('proof'), createDailyCashExpense);
router.post('/expenses/:id/approve', protect, applyOutletScope, checkPermission('daily_expenses', 'can_approve'), loadScopedRecord('daily_cash_expenses'), preventLockedModification, approveDailyCashExpense);

router.post('/bank-deposits', protect, applyOutletScope, upload.single('proof'), createBankDeposit);

router.get('/day-closing', protect, applyOutletScope, getDayClosings);
router.post('/day-closing', protect, applyOutletScope, checkPermission('day_closing', 'can_submit'), submitDayClosing);
router.post('/day-closing/:id/verify', protect, applyOutletScope, checkPermission('day_closing', 'can_verify'), loadScopedRecord('day_closings'), verifyDayClosing);

export default router;

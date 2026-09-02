import express from 'express';
import { protect, applyOutletScope, loadScopedRecord, preventLockedModification, preventOwnApproval } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import { upload } from '../config/multer.js';
import {
  getDailyCashbooks,
  createDailyCashbook,
  updateDailyCashbook,
  verifyDailyCashbook,
  submitDailyCashbook,
  lockDailyCashbook,
  getCashbookSummary,
  deleteDailyCashbook,
  getDailyCashExpenses,
  getDailyCashExpenseById,
  createDailyCashExpense,
  updateDailyCashExpense,
  submitDailyCashExpense,
  approveDailyCashExpense,
  rejectDailyCashExpense,
  deleteDailyCashExpense,
  getBankDeposits,
  getBankDepositSummary,
  getBankDepositById,
  createBankDeposit,
  updateBankDeposit,
  submitBankDeposit,
  verifyBankDeposit,
  rejectBankDeposit,
  deleteBankDeposit,
  getDayClosings,
  getDayClosingById,
  getDayClosingSummary,
  createDayClosing,
  updateDayClosing,
  submitDayClosing,
  verifyDayClosing,
  rejectDayClosing,
  lockDayClosing,
  deleteDayClosing,
  getDailyChecklists,
  getDailyChecklistById,
  getDailyChecklistSummaryAPI,
  createDailyChecklist,
  updateDailyChecklist,
  submitDailyChecklist,
  verifyDailyChecklist,
  rejectDailyChecklist,
  deleteDailyChecklist
} from '../controllers/dailyAccountsController.js';

const router = express.Router();

router.get('/cashbooks', protect, applyOutletScope, getDailyCashbooks);
router.get('/cashbooks/summary', protect, applyOutletScope, getCashbookSummary);
router.post('/cashbooks', protect, applyOutletScope, checkPermission('daily_cashbook', 'can_create'), createDailyCashbook);
router.put('/cashbooks/:id', protect, applyOutletScope, checkPermission('daily_cashbook', 'can_edit'), loadScopedRecord('daily_cashbooks'), preventLockedModification, updateDailyCashbook);
router.post('/cashbooks/:id/submit', protect, applyOutletScope, checkPermission('daily_cashbook', 'can_submit'), loadScopedRecord('daily_cashbooks'), submitDailyCashbook);
router.post('/cashbooks/:id/verify', protect, applyOutletScope, checkPermission('daily_cashbook', 'can_verify'), loadScopedRecord('daily_cashbooks'), preventLockedModification, verifyDailyCashbook);
router.post('/cashbooks/:id/lock', protect, applyOutletScope, checkPermission('daily_cashbook', 'can_lock'), loadScopedRecord('daily_cashbooks'), preventLockedModification, lockDailyCashbook);
router.delete('/cashbooks/:id', protect, applyOutletScope, checkPermission('daily_cashbook', 'can_delete'), loadScopedRecord('daily_cashbooks'), deleteDailyCashbook);

router.get('/expenses', protect, applyOutletScope, checkPermission('daily_expenses', 'can_view'), getDailyCashExpenses);
router.get('/expenses/:id', protect, applyOutletScope, checkPermission('daily_expenses', 'can_view'), loadScopedRecord('daily_cash_expenses'), getDailyCashExpenseById);
router.post('/expenses', protect, applyOutletScope, checkPermission('daily_expenses', 'can_create'), upload.single('proof'), createDailyCashExpense);
router.put('/expenses/:id', protect, applyOutletScope, checkPermission('daily_expenses', 'can_edit'), loadScopedRecord('daily_cash_expenses'), preventLockedModification, upload.single('proof'), updateDailyCashExpense);
router.post('/expenses/:id/submit', protect, applyOutletScope, checkPermission('daily_expenses', 'can_submit'), loadScopedRecord('daily_cash_expenses'), submitDailyCashExpense);
router.post('/expenses/:id/approve', protect, applyOutletScope, checkPermission('daily_expenses', 'can_approve'), loadScopedRecord('daily_cash_expenses'), preventOwnApproval('entered_by'), preventLockedModification, approveDailyCashExpense);
router.post('/expenses/:id/reject', protect, applyOutletScope, checkPermission('daily_expenses', 'can_reject'), loadScopedRecord('daily_cash_expenses'), preventOwnApproval('entered_by'), preventLockedModification, rejectDailyCashExpense);
router.delete('/expenses/:id', protect, applyOutletScope, checkPermission('daily_expenses', 'can_delete'), loadScopedRecord('daily_cash_expenses'), deleteDailyCashExpense);

router.get('/bank-deposits', protect, applyOutletScope, checkPermission('bank_deposits', 'can_view'), getBankDeposits);
router.get('/bank-deposits/summary', protect, applyOutletScope, checkPermission('bank_deposits', 'can_view'), getBankDepositSummary);
router.get('/bank-deposits/:id', protect, applyOutletScope, checkPermission('bank_deposits', 'can_view'), loadScopedRecord('bank_deposits'), getBankDepositById);
router.post('/bank-deposits', protect, applyOutletScope, checkPermission('bank_deposits', 'can_create'), upload.single('proof'), createBankDeposit);
router.put('/bank-deposits/:id', protect, applyOutletScope, checkPermission('bank_deposits', 'can_edit'), loadScopedRecord('bank_deposits'), preventLockedModification, upload.single('proof'), updateBankDeposit);
router.post('/bank-deposits/:id/submit', protect, applyOutletScope, checkPermission('bank_deposits', 'can_submit'), loadScopedRecord('bank_deposits'), submitBankDeposit);
router.post('/bank-deposits/:id/verify', protect, applyOutletScope, checkPermission('bank_deposits', 'can_verify'), loadScopedRecord('bank_deposits'), preventOwnApproval('entered_by'), verifyBankDeposit);
router.post('/bank-deposits/:id/reject', protect, applyOutletScope, checkPermission('bank_deposits', 'can_reject'), loadScopedRecord('bank_deposits'), preventOwnApproval('entered_by'), rejectBankDeposit);
router.delete('/bank-deposits/:id', protect, applyOutletScope, checkPermission('bank_deposits', 'can_delete'), loadScopedRecord('bank_deposits'), deleteBankDeposit);

router.get('/day-closing', protect, applyOutletScope, checkPermission('day_closing', 'can_view'), getDayClosings);
router.get('/day-closing/summary', protect, applyOutletScope, checkPermission('day_closing', 'can_view'), getDayClosingSummary);
router.get('/day-closing/:id', protect, applyOutletScope, checkPermission('day_closing', 'can_view'), loadScopedRecord('day_closings'), getDayClosingById);
router.post('/day-closing', protect, applyOutletScope, checkPermission('day_closing', 'can_create'), createDayClosing);
router.put('/day-closing/:id', protect, applyOutletScope, checkPermission('day_closing', 'can_edit'), loadScopedRecord('day_closings'), preventLockedModification, updateDayClosing);
router.post('/day-closing/:id/submit', protect, applyOutletScope, checkPermission('day_closing', 'can_submit'), loadScopedRecord('day_closings'), submitDayClosing);
router.post('/day-closing/:id/verify', protect, applyOutletScope, checkPermission('day_closing', 'can_verify'), loadScopedRecord('day_closings'), preventLockedModification, preventOwnApproval('submitted_by'), verifyDayClosing);
router.post('/day-closing/:id/reject', protect, applyOutletScope, checkPermission('day_closing', 'can_reject'), loadScopedRecord('day_closings'), preventLockedModification, preventOwnApproval('submitted_by'), rejectDayClosing);
router.post('/day-closing/:id/lock', protect, applyOutletScope, checkPermission('day_closing', 'can_lock'), loadScopedRecord('day_closings'), preventLockedModification, lockDayClosing);
router.delete('/day-closing/:id', protect, applyOutletScope, checkPermission('day_closing', 'can_delete'), loadScopedRecord('day_closings'), deleteDayClosing);

router.get('/daily-checklist', protect, applyOutletScope, checkPermission('daily_checklist', 'can_view'), getDailyChecklists);
router.get('/daily-checklist/summary', protect, applyOutletScope, checkPermission('daily_checklist', 'can_view'), getDailyChecklistSummaryAPI);
router.get('/daily-checklist/:id', protect, applyOutletScope, checkPermission('daily_checklist', 'can_view'), loadScopedRecord('daily_checklists'), getDailyChecklistById);
router.post('/daily-checklist', protect, applyOutletScope, checkPermission('daily_checklist', 'can_create'), createDailyChecklist);
router.put('/daily-checklist/:id', protect, applyOutletScope, checkPermission('daily_checklist', 'can_edit'), loadScopedRecord('daily_checklists'), updateDailyChecklist);
router.post('/daily-checklist/:id/submit', protect, applyOutletScope, checkPermission('daily_checklist', 'can_submit'), loadScopedRecord('daily_checklists'), submitDailyChecklist);
router.post('/daily-checklist/:id/verify', protect, applyOutletScope, checkPermission('daily_checklist', 'can_verify'), loadScopedRecord('daily_checklists'), verifyDailyChecklist);
router.post('/daily-checklist/:id/reject', protect, applyOutletScope, checkPermission('daily_checklist', 'can_reject'), loadScopedRecord('daily_checklists'), rejectDailyChecklist);
router.delete('/daily-checklist/:id', protect, applyOutletScope, checkPermission('daily_checklist', 'can_delete'), loadScopedRecord('daily_checklists'), deleteDailyChecklist);

export default router;

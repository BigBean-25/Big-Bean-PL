import express from 'express';
import { protect, applyOutletScope } from '../middleware/auth.js';
import {
  getMonthlyOutletPL,
  getActualConsumptionReport,
  getTheoreticalConsumptionReport,
  getDailyCashbookReport,
  getExpenseReport
} from '../controllers/reportController.js';

const router = express.Router();

router.get('/monthly-pl', protect, applyOutletScope, getMonthlyOutletPL);
router.get('/actual-consumption', protect, applyOutletScope, getActualConsumptionReport);
router.get('/theoretical-consumption', protect, applyOutletScope, getTheoreticalConsumptionReport);
router.get('/daily-cashbook', protect, applyOutletScope, getDailyCashbookReport);
router.get('/expenses', protect, applyOutletScope, getExpenseReport);

export default router;

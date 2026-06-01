import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getMonthlyOutletPL,
  getActualConsumptionReport,
  getTheoreticalConsumptionReport,
  getDailyCashbookReport,
  getExpenseReport
} from '../controllers/reportController.js';

const router = express.Router();

router.get('/monthly-pl', protect, getMonthlyOutletPL);
router.get('/actual-consumption', protect, getActualConsumptionReport);
router.get('/theoretical-consumption', protect, getTheoreticalConsumptionReport);
router.get('/daily-cashbook', protect, getDailyCashbookReport);
router.get('/expenses', protect, getExpenseReport);

export default router;

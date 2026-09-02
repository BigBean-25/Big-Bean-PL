import express from 'express';
import { protect, applyOutletScope } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import {
  getMonthlyOutletPL,
  finalizeMonthlyOutletPL,
  getOutletComparisonReport,
  getActualConsumptionReport,
  getTheoreticalConsumptionReport,
  getDailyCashbookReport,
  getExpenseReport,
  getSupplierPendingReport,
  getPurchaseGSTReport,
  getSalesGSTReport,
  getGSTR1Report
} from '../controllers/reportController.js';
import { saveConsumptionVarianceRun } from '../services/consumptionVarianceService.js';

const router = express.Router();

router.get('/monthly-pl', protect, applyOutletScope, getMonthlyOutletPL);
router.post('/monthly-pl/finalize', protect, applyOutletScope, checkPermission('monthly_pl', 'can_lock'), finalizeMonthlyOutletPL);
router.get('/outlet-comparison', protect, getOutletComparisonReport);
router.get('/actual-consumption', protect, applyOutletScope, getActualConsumptionReport);
router.get('/theoretical-consumption', protect, applyOutletScope, getTheoreticalConsumptionReport);
router.get('/daily-cashbook', protect, applyOutletScope, getDailyCashbookReport);
router.get('/expenses', protect, applyOutletScope, getExpenseReport);
router.get('/supplier-pending', protect, applyOutletScope, getSupplierPendingReport);
router.get('/purchase-gst', protect, getPurchaseGSTReport);
router.get('/sales-gst', protect, applyOutletScope, getSalesGSTReport);
router.get('/gstr1', protect, applyOutletScope, getGSTR1Report);

router.get('/consumption-variance', protect, applyOutletScope, async (req, res) => {
  try {
    const { outlet_id, month, year } = req.query;
    if (!outlet_id || !month || !year) {
      return res.status(400).json({ success: false, message: 'Outlet, month, and year are required' });
    }
    const { rows } = await saveConsumptionVarianceRun({ outletId: outlet_id, month, year, userId: req.user.id });
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Get consumption variance report error:', error);
    res.status(500).json({ success: false, message: 'Error generating consumption variance report' });
  }
});

export default router;

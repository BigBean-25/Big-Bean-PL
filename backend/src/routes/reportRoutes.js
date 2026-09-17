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
import { getConsumptionVarianceDiagnostics } from '../services/consumptionVarianceDiagnosticsService.js';
import { getOutletWastageByCategoryReport } from '../services/outletWastageByCategoryService.js';

const router = express.Router();

// Every route below except outlet-comparison/purchase-gst (which have their
// own internal canAccessAllOutlets check instead, since they span every
// outlet with no outlet_id to scope by) had no checkPermission at all - any
// authenticated user with an assigned outlet, including Outlet Staff (who
// the permission matrix deliberately grants neither 'reports' nor
// 'monthly_pl' to), could pull GST/consumption/expense/supplier reports for
// that outlet regardless of their actual report permission. monthly-pl
// checks the 'monthly_pl' module key specifically (matching its own
// finalize route below) rather than 'reports', since Outlet Admin/Manager
// are deliberately granted 'reports' but not 'monthly_pl' - the P&L report
// is meant to stay Accountant/leadership-level, unlike the rest.
router.get('/monthly-pl', protect, applyOutletScope, checkPermission('monthly_pl', 'can_view'), getMonthlyOutletPL);
router.post('/monthly-pl/finalize', protect, applyOutletScope, checkPermission('monthly_pl', 'can_lock'), finalizeMonthlyOutletPL);
router.get('/outlet-comparison', protect, checkPermission('monthly_pl', 'can_view'), getOutletComparisonReport);
router.get('/actual-consumption', protect, applyOutletScope, checkPermission('reports', 'can_view'), getActualConsumptionReport);
router.get('/theoretical-consumption', protect, applyOutletScope, checkPermission('reports', 'can_view'), getTheoreticalConsumptionReport);
router.get('/daily-cashbook', protect, applyOutletScope, checkPermission('reports', 'can_view'), getDailyCashbookReport);
router.get('/expenses', protect, applyOutletScope, checkPermission('reports', 'can_view'), getExpenseReport);
router.get('/supplier-pending', protect, applyOutletScope, checkPermission('reports', 'can_view'), getSupplierPendingReport);
router.get('/purchase-gst', protect, checkPermission('reports', 'can_view'), getPurchaseGSTReport);
router.get('/sales-gst', protect, applyOutletScope, checkPermission('reports', 'can_view'), getSalesGSTReport);
router.get('/gstr1', protect, applyOutletScope, checkPermission('reports', 'can_view'), getGSTR1Report);

router.get('/consumption-variance', protect, applyOutletScope, checkPermission('reports', 'can_view'), async (req, res) => {
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

router.get('/consumption-variance-diagnostics', protect, applyOutletScope, checkPermission('reports', 'can_view'), async (req, res) => {
  try {
    const { outlet_id, month, year } = req.query;
    if (!outlet_id || !month || !year) {
      return res.status(400).json({ success: false, message: 'Outlet, month, and year are required' });
    }
    const data = await getConsumptionVarianceDiagnostics({ outletId: outlet_id, month, year, outletScope: req.outletScope });
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get consumption variance diagnostics error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Error generating consumption variance diagnostics' });
  }
});

router.get('/wastage-by-category', protect, applyOutletScope, checkPermission('reports', 'can_view'), async (req, res) => {
  try {
    const { outlet_id, from_date, to_date } = req.query;
    if (!outlet_id || !from_date || !to_date) {
      return res.status(400).json({ success: false, message: 'Outlet, from date, and to date are required' });
    }
    const data = await getOutletWastageByCategoryReport({ outletId: outlet_id, fromDate: from_date, toDate: to_date, outletScope: req.outletScope });
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get wastage by category report error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Error generating wastage by category report' });
  }
});

export default router;

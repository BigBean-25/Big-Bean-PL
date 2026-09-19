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
import { getPhysicalAccountingReconciliation } from '../services/physicalAccountingReconciliationService.js';
import { getClosingReconciliation } from '../services/closingReconciliationService.js';
import { getHybridCogsReconciliation } from '../services/hybridCogsReconciliationService.js';
import { getOutletConsumptionReconciliation } from '../services/outletConsumptionService.js';
import { getProductionValuation } from '../services/productionValuationService.js';
import { canAccessAllOutlets } from '../utils/roleAccess.js';

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

// Phase 6A2: SHADOW physical <-> accounting reconciliation. Read-only
// diagnostics - returns comparison data only, never writes, never makes a
// physical transaction financially effective.
router.get('/physical-accounting-reconciliation', protect, applyOutletScope, checkPermission('reports', 'can_view'), async (req, res) => {
  try {
    const { outlet_id, from_date, to_date, supplier_id, raw_material_id } = req.query;
    const data = await getPhysicalAccountingReconciliation({
      outletId: outlet_id ? Number(outlet_id) : null,
      fromDate: from_date,
      toDate: to_date,
      supplierId: supplier_id ? Number(supplier_id) : null,
      rawMaterialId: raw_material_id ? Number(raw_material_id) : null,
      outletScope: req.outletScope,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get physical-accounting reconciliation error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Error generating reconciliation' });
  }
});

// Phase 6A5: closing-stock reconciliation + month-close readiness.
// Read-only - the Verified closing upload remains the financial closing
// source; physical ledger/counts are diagnostics and the readiness verdict
// is advisory only (it never blocks finalization).
router.get('/closing-reconciliation', protect, applyOutletScope, checkPermission('reports', 'can_view'), async (req, res) => {
  try {
    const { outlet_id, month, year, to_date } = req.query;
    const data = await getClosingReconciliation({
      outletId: outlet_id ? Number(outlet_id) : null,
      month: month ? Number(month) : null,
      year: year ? Number(year) : null,
      toDate: to_date || null,
      outletScope: req.outletScope,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get closing reconciliation error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Error generating closing reconciliation' });
  }
});

// Phase 6A6: hybrid COGS reconciliation. Read-only - FINANCIAL COGS
// (Verified Opening + Effective Purchases - Verified Closing) remains the
// official P&L figure; physical values are diagnostics, never posted.
router.get('/hybrid-cogs-reconciliation', protect, applyOutletScope, checkPermission('reports', 'can_view'), async (req, res) => {
  try {
    const { outlet_id, month, year } = req.query;
    const data = await getHybridCogsReconciliation({
      outletId: outlet_id ? Number(outlet_id) : null,
      month: month ? Number(month) : null,
      year: year ? Number(year) : null,
      outletScope: req.outletScope,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get hybrid COGS reconciliation error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Error generating hybrid COGS reconciliation' });
  }
});

// Phase 6A7: physical vs theoretical outlet consumption reconciliation.
// Read-only - Posted OUTLET_CONSUMPTION ledger rows vs canonical theoretical
// consumption. Variance is diagnostic only, never posted.
router.get('/outlet-consumption-reconciliation', protect, applyOutletScope, checkPermission('reports', 'can_view'), async (req, res) => {
  try {
    const { outlet_id, month, year } = req.query;
    if (!outlet_id || !month || !year) {
      return res.status(400).json({ success: false, message: 'Outlet, month, and year are required' });
    }
    if (req.outletScope && !req.outletScope.all && !(req.outletScope.outletIds || []).map(Number).includes(Number(outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to the requested outlet' });
    }
    const data = await getOutletConsumptionReconciliation({ outletId: Number(outlet_id), month: Number(month), year: Number(year) });
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get outlet consumption reconciliation error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Error generating outlet consumption reconciliation' });
  }
});

// Phase 6A7: production valuation diagnostics. Read-only - surfaces the
// deterministic physical cost trail postProductionBatch already writes.
// Scoped by Central Kitchen location rather than outlet_id: full-access roles
// see any kitchen; Warehouse Admin is blocked (Central Warehouse scope);
// outlet-locked roles may view a kitchen only where their role permits
// production reporting (gated by the reports.can_view check above plus the
// location check below).
router.get('/production-valuation', protect, applyOutletScope, checkPermission('reports', 'can_view'), async (req, res) => {
  try {
    const { central_kitchen_id, from_date, to_date } = req.query;
    if (!central_kitchen_id) {
      return res.status(400).json({ success: false, message: 'central_kitchen_id is required' });
    }
    if (!canAccessAllOutlets(req.user.role_name)) {
      // Outlet-locked roles have no production-report permission in the
      // matrix - a report spanning a kitchen they don't own is not theirs to
      // see. They can view only if the kitchen is mapped to their outlet,
      // which Central Kitchen locations never are.
      return res.status(403).json({ success: false, message: 'You do not have access to this report' });
    }
    const data = await getProductionValuation({ centralKitchenId: Number(central_kitchen_id), fromDate: from_date || null, toDate: to_date || null });
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get production valuation error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Error generating production valuation' });
  }
});

export default router;

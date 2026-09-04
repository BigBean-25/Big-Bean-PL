import express from 'express';
import { protect } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import { applyLocationScope, checkLocationAccess, isLocationAccessible, resolveScopedLocationId, resolveScopedLocationIds } from '../middleware/warehouseMiddleware.js';
import { query } from '../config/database.js';
import { canAccessAllOutlets } from '../utils/roleAccess.js';
import {
  getAllowedLocations, createLocation, getLocationById, postOpening, getCurrentStock,
  getStockLedger, getDashboardMetrics, createGRN, postGRN, getGRNs, getGRNById,
  getRequisitions, getRequisitionById, createRequisition, submitRequisition,
  approveRequisition, dispatchRequisition, getTransfers, getTransferById, receiveTransfer,
  getLocationsForManagement, updateLocation, getLocationOperationalSummary,
} from '../services/warehouseService.js';
import {
  getPhysicalStockCounts, getPhysicalStockCountById, createPhysicalStockCount, updatePhysicalStockCount,
  submitPhysicalStockCount, verifyPhysicalStockCount, approvePhysicalStockCount, postPhysicalStockCount, lockPhysicalStockCount, deletePhysicalStockCount,
  getStockAdjustments, getStockAdjustmentById, createStockAdjustment, updateStockAdjustment,
  submitStockAdjustment, verifyStockAdjustment, approveStockAdjustment, postStockAdjustment, lockStockAdjustment, deleteStockAdjustment,
  getWarehouseWastages, getWarehouseWastageById, createWarehouseWastage, updateWarehouseWastage,
  submitWarehouseWastage, verifyWarehouseWastage, approveWarehouseWastage, postWarehouseWastage, lockWarehouseWastage, deleteWarehouseWastage,
} from '../services/warehousePhase2cService.js';
import {
  getBatches, getAvailableBatches, allocateFEFO, getExpiryAlerts, getBatchLedgerHistory
} from '../services/warehouseBatchService.js';
import {
  getReturns, getReturnById, createReturn, updateReturn, deleteReturn,
  submitReturn, verifyReturn, approveReturn, rejectReturn, postReturn, lockReturn,
  getGRNsForReturn, getGRNItems, getCreditsSummary, updateCreditStatus
} from '../services/warehousePurchaseReturnService.js';
import {
  getPOs, getPOById, createPO, updatePO, deletePO,
  submitPO, approvePO, rejectPO, sendPO, closePO,
  getPOReceiptSummary, getGRNPrefill
} from '../services/warehousePurchaseOrderService.js';
import {
  getSupplierHistorySummary, getSupplierHistoryDetail,
  getSupplierMaterialHistory, getSupplierPriceMovement, getSupplierTimeline
} from '../services/warehouseSupplierHistoryService.js';
import {
  getReorderData, updateReorderSettings, createDraftPOFromReorder
} from '../services/warehouseReorderService.js';
import * as reportService from '../services/warehouseReportService.js';
import * as settingService from '../services/warehouseSettingService.js';

const router = express.Router();

router.use(protect);

router.get('/locations', async (req, res) => {
  try {
    if (req.query.scope === 'management') {
      return checkPermission('locations', 'can_view')(req, res, async () => {
        try {
          const rows = await getLocationsForManagement(req.query);
          res.json({ success: true, data: rows });
        } catch (error) {
          res.status(500).json({ success: false, message: error.message });
        }
      });
    }
    const rows = await getAllowedLocations(req.user, req.query.scope);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/locations', checkPermission('locations', 'can_create'), async (req, res) => {
  try {
    const row = await createLocation(req.body, req.user.id);
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/locations/:id', protect, checkLocationAccess('id'), async (req, res) => {
  try {
    const row = await getLocationById(req.params.id);
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/locations/:id/summary', checkPermission('locations', 'can_view'), checkLocationAccess('id'), async (req, res) => {
  try {
    const row = await getLocationById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Location not found' });
    const summary = await getLocationOperationalSummary(req.params.id);
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/locations/:id', checkPermission('locations', 'can_edit'), async (req, res) => {
  try {
    const row = await updateLocation(req.params.id, req.body);
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/dashboard', checkPermission('warehouse_dashboard', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const locationId = req.query.location_id || (req.locationScope ? req.locationScope.requestedLocationId : null);
    if (!locationId) return res.status(400).json({ success: false, message: 'location_id required' });
    const data = await getDashboardMetrics(locationId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/stock', checkPermission('warehouse_stock', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const locationId = req.query.location_id || (req.locationScope ? req.locationScope.requestedLocationId : null);
    if (!locationId) return res.status(400).json({ success: false, message: 'location_id required' });
    const data = await getCurrentStock(locationId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/ledger', checkPermission('warehouse_ledger', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    // getStockLedger computes a running balance by walking every matching row
    // in order (balance += qty_in - qty_out, cumulative from the start of the
    // filtered set) - it also backs the ledger report/export, which need that
    // complete computed array. So the query and balance math stay untouched
    // here; pagination is applied afterwards, in memory, on the already-
    // computed array, purely to bound what actually gets sent to the browser.
    const allowedLocationIds = resolveScopedLocationIds(req, res, req.query.location_id);
    if (allowedLocationIds === undefined) return;
    const fullData = await getStockLedger({ ...req.query, allowedLocationIds });
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 25);
    const total = fullData.length;
    const start = (page - 1) * limit;
    const data = fullData.slice(start, start + limit);
    res.json({ success: true, data, pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/opening', checkPermission('warehouse_stock', 'can_create'), checkLocationAccess('location_id'), async (req, res) => {
  try {
    const row = await postOpening({ ...req.body, transaction_date: req.body.transaction_date || new Date().toISOString().split('T')[0] }, req.user.id);
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/grn', checkPermission('grn', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const allowedLocationIds = resolveScopedLocationIds(req, res, req.query.location_id);
    if (allowedLocationIds === undefined) return;
    const result = await getGRNs({ ...req.query, allowedLocationIds });
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/grn/:id', checkPermission('grn', 'can_view'), async (req, res) => {
  try {
    const data = await getGRNById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'GRN not found' });
    // checkLocationAccess() defaults to param 'location_id', which never
    // appears on this route (:id is the GRN's own id) so the check silently
    // no-op'd for every caller. Check the fetched record's own location
    // instead, same as its sibling GET /locations/:id (checkLocationAccess('id'))
    // and every other warehouse :id route in this file (requisitions,
    // transfers, purchase-orders, purchase-returns, etc.).
    if (!(await isLocationAccessible(req.user, data.warehouse_location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/grn', checkPermission('grn', 'can_create'), checkLocationAccess('warehouse_location_id'), async (req, res) => {
  try {
    const data = await createGRN(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/grn/:id/post', checkPermission('grn', 'can_edit'), async (req, res) => {
  try {
    const grn = await getGRNById(req.params.id);
    if (!grn) return res.status(404).json({ success: false, message: 'GRN not found' });
    if (!(await isLocationAccessible(req.user, grn.warehouse_location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    const data = await postGRN(req.params.id, req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/requisitions', checkPermission('warehouse_requisitions', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const allowedLocationIds = resolveScopedLocationIds(req, res, req.query.location_id, req.query.from_location_id, req.query.to_location_id);
    if (allowedLocationIds === undefined) return;
    const result = await getRequisitions({ ...req.query, allowedLocationIds });
    res.json({ success: true, data: result.data, pagination: result.pagination });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/requisitions/:id', checkPermission('warehouse_requisitions', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const data = await getRequisitionById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Requisition not found' });
    if (!req.locationScope.all) {
      const allowed = req.locationScope.locationIds;
      if (!allowed.includes(Number(data.from_location_id)) && !allowed.includes(Number(data.to_location_id))) {
        return res.status(403).json({ success: false, message: 'You do not have access to this requisition' });
      }
    }
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/requisitions', checkPermission('warehouse_requisitions', 'can_create'), async (req, res) => {
  try {
    // Outlet-scoped users (Outlet Admin/Staff) can only raise a requisition
    // for their own outlet's location, not any outlet in the picker.
    // canAccessAllOutlets checked first - outlet_ids can be non-empty even for
    // an all-outlet role (e.g. a Warehouse Admin account tagged to a couple of
    // outlets for convenience), which would otherwise wrongly restrict them.
    const outletIds = (req.user.outlet_ids || []).map((id) => Number(id)).filter(Boolean);
    if (!canAccessAllOutlets(req.user.role_name) && outletIds.length > 0) {
      const [toLocation] = await query('SELECT outlet_id FROM locations WHERE id = ?', [req.body.to_location_id]);
      if (!toLocation || !outletIds.includes(Number(toLocation.outlet_id))) {
        return res.status(403).json({ success: false, message: 'You can only raise a requisition for your own outlet' });
      }
    }
    const data = await createRequisition(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/requisitions/:id/submit', checkPermission('warehouse_requisitions', 'can_submit'), async (req, res) => {
  try {
    const requisition = await getRequisitionById(req.params.id);
    if (!requisition) return res.status(404).json({ success: false, message: 'Requisition not found' });
    // canAccessAllOutlets checked first, same reasoning as POST /requisitions above.
    const outletIds = (req.user.outlet_ids || []).map((id) => Number(id)).filter(Boolean);
    if (!canAccessAllOutlets(req.user.role_name) && outletIds.length > 0) {
      const [toLocation] = await query('SELECT outlet_id FROM locations WHERE id = ?', [requisition.to_location_id]);
      if (!toLocation || !outletIds.includes(Number(toLocation.outlet_id))) {
        return res.status(403).json({ success: false, message: 'You can only submit a requisition for your own outlet' });
      }
    }
    const data = await submitRequisition(req.params.id, req.user.id);
    res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/requisitions/:id/approve', checkPermission('warehouse_requisitions', 'can_approve'), async (req, res) => {
  try { const data = await approveRequisition(req.params.id, req.body, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/requisitions/:id/dispatch', checkPermission('warehouse_requisitions', 'can_edit'), async (req, res) => {
  try { const data = await dispatchRequisition(req.params.id, req.body, req.user.id); res.status(201).json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.get('/transfers', checkPermission('warehouse_transfers', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const allowedLocationIds = resolveScopedLocationIds(req, res, req.query.location_id, req.query.from_location_id, req.query.to_location_id);
    if (allowedLocationIds === undefined) return;
    const data = await getTransfers({ ...req.query, allowedLocationIds });
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/transfers/:id', checkPermission('warehouse_transfers', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const data = await getTransferById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Transfer not found' });
    if (!req.locationScope.all) {
      const allowed = req.locationScope.locationIds;
      if (!allowed.includes(Number(data.from_location_id)) && !allowed.includes(Number(data.to_location_id))) {
        return res.status(403).json({ success: false, message: 'You do not have access to this transfer' });
      }
    }
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/transfers/:id/receive', checkPermission('warehouse_transfers', 'can_edit'), async (req, res) => {
  try {
    const transfer = await getTransferById(req.params.id);
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' });
    if (!(await isLocationAccessible(req.user, transfer.to_location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    const data = await receiveTransfer(req.params.id, req.body, req.user.id);
    res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// --- Physical Stock Count ---

router.get('/physical-stock-counts', checkPermission('physical_stock_counts', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const allowedLocationIds = resolveScopedLocationIds(req, res, req.query.location_id);
    if (allowedLocationIds === undefined) return;
    const data = await getPhysicalStockCounts({ ...req.query, allowedLocationIds });
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/physical-stock-counts/:id', checkPermission('physical_stock_counts', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const data = await getPhysicalStockCountById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Physical stock count not found' });
    if (!req.locationScope.all && !req.locationScope.locationIds.includes(Number(data.location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/physical-stock-counts', checkPermission('physical_stock_counts', 'can_create'), checkLocationAccess('location_id'), async (req, res) => {
  try { const data = await createPhysicalStockCount(req.body, req.user.id); res.status(201).json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.put('/physical-stock-counts/:id', checkPermission('physical_stock_counts', 'can_edit'), async (req, res) => {
  try {
    const existing = await getPhysicalStockCountById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Physical stock count not found' });
    if (!(await isLocationAccessible(req.user, req.body.location_id || existing.location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    const data = await updatePhysicalStockCount(req.params.id, req.body); res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/physical-stock-counts/:id', checkPermission('physical_stock_counts', 'can_delete'), async (req, res) => {
  try {
    const existing = await getPhysicalStockCountById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Physical stock count not found' });
    if (!(await isLocationAccessible(req.user, existing.location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    const data = await deletePhysicalStockCount(req.params.id); res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/physical-stock-counts/:id/submit', checkPermission('physical_stock_counts', 'can_submit'), async (req, res) => {
  try { const data = await submitPhysicalStockCount(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/physical-stock-counts/:id/verify', checkPermission('physical_stock_counts', 'can_verify'), async (req, res) => {
  try { const data = await verifyPhysicalStockCount(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/physical-stock-counts/:id/approve', checkPermission('physical_stock_counts', 'can_approve'), async (req, res) => {
  try { const data = await approvePhysicalStockCount(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/physical-stock-counts/:id/post', checkPermission('physical_stock_counts', 'can_approve'), async (req, res) => {
  try { const data = await postPhysicalStockCount(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/physical-stock-counts/:id/lock', checkPermission('physical_stock_counts', 'can_lock'), async (req, res) => {
  try { const data = await lockPhysicalStockCount(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// --- Stock Adjustments ---

router.get('/stock-adjustments', checkPermission('stock_adjustments', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const allowedLocationIds = resolveScopedLocationIds(req, res, req.query.location_id);
    if (allowedLocationIds === undefined) return;
    const data = await getStockAdjustments({ ...req.query, allowedLocationIds });
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/stock-adjustments/:id', checkPermission('stock_adjustments', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const data = await getStockAdjustmentById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Stock adjustment not found' });
    if (!req.locationScope.all && !req.locationScope.locationIds.includes(Number(data.location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/stock-adjustments', checkPermission('stock_adjustments', 'can_create'), checkLocationAccess('location_id'), async (req, res) => {
  try { const data = await createStockAdjustment(req.body, req.user.id); res.status(201).json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.put('/stock-adjustments/:id', checkPermission('stock_adjustments', 'can_edit'), async (req, res) => {
  try {
    const existing = await getStockAdjustmentById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Stock adjustment not found' });
    if (!(await isLocationAccessible(req.user, req.body.location_id || existing.location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    const data = await updateStockAdjustment(req.params.id, req.body); res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/stock-adjustments/:id', checkPermission('stock_adjustments', 'can_delete'), async (req, res) => {
  try {
    const existing = await getStockAdjustmentById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Stock adjustment not found' });
    if (!(await isLocationAccessible(req.user, existing.location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    const data = await deleteStockAdjustment(req.params.id); res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/stock-adjustments/:id/submit', checkPermission('stock_adjustments', 'can_submit'), async (req, res) => {
  try { const data = await submitStockAdjustment(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/stock-adjustments/:id/verify', checkPermission('stock_adjustments', 'can_verify'), async (req, res) => {
  try { const data = await verifyStockAdjustment(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/stock-adjustments/:id/approve', checkPermission('stock_adjustments', 'can_approve'), async (req, res) => {
  try { const data = await approveStockAdjustment(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/stock-adjustments/:id/post', checkPermission('stock_adjustments', 'can_approve'), async (req, res) => {
  try { const data = await postStockAdjustment(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/stock-adjustments/:id/lock', checkPermission('stock_adjustments', 'can_lock'), async (req, res) => {
  try { const data = await lockStockAdjustment(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// --- Warehouse Wastage ---

router.get('/warehouse-wastage', checkPermission('warehouse_wastage', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const allowedLocationIds = resolveScopedLocationIds(req, res, req.query.location_id);
    if (allowedLocationIds === undefined) return;
    const data = await getWarehouseWastages({ ...req.query, allowedLocationIds });
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/warehouse-wastage/:id', checkPermission('warehouse_wastage', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const data = await getWarehouseWastageById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Wastage record not found' });
    if (!req.locationScope.all && !req.locationScope.locationIds.includes(Number(data.location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/warehouse-wastage', checkPermission('warehouse_wastage', 'can_create'), checkLocationAccess('location_id'), async (req, res) => {
  try { const data = await createWarehouseWastage(req.body, req.user.id); res.status(201).json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.put('/warehouse-wastage/:id', checkPermission('warehouse_wastage', 'can_edit'), async (req, res) => {
  try {
    const existing = await getWarehouseWastageById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Wastage record not found' });
    if (!(await isLocationAccessible(req.user, req.body.location_id || existing.location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    const data = await updateWarehouseWastage(req.params.id, req.body); res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/warehouse-wastage/:id', checkPermission('warehouse_wastage', 'can_delete'), async (req, res) => {
  try {
    const existing = await getWarehouseWastageById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Wastage record not found' });
    if (!(await isLocationAccessible(req.user, existing.location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    const data = await deleteWarehouseWastage(req.params.id); res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/warehouse-wastage/:id/submit', checkPermission('warehouse_wastage', 'can_submit'), async (req, res) => {
  try { const data = await submitWarehouseWastage(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/warehouse-wastage/:id/verify', checkPermission('warehouse_wastage', 'can_verify'), async (req, res) => {
  try { const data = await verifyWarehouseWastage(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/warehouse-wastage/:id/approve', checkPermission('warehouse_wastage', 'can_approve'), async (req, res) => {
  try { const data = await approveWarehouseWastage(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/warehouse-wastage/:id/post', checkPermission('warehouse_wastage', 'can_approve'), async (req, res) => {
  try { const data = await postWarehouseWastage(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/warehouse-wastage/:id/lock', checkPermission('warehouse_wastage', 'can_lock'), async (req, res) => {
  try { const data = await lockWarehouseWastage(req.params.id, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// --- Batch & Expiry ---

router.get('/batches', checkPermission('warehouse_batch_expiry', 'can_view'), async (req, res) => {
  try { const data = await getBatches(req.query); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/batches/:materialId/available', checkPermission('warehouse_batch_expiry', 'can_view'), async (req, res) => {
  try {
    const data = await getAvailableBatches(req.query.location_id, Number(req.params.materialId));
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/batches/:materialId/fefo', checkPermission('warehouse_batch_expiry', 'can_view'), async (req, res) => {
  try {
    const { location_id, qty } = req.query;
    const data = await allocateFEFO(Number(location_id), Number(req.params.materialId), Number(qty));
    res.json({ success: true, data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.get('/expiry-alerts', checkPermission('warehouse_batch_expiry', 'can_view'), async (req, res) => {
  try { const data = await getExpiryAlerts(req.query); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/batches/:materialId/history', checkPermission('warehouse_batch_expiry', 'can_view'), async (req, res) => {
  try {
    const { location_id, batch_no, expiry_date } = req.query;
    const data = await getBatchLedgerHistory(Number(location_id), Number(req.params.materialId), batch_no, expiry_date);
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// --- Purchase Returns ---

router.get('/purchase-returns', checkPermission('warehouse_purchase_returns', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const allowedLocationIds = resolveScopedLocationIds(req, res, req.query.location_id);
    if (allowedLocationIds === undefined) return;
    const data = await getReturns({ ...req.query, allowedLocationIds });
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/purchase-returns/grns', checkPermission('warehouse_purchase_returns', 'can_create'), async (req, res) => {
  try { const data = await getGRNsForReturn(Number(req.query.supplier_id), Number(req.query.location_id)); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/purchase-returns/grns/:id/items', checkPermission('warehouse_purchase_returns', 'can_create'), async (req, res) => {
  try { const data = await getGRNItems(Number(req.params.id)); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/purchase-returns/:id', checkPermission('warehouse_purchase_returns', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const data = await getReturnById(Number(req.params.id));
    if (!data) return res.status(404).json({ success: false, message: 'Purchase return not found' });
    if (!req.locationScope.all && !req.locationScope.locationIds.includes(Number(data.warehouse_location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/purchase-returns', checkPermission('warehouse_purchase_returns', 'can_create'), checkLocationAccess('warehouse_location_id'), async (req, res) => {
  try { const data = await createReturn(req.body, req.user.id); res.status(201).json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.put('/purchase-returns/:id', checkPermission('warehouse_purchase_returns', 'can_edit'), async (req, res) => {
  try {
    const existing = await getReturnById(Number(req.params.id));
    if (!existing) return res.status(404).json({ success: false, message: 'Purchase return not found' });
    if (!(await isLocationAccessible(req.user, req.body.warehouse_location_id || existing.warehouse_location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    const data = await updateReturn(Number(req.params.id), req.body, req.user.id); res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/purchase-returns/:id', checkPermission('warehouse_purchase_returns', 'can_delete'), async (req, res) => {
  try {
    const existing = await getReturnById(Number(req.params.id));
    if (!existing) return res.status(404).json({ success: false, message: 'Purchase return not found' });
    if (!(await isLocationAccessible(req.user, existing.warehouse_location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    await deleteReturn(Number(req.params.id), req.user.id); res.json({ success: true });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/purchase-returns/:id/submit', checkPermission('warehouse_purchase_returns', 'can_submit'), async (req, res) => {
  try { const data = await submitReturn(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/purchase-returns/:id/verify', checkPermission('warehouse_purchase_returns', 'can_verify'), async (req, res) => {
  try { const data = await verifyReturn(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/purchase-returns/:id/approve', checkPermission('warehouse_purchase_returns', 'can_approve'), async (req, res) => {
  try { const data = await approveReturn(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/purchase-returns/:id/reject', checkPermission('warehouse_purchase_returns', 'can_reject'), async (req, res) => {
  try { const data = await rejectReturn(Number(req.params.id), req.user.id, req.body.rejection_reason); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/purchase-returns/:id/post', checkPermission('warehouse_purchase_returns', 'can_approve'), async (req, res) => {
  try { const data = await postReturn(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/purchase-returns/:id/lock', checkPermission('warehouse_purchase_returns', 'can_lock'), async (req, res) => {
  try { const data = await lockReturn(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.get('/purchase-returns/credits-summary', checkPermission('warehouse_purchase_returns', 'can_view'), async (req, res) => {
  try { const data = await getCreditsSummary(); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.put('/purchase-returns/credits/:id/status', checkPermission('warehouse_purchase_returns', 'can_edit'), async (req, res) => {
  try { const data = await updateCreditStatus(Number(req.params.id), req.body.status, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// Warehouse Phase 2F: Purchase Orders
router.get('/purchase-orders', checkPermission('warehouse_purchase_orders', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const allowedLocationIds = resolveScopedLocationIds(req, res, req.query.location_id);
    if (allowedLocationIds === undefined) return;
    const data = await getPOs({ ...req.query, allowedLocationIds });
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/purchase-orders/:id', checkPermission('warehouse_purchase_orders', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const data = await getPOById(Number(req.params.id));
    if (!data) return res.status(404).json({ success: false, message: 'PO not found' });
    if (!req.locationScope.all && !req.locationScope.locationIds.includes(Number(data.warehouse_location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/purchase-orders', checkPermission('warehouse_purchase_orders', 'can_create'), checkLocationAccess('warehouse_location_id'), async (req, res) => {
  try { const data = await createPO(req.body, req.user.id); res.status(201).json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.put('/purchase-orders/:id', checkPermission('warehouse_purchase_orders', 'can_edit'), async (req, res) => {
  try {
    const existing = await getPOById(Number(req.params.id));
    if (!existing) return res.status(404).json({ success: false, message: 'PO not found' });
    if (!(await isLocationAccessible(req.user, req.body.warehouse_location_id || existing.warehouse_location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    const data = await updatePO(Number(req.params.id), req.body, req.user.id); res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.delete('/purchase-orders/:id', checkPermission('warehouse_purchase_orders', 'can_delete'), async (req, res) => {
  try {
    const existing = await getPOById(Number(req.params.id));
    if (!existing) return res.status(404).json({ success: false, message: 'PO not found' });
    if (!(await isLocationAccessible(req.user, existing.warehouse_location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    const data = await deletePO(Number(req.params.id)); res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/purchase-orders/:id/submit', checkPermission('warehouse_purchase_orders', 'can_submit'), async (req, res) => {
  try { const data = await submitPO(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/purchase-orders/:id/approve', checkPermission('warehouse_purchase_orders', 'can_approve'), async (req, res) => {
  try {
    const po = await getPOById(Number(req.params.id));
    if (!po) return res.status(404).json({ success: false, message: 'PO not found' });
    if (po.created_by === req.user.id) return res.status(403).json({ success: false, message: 'Creator cannot approve own PO' });
    const data = await approvePO(Number(req.params.id), req.user.id);
    res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/purchase-orders/:id/reject', checkPermission('warehouse_purchase_orders', 'can_reject'), async (req, res) => {
  try { const data = await rejectPO(Number(req.params.id), req.user.id, req.body.rejection_reason); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/purchase-orders/:id/send', checkPermission('warehouse_purchase_orders', 'can_edit'), async (req, res) => {
  try { const data = await sendPO(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/purchase-orders/:id/close', checkPermission('warehouse_purchase_orders', 'can_lock'), async (req, res) => {
  try { const data = await closePO(Number(req.params.id), req.user.id, req.body.close_reason); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.get('/purchase-orders/:id/receipt-summary', checkPermission('warehouse_purchase_orders', 'can_view'), async (req, res) => {
  try { const data = await getPOReceiptSummary(Number(req.params.id)); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/purchase-orders/:id/grn-prefill', checkPermission('grn', 'can_create'), async (req, res) => {
  try { const data = await getGRNPrefill(Number(req.params.id)); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// Supplier purchase history (read-only reporting). These take a single
// optional location_id and, when omitted, previously reported across every
// warehouse location regardless of who was asking. applyLocationScope +
// resolveScopedLocationId close that: a scoped caller (Warehouse Admin, who
// is the only non-all-outlet role with this permission today) defaults to
// their own location instead of company-wide data, and can't request a
// location outside their scope either.
router.get('/supplier-history', checkPermission('warehouse_supplier_history', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const locationId = resolveScopedLocationId(req, res, req.query.location_id);
    if (locationId === undefined) return;
    const data = await getSupplierHistorySummary({
      locationId,
      supplierId: req.query.supplier_id ? Number(req.query.supplier_id) : null,
      materialId: req.query.material_id ? Number(req.query.material_id) : null,
      from: req.query.from,
      to: req.query.to,
      documentType: req.query.document_type,
      search: req.query.search,
    });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/supplier-history/:supplierId', checkPermission('warehouse_supplier_history', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const locationId = resolveScopedLocationId(req, res, req.query.location_id);
    if (locationId === undefined) return;
    const data = await getSupplierHistoryDetail(Number(req.params.supplierId), locationId);
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/supplier-history/:supplierId/materials', checkPermission('warehouse_supplier_history', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const locationId = resolveScopedLocationId(req, res, req.query.location_id);
    if (locationId === undefined) return;
    const data = await getSupplierMaterialHistory(Number(req.params.supplierId), locationId, req.query.material_id ? Number(req.query.material_id) : null);
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/supplier-history/:supplierId/price-movement', checkPermission('warehouse_supplier_history', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const locationId = resolveScopedLocationId(req, res, req.query.location_id);
    if (locationId === undefined) return;
    const data = await getSupplierPriceMovement(Number(req.params.supplierId), locationId, req.query.material_id ? Number(req.query.material_id) : null);
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/supplier-history/:supplierId/timeline', checkPermission('warehouse_supplier_history', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const locationId = resolveScopedLocationId(req, res, req.query.location_id);
    if (locationId === undefined) return;
    const data = await getSupplierTimeline(Number(req.params.supplierId), locationId);
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Low Stock / Reorder - same "optional location_id defaults to company-wide"
// leak as supplier history above, fixed the same way.
router.get('/reorder', checkPermission('warehouse_reorder', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const locationId = resolveScopedLocationId(req, res, req.query.location_id);
    if (locationId === undefined) return;
    const data = await getReorderData({
      locationId,
      categoryId: req.query.category_id ? Number(req.query.category_id) : null,
      statusFilter: req.query.status_filter || null,
      supplierId: req.query.supplier_id ? Number(req.query.supplier_id) : null,
      search: req.query.search || null,
    });
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.put('/reorder/:materialId/settings', checkPermission('warehouse_reorder', 'can_edit'), async (req, res) => {
  try {
    const data = await updateReorderSettings(Number(req.params.materialId), req.body);
    res.json({ success: true, data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/reorder/create-po', checkPermission('warehouse_reorder', 'can_create'), async (req, res) => {
  try {
    const data = await createDraftPOFromReorder(req.body.material_ids, Number(req.body.location_id), req.user.id);
    res.json({ success: true, data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// Warehouse Reports (read-only). Same fix as supplier-history/reorder above:
// applyLocationScope + resolveScopedLocationId stop a scoped caller from
// pulling report data for a location outside their scope, or - when they
// send no location_id at all - from getting an unrestricted, company-wide
// report by default.
router.get('/reports/summary', checkPermission('warehouse_reports', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const locationId = resolveScopedLocationId(req, res, req.query.location_id);
    if (locationId === undefined) return;
    const data = await reportService.getReportSummary(locationId);
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/reports/:type', checkPermission('warehouse_reports', 'can_view'), applyLocationScope, async (req, res) => {
  try {
    const { type } = req.params;
    const locationId = resolveScopedLocationId(req, res, req.query.location_id);
    if (locationId === undefined) return;
    const filters = {
      location_id: locationId,
      raw_material_id: req.query.material_id ? Number(req.query.material_id) : null,
      supplier_id: req.query.supplier_id ? Number(req.query.supplier_id) : null,
      category_id: req.query.category_id ? Number(req.query.category_id) : null,
      from_date: req.query.from_date,
      to_date: req.query.to_date,
      status: req.query.status,
    };
    const handlers = {
      'current-stock': reportService.getCurrentStockReport,
      'ledger': reportService.getStockLedgerReport,
      'valuation': reportService.getStockValuationReport,
      'ageing': reportService.getStockAgeingReport,
      'batch': reportService.getBatchReport,
      'expiry': reportService.getExpiryReport,
      'low-stock': reportService.getLowStockReport,
      'out-of-stock': reportService.getOutOfStockReport,
      'grn': reportService.getGRNReport,
      'supplier-receipt': reportService.getSupplierReceiptReport,
      'purchase-return': reportService.getPurchaseReturnReport,
      'requisition': reportService.getRequisitionReport,
      'pending-requisition': reportService.getPendingRequisitionReport,
      'dispatch': reportService.getDispatchReport,
      'transit': reportService.getTransitReport,
      'receipt': reportService.getReceiptReport,
      'damage': reportService.getTransitDamageReport,
      'short': reportService.getTransitShortReport,
      'physical-count': reportService.getPhysicalCountReport,
      'variance': reportService.getVarianceReport,
      'wastage': reportService.getWastageReport,
      'adjustment': reportService.getAdjustmentReport,
      'movement': reportService.getMaterialMovementReport,
      'trend': reportService.getMovementTrend,
      'closing': reportService.getClosingStockReport,
      'profit': reportService.getWarehouseProfitReport,
      'gstr3b': reportService.getGSTR3BWarehouseReport,
      'purchase-return-gst': reportService.getPurchaseReturnGSTSummary,
    };
    if (!handlers[type]) return res.status(404).json({ success: false, message: 'Report not found' });
    const data = await handlers[type](filters);
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/reports/pack/export', checkPermission('warehouse_reports', 'can_export'), applyLocationScope, async (req, res) => {
  try {
    const locationId = resolveScopedLocationId(req, res, req.query.location_id);
    if (locationId === undefined) return;
    const filters = {
      location_id: locationId,
      from_date: req.query.from_date,
      to_date: req.query.to_date,
    };
    const buffer = await reportService.getReportPack(filters);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="BigBean_Warehouse_Report_Pack_${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.send(buffer);
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Warehouse Settings
router.get('/settings', checkPermission('warehouse_settings', 'can_view'), async (req, res) => {
  try {
    const locationId = Number(req.query.location_id);
    const data = await settingService.getWarehouseSettings(locationId);
    res.json({ success: true, data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.put('/settings', checkPermission('warehouse_settings', 'can_edit'), async (req, res) => {
  try {
    const { location_id, settings } = req.body;
    const data = await settingService.updateWarehouseSettings(Number(location_id), settings, req.user.id);
    res.json({ success: true, data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

export default router;

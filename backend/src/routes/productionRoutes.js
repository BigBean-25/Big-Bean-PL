import express from 'express';
import { query } from '../config/database.js';
import { protect } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import {
  getCentralKitchenLocations, getProductionDashboard, getProductionRequests, getProductionRequestById,
  createProductionRequest, updateProductionRequestStatus, getProductionPlans, getProductionPlanById,
  createProductionPlan, updateProductionPlanStatus, getProductionBatches, getProductionBatchById, createProductionBatch,
  getRawMaterialAvailability, postProductionBatch, setProductionBatchMaterials, updateProductionBatchActualQty,
  getFinishedGoodsStock,
} from '../services/productionService.js';
import { 
  getProductionWastages, getProductionWastageById, createProductionWastage, updateProductionWastage,
  submitProductionWastage, verifyProductionWastage, approveProductionWastage, rejectProductionWastage,
  postProductionWastage, lockProductionWastage, exportProductionWastageExcel,
} from '../services/productionWastageService.js';
import { 
  getProductionVariance, getProductionVarianceByBatch, getProductionDashboardVarianceKPIs, exportProductionVarianceExcel 
} from '../services/productionVarianceService.js';
import {
  getProductionDispatches, getProductionDispatchById, createProductionDispatch, postProductionDispatch,
  receiveProductionDispatch, getPendingRequestItems, exportProductionDispatchExcel, getProductionDispatchKPIs,
  getProductionProfitReport,
} from '../services/productionDispatchService.js';

// A production request's status transitions split into two different jobs:
// the requesting outlet submitting its own Draft request, versus Central
// Kitchen reviewing/approving/rejecting it. A single flat can_edit check
// would let anyone who can submit their own request also approve/reject
// every other outlet's requests. Mirrors canReceiveProductionDispatch below.
const canTransitionProductionRequest = async (req, res, next) => {
  try {
    const status = req.body.status;
    const perm = await query(
      'SELECT can_create, can_submit, can_edit, can_approve, can_reject, is_read_only FROM role_permissions WHERE role_id = ? AND module_key = ?',
      [req.user.role_id, 'production_requests']
    );
    const p = perm[0] || {};
    if (p.is_read_only) {
      return res.status(403).json({ success: false, message: 'Read-only users cannot modify data' });
    }

    if (status === 'Submitted') {
      if (!p.can_submit && !p.can_edit) {
        return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
      }

      const outletIds = (req.user.outlet_ids || []).map((id) => Number(id)).filter(Boolean);
      if (outletIds.length > 0) {
        const [request] = await query('SELECT from_outlet_id FROM production_requests WHERE id = ?', [req.params.id]);
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
        if (!outletIds.includes(Number(request.from_outlet_id))) {
          return res.status(403).json({ success: false, message: 'You can only submit requests for your own outlet' });
        }
      }
      return next();
    }

    if (status === 'Approved' && (p.can_approve || p.can_edit)) return next();
    if (status === 'Rejected' && (p.can_reject || p.can_edit)) return next();
    if (p.can_edit) return next();

    return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
  } catch (error) {
    console.error('canTransitionProductionRequest error:', error);
    return res.status(500).json({ success: false, message: 'Error checking permission' });
  }
};

const canReceiveProductionDispatch = async (req, res, next) => {
  try {
    const transferId = Number(req.params.id);
    const [transfer] = await query('SELECT to_location_id FROM stock_transfers WHERE id = ?', [transferId]);
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' });
    const [loc] = await query('SELECT outlet_id, location_type FROM locations WHERE id = ?', [transfer.to_location_id]);
    if (!loc || loc.location_type !== 'Outlet') return res.status(400).json({ success: false, message: 'Destination is not an outlet' });

    const perm = await query('SELECT can_edit, is_read_only FROM role_permissions WHERE role_id = ? AND module_key = ?', [req.user.role_id, 'production_dispatch']);
    const hasEdit = perm.length && perm[0].can_edit && !perm[0].is_read_only;
    if (hasEdit) return next();

    if (req.user.role_name === 'Outlet Admin' || req.user.role_name === 'Outlet Manager') {
      const [uo] = await query('SELECT id FROM user_outlets WHERE user_id = ? AND outlet_id = ?', [req.user.id, loc.outlet_id]);
      if (uo) return next();
    }

    return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
  } catch (error) {
    console.error('canReceiveProductionDispatch error:', error);
    return res.status(500).json({ success: false, message: 'Error checking receipt access' });
  }
};

const router = express.Router();
router.use(protect);

router.get('/central-kitchens', checkPermission('production_dashboard', 'can_view'), async (req, res) => {
  try { const data = await getCentralKitchenLocations(); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/dashboard/:centralKitchenId', checkPermission('production_dashboard', 'can_view'), async (req, res) => {
  try { const data = await getProductionDashboard(Number(req.params.centralKitchenId)); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/finished-stock/:centralKitchenId', checkPermission('production_dashboard', 'can_view'), async (req, res) => {
  try { const data = await getFinishedGoodsStock(Number(req.params.centralKitchenId)); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/requests', checkPermission('production_requests', 'can_view'), async (req, res) => {
  try {
    const data = await getProductionRequests(Number(req.query.central_kitchen_id));
    // getProductionRequests only ever filtered by central_kitchen_id (a
    // client-supplied query param), never by from_outlet_id - an outlet-locked
    // caller (Outlet Admin has production_requests.can_view by default) could
    // see every outlet's requests to this kitchen, not just their own. Same
    // req.user.outlet_ids check the POST /requests handler below already uses.
    const outletIds = (req.user.outlet_ids || []).map((id) => Number(id)).filter(Boolean);
    const scoped = outletIds.length > 0
      ? data.filter((r) => outletIds.includes(Number(r.from_outlet_id)))
      : data;
    res.json({ success: true, data: scoped });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/requests/:id', checkPermission('production_requests', 'can_view'), async (req, res) => {
  try {
    const data = await getProductionRequestById(Number(req.params.id));
    if (!data) return res.status(404).json({ success: false, message: 'Request not found' });
    // Same gap as the list endpoint above - getProductionRequestById had no
    // outlet check at all, so any outlet-locked caller could read any other
    // outlet's request by id.
    const outletIds = (req.user.outlet_ids || []).map((id) => Number(id)).filter(Boolean);
    if (outletIds.length > 0 && !outletIds.includes(Number(data.from_outlet_id))) {
      return res.status(403).json({ success: false, message: 'You can only view requests for your own outlet' });
    }
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/requests', checkPermission('production_requests', 'can_create'), async (req, res) => {
  try {
    // Outlet-scoped users (Outlet Admin/Staff) can only raise a request for
    // their own outlet, not any outlet in the picker - company-wide roles
    // (Central Kitchen Admin etc.) aren't restricted this way.
    const outletIds = (req.user.outlet_ids || []).map((id) => Number(id)).filter(Boolean);
    if (outletIds.length > 0 && !outletIds.includes(Number(req.body.from_outlet_id))) {
      return res.status(403).json({ success: false, message: 'You can only raise a request for your own outlet' });
    }
    const data = await createProductionRequest(req.body, req.user.id);
    res.json({ success: true, data });
  }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.patch('/requests/:id/status', canTransitionProductionRequest, async (req, res) => {
  try { const data = await updateProductionRequestStatus(Number(req.params.id), req.body.status, req.user.id, req.body); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.get('/plans', checkPermission('production_planning', 'can_view'), async (req, res) => {
  try { const data = await getProductionPlans(Number(req.query.central_kitchen_id)); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/plans/:id', checkPermission('production_planning', 'can_view'), async (req, res) => {
  try { const data = await getProductionPlanById(Number(req.params.id)); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/plans', checkPermission('production_planning', 'can_create'), async (req, res) => {
  try { const data = await createProductionPlan(req.body, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.patch('/plans/:id/status', checkPermission('production_planning', 'can_edit'), async (req, res) => {
  try { const data = await updateProductionPlanStatus(Number(req.params.id), req.body.status, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.get('/batches', checkPermission('production_batches', 'can_view'), async (req, res) => {
  try { const data = await getProductionBatches(Number(req.query.central_kitchen_id)); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/batches/:id', checkPermission('production_batches', 'can_view'), async (req, res) => {
  try { const data = await getProductionBatchById(Number(req.params.id)); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/batches', checkPermission('production_batches', 'can_create'), async (req, res) => {
  try { const data = await createProductionBatch(req.body, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.put('/batches/:id/materials', checkPermission('production_batches', 'can_edit'), async (req, res) => {
  try { const data = await setProductionBatchMaterials(Number(req.params.id), req.body.materials); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.patch('/batches/:id/actual-qty', checkPermission('production_batches', 'can_edit'), async (req, res) => {
  try { const data = await updateProductionBatchActualQty(Number(req.params.id), req.body); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.get('/batches/:id/availability', checkPermission('production_batches', 'can_view'), async (req, res) => {
  try { const data = await getRawMaterialAvailability(Number(req.params.id)); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/batches/:id/post', checkPermission('production_batches', 'can_edit'), async (req, res) => {
  try { const data = await postProductionBatch(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

// Wastage
router.get('/wastage', checkPermission('production_wastage', 'can_view'), async (req, res) => {
  try { const data = await getProductionWastages(req.query); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/wastage/:id', checkPermission('production_wastage', 'can_view'), async (req, res) => {
  try { const data = await getProductionWastageById(Number(req.params.id)); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/wastage', checkPermission('production_wastage', 'can_create'), async (req, res) => {
  try { const data = await createProductionWastage(req.body, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.put('/wastage/:id', checkPermission('production_wastage', 'can_edit'), async (req, res) => {
  try { const data = await updateProductionWastage(Number(req.params.id), req.body, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/wastage/:id/submit', checkPermission('production_wastage', 'can_submit'), async (req, res) => {
  try { const data = await submitProductionWastage(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/wastage/:id/verify', checkPermission('production_wastage', 'can_verify'), async (req, res) => {
  try { const data = await verifyProductionWastage(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/wastage/:id/approve', checkPermission('production_wastage', 'can_approve'), async (req, res) => {
  try { const data = await approveProductionWastage(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/wastage/:id/post', checkPermission('production_wastage', 'can_approve'), async (req, res) => {
  try { const data = await postProductionWastage(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/wastage/:id/reject', checkPermission('production_wastage', 'can_reject'), async (req, res) => {
  try { const data = await rejectProductionWastage(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/wastage/:id/lock', checkPermission('production_wastage', 'can_lock'), async (req, res) => {
  try { const data = await lockProductionWastage(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.get('/wastage-export', checkPermission('production_wastage', 'can_export'), async (req, res) => {
  try {
    const buffer = await exportProductionWastageExcel(req.query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="production_wastage.xlsx"');
    res.send(buffer);
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

function normalizeOutletId(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === 'all') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return 'invalid';
  return n;
}

// Variance
router.get('/variance', checkPermission('production_variance', 'can_view'), async (req, res) => {
  try {
    const outletId = normalizeOutletId(req.query.outlet_id);
    if (outletId === 'invalid') return res.status(400).json({ success: false, message: 'Invalid outlet_id' });
    const data = await getProductionVariance(req.query);
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/variance/:batchId', checkPermission('production_variance', 'can_view'), async (req, res) => {
  try { const data = await getProductionVarianceByBatch(Number(req.params.batchId)); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/variance-kpis/:centralKitchenId', checkPermission('production_dashboard', 'can_view'), async (req, res) => {
  try {
    const outletId = normalizeOutletId(req.query.outlet_id);
    if (outletId === 'invalid') return res.status(400).json({ success: false, message: 'Invalid outlet_id' });
    const data = await getProductionDashboardVarianceKPIs(Number(req.params.centralKitchenId));
    res.json({ success: true, data });
  }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/variance-export', checkPermission('production_variance', 'can_export'), async (req, res) => {
  try {
    const outletId = normalizeOutletId(req.query.outlet_id);
    if (outletId === 'invalid') return res.status(400).json({ success: false, message: 'Invalid outlet_id' });
    const buffer = await exportProductionVarianceExcel(req.query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="production_variance.xlsx"');
    res.send(buffer);
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// Dispatch
router.get('/dispatch-kpis', checkPermission('production_dispatch', 'can_view'), async (req, res) => {
  try { const data = await getProductionDispatchKPIs(req.query); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/profit', checkPermission('production_dashboard', 'can_view'), async (req, res) => {
  try { const data = await getProductionProfitReport(req.query); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/dispatch', checkPermission('production_dispatch', 'can_view'), async (req, res) => {
  try { const data = await getProductionDispatches(req.query); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/dispatch/pending-items/:requestId', checkPermission('production_dispatch', 'can_view'), async (req, res) => {
  try { const data = await getPendingRequestItems(Number(req.params.requestId)); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.get('/dispatch/:id', checkPermission('production_dispatch', 'can_view'), async (req, res) => {
  try { const data = await getProductionDispatchById(Number(req.params.id)); res.json({ success: true, data }); }
  catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.post('/dispatch', checkPermission('production_dispatch', 'can_create'), async (req, res) => {
  try { const data = await createProductionDispatch(req.body, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/dispatch/:id/post', checkPermission('production_dispatch', 'can_submit'), async (req, res) => {
  try { const data = await postProductionDispatch(Number(req.params.id), req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post('/dispatch/:id/receive', canReceiveProductionDispatch, async (req, res) => {
  try { const data = await receiveProductionDispatch(Number(req.params.id), req.body, req.user.id); res.json({ success: true, data }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.get('/dispatch-export', checkPermission('production_dispatch', 'can_export'), async (req, res) => {
  try {
    const buffer = await exportProductionDispatchExcel(req.query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="production_dispatch.xlsx"');
    res.send(buffer);
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

export default router;

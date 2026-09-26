import express from 'express';
import { query } from '../config/database.js';
import { protect } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import { isLocationAccessible } from '../middleware/warehouseMiddleware.js';
import { canAccessAllOutlets } from '../utils/roleAccess.js';
import {
  getOutletConsumptions,
  getOutletConsumptionById,
  getTheoreticalPrefill,
  createOutletConsumption,
  updateOutletConsumption,
  deleteOutletConsumption,
  submitOutletConsumption,
  verifyOutletConsumption,
  approveOutletConsumption,
  postOutletConsumption,
  lockOutletConsumption,
} from '../services/outletConsumptionService.js';

const router = express.Router();
router.use(protect);
const MODULE = 'outlet_consumption';

// Outlet consumption lives at OUTLET locations, so warehouseMiddleware's
// applyLocationScope (which hard-requires Central Warehouse for scoped users)
// can't be used here. This resolves the same allowed-location set its
// else-branch computes - full-access roles see everything, Warehouse Admin
// sees Central Warehouse only, outlet users see their outlets' locations.
const allowedLocationIdsFor = async (user) => {
  if (canAccessAllOutlets(user.role_name) && user.role_name !== 'Warehouse Admin') return null;
  if (user.role_name === 'Warehouse Admin') {
    const rows = await query("SELECT id FROM locations WHERE location_type = 'Central Warehouse' AND is_active = 1");
    return rows.map((r) => Number(r.id));
  }
  const assignedOutletIds = (user.outlet_ids || []).map((id) => Number(id)).filter(Boolean);
  if (!assignedOutletIds.length) return [];
  const rows = await query(`SELECT id FROM locations WHERE outlet_id IN (${assignedOutletIds.join(',')}) AND is_active = 1`);
  return rows.map((r) => Number(r.id));
};

// Loads the document and enforces location access - the :id routes can't rely
// on param-based middleware since the location is on the record, not the URL.
const loadAccessibleDoc = async (req, res) => {
  const doc = await getOutletConsumptionById(req.params.id);
  if (!doc) {
    res.status(404).json({ success: false, message: 'Outlet consumption not found' });
    return null;
  }
  if (!(await isLocationAccessible(req.user, doc.location_id))) {
    res.status(403).json({ success: false, message: 'You do not have access to this location' });
    return null;
  }
  return doc;
};

// The document's location must belong to its outlet - an outlet consumption
// can only ever post stock at a location mapped to that outlet.
const assertLocationBelongsToOutlet = async (outletId, locationId) => {
  const rows = await query('SELECT id FROM locations WHERE id = ? AND outlet_id = ? AND is_active = 1', [locationId, outletId]);
  if (!rows.length) {
    const err = new Error('Location does not belong to this outlet');
    err.statusCode = 400;
    throw err;
  }
};

router.get('/', checkPermission(MODULE, 'can_view'), async (req, res) => {
  try {
    const allowed = await allowedLocationIdsFor(req.user);
    if (allowed && !allowed.length) return res.json({ success: true, data: [] });
    if (allowed && req.query.location_id && !allowed.includes(Number(req.query.location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to the requested location' });
    }
    const data = await getOutletConsumptions({ ...req.query, allowedLocationIds: allowed });
    res.json({ success: true, data });
  } catch (error) { res.status(error.statusCode || 500).json({ success: false, message: error.message }); }
});

// Theoretical prefill - returns proposed items from Verified Item Sales +
// recipes. Creates nothing, moves no stock.
router.get('/prefill', checkPermission(MODULE, 'can_view'), async (req, res) => {
  try {
    const outletId = Number(req.query.outlet_id);
    if (!Number.isInteger(outletId) || outletId <= 0) {
      return res.status(400).json({ success: false, message: 'A valid numeric outlet_id is required' });
    }
    if (!canAccessAllOutlets(req.user.role_name)) {
      const assignedOutletIds = (req.user.outlet_ids || []).map((id) => Number(id)).filter(Boolean);
      if (!assignedOutletIds.includes(outletId)) {
        return res.status(403).json({ success: false, message: 'You do not have access to the requested outlet' });
      }
    }
    const items = await getTheoreticalPrefill({ outletId, month: req.query.month, year: req.query.year });
    res.json({ success: true, data: items });
  } catch (error) { res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});

router.get('/:id', checkPermission(MODULE, 'can_view'), async (req, res) => {
  try {
    const doc = await loadAccessibleDoc(req, res);
    if (!doc) return;
    res.json({ success: true, data: doc });
  } catch (error) { res.status(error.statusCode || 500).json({ success: false, message: error.message }); }
});

router.post('/', checkPermission(MODULE, 'can_create'), async (req, res) => {
  try {
    if (!(await isLocationAccessible(req.user, req.body.location_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    await assertLocationBelongsToOutlet(req.body.outlet_id, req.body.location_id);
    const data = await createOutletConsumption(req.body, req.user.id);
    res.status(201).json({ success: true, data });
  } catch (error) { res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});

router.put('/:id', checkPermission(MODULE, 'can_edit'), async (req, res) => {
  try {
    const doc = await loadAccessibleDoc(req, res);
    if (!doc) return;
    const locationId = req.body.location_id || doc.location_id;
    if (!(await isLocationAccessible(req.user, locationId))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    await assertLocationBelongsToOutlet(doc.outlet_id, locationId);
    const data = await updateOutletConsumption(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (error) { res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});

router.delete('/:id', checkPermission(MODULE, 'can_delete'), async (req, res) => {
  try {
    const doc = await loadAccessibleDoc(req, res);
    if (!doc) return;
    const data = await deleteOutletConsumption(req.params.id);
    res.json({ success: true, data });
  } catch (error) { res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});

const workflowRoute = (action, permission, handler) => {
  router.post(`/:id/${action}`, checkPermission(MODULE, permission), async (req, res) => {
    try {
      const doc = await loadAccessibleDoc(req, res);
      if (!doc) return;
      const data = await handler(req.params.id, req.user.id);
      res.json({ success: true, data });
    } catch (error) { res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
  });
};

workflowRoute('submit', 'can_submit', submitOutletConsumption);
workflowRoute('verify', 'can_verify', verifyOutletConsumption);
workflowRoute('approve', 'can_approve', approveOutletConsumption);
workflowRoute('post', 'can_approve', postOutletConsumption);
workflowRoute('lock', 'can_lock', lockOutletConsumption);

export default router;

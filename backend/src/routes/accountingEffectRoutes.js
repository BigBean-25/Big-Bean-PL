import express from 'express';
import { protect, applyOutletScope } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import { canAccessAllOutlets } from '../utils/roleAccess.js';
import {
  listPurchaseEffects,
  getPurchaseEffectDetail,
  claimEffect,
  unclaimEffect,
  verifyAndPostPurchaseEffect,
} from '../services/accountingEffectService.js';

const router = express.Router();

// Phase 6A3 - GRN -> accounting purchase bridge review endpoints.
// Deliberately narrow: listing/detail + claim/unclaim/verify-post only.
// No generic effect mutation, no new permission actions - review uses the
// existing Material Purchase module (can_view to read, can_verify to act),
// matching how that module's own upload verification is gated.

const sendError = (res, error, fallback) => {
  console.error(`${fallback}:`, error);
  res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : fallback });
};

// Outlet scoping for effect rows: a scoped (non all-outlet) user may only
// see/act on effects whose accounting outlet is one of their assigned
// outlets. Unowned (outlet_id NULL) effects are visible only to all-scope
// roles - and can never be posted anyway.
const effectOutletAllowed = (req, effect) => {
  if (canAccessAllOutlets(req.user.role_name)) return true;
  const allowed = (req.outletScope?.outletIds || []).map(Number);
  return effect.outlet_id !== null && allowed.includes(Number(effect.outlet_id));
};

router.get('/purchases', protect, applyOutletScope, checkPermission('material_purchase', 'can_view'), async (req, res) => {
  try {
    const allScope = canAccessAllOutlets(req.user.role_name);
    const rows = await listPurchaseEffects({
      status: req.query.status || null,
      outletIds: allScope ? null : (req.outletScope?.outletIds || []),
      includeUnowned: allScope,
      limit: req.query.limit,
    });
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    sendError(res, error, 'Error listing purchase effects');
  }
});

router.get('/:id', protect, applyOutletScope, checkPermission('material_purchase', 'can_view'), async (req, res) => {
  try {
    const row = await getPurchaseEffectDetail(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Accounting effect not found' });
    if (!effectOutletAllowed(req, row)) {
      return res.status(403).json({ success: false, message: 'You do not have access to this accounting effect' });
    }
    res.status(200).json({ success: true, data: row });
  } catch (error) {
    sendError(res, error, 'Error loading accounting effect');
  }
});

const loadEffectForWrite = async (req, res) => {
  const row = await getPurchaseEffectDetail(req.params.id);
  if (!row) {
    res.status(404).json({ success: false, message: 'Accounting effect not found' });
    return null;
  }
  if (!effectOutletAllowed(req, row)) {
    res.status(403).json({ success: false, message: 'You do not have access to this accounting effect' });
    return null;
  }
  return row;
};

router.post('/:id/claim', protect, applyOutletScope, checkPermission('material_purchase', 'can_verify'), async (req, res) => {
  try {
    const row = await loadEffectForWrite(req, res);
    if (!row) return;
    const uploadItemId = Number(req.body?.upload_item_id);
    if (!uploadItemId) {
      return res.status(400).json({ success: false, message: 'upload_item_id is required' });
    }
    const updated = await claimEffect(req.params.id, uploadItemId, req.user.id);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    sendError(res, error, 'Error claiming accounting effect');
  }
});

router.post('/:id/unclaim', protect, applyOutletScope, checkPermission('material_purchase', 'can_verify'), async (req, res) => {
  try {
    const row = await loadEffectForWrite(req, res);
    if (!row) return;
    const updated = await unclaimEffect(req.params.id, req.user.id);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    sendError(res, error, 'Error unclaiming accounting effect');
  }
});

router.post('/:id/verify-post', protect, applyOutletScope, checkPermission('material_purchase', 'can_verify'), async (req, res) => {
  try {
    const row = await loadEffectForWrite(req, res);
    if (!row) return;
    const updated = await verifyAndPostPurchaseEffect(req.params.id, req.user.id);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    sendError(res, error, 'Error verifying and posting accounting effect');
  }
});

export default router;

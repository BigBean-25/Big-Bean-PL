import express from 'express';
import { protect, applyOutletScope, loadScopedRecord } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import { query } from '../config/database.js';

const router = express.Router();

const WORKFLOW_FIELDS = ['status', 'submitted_by', 'submitted_at', 'verified_by', 'verified_at', 'rejected_by', 'rejected_at', 'rejection_reason', 'locked_by', 'locked_at', 'lock_reason'];
const EDITABLE_STATUSES = ['Draft', 'Rejected'];
const DELETABLE_STATUSES = ['Draft', 'Rejected'];

function stripProtectedFields(body) {
  delete body.outlet_id;
  delete body.created_by;
  delete body.created_at;
  delete body.updated_at;
  for (const f of WORKFLOW_FIELDS) delete body[f];
}

// ======================== ONLINE PAYOUTS ========================

router.get('/online', protect, applyOutletScope, async (req, res) => {
  try {
    const { month, year } = req.query;
    const scope = req.outletScope || { all: true };

    let whereClause = '1=1';
    const params = [];

    if (!scope.all && scope.outletIds && scope.outletIds.length > 0) {
      const placeholders = scope.outletIds.map(() => '?').join(', ');
      whereClause += ` AND op.outlet_id IN (${placeholders})`;
      params.push(...scope.outletIds);
    }

    if (month) { whereClause += ' AND op.month = ?'; params.push(month); }
    if (year) { whereClause += ' AND op.year = ?'; params.push(year); }

    const payouts = await query(
      `SELECT op.*,
              op.customer_paid_amount AS gross_sales,
              op.gross_order_value,
              op.platform_commission AS commission_amount,
              op.tcs AS tcs_amount,
              op.tds AS tds_amount,
              op.net_payout_expected AS net_payout,
              o.outlet_name, opl.platform_name,
              uc.full_name AS created_by_name,
              us.full_name AS submitted_by_name,
              uv.full_name AS verified_by_name,
              ur.full_name AS rejected_by_name
       FROM online_payouts op
       LEFT JOIN outlets o ON op.outlet_id = o.id
       LEFT JOIN online_platforms opl ON op.platform_id = opl.id
       LEFT JOIN users uc ON op.created_by = uc.id
       LEFT JOIN users us ON op.submitted_by = us.id
       LEFT JOIN users uv ON op.verified_by = uv.id
       LEFT JOIN users ur ON op.rejected_by = ur.id
       WHERE ${whereClause}
       ORDER BY op.year DESC, op.month DESC`,
      params
    );

    res.json({ success: true, data: payouts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/online', protect, applyOutletScope, checkPermission('online_payouts', 'can_create'), async (req, res) => {
  try {
    const scope = req.outletScope || { all: true };
    const outletId = Number(req.body.outlet_id);

    if (!outletId || req.body.outlet_id === 'all') {
      return res.status(400).json({ success: false, message: 'Valid outlet_id is required' });
    }

    if (!scope.all && !scope.outletIds.includes(outletId)) {
      return res.status(403).json({ success: false, message: 'You do not have access to the selected outlet' });
    }

    // Force Draft status on creation
    for (const f of WORKFLOW_FIELDS) delete req.body[f];
    delete req.body.created_by;
    delete req.body.created_at;

    const b = req.body;
    const customerPaid = Number(b.customer_paid_amount ?? b.gross_sales ?? b.gross_order_value ?? 0);
    const grossOrder = Number(b.gross_order_value ?? b.customer_paid_amount ?? b.gross_sales ?? 0);
    const platformCommission = Number(b.platform_commission ?? b.commission_amount ?? 0);
    const paymentGatewayCharges = Number(b.payment_gateway_charges ?? 0);
    const packagingCharges = Number(b.packaging_charges ?? 0);
    const deliveryCharges = Number(b.delivery_charges ?? 0);
    const tcs = Number(b.tcs ?? b.tcs_amount ?? 0);
    const tds = Number(b.tds ?? b.tds_amount ?? 0);
    const otherDeductions = Number(b.other_deductions ?? 0);
    const actualPayoutReceived = Number(b.actual_payout_received ?? 0);
    const discount = Number(b.discount ?? 0);
    const taxes = Number(b.taxes ?? 0);

    const result = await query(
      `INSERT INTO online_payouts (
        outlet_id, platform_id, month, year,
        gross_order_value, customer_paid_amount, discount, taxes,
        platform_commission, payment_gateway_charges, packaging_charges, delivery_charges,
        tcs, tds, other_deductions, actual_payout_received,
        status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, NOW())`,
      [
        b.outlet_id, b.platform_id, b.month, b.year,
        grossOrder, customerPaid, discount, taxes,
        platformCommission, paymentGatewayCharges, packagingCharges, deliveryCharges,
        tcs, tds, otherDeductions, actualPayoutReceived,
        req.user.id
      ]
    );

    const [created] = await query('SELECT * FROM online_payouts WHERE id = ?', [result.insertId]);

    res.status(201).json({ success: true, message: 'Online payout created successfully', data: created });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Online payout already exists for this outlet, month and platform.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/online/:id', protect, applyOutletScope, checkPermission('online_payouts', 'can_edit'), loadScopedRecord('online_payouts'), async (req, res) => {
  try {
    const record = req.record;
    if (!EDITABLE_STATUSES.includes(record.status)) {
      return res.status(400).json({ success: false, message: `Cannot edit a payout with status "${record.status}". Only Draft or Rejected records can be edited.` });
    }

    stripProtectedFields(req.body);

    const fields = Object.keys(req.body);
    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    const values = Object.values(req.body);
    const setClause = fields.map(f => `${f} = ?`).join(', ');

    await query(
      `UPDATE online_payouts SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      [...values, req.params.id]
    );

    res.json({ success: true, message: 'Online payout updated successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Online payout already exists for this outlet, month and platform.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/online/:id', protect, applyOutletScope, checkPermission('online_payouts', 'can_delete'), loadScopedRecord('online_payouts'), async (req, res) => {
  try {
    const record = req.record;
    if (!DELETABLE_STATUSES.includes(record.status)) {
      return res.status(400).json({ success: false, message: `Cannot delete a payout with status "${record.status}". Only Draft or Rejected records can be deleted.` });
    }
    await query('DELETE FROM online_payouts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Online payout deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/online/:id/submit', protect, applyOutletScope, checkPermission('online_payouts', 'can_submit'), loadScopedRecord('online_payouts'), async (req, res) => {
  try {
    const record = req.record;
    if (record.status !== 'Draft' && record.status !== 'Rejected') {
      return res.status(400).json({ success: false, message: `Cannot submit a payout with status "${record.status}". Only Draft or Rejected records can be submitted.` });
    }

    await query(
      `UPDATE online_payouts SET status = 'Submitted', submitted_by = ?, submitted_at = NOW(),
       verified_by = NULL, verified_at = NULL, rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL,
       updated_at = NOW() WHERE id = ?`,
      [req.user.id, req.params.id]
    );

    res.json({ success: true, message: 'Online payout submitted for verification' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/online/:id/verify', protect, applyOutletScope, checkPermission('online_payouts', 'can_verify'), loadScopedRecord('online_payouts'), async (req, res) => {
  try {
    const record = req.record;
    if (record.status !== 'Submitted') {
      return res.status(400).json({ success: false, message: `Cannot verify a payout with status "${record.status}". Only Submitted records can be verified.` });
    }
    if (record.submitted_by === req.user.id) {
      return res.status(403).json({ success: false, message: 'You cannot verify your own submission (maker-checker rule).' });
    }

    await query(
      `UPDATE online_payouts SET status = 'Verified', verified_by = ?, verified_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [req.user.id, req.params.id]
    );

    res.json({ success: true, message: 'Online payout verified successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/online/:id/reject', protect, applyOutletScope, checkPermission('online_payouts', 'can_verify'), loadScopedRecord('online_payouts'), async (req, res) => {
  try {
    const record = req.record;
    if (record.status !== 'Submitted') {
      return res.status(400).json({ success: false, message: `Cannot reject a payout with status "${record.status}". Only Submitted records can be rejected.` });
    }
    if (record.submitted_by === req.user.id) {
      return res.status(403).json({ success: false, message: 'You cannot reject your own submission (maker-checker rule).' });
    }
    const { rejection_reason } = req.body;
    if (!rejection_reason || !rejection_reason.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    await query(
      `UPDATE online_payouts SET status = 'Rejected', rejected_by = ?, rejected_at = NOW(), rejection_reason = ?, updated_at = NOW() WHERE id = ?`,
      [req.user.id, rejection_reason.trim(), req.params.id]
    );

    res.json({ success: true, message: 'Online payout rejected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ======================== DINE-IN PAYOUTS ========================

router.get('/dine-in', protect, applyOutletScope, async (req, res) => {
  try {
    const { month, year } = req.query;
    const scope = req.outletScope || { all: true };

    let whereClause = '1=1';
    const params = [];

    if (!scope.all && scope.outletIds && scope.outletIds.length > 0) {
      const placeholders = scope.outletIds.map(() => '?').join(', ');
      whereClause += ` AND dp.outlet_id IN (${placeholders})`;
      params.push(...scope.outletIds);
    }

    if (month) { whereClause += ' AND dp.month = ?'; params.push(month); }
    if (year) { whereClause += ' AND dp.year = ?'; params.push(year); }

    const payouts = await query(
      `SELECT dp.*,
              dp.customer_paid_value AS customer_paid,
              dp.customer_bill_value,
              dp.portal_commission AS commission_amount,
              dp.expected_payout AS net_received,
              o.outlet_name, dip.portal_name,
              uc.full_name AS created_by_name,
              us.full_name AS submitted_by_name,
              uv.full_name AS verified_by_name,
              ur.full_name AS rejected_by_name
       FROM dine_in_payouts dp
       LEFT JOIN outlets o ON dp.outlet_id = o.id
       LEFT JOIN dine_in_portals dip ON dp.portal_id = dip.id
       LEFT JOIN users uc ON dp.created_by = uc.id
       LEFT JOIN users us ON dp.submitted_by = us.id
       LEFT JOIN users uv ON dp.verified_by = uv.id
       LEFT JOIN users ur ON dp.rejected_by = ur.id
       WHERE ${whereClause}
       ORDER BY dp.year DESC, dp.month DESC`,
      params
    );

    res.json({ success: true, data: payouts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/dine-in', protect, applyOutletScope, checkPermission('dine_in_payouts', 'can_create'), async (req, res) => {
  try {
    const scope = req.outletScope || { all: true };
    const outletId = Number(req.body.outlet_id);

    if (!outletId || req.body.outlet_id === 'all') {
      return res.status(400).json({ success: false, message: 'Valid outlet_id is required' });
    }

    if (!scope.all && !scope.outletIds.includes(outletId)) {
      return res.status(403).json({ success: false, message: 'You do not have access to the selected outlet' });
    }

    for (const f of WORKFLOW_FIELDS) delete req.body[f];
    delete req.body.created_by;
    delete req.body.created_at;

    const b = req.body;
    const customerPaid = Number(b.customer_paid_value ?? b.customer_paid ?? 0);
    const customerBill = Number(b.customer_bill_value ?? 0);
    const discountGiven = Number(b.discount_given ?? 0);
    const tax = Number(b.tax ?? 0);
    const portalCommission = Number(b.portal_commission ?? b.commission_amount ?? 0);
    const tcs = Number(b.tcs ?? 0);
    const tds = Number(b.tds ?? 0);
    const expectedPayout = Number(b.expected_payout ?? b.net_received ?? 0);
    const otherDeduction = Number(
      b.other_deduction ?? Math.max(0, customerPaid - portalCommission - tcs - tds - expectedPayout)
    );
    const actualPayoutReceived = Number(b.actual_payout_received ?? 0);

    const result = await query(
      `INSERT INTO dine_in_payouts (
        outlet_id, portal_id, month, year,
        customer_bill_value, customer_paid_value, discount_given, tax,
        portal_commission, tcs, tds, other_deduction, actual_payout_received,
        status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, NOW())`,
      [
        b.outlet_id, b.portal_id, b.month, b.year,
        customerBill, customerPaid, discountGiven, tax,
        portalCommission, tcs, tds, otherDeduction, actualPayoutReceived,
        req.user.id
      ]
    );

    const [created] = await query('SELECT * FROM dine_in_payouts WHERE id = ?', [result.insertId]);

    res.status(201).json({ success: true, message: 'Dine-in payout created successfully', data: created });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Dine-in payout already exists for this outlet, month and portal.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/dine-in/:id', protect, applyOutletScope, checkPermission('dine_in_payouts', 'can_edit'), loadScopedRecord('dine_in_payouts'), async (req, res) => {
  try {
    const record = req.record;
    if (!EDITABLE_STATUSES.includes(record.status)) {
      return res.status(400).json({ success: false, message: `Cannot edit a payout with status "${record.status}". Only Draft or Rejected records can be edited.` });
    }

    stripProtectedFields(req.body);
    const b = req.body;

    const customerPaid = b.customer_paid_value !== undefined ? Number(b.customer_paid_value) : (b.customer_paid !== undefined ? Number(b.customer_paid) : record.customer_paid_value);
    const portalCommission = b.portal_commission !== undefined ? Number(b.portal_commission) : (b.commission_amount !== undefined ? Number(b.commission_amount) : record.portal_commission);
    const tcs = b.tcs !== undefined ? Number(b.tcs) : (record.tcs ?? 0);
    const tds = b.tds !== undefined ? Number(b.tds) : (record.tds ?? 0);
    const expectedPayout = b.expected_payout !== undefined ? Number(b.expected_payout) : (b.net_received !== undefined ? Number(b.net_received) : record.expected_payout);
    const otherDeduction = b.other_deduction !== undefined
      ? Number(b.other_deduction)
      : Math.max(0, customerPaid - portalCommission - tcs - tds - expectedPayout);

    await query(
      `UPDATE dine_in_payouts SET
        outlet_id = ?, portal_id = ?, month = ?, year = ?,
        customer_bill_value = ?, customer_paid_value = ?, discount_given = ?, tax = ?,
        portal_commission = ?, tcs = ?, tds = ?, other_deduction = ?, actual_payout_received = ?,
        updated_at = NOW() WHERE id = ?`,
      [
        b.outlet_id ?? record.outlet_id, b.portal_id ?? record.portal_id, b.month ?? record.month, b.year ?? record.year,
        b.customer_bill_value !== undefined ? Number(b.customer_bill_value) : (record.customer_bill_value ?? 0),
        customerPaid,
        b.discount_given !== undefined ? Number(b.discount_given) : (record.discount_given ?? 0),
        b.tax !== undefined ? Number(b.tax) : (record.tax ?? 0),
        portalCommission, tcs, tds, otherDeduction,
        b.actual_payout_received !== undefined ? Number(b.actual_payout_received) : (record.actual_payout_received ?? 0),
        req.params.id
      ]
    );

    res.json({ success: true, message: 'Dine-in payout updated successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Dine-in payout already exists for this outlet, month and portal.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/dine-in/:id', protect, applyOutletScope, checkPermission('dine_in_payouts', 'can_delete'), loadScopedRecord('dine_in_payouts'), async (req, res) => {
  try {
    const record = req.record;
    if (!DELETABLE_STATUSES.includes(record.status)) {
      return res.status(400).json({ success: false, message: `Cannot delete a payout with status "${record.status}". Only Draft or Rejected records can be deleted.` });
    }
    await query('DELETE FROM dine_in_payouts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Dine-in payout deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/dine-in/:id/submit', protect, applyOutletScope, checkPermission('dine_in_payouts', 'can_submit'), loadScopedRecord('dine_in_payouts'), async (req, res) => {
  try {
    const record = req.record;
    if (record.status !== 'Draft' && record.status !== 'Rejected') {
      return res.status(400).json({ success: false, message: `Cannot submit a payout with status "${record.status}". Only Draft or Rejected records can be submitted.` });
    }

    await query(
      `UPDATE dine_in_payouts SET status = 'Submitted', submitted_by = ?, submitted_at = NOW(),
       verified_by = NULL, verified_at = NULL, rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL,
       updated_at = NOW() WHERE id = ?`,
      [req.user.id, req.params.id]
    );

    res.json({ success: true, message: 'Dine-in payout submitted for verification' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/dine-in/:id/verify', protect, applyOutletScope, checkPermission('dine_in_payouts', 'can_verify'), loadScopedRecord('dine_in_payouts'), async (req, res) => {
  try {
    const record = req.record;
    if (record.status !== 'Submitted') {
      return res.status(400).json({ success: false, message: `Cannot verify a payout with status "${record.status}". Only Submitted records can be verified.` });
    }
    if (record.submitted_by === req.user.id) {
      return res.status(403).json({ success: false, message: 'You cannot verify your own submission (maker-checker rule).' });
    }

    await query(
      `UPDATE dine_in_payouts SET status = 'Verified', verified_by = ?, verified_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [req.user.id, req.params.id]
    );

    res.json({ success: true, message: 'Dine-in payout verified successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/dine-in/:id/reject', protect, applyOutletScope, checkPermission('dine_in_payouts', 'can_verify'), loadScopedRecord('dine_in_payouts'), async (req, res) => {
  try {
    const record = req.record;
    if (record.status !== 'Submitted') {
      return res.status(400).json({ success: false, message: `Cannot reject a payout with status "${record.status}". Only Submitted records can be rejected.` });
    }
    if (record.submitted_by === req.user.id) {
      return res.status(403).json({ success: false, message: 'You cannot reject your own submission (maker-checker rule).' });
    }
    const { rejection_reason } = req.body;
    if (!rejection_reason || !rejection_reason.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    await query(
      `UPDATE dine_in_payouts SET status = 'Rejected', rejected_by = ?, rejected_at = NOW(), rejection_reason = ?, updated_at = NOW() WHERE id = ?`,
      [req.user.id, rejection_reason.trim(), req.params.id]
    );

    res.json({ success: true, message: 'Dine-in payout rejected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

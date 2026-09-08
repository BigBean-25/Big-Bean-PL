import { query } from '../config/database.js';
import { logAudit } from '../utils/logger.js';
import {
  getOutletDashboardSummary,
  getSalesForDateRange,
  getMonthlyPayoutBreakdown,
  getSalesTarget,
  upsertSalesTarget,
} from '../services/salesTargetService.js';

const isAllOutlets = (value) => !value || value === 'all';

const resolveOutletId = (req, res) => {
  const { outlet_id } = req.query;
  if (isAllOutlets(outlet_id)) {
    res.status(400).json({ success: false, message: 'A specific outlet is required' });
    return null;
  }
  const outletScope = req.outletScope;
  if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(outlet_id))) {
    res.status(403).json({ success: false, message: 'You do not have access to the requested outlet' });
    return null;
  }
  return outlet_id;
};

export const getDashboardSummary = async (req, res) => {
  try {
    const outletId = resolveOutletId(req, res);
    if (outletId === null) return;

    const summary = await getOutletDashboardSummary(outletId, new Date());
    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    console.error('Get outlet dashboard summary error:', error);
    res.status(500).json({ success: false, message: 'Error fetching dashboard summary' });
  }
};

export const getSalesBreakdown = async (req, res) => {
  try {
    const outletId = resolveOutletId(req, res);
    if (outletId === null) return;

    const { from, to, month, year } = req.query;
    if (!from || !to) {
      return res.status(400).json({ success: false, message: 'from and to dates are required' });
    }
    const effectiveMonth = Number(month) || new Date(to).getMonth() + 1;
    const effectiveYear = Number(year) || new Date(to).getFullYear();

    const [range, payouts] = await Promise.all([
      getSalesForDateRange(outletId, from, to),
      getMonthlyPayoutBreakdown(outletId, effectiveMonth, effectiveYear),
    ]);

    res.status(200).json({
      success: true,
      data: {
        range: { from, to, ...range },
        monthly_payouts: { month: effectiveMonth, year: effectiveYear, ...payouts },
      },
    });
  } catch (error) {
    console.error('Get sales breakdown error:', error);
    res.status(500).json({ success: false, message: 'Error fetching sales breakdown' });
  }
};

export const getTarget = async (req, res) => {
  try {
    const outletId = resolveOutletId(req, res);
    if (outletId === null) return;

    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ success: false, message: 'month and year are required' });
    }

    const target = await getSalesTarget(outletId, Number(month), Number(year));
    res.status(200).json({ success: true, data: target });
  } catch (error) {
    console.error('Get sales target error:', error);
    res.status(500).json({ success: false, message: 'Error fetching sales target' });
  }
};

export const setTarget = async (req, res) => {
  try {
    const { outlet_id, month, year, target_amount } = req.body;

    if (!outlet_id || !month || !year || target_amount === undefined) {
      return res.status(400).json({ success: false, message: 'Outlet, month, year and target amount are required' });
    }
    if (Number.isNaN(Number(target_amount)) || Number(target_amount) < 0) {
      return res.status(400).json({ success: false, message: 'Target amount must be a non-negative number' });
    }

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to the requested outlet' });
    }

    const outlet = await query('SELECT id FROM outlets WHERE id = ? AND is_active = 1', [outlet_id]);
    if (!outlet.length) {
      return res.status(400).json({ success: false, message: 'Outlet not found or inactive' });
    }

    const result = await upsertSalesTarget({
      outletId: outlet_id,
      month: Number(month),
      year: Number(year),
      targetAmount: Number(target_amount),
      userId: req.user.id,
    });

    await logAudit(req.user.id, result.created ? 'CREATE' : 'UPDATE', 'sales_targets', result.id, null, req.body, 'Set sales target');

    res.status(result.created ? 201 : 200).json({
      success: true,
      message: result.created ? 'Sales target created' : 'Sales target updated',
      data: { id: result.id },
    });
  } catch (error) {
    console.error('Set sales target error:', error);
    res.status(500).json({ success: false, message: 'Error setting sales target' });
  }
};

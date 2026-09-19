import { query } from '../config/database.js';
import { getOfficialOutletPL } from '../services/plCalculator.js';

const money = (value) => Number(value || 0);

export const getDashboardSummary = async (req, res) => {
  try {
    const scope = req.outletScope;
    const outletId = scope?.all ? null : (scope?.outletIds?.[0] || null);

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // Phase 6A8: canonical official P&L - same source of truth as the Monthly
    // P&L report (snapshot for finalized months, mode-resolved live otherwise).
    const pl = await getOfficialOutletPL({ outletId, month, year });

    const pendingUploads = await query(
      `SELECT COUNT(*) as value FROM (
         SELECT outlet_id FROM opening_stock_uploads WHERE approval_status IN ('Draft','Submitted')
         UNION ALL SELECT outlet_id FROM closing_stock_uploads WHERE approval_status IN ('Draft','Submitted')
         UNION ALL SELECT outlet_id FROM material_purchase_uploads WHERE approval_status IN ('Draft','Submitted')
         UNION ALL SELECT outlet_id FROM item_sales_uploads WHERE approval_status IN ('Draft','Submitted')
         UNION ALL SELECT outlet_id FROM petpooja_item_tax_uploads WHERE approval_status IN ('Draft','Submitted')
       ) pending WHERE ${scope?.all ? '1=1' : `pending.outlet_id IN (${(scope?.outletIds || []).map(() => '?').join(',') || 'NULL'})`}`,
      scope?.all ? [] : scope?.outletIds || []
    );

    const platformCharges = money(pl.revenue.total_online_deductions) + money(pl.revenue.total_dinein_deductions);

    res.json({
      success: true,
      data: {
        outlet_id: scope?.requestedOutletId || 'all',
        gross_sales: money(pl.revenue.gross_sales),
        net_sales: money(pl.revenue.net_sales),
        tax: money(pl.revenue.taxes),
        opening_stock: money(pl.cost_of_goods.opening_stock),
        purchases: money(pl.cost_of_goods.purchases),
        closing_stock: money(pl.cost_of_goods.closing_stock),
        cogs: money(pl.cost_of_goods.actual_consumption),
        cogs_source: pl.cogs_source || 'PERIODIC',
        pnl_state: pl.pnl_state || 'OK',
        payroll_cost: money(pl.operating_expenses.total_salary),
        daily_expenses: money(pl.operating_expenses.daily_cash_expenses),
        platform_charges: platformCharges,
        net_profit: money(pl.summary.profit_loss),
        pending_uploads: money(pendingUploads[0]?.value)
      }
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ success: false, message: 'Error fetching dashboard summary', error: error.message });
  }
};

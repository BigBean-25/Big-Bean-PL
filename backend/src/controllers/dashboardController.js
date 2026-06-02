import { query } from '../config/database.js';

const money = (value) => Number(value || 0);

const outletWhere = (alias, outletScope) => {
  if (!outletScope || outletScope.all) return { sql: '', params: [] };
  const ids = outletScope.outletIds || [];
  if (ids.length === 0) return { sql: ` AND ${alias}.outlet_id IN (NULL)`, params: [] };
  return { sql: ` AND ${alias}.outlet_id IN (${ids.map(() => '?').join(',')})`, params: ids };
};

const scalar = async (sql, params = [], field = 'value') => {
  try {
    const rows = await query(sql, params);
    return money(rows?.[0]?.[field]);
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') {
      return 0;
    }
    throw error;
  }
};

const rowsOrDefault = async (sql, params = [], defaultRows = []) => {
  try {
    return await query(sql, params);
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') {
      return defaultRows;
    }
    throw error;
  }
};

export const getDashboardSummary = async (req, res) => {
  try {
    const scope = req.outletScope;
    const salesFilter = outletWhere('pis', scope);
    const openingFilter = outletWhere('osu', scope);
    const purchaseFilter = outletWhere('mpu', scope);
    const closingFilter = outletWhere('csu', scope);
    const payrollFilter = outletWhere('es', scope);
    const expenseFilter = outletWhere('dce', scope);
    const onlineFilter = outletWhere('op', scope);
    const dineFilter = outletWhere('dp', scope);

    const sales = await rowsOrDefault(
      `SELECT
         COALESCE(SUM(pis.gross_sales), 0) gross_sales,
         COALESCE(SUM(pis.net_sales), 0) net_sales,
         COALESCE(SUM(pis.tax), 0) tax,
         COALESCE(SUM(pis.quantity), 0) quantity,
         COALESCE(SUM(CASE WHEN LOWER(COALESCE(pis.order_type, '')) LIKE '%cash%' THEN pis.net_sales ELSE 0 END), 0) cash_sales,
         COALESCE(SUM(CASE WHEN LOWER(COALESCE(pis.platform, '')) IN ('zomato','swiggy','online') THEN pis.net_sales ELSE 0 END), 0) online_sales,
         COALESCE(SUM(CASE WHEN LOWER(COALESCE(pis.order_type, '')) LIKE '%dine%' THEN pis.net_sales ELSE 0 END), 0) dine_in_sales
       FROM petpooja_item_sales pis
       WHERE 1=1${salesFilter.sql}`,
      salesFilter.params,
      [{
        gross_sales: 0,
        net_sales: 0,
        tax: 0,
        quantity: 0,
        cash_sales: 0,
        online_sales: 0,
        dine_in_sales: 0
      }]
    );

    const openingStock = await scalar(
      `SELECT COALESCE(SUM(osu.total_value), 0) value FROM opening_stock_uploads osu WHERE 1=1${openingFilter.sql}`,
      openingFilter.params
    );
    const purchases = await scalar(
      `SELECT COALESCE(SUM(mpu.total_amount), 0) value FROM material_purchase_uploads mpu WHERE 1=1${purchaseFilter.sql}`,
      purchaseFilter.params
    );
    const closingStock = await scalar(
      `SELECT COALESCE(SUM(csu.total_value), 0) value FROM closing_stock_uploads csu WHERE 1=1${closingFilter.sql}`,
      closingFilter.params
    );
    const payrollCost = await scalar(
      `SELECT COALESCE(SUM(COALESCE(es.net_payable,0) + COALESCE(es.incentives,0) + COALESCE(es.ot_amount,0) + COALESCE(es.staff_benefits,0)), 0) value
       FROM employee_salary es
       WHERE COALESCE(es.status, 'Draft') IN ('Approved','Locked')${payrollFilter.sql}`,
      payrollFilter.params
    );
    const dailyExpenses = await scalar(
      `SELECT COALESCE(SUM(dce.amount), 0) value FROM daily_cash_expenses dce WHERE COALESCE(dce.status, 'Draft') IN ('Approved','Locked')${expenseFilter.sql}`,
      expenseFilter.params
    );
    const onlineCharges = await scalar(
      `SELECT COALESCE(SUM(COALESCE(op.commission,0) + COALESCE(op.gateway_charges,0) + COALESCE(op.deductions,0)), 0) value FROM online_payouts op WHERE 1=1${onlineFilter.sql}`,
      onlineFilter.params
    );
    const dineInCharges = await scalar(
      `SELECT COALESCE(SUM(COALESCE(dp.commission,0) + COALESCE(dp.gateway_charges,0) + COALESCE(dp.deductions,0)), 0) value FROM dine_in_payouts dp WHERE 1=1${dineFilter.sql}`,
      dineFilter.params
    );
    const pendingUploads = await scalar(
      `SELECT COUNT(*) value FROM (
         SELECT outlet_id FROM opening_stock_uploads WHERE COALESCE(status, 'Draft') IN ('Draft','Submitted')
         UNION ALL SELECT outlet_id FROM closing_stock_uploads WHERE COALESCE(status, 'Draft') IN ('Draft','Submitted')
         UNION ALL SELECT outlet_id FROM material_purchase_uploads WHERE COALESCE(status, 'Draft') IN ('Draft','Submitted')
       ) pending WHERE ${scope?.all ? '1=1' : `pending.outlet_id IN (${(scope?.outletIds || []).map(() => '?').join(',') || 'NULL'})`}`,
      scope?.all ? [] : scope?.outletIds || []
    );
    const stockAlerts = await scalar(
      `SELECT COUNT(*) value FROM outlet_stock os WHERE COALESCE(os.current_qty,0) <= COALESCE(os.reorder_level,0)${outletWhere('os', scope).sql}`,
      outletWhere('os', scope).params
    );

    const grossSales = money(sales[0]?.gross_sales);
    const netSales = money(sales[0]?.net_sales);
    const tax = money(sales[0]?.tax);
    const cogs = openingStock + purchases - closingStock;
    const platformCharges = onlineCharges + dineInCharges;
    const fixedExpenses = dailyExpenses;
    const netProfit = netSales - cogs - payrollCost - fixedExpenses - platformCharges - tax;

    res.json({
      success: true,
      data: {
        outlet_id: scope?.requestedOutletId || 'all',
        gross_sales: grossSales,
        net_sales: netSales,
        tax,
        quantity: money(sales[0]?.quantity),
        cash_sales: money(sales[0]?.cash_sales),
        online_sales: money(sales[0]?.online_sales),
        dine_in_sales: money(sales[0]?.dine_in_sales),
        opening_stock: openingStock,
        purchases,
        closing_stock: closingStock,
        cogs,
        payroll_cost: payrollCost,
        daily_expenses: dailyExpenses,
        platform_charges: platformCharges,
        net_profit: netProfit,
        pending_uploads: pendingUploads,
        stock_alerts: stockAlerts
      }
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ success: false, message: 'Error fetching dashboard summary', error: error.message });
  }
};

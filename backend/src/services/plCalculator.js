import { query } from '../config/database.js';

const num = (value) => Number(value || 0);

const monthRange = (month, year) => {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
  return { startDate, endDate };
};

const outletWhere = (alias, outletId) => ({
  sql: outletId ? `${alias}.outlet_id = ?` : '1=1',
  params: outletId ? [outletId] : []
});

/**
 * Canonical outlet P&L for one month. Single source of truth used by both
 * the Monthly P&L report and the dashboard summary.
 *
 * Sales are read from the PetPooja pipeline (petpooja_sales_items/uploads,
 * status = 'Approved') since that's the pipeline that actually validates the
 * PetPooja item-wise sales format and carries a real approval workflow.
 */
export const getOutletPL = async ({ outletId, month, year }) => {
  const { startDate, endDate } = monthRange(month, year);

  const psiOutlet = outletWhere('psi', outletId);
  const osiOutlet = outletWhere('osi', outletId);
  const csiOutlet = outletWhere('csi', outletId);
  const mpiOutlet = outletWhere('mpi', outletId);
  const expenseOutlet = outletWhere('daily_cash_expenses', outletId);
  const utilityOutlet = outletWhere('utility_bills', outletId);
  const salaryOutlet = outletWhere('employee_salary_monthly', outletId);
  const onlineOutlet = outletWhere('online_payouts', outletId);
  const dineOutlet = outletWhere('dine_in_payouts', outletId);
  const fixedCostOutlet = outletWhere('outlet_fixed_costs', outletId);

  const salesData = await query(
    `SELECT
      COALESCE(SUM(psi.gross_sales), 0) as gross_sales,
      COALESCE(SUM(psi.discount), 0) as total_discount,
      COALESCE(SUM(psi.total_tax), 0) as total_tax,
      COALESCE(SUM(psi.net_sales), 0) as net_sales
     FROM petpooja_sales_items psi
     INNER JOIN petpooja_sales_uploads psu ON psi.upload_id = psu.id
     WHERE ${psiOutlet.sql}
     AND psu.status = 'Approved'
     AND COALESCE(psu.upload_date_from, psu.upload_date) <= ?
     AND COALESCE(psu.upload_date_to, psu.upload_date) >= ?`,
    [...psiOutlet.params, endDate, startDate]
  );

  const onlinePayouts = await query(
    `SELECT
      COALESCE(SUM(customer_paid_amount), 0) as customer_paid,
      COALESCE(SUM(platform_commission), 0) as commission,
      COALESCE(SUM(payment_gateway_charges), 0) as pg_charges,
      COALESCE(SUM(tcs), 0) as tcs,
      COALESCE(SUM(tds), 0) as tds,
      COALESCE(SUM(other_deductions), 0) as other_deductions,
      COALESCE(SUM(net_payout_expected), 0) as net_payout
     FROM online_payouts
     WHERE ${onlineOutlet.sql} AND month = ? AND year = ? AND status = 'Verified'`,
    [...onlineOutlet.params, month, year]
  );

  const dineInPayouts = await query(
    `SELECT
      COALESCE(SUM(customer_paid_value), 0) as customer_paid,
      COALESCE(SUM(portal_commission), 0) as commission,
      COALESCE(SUM(tcs), 0) as tcs,
      COALESCE(SUM(tds), 0) as tds,
      COALESCE(SUM(expected_payout), 0) as expected_payout
     FROM dine_in_payouts
     WHERE ${dineOutlet.sql} AND month = ? AND year = ? AND status = 'Verified'`,
    [...dineOutlet.params, month, year]
  );

  const openingStock = await query(
    `SELECT COALESCE(SUM(value), 0) as opening_stock_value
     FROM opening_stock_items osi
     INNER JOIN opening_stock_uploads osu ON osi.upload_id = osu.id
     WHERE ${osiOutlet.sql} AND osu.month = ? AND osu.year = ?
     AND osu.status = 'Completed'`,
    [...osiOutlet.params, month, year]
  );

  const closingStock = await query(
    `SELECT COALESCE(SUM(value), 0) as closing_stock_value
     FROM closing_stock_items csi
     INNER JOIN closing_stock_uploads csu ON csi.upload_id = csu.id
     WHERE ${csiOutlet.sql} AND csu.month = ? AND csu.year = ?
     AND csu.status = 'Completed'`,
    [...csiOutlet.params, month, year]
  );

  const purchases = await query(
    `SELECT COALESCE(SUM(total_amount), 0) as purchase_value
     FROM material_purchase_items mpi
     INNER JOIN material_purchase_uploads mpu ON mpi.upload_id = mpu.id
     WHERE ${mpiOutlet.sql} AND mpi.date >= ? AND mpi.date <= ?
     AND mpu.status = 'Completed'`,
    [...mpiOutlet.params, startDate, endDate]
  );

  const actualConsumption =
    num(openingStock[0].opening_stock_value) +
    num(purchases[0].purchase_value) -
    num(closingStock[0].closing_stock_value);

  const dailyExpenses = await query(
    `SELECT COALESCE(SUM(amount), 0) as total_expenses
     FROM daily_cash_expenses
     WHERE ${expenseOutlet.sql} AND date >= ? AND date <= ?
     AND status = 'Approved'`,
    [...expenseOutlet.params, startDate, endDate]
  );

  const utilities = await query(
    `SELECT
      COALESCE(electricity_bill, 0) as electricity,
      COALESCE(maintenance_cost, 0) as maintenance,
      COALESCE(water_bill, 0) as water,
      COALESCE(garbage, 0) as garbage,
      COALESCE(internet, 0) as internet,
      COALESCE(gas_monthly, 0) as gas,
      COALESCE(other_utility, 0) as other_utility,
      COALESCE(total_utility_cost, 0) as total_utility
     FROM utility_bills
     WHERE ${utilityOutlet.sql} AND month = ? AND year = ? AND status = 'Verified'`,
    [...utilityOutlet.params, month, year]
  );

  const salary = await query(
    `SELECT
      COALESCE(total_employee_salary, 0) as salary,
      COALESCE(incentive_bonus, 0) as incentive,
      COALESCE(staff_accommodation, 0) as accommodation,
      COALESCE(other_staff_cost, 0) as other_staff,
      COALESCE(total_salary_cost, 0) as total_salary
     FROM employee_salary_monthly
     WHERE ${salaryOutlet.sql} AND month = ? AND year = ?`,
    [...salaryOutlet.params, month, year]
  );

  const fixedCosts = await query(
    `SELECT COALESCE(SUM(amount), 0) as total_fixed_costs
     FROM outlet_fixed_costs
     WHERE ${fixedCostOutlet.sql} AND month = ? AND year = ?`,
    [...fixedCostOutlet.params, month, year]
  );

  const sales = salesData[0];
  const online = onlinePayouts[0];
  const dineIn = dineInPayouts[0];
  const util = utilities[0] || {};
  const sal = salary[0] || {};

  const totalOnlineDeductions =
    num(online.commission) +
    num(online.pg_charges) +
    num(online.tcs) +
    num(online.tds) +
    num(online.other_deductions);

  const totalDineInDeductions =
    num(dineIn.commission) +
    num(dineIn.tcs) +
    num(dineIn.tds);

  // Net Sales/Adjusted Sales = Gross Sales - Taxes - Discounts - Online
  // Platform Commission - Payment Gateway Charges - TCS/TDS - Other Portal
  // Deductions. item/petpooja sales already carry the full order value, so
  // payout entries are used only for their deduction components here, never
  // their customer-paid amount, to avoid double-counting sales.
  const adjustedSales = num(sales.net_sales) - totalOnlineDeductions - totalDineInDeductions;

  const totalOperatingExpenses =
    num(dailyExpenses[0].total_expenses) +
    num(util.total_utility) +
    num(sal.total_salary) +
    num(fixedCosts[0].total_fixed_costs);

  // Supplier payments and bank deposits are intentionally never included
  // here: supplier payments are vendor-ledger settlements against purchases
  // already counted via actualConsumption, and bank deposits are pure cash
  // movement with no P&L effect.
  const totalExpenses = actualConsumption + totalOperatingExpenses;

  const profitLoss = adjustedSales - totalExpenses;

  const foodCostPercentage = adjustedSales > 0 ? (actualConsumption / adjustedSales) * 100 : 0;
  const salaryCostPercentage = adjustedSales > 0 ? (num(sal.total_salary) / adjustedSales) * 100 : 0;
  const utilityCostPercentage = adjustedSales > 0 ? (num(util.total_utility) / adjustedSales) * 100 : 0;
  const netProfitPercentage = adjustedSales > 0 ? (profitLoss / adjustedSales) * 100 : 0;

  return {
    outlet_id: outletId || 'all',
    month,
    year,
    revenue: {
      gross_sales: num(sales.gross_sales),
      discounts: num(sales.total_discount),
      taxes: num(sales.total_tax),
      net_sales: num(sales.net_sales),
      online_commission: num(online.commission),
      payment_gateway_charges: num(online.pg_charges),
      tcs_tds: num(online.tcs) + num(online.tds) + num(dineIn.tcs) + num(dineIn.tds),
      total_online_deductions: totalOnlineDeductions,
      total_dinein_deductions: totalDineInDeductions,
      adjusted_sales: adjustedSales
    },
    cost_of_goods: {
      opening_stock: num(openingStock[0].opening_stock_value),
      purchases: num(purchases[0].purchase_value),
      closing_stock: num(closingStock[0].closing_stock_value),
      actual_consumption: actualConsumption
    },
    operating_expenses: {
      daily_cash_expenses: num(dailyExpenses[0].total_expenses),
      electricity_bill: num(util.electricity),
      maintenance_cost: num(util.maintenance),
      water_bill: num(util.water),
      garbage: num(util.garbage),
      internet: num(util.internet),
      gas: num(util.gas),
      other_utility: num(util.other_utility),
      total_utilities: num(util.total_utility),
      employee_salary: num(sal.salary),
      incentive_bonus: num(sal.incentive),
      staff_accommodation: num(sal.accommodation),
      other_staff_cost: num(sal.other_staff),
      total_salary: num(sal.total_salary),
      fixed_costs: num(fixedCosts[0].total_fixed_costs),
      total_operating_expenses: totalOperatingExpenses
    },
    summary: {
      total_revenue: adjustedSales,
      total_expenses: totalExpenses,
      profit_loss: profitLoss,
      food_cost_percentage: foodCostPercentage.toFixed(2),
      salary_cost_percentage: salaryCostPercentage.toFixed(2),
      utility_cost_percentage: utilityCostPercentage.toFixed(2),
      net_profit_percentage: netProfitPercentage.toFixed(2)
    }
  };
};

/**
 * Side-by-side P&L for every active outlet in one month, for the company-wide
 * comparison dashboard. Reuses getOutletPL() per outlet - no duplicate P&L
 * logic - so this always agrees with each outlet's individual P&L page.
 */
export const getOutletComparison = async ({ month, year }) => {
  const outlets = await query('SELECT id, outlet_name FROM outlets WHERE is_active = 1 ORDER BY outlet_name');

  const rows = await Promise.all(
    outlets.map(async (outlet) => {
      const snapshot = await getFinalizedSnapshot({ outletId: outlet.id, month, year });
      const pl = snapshot || await getOutletPL({ outletId: outlet.id, month, year });
      return {
        outlet_id: outlet.id,
        outlet_name: outlet.outlet_name,
        adjusted_sales: pl.revenue.adjusted_sales,
        actual_consumption: pl.cost_of_goods.actual_consumption,
        total_operating_expenses: pl.operating_expenses.total_operating_expenses,
        total_expenses: pl.summary.total_expenses,
        profit_loss: pl.summary.profit_loss,
        food_cost_percentage: pl.summary.food_cost_percentage,
        net_profit_percentage: pl.summary.net_profit_percentage
      };
    })
  );

  const totals = rows.reduce(
    (acc, r) => ({
      adjusted_sales: acc.adjusted_sales + num(r.adjusted_sales),
      actual_consumption: acc.actual_consumption + num(r.actual_consumption),
      total_operating_expenses: acc.total_operating_expenses + num(r.total_operating_expenses),
      total_expenses: acc.total_expenses + num(r.total_expenses),
      profit_loss: acc.profit_loss + num(r.profit_loss)
    }),
    { adjusted_sales: 0, actual_consumption: 0, total_operating_expenses: 0, total_expenses: 0, profit_loss: 0 }
  );

  return {
    month,
    year,
    outlets: rows,
    company_total: {
      ...totals,
      net_profit_percentage: totals.adjusted_sales > 0 ? ((totals.profit_loss / totals.adjusted_sales) * 100).toFixed(2) : '0.00'
    }
  };
};

/**
 * Returns the frozen snapshot for a month/outlet if one has been finalized, in the
 * same nested shape getOutletPL() returns, or null if the month hasn't been finalized.
 */
export const getFinalizedSnapshot = async ({ outletId, month, year }) => {
  if (!outletId) return null;

  const rows = await query(
    `SELECT * FROM monthly_pnl_snapshots WHERE outlet_id = ? AND month = ? AND year = ? AND is_finalized = 1`,
    [outletId, month, year]
  );
  if (rows.length === 0) return null;

  const s = rows[0];
  return {
    outlet_id: outletId,
    month,
    year,
    is_finalized: true,
    finalized_at: s.finalized_at,
    revenue: {
      gross_sales: num(s.gross_sales),
      discounts: num(s.discounts),
      taxes: num(s.taxes),
      net_sales: num(s.net_sales),
      online_commission: num(s.online_commission),
      payment_gateway_charges: num(s.payment_gateway_charges),
      tcs_tds: num(s.tcs_tds),
      total_online_deductions: num(s.total_online_deductions),
      total_dinein_deductions: num(s.total_dinein_deductions),
      adjusted_sales: num(s.adjusted_sales)
    },
    cost_of_goods: {
      opening_stock: num(s.opening_stock),
      purchases: num(s.purchases),
      closing_stock: num(s.closing_stock),
      actual_consumption: num(s.actual_consumption)
    },
    operating_expenses: {
      daily_cash_expenses: num(s.daily_cash_expenses),
      electricity_bill: num(s.electricity_bill),
      maintenance_cost: num(s.maintenance_cost),
      water_bill: num(s.water_bill),
      garbage: num(s.garbage),
      internet: num(s.internet),
      gas: num(s.gas),
      other_utility: num(s.other_utility),
      total_utilities: num(s.total_utilities),
      employee_salary: num(s.employee_salary),
      incentive_bonus: num(s.incentive_bonus),
      staff_accommodation: num(s.staff_accommodation),
      other_staff_cost: num(s.other_staff_cost),
      total_salary: num(s.total_salary),
      fixed_costs: num(s.fixed_costs),
      total_operating_expenses: num(s.total_operating_expenses)
    },
    summary: {
      total_revenue: num(s.total_revenue),
      total_expenses: num(s.total_expenses),
      profit_loss: num(s.profit_loss),
      food_cost_percentage: Number(s.food_cost_percentage).toFixed(2),
      salary_cost_percentage: Number(s.salary_cost_percentage).toFixed(2),
      utility_cost_percentage: Number(s.utility_cost_percentage).toFixed(2),
      net_profit_percentage: Number(s.net_profit_percentage).toFixed(2)
    }
  };
};

/**
 * Freezes the current getOutletPL() result for one outlet/month into
 * monthly_pnl_snapshots. Once finalized, the read path serves this frozen copy instead
 * of recomputing live, so later edits to the underlying daily records (expenses, stock
 * uploads, payouts, ...) can no longer move a closed month's P&L.
 */
export const finalizeMonth = async ({ outletId, month, year, userId }) => {
  if (!outletId) {
    const err = new Error('An outlet must be selected to finalize a month');
    err.statusCode = 400;
    throw err;
  }

  const existing = await query(
    `SELECT is_finalized FROM monthly_pnl_snapshots WHERE outlet_id = ? AND month = ? AND year = ?`,
    [outletId, month, year]
  );
  if (existing.length > 0 && existing[0].is_finalized) {
    const err = new Error('This month is already finalized for this outlet');
    err.statusCode = 400;
    throw err;
  }

  const pl = await getOutletPL({ outletId, month, year });

  await query(
    `INSERT INTO monthly_pnl_snapshots (
      outlet_id, month, year,
      gross_sales, discounts, taxes, net_sales, online_commission, payment_gateway_charges,
      tcs_tds, total_online_deductions, total_dinein_deductions, adjusted_sales,
      opening_stock, purchases, closing_stock, actual_consumption,
      daily_cash_expenses, electricity_bill, maintenance_cost, water_bill, garbage, internet,
      gas, other_utility, total_utilities, employee_salary, incentive_bonus,
      staff_accommodation, other_staff_cost, total_salary, fixed_costs, total_operating_expenses,
      total_revenue, total_expenses, profit_loss, food_cost_percentage,
      salary_cost_percentage, utility_cost_percentage, net_profit_percentage,
      is_finalized, finalized_by, finalized_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())
    ON DUPLICATE KEY UPDATE
      gross_sales = VALUES(gross_sales), discounts = VALUES(discounts), taxes = VALUES(taxes),
      net_sales = VALUES(net_sales), online_commission = VALUES(online_commission),
      payment_gateway_charges = VALUES(payment_gateway_charges), tcs_tds = VALUES(tcs_tds),
      total_online_deductions = VALUES(total_online_deductions),
      total_dinein_deductions = VALUES(total_dinein_deductions), adjusted_sales = VALUES(adjusted_sales),
      opening_stock = VALUES(opening_stock), purchases = VALUES(purchases),
      closing_stock = VALUES(closing_stock), actual_consumption = VALUES(actual_consumption),
      daily_cash_expenses = VALUES(daily_cash_expenses), electricity_bill = VALUES(electricity_bill),
      maintenance_cost = VALUES(maintenance_cost), water_bill = VALUES(water_bill),
      garbage = VALUES(garbage), internet = VALUES(internet), gas = VALUES(gas),
      other_utility = VALUES(other_utility), total_utilities = VALUES(total_utilities),
      employee_salary = VALUES(employee_salary), incentive_bonus = VALUES(incentive_bonus),
      staff_accommodation = VALUES(staff_accommodation), other_staff_cost = VALUES(other_staff_cost),
      total_salary = VALUES(total_salary), fixed_costs = VALUES(fixed_costs),
      total_operating_expenses = VALUES(total_operating_expenses),
      total_revenue = VALUES(total_revenue), total_expenses = VALUES(total_expenses),
      profit_loss = VALUES(profit_loss), food_cost_percentage = VALUES(food_cost_percentage),
      salary_cost_percentage = VALUES(salary_cost_percentage),
      utility_cost_percentage = VALUES(utility_cost_percentage),
      net_profit_percentage = VALUES(net_profit_percentage),
      is_finalized = 1, finalized_by = VALUES(finalized_by), finalized_at = NOW()`,
    [
      outletId, month, year,
      pl.revenue.gross_sales, pl.revenue.discounts, pl.revenue.taxes, pl.revenue.net_sales,
      pl.revenue.online_commission, pl.revenue.payment_gateway_charges, pl.revenue.tcs_tds,
      pl.revenue.total_online_deductions, pl.revenue.total_dinein_deductions, pl.revenue.adjusted_sales,
      pl.cost_of_goods.opening_stock, pl.cost_of_goods.purchases, pl.cost_of_goods.closing_stock,
      pl.cost_of_goods.actual_consumption,
      pl.operating_expenses.daily_cash_expenses, pl.operating_expenses.electricity_bill,
      pl.operating_expenses.maintenance_cost, pl.operating_expenses.water_bill,
      pl.operating_expenses.garbage, pl.operating_expenses.internet, pl.operating_expenses.gas,
      pl.operating_expenses.other_utility, pl.operating_expenses.total_utilities,
      pl.operating_expenses.employee_salary, pl.operating_expenses.incentive_bonus,
      pl.operating_expenses.staff_accommodation, pl.operating_expenses.other_staff_cost,
      pl.operating_expenses.total_salary, pl.operating_expenses.fixed_costs,
      pl.operating_expenses.total_operating_expenses,
      pl.summary.total_revenue, pl.summary.total_expenses, pl.summary.profit_loss,
      pl.summary.food_cost_percentage, pl.summary.salary_cost_percentage,
      pl.summary.utility_cost_percentage, pl.summary.net_profit_percentage,
      userId
    ]
  );

  return getFinalizedSnapshot({ outletId, month, year });
};

import { query } from '../config/database.js';
import { getEffectivePurchaseValue } from './effectivePurchaseService.js';

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
     AND osu.status = 'Completed'
     AND osu.approval_status = 'Verified'`,
    [...osiOutlet.params, month, year]
  );

  const closingStock = await query(
    `SELECT COALESCE(SUM(value), 0) as closing_stock_value
     FROM closing_stock_items csi
     INNER JOIN closing_stock_uploads csu ON csi.upload_id = csu.id
     WHERE ${csiOutlet.sql} AND csu.month = ? AND csu.year = ?
     AND csu.status = 'Completed'
     AND csu.approval_status = 'Verified'`,
    [...csiOutlet.params, month, year]
  );

  // Phase 6A3: "purchases" means EFFECTIVE purchases - Verified manual
  // upload items not replaced by a Posted claimed GRN bridge effect, plus
  // Posted GRN->PURCHASE accounting effects. A Draft bridge has zero effect
  // here; a Posted claimed bridge and its manual item can never both count.
  const purchases = [{ purchase_value: await getEffectivePurchaseValue({ outletId, fromDate: startDate, toDate: endDate }) }];

  const actualConsumption =
    num(openingStock[0].opening_stock_value) +
    num(purchases[0].purchase_value) -
    num(closingStock[0].closing_stock_value);

  // linked_purchase_item_id IS NULL excludes raw-material-tagged expenses
  // that were auto-converted into a material_purchase_items row at approval
  // (see approveDailyCashExpense in dailyAccountsController.js / database/
  // add_raw_material_cash_expense_linkage.sql). Those already flow into the
  // `purchases` sum above as material cost - without this exclusion the same
  // rupee amount was counted twice: once as raw-material consumption cost
  // and again as a flat cash expense, inflating total cost and understating
  // profit for every outlet with an approved raw-material cash expense.
  const dailyExpenses = await query(
    `SELECT COALESCE(SUM(amount), 0) as total_expenses
     FROM daily_cash_expenses
     WHERE ${expenseOutlet.sql} AND date >= ? AND date <= ?
     AND status = 'Approved' AND linked_purchase_item_id IS NULL`,
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

  // employee_salary_monthly has the same Draft/Submitted/Verified workflow as
  // utility_bills/online_payouts/dine_in_payouts (all filtered to Verified
  // above) - this was missing that filter, so an unreviewed Draft/Submitted
  // salary figure flowed straight into the P&L before payroll's own verify
  // step (verifyEmployeeSalary) ever ran, defeating the point of that
  // maker-checker review.
  const salary = await query(
    `SELECT
      COALESCE(total_employee_salary, 0) as salary,
      COALESCE(incentive_bonus, 0) as incentive,
      COALESCE(staff_accommodation, 0) as accommodation,
      COALESCE(other_staff_cost, 0) as other_staff,
      COALESCE(total_salary_cost, 0) as total_salary
     FROM employee_salary_monthly
     WHERE ${salaryOutlet.sql} AND month = ? AND year = ? AND status = 'Verified'`,
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

  // Snapshots store a more granular cost model than getOutletPL() returns.
  // finalizeMonth() embeds the residual splits it cannot store in dedicated
  // columns (daily cash expenses, non-billed utilities, uncategorized fixed
  // costs, the dine-in share of combined tcs/tds) as JSON in `remarks` so the
  // frozen report reconstructs exactly; snapshots without it degrade to a
  // lumped but still total-correct read.
  let detail = {};
  try {
    const marker = 'SNAPSHOT_DETAIL:';
    const raw = String(s.remarks || '');
    if (raw.startsWith(marker)) detail = JSON.parse(raw.slice(marker.length));
  } catch { detail = {}; }

  const totalPlatformCharges = num(s.total_platform_charges);
  const dineInTcsTds = num(detail.dinein_tcs_tds);
  const totalOnlineDeductions = totalPlatformCharges - num(s.dine_in_commission) - dineInTcsTds;
  const totalDineInDeductions = num(s.dine_in_commission) + dineInTcsTds;
  const adjustedSales = num(s.net_sales) - totalPlatformCharges;
  const actualConsumption = num(s.cogs);
  const utilityResidual = num(detail.utility_residual);
  const dailyCash = num(detail.daily_cash_expenses);
  const fixedCosts = num(s.rent) + num(s.accommodation) +
    (detail.daily_cash_expenses !== undefined
      ? num(detail.fixed_residual)
      : num(s.other_expenses));
  const totalUtilities = num(s.electricity) + num(s.maintenance) + num(s.water) + utilityResidual;
  const totalOperatingExpenses = dailyCash + totalUtilities + num(s.total_payroll_cost) + fixedCosts;

  return {
    outlet_id: outletId,
    month,
    year,
    is_finalized: true,
    finalized_at: s.finalized_at,
    revenue: {
      gross_sales: num(s.gross_sales),
      discounts: num(s.total_discount),
      taxes: num(s.total_tax),
      net_sales: num(s.net_sales),
      online_commission: num(s.zomato_commission) + num(s.swiggy_commission),
      payment_gateway_charges: num(s.gateway_charges),
      tcs_tds: num(s.tcs) + num(s.tds),
      total_online_deductions: totalOnlineDeductions,
      total_dinein_deductions: totalDineInDeductions,
      adjusted_sales: adjustedSales
    },
    cost_of_goods: {
      opening_stock: num(s.opening_stock),
      purchases: num(s.purchases),
      closing_stock: num(s.closing_stock),
      actual_consumption: actualConsumption
    },
    operating_expenses: {
      daily_cash_expenses: dailyCash,
      electricity_bill: num(s.electricity),
      maintenance_cost: num(s.maintenance),
      water_bill: num(s.water),
      garbage: 0,
      internet: 0,
      gas: 0,
      other_utility: utilityResidual,
      total_utilities: totalUtilities,
      employee_salary: num(s.employee_salary),
      incentive_bonus: num(s.incentives),
      staff_accommodation: 0,
      other_staff_cost: num(s.staff_benefits),
      total_salary: num(s.total_payroll_cost),
      fixed_costs: fixedCosts,
      total_operating_expenses: totalOperatingExpenses
    },
    summary: {
      total_revenue: adjustedSales,
      total_expenses: actualConsumption + totalOperatingExpenses,
      profit_loss: num(s.net_profit),
      food_cost_percentage: adjustedSales > 0 ? ((actualConsumption / adjustedSales) * 100).toFixed(2) : '0.00',
      salary_cost_percentage: adjustedSales > 0 ? ((num(s.total_payroll_cost) / adjustedSales) * 100).toFixed(2) : '0.00',
      utility_cost_percentage: adjustedSales > 0 ? ((totalUtilities / adjustedSales) * 100).toFixed(2) : '0.00',
      net_profit_percentage: Number(s.net_profit_percentage || 0).toFixed(2)
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

  // The canonical monthly_pnl_snapshots schema stores a more granular cost
  // model than getOutletPL() returns (per-platform commissions, tcs/tds
  // split, payroll sub-types, categorized fixed costs, generated totals).
  // Component values the P&L object does not carry are re-derived below from
  // the same Verified source rows and filters getOutletPL() already uses -
  // no new financial logic, only finer-grained reads of the same inputs.
  const [platformSplit, onlineSplit, dineInSplit, fixedSplit] = await Promise.all([
    query(
      `SELECT op.platform_name, COALESCE(SUM(o.platform_commission), 0) AS commission
       FROM online_payouts o
       INNER JOIN online_platforms op ON op.id = o.platform_id
       WHERE o.outlet_id = ? AND o.month = ? AND o.year = ? AND o.status = 'Verified'
       GROUP BY op.platform_name`,
      [outletId, month, year]
    ),
    query(
      `SELECT COALESCE(SUM(tcs), 0) AS tcs, COALESCE(SUM(tds), 0) AS tds,
              COALESCE(SUM(other_deductions), 0) AS other_deductions
       FROM online_payouts
       WHERE outlet_id = ? AND month = ? AND year = ? AND status = 'Verified'`,
      [outletId, month, year]
    ),
    query(
      `SELECT COALESCE(SUM(portal_commission), 0) AS commission,
              COALESCE(SUM(tcs), 0) AS tcs, COALESCE(SUM(tds), 0) AS tds
       FROM dine_in_payouts
       WHERE outlet_id = ? AND month = ? AND year = ? AND status = 'Verified'`,
      [outletId, month, year]
    ),
    query(
      `SELECT category, COALESCE(SUM(amount), 0) AS amount
       FROM outlet_fixed_costs
       WHERE outlet_id = ? AND month = ? AND year = ?
       GROUP BY category`,
      [outletId, month, year]
    )
  ]);

  const commissionFor = (name) =>
    num((platformSplit.find((r) => r.platform_name === name) || {}).commission);
  const zomatoCommission = commissionFor('Zomato');
  const swiggyCommission = commissionFor('Swiggy');
  const otherPlatformCommission = platformSplit.reduce(
    (acc, r) => acc + (['Zomato', 'Swiggy'].includes(r.platform_name) ? 0 : num(r.commission)),
    0
  );
  const online = onlineSplit[0] || {};
  const dine = dineInSplit[0] || {};

  let rent = 0;
  let accommodation = 0;
  let fixedResidual = 0;
  for (const row of fixedSplit) {
    const category = String(row.category || '').toLowerCase();
    if (category.includes('rent')) rent += num(row.amount);
    else if (category.includes('accommodat')) accommodation += num(row.amount);
    else fixedResidual += num(row.amount);
  }

  const opex = pl.operating_expenses;
  const utilityResidual =
    num(opex.garbage) + num(opex.internet) + num(opex.gas) + num(opex.other_utility);
  // other_expenses absorbs every expense component with no dedicated column
  // (daily cash expenses, non-billed utilities, uncategorized fixed costs) so
  // the stored buckets still sum to the P&L's real expense total.
  const otherExpenses = num(opex.daily_cash_expenses) + utilityResidual + fixedResidual;
  // staff_benefits = non-salary staff costs; with employee_salary + incentives
  // this keeps generated total_payroll_cost equal to pl's total_salary.
  const staffBenefits = num(opex.staff_accommodation) + num(opex.other_staff_cost);
  // other_deductions = portal other_deductions + commission on platforms other
  // than Zomato/Swiggy; with the named columns this keeps generated
  // total_platform_charges equal to pl's combined online+dine-in deductions.
  const otherDeductions = num(online.other_deductions) + otherPlatformCommission;

  const netSales = num(pl.revenue.net_sales);
  const cogs = num(pl.cost_of_goods.actual_consumption);
  const grossProfitPercentage = netSales > 0 ? ((netSales - cogs) / netSales) * 100 : null;

  const remarks = 'SNAPSHOT_DETAIL:' + JSON.stringify({
    daily_cash_expenses: num(opex.daily_cash_expenses),
    utility_residual: utilityResidual,
    fixed_residual: fixedResidual,
    dinein_tcs_tds: num(dine.tcs) + num(dine.tds)
  });

  await query(
    `INSERT INTO monthly_pnl_snapshots (
      outlet_id, month, year,
      gross_sales, total_discount, net_sales, total_tax,
      opening_stock, purchases, closing_stock, gross_profit_percentage,
      employee_salary, incentives, overtime, staff_benefits,
      rent, electricity, water, maintenance, accommodation, other_expenses,
      zomato_commission, swiggy_commission, dine_in_commission,
      gateway_charges, tds, tcs, other_deductions,
      net_profit_percentage, is_finalized, finalized_by, finalized_at, remarks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), ?)
    ON DUPLICATE KEY UPDATE
      gross_sales = VALUES(gross_sales), total_discount = VALUES(total_discount),
      net_sales = VALUES(net_sales), total_tax = VALUES(total_tax),
      opening_stock = VALUES(opening_stock), purchases = VALUES(purchases),
      closing_stock = VALUES(closing_stock),
      gross_profit_percentage = VALUES(gross_profit_percentage),
      employee_salary = VALUES(employee_salary), incentives = VALUES(incentives),
      overtime = VALUES(overtime), staff_benefits = VALUES(staff_benefits),
      rent = VALUES(rent), electricity = VALUES(electricity), water = VALUES(water),
      maintenance = VALUES(maintenance), accommodation = VALUES(accommodation),
      other_expenses = VALUES(other_expenses),
      zomato_commission = VALUES(zomato_commission),
      swiggy_commission = VALUES(swiggy_commission),
      dine_in_commission = VALUES(dine_in_commission),
      gateway_charges = VALUES(gateway_charges), tds = VALUES(tds), tcs = VALUES(tcs),
      other_deductions = VALUES(other_deductions),
      net_profit_percentage = VALUES(net_profit_percentage),
      is_finalized = 1, finalized_by = VALUES(finalized_by),
      finalized_at = NOW(), remarks = VALUES(remarks)`,
    [
      outletId, month, year,
      pl.revenue.gross_sales, pl.revenue.discounts, netSales, pl.revenue.taxes,
      pl.cost_of_goods.opening_stock, pl.cost_of_goods.purchases,
      pl.cost_of_goods.closing_stock, grossProfitPercentage,
      opex.employee_salary, opex.incentive_bonus, 0, staffBenefits,
      rent, opex.electricity_bill, opex.water_bill, opex.maintenance_cost,
      accommodation, otherExpenses,
      zomatoCommission, swiggyCommission, num(dine.commission),
      pl.revenue.payment_gateway_charges,
      num(online.tds) + num(dine.tds), num(online.tcs) + num(dine.tcs),
      otherDeductions,
      num(pl.summary.net_profit_percentage), userId, remarks
    ]
  );

  return getFinalizedSnapshot({ outletId, month, year });
};

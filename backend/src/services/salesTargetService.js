import { query } from '../config/database.js';

const num = (value) => Number(value || 0);

const toISODate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const startOfWeek = (date) => {
  // Monday as the start of the week.
  const d = date instanceof Date ? new Date(date) : new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
};

const startOfMonth = (date) => {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

const outletWhere = (alias, outletId) => ({
  sql: outletId ? `${alias}.outlet_id = ?` : '1=1',
  params: outletId ? [outletId] : []
});

/**
 * Gross/Discount/Tax/Net sales for an outlet across an arbitrary date range,
 * reusing the same petpooja_sales_items/uploads range-overlap query shape
 * plCalculator.js's getOutletPL uses for a calendar month - written fresh
 * here (not imported from plCalculator.js) so the battle-tested monthly P&L
 * path is never touched by this new, differently-scoped feature.
 */
export const getSalesForDateRange = async (outletId, startDate, endDate) => {
  const psiOutlet = outletWhere('psi', outletId);
  const rows = await query(
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
  const row = rows[0] || {};
  return {
    gross_sales: num(row.gross_sales),
    total_discount: num(row.total_discount),
    total_tax: num(row.total_tax),
    net_sales: num(row.net_sales),
  };
};

/**
 * Commission / platform (app) collection / TCS-TDS for an outlet - only
 * available at monthly granularity, since online_payouts/dine_in_payouts are
 * entered once per outlet per month with no date column. Mirrors the exact
 * fields plCalculator.js's getOutletPL reads from these two tables.
 */
export const getMonthlyPayoutBreakdown = async (outletId, month, year) => {
  const onlineOutlet = outletWhere('online_payouts', outletId);
  const dineOutlet = outletWhere('dine_in_payouts', outletId);

  const onlinePayouts = await query(
    `SELECT
      COALESCE(SUM(customer_paid_amount), 0) as customer_paid,
      COALESCE(SUM(platform_commission), 0) as commission,
      COALESCE(SUM(payment_gateway_charges), 0) as pg_charges,
      COALESCE(SUM(tcs), 0) as tcs,
      COALESCE(SUM(tds), 0) as tds,
      COALESCE(SUM(other_deductions), 0) as other_deductions
     FROM online_payouts
     WHERE ${onlineOutlet.sql} AND month = ? AND year = ? AND status = 'Verified'`,
    [...onlineOutlet.params, month, year]
  );

  const dineInPayouts = await query(
    `SELECT
      COALESCE(SUM(customer_paid_value), 0) as customer_paid,
      COALESCE(SUM(portal_commission), 0) as commission,
      COALESCE(SUM(tcs), 0) as tcs,
      COALESCE(SUM(tds), 0) as tds
     FROM dine_in_payouts
     WHERE ${dineOutlet.sql} AND month = ? AND year = ? AND status = 'Verified'`,
    [...dineOutlet.params, month, year]
  );

  const online = onlinePayouts[0] || {};
  const dineIn = dineInPayouts[0] || {};

  return {
    app_collection: num(online.customer_paid) + num(dineIn.customer_paid),
    commission: num(online.commission) + num(dineIn.commission),
    payment_gateway_charges: num(online.pg_charges),
    tcs: num(online.tcs) + num(dineIn.tcs),
    tds: num(online.tds) + num(dineIn.tds),
    other_deductions: num(online.other_deductions),
  };
};

export const getSalesTarget = async (outletId, month, year) => {
  const rows = await query(
    'SELECT * FROM sales_targets WHERE outlet_id = ? AND month = ? AND year = ?',
    [outletId, month, year]
  );
  return rows[0] || null;
};

export const upsertSalesTarget = async ({ outletId, month, year, targetAmount, userId }) => {
  const existing = await getSalesTarget(outletId, month, year);
  if (existing) {
    await query(
      'UPDATE sales_targets SET target_amount = ?, updated_at = NOW() WHERE id = ?',
      [targetAmount, existing.id]
    );
    return { id: existing.id, created: false };
  }
  const result = await query(
    `INSERT INTO sales_targets (outlet_id, month, year, target_amount, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [outletId, month, year, targetAmount, userId]
  );
  return { id: result.insertId, created: true };
};

const percentChange = (current, previous) => {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
};

const withComparison = async (outletId, [curStart, curEnd], [prevStart, prevEnd]) => {
  const [current, previous] = await Promise.all([
    getSalesForDateRange(outletId, toISODate(curStart), toISODate(curEnd)),
    getSalesForDateRange(outletId, toISODate(prevStart), toISODate(prevEnd)),
  ]);
  return {
    current,
    previous,
    change_percent: percentChange(current.net_sales, previous.net_sales),
  };
};

/**
 * Outlet Dashboard overview: today vs the same weekday last week, this
 * week-to-date vs the same span last week, this month-to-date vs the same
 * span last month, plus the current month's target (if any).
 */
export const getOutletDashboardSummary = async (outletId, asOfDate = new Date()) => {
  const today = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
  const sameDayLastWeek = addDays(today, -7);

  const weekStart = startOfWeek(today);
  const lastWeekStart = addDays(weekStart, -7);
  const lastWeekEndSameOffset = addDays(lastWeekStart, today.getDay() === 0 ? 6 : today.getDay() - 1);

  const monthStart = startOfMonth(today);
  const lastMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
  const lastMonthEndSameOffset = addDays(lastMonthStart, today.getDate() - 1);

  const [todayVsLastWeek, weekVsLastWeek, monthVsLastMonth] = await Promise.all([
    withComparison(outletId, [today, today], [sameDayLastWeek, sameDayLastWeek]),
    withComparison(outletId, [weekStart, today], [lastWeekStart, lastWeekEndSameOffset]),
    withComparison(outletId, [monthStart, today], [lastMonthStart, lastMonthEndSameOffset]),
  ]);

  const target = await getSalesTarget(outletId, today.getMonth() + 1, today.getFullYear());
  const monthToDateNet = monthVsLastMonth.current.net_sales;
  const targetAmount = target ? num(target.target_amount) : null;

  return {
    today_vs_last_week: todayVsLastWeek,
    week_vs_last_week: weekVsLastWeek,
    month_vs_last_month: monthVsLastMonth,
    target: {
      target_amount: targetAmount,
      month_to_date_net_sales: monthToDateNet,
      percent_of_target: targetAmount ? (monthToDateNet / targetAmount) * 100 : null,
    },
  };
};

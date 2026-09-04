import { query } from '../config/database.js';

// Shared month-finalization guard. Originally only fixedCostsController.js
// had this check - every other financial write-path (cashbook, cash
// expenses, bank deposits, day closing, payroll, utility bills, PetPooja
// sales, opening/closing stock, material purchase, supplier payments) had
// none at all, so a transaction could be created or backdated into a month
// whose P&L had already been finalized and reported. The frozen snapshot
// itself never recalculates (confirmed separately), but the live data would
// silently diverge from what was reported, with no warning to anyone.
// Extracted so every module enforces the same rule the same way, instead of
// each one re-deriving its own month/year-from-date logic.
export const assertMonthEditable = async (outletId, month, year, label = 'This record') => {
  if (!outletId || !month || !year) return;
  const rows = await query(
    'SELECT is_finalized FROM monthly_pnl_snapshots WHERE outlet_id = ? AND month = ? AND year = ?',
    [outletId, month, year]
  );
  if (rows.length > 0 && rows[0].is_finalized) {
    const err = new Error(`${label} for a finalized month cannot be created or edited. Reopen the month first if this needs to change.`);
    err.statusCode = 400;
    throw err;
  }
};

// Convenience wrapper for modules keyed by a single calendar date rather
// than an explicit month/year pair (cashbook, cash expenses, bank deposits,
// day closing, supplier payments).
export const assertDateEditable = async (outletId, dateStr, label = 'This record') => {
  if (!outletId || !dateStr) return;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return;
  await assertMonthEditable(outletId, d.getMonth() + 1, d.getFullYear(), label);
};

// Convenience wrapper for modules that cover a date range rather than one
// date or one month/year (PetPooja sales uploads, material purchase - which
// has no month/year field at all, only per-row dates). Checks every
// calendar month touched by [fromDateStr, toDateStr], since a range can
// span a month boundary.
export const assertDateRangeEditable = async (outletId, fromDateStr, toDateStr, label = 'This record') => {
  if (!outletId || !fromDateStr) return;
  const from = new Date(fromDateStr);
  const to = new Date(toDateStr || fromDateStr);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return;
  const seen = new Set();
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cursor <= to) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}`;
    if (!seen.has(key)) {
      seen.add(key);
      await assertMonthEditable(outletId, cursor.getMonth() + 1, cursor.getFullYear(), label);
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
};

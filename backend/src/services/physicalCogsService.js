import { query } from '../config/database.js';
import { getHybridCogsReconciliation } from './hybridCogsReconciliationService.js';

// Phase 6A8 - physical COGS source service.
//
// Wraps getHybridCogsReconciliation() (the existing movement-classified
// stock-ledger diagnostic) and distils it into the components the official
// P&L needs. READ-ONLY: no writes, no accounting_effects, no posting.
//
// COGS definition (company/outlet official):
//   physical_cogs_total = Posted OUTLET_CONSUMPTION value ONLY.
//
// Deliberately excluded from COGS (documented policy):
//   * WASTAGE            -> separate expense line (operational loss, not
//                           cost-of-goods-sold). The repository has no
//                           wastage accounting classification, so it is
//                           surfaced explicitly rather than hidden in COGS.
//   * adjustment variance -> separate line (inventory_adjustment_variance);
//                           net of negative - positive adjustments. Never
//                           silently merged into COGS.
//   * PRODUCTION_ISSUE / PRODUCTION_RECEIPT -> internal inventory
//                           transformation; the cost flows into finished
//                           goods and only reaches COGS through the final
//                           OUTLET_CONSUMPTION posting.
//   * TRANSFER_IN/OUT, PURCHASE_RETURN, TRANSIT_* -> internal/external
//                           movements handled elsewhere (returns already
//                           reduce effective purchases via supplier credits;
//                           transfers net to zero at company level).
//
// This is why counting consumption once is guaranteed: only the
// OUTLET_CONSUMPTION class contributes to physical_cogs_total.

const num = (value) => Number(value || 0);
const round2 = (n) => Math.round(n * 100) / 100;

const httpError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * Resolve the effective COGS mode for an outlet in a given month.
 *
 * PHYSICAL applies only when the outlet's settings row exists with
 * cogs_mode = 'PHYSICAL' AND physical_cogs_start_date is set AND the
 * requested month's first day is >= the first day of the cutover month.
 * Everything else (no row, PERIODIC, NULL start date, earlier month)
 * resolves to PERIODIC, so history can never silently switch.
 */
export const resolveOutletCogsMode = async ({ outletId, month, year }) => {
  const base = { mode: 'PERIODIC', cogs_mode_setting: null, physical_cogs_start_date: null };
  if (!outletId) return base;

  const rows = await query(
    'SELECT cogs_mode, physical_cogs_start_date FROM outlet_cogs_settings WHERE outlet_id = ?',
    [outletId]
  );
  if (rows.length === 0) return base;

  const { cogs_mode, physical_cogs_start_date } = rows[0];
  base.cogs_mode_setting = cogs_mode;
  base.physical_cogs_start_date = physical_cogs_start_date;

  if (cogs_mode !== 'PHYSICAL' || !physical_cogs_start_date) return base;

  // Whole-month granularity: PHYSICAL applies to the month containing the
  // start date and every month after it.
  const sd = new Date(physical_cogs_start_date);
  if (Number.isNaN(sd.getTime())) return base;
  const cutoverMonthStart = new Date(sd.getFullYear(), sd.getMonth(), 1);
  const periodMonthStart = new Date(Number(year), Number(month) - 1, 1);

  return periodMonthStart >= cutoverMonthStart ? { ...base, mode: 'PHYSICAL' } : base;
};

/**
 * Physical COGS components + structural readiness for one outlet/period.
 * All movement values come from getHybridCogsReconciliation's audited
 * classification - nothing is re-derived here.
 */
export const getPhysicalCogs = async ({ outletId, month, year, outletScope = null }) => {
  if (!outletId) throw httpError('outlet_id is required for physical COGS', 400);

  const recon = await getHybridCogsReconciliation({ outletId, month, year, outletScope });
  const p = recon.physical;

  // Net of out-direction consumption minus in-direction controlled reversals
  // (Phase 6A9 reversal rows post as OUTLET_CONSUMPTION qty_in/value_in on the
  // same class). Ordinary postings never carry in-direction value on this
  // class, so on non-reversed periods value_in is 0 and this is identical to
  // the pre-6A9 figure.
  const outletConsumptionCogs = num(p.outlet_consumption.value_out) - num(p.outlet_consumption.value_in);
  const wastageCost = num(p.wastage.value_out);
  // Net adjustment variance: negative adjustments + physical-count shortfalls
  // are costs (out direction); positive adjustments / count overages are
  // credits (in direction). Net positive = shrinkage cost.
  const adjustmentVariance =
    num(p.adjustment_negative.value_out) + num(p.physical_count_adjustment.value_out)
    - num(p.adjustment_positive.value_in) - num(p.physical_count_adjustment.value_in);

  const consumptionModel = p.consumption.model; // EXPLICIT | INCOMPLETE
  const hasPhysicalData = recon.data_state !== 'DATA_LIMITED';
  const unvaluedRows = num(p.consumption.unvalued_rows)
    + num(p.opening.unvalued_rows) + num(p.closing.unvalued_rows)
    + num(p.external_receipts.unvalued_rows) + num(p.internal_transfer_in.unvalued_rows)
    + num(p.internal_transfer_out.unvalued_rows) + num(p.production_issue.unvalued_rows)
    + num(p.production_receipt.unvalued_rows) + num(p.purchase_return.unvalued_rows)
    + num(p.wastage.unvalued_rows) + num(p.adjustment_positive.unvalued_rows)
    + num(p.adjustment_negative.unvalued_rows) + num(p.physical_count_adjustment.unvalued_rows)
    + num(p.other.unvalued_rows) + num(p.opening_movement.unvalued_rows);
  const residual = num(p.unexplained_residual_value);

  // Objective readiness gate - nothing is fabricated.
  const reasons = [];
  if (!hasPhysicalData) reasons.push('NO_PHYSICAL_DATA');
  if (consumptionModel !== 'EXPLICIT') reasons.push('NO_POSTED_OUTLET_CONSUMPTION');
  if (unvaluedRows > 0) reasons.push('UNVALUED_MOVEMENTS');
  if (Math.abs(residual) >= 0.01) reasons.push('UNEXPLAINED_RESIDUAL');

  const readiness =
    !hasPhysicalData || consumptionModel !== 'EXPLICIT'
      ? 'PHYSICAL_BLOCKED'
      : unvaluedRows > 0 || Math.abs(residual) >= 0.01
        ? 'PHYSICAL_PARTIAL'
        : 'PHYSICAL_READY';

  return {
    outlet_id: Number(outletId),
    month: Number(month),
    year: Number(year),
    // The one official physical COGS figure: posted outlet consumption only.
    physical_cogs_total: round2(outletConsumptionCogs),
    components: {
      outlet_consumption_cogs: round2(outletConsumptionCogs),
      wastage_cost: round2(wastageCost),
      adjustment_variance: round2(adjustmentVariance),
    },
    diagnostics: {
      production_issue_value: round2(num(p.production_issue.value_out)),
      production_receipt_value: round2(num(p.production_receipt.value_in)),
      internal_transfer_in: round2(num(p.internal_transfer_in.value_in)),
      internal_transfer_out: round2(num(p.internal_transfer_out.value_out)),
      purchase_return_value: round2(num(p.purchase_return.value_out)),
      external_receipts: round2(num(p.external_receipts.value_in)),
      physical_opening_value: round2(num(p.opening.value)),
      physical_closing_value: round2(num(p.closing.value)),
      unexplained_residual_value: residual,
      consumption_model: consumptionModel,
      consumption_rows: num(p.consumption.rows),
    },
    valuation_state: p.valuation_state,
    physical_cogs_state: p.physical_cogs_state,
    readiness,
    readiness_reasons: reasons,
    note: 'physical_cogs_total = Posted OUTLET_CONSUMPTION only. Wastage and adjustment variance are separate P&L lines, never inside COGS. Production issue/receipt and internal transfers are inventory transformation - never company COGS.',
  };
};

/**
 * Read the raw settings row (for the settings endpoint response).
 */
export const getCogsSettings = async ({ outletId }) => {
  const rows = await query(
    `SELECT o.id AS outlet_id, o.outlet_name, s.cogs_mode, s.physical_cogs_start_date,
            s.updated_by, s.updated_at
     FROM outlets o
     LEFT JOIN outlet_cogs_settings s ON s.outlet_id = o.id
     ${outletId ? 'WHERE o.id = ?' : ''}
     ORDER BY o.outlet_name`,
    outletId ? [outletId] : []
  );
  return rows.map((r) => ({
    outlet_id: r.outlet_id,
    outlet_name: r.outlet_name,
    cogs_mode: r.cogs_mode || 'PERIODIC',
    physical_cogs_start_date: r.physical_cogs_start_date,
    updated_by: r.updated_by,
    updated_at: r.updated_at,
  }));
};

/**
 * Upsert the outlet COGS mode. PHYSICAL requires a cutover date - without
 * one the mode can never activate, so storing PHYSICAL+NULL would be a
 * meaningless half-state; reject it instead.
 */
export const setCogsSettings = async ({ outletId, cogsMode, physicalCogsStartDate, userId }) => {
  if (!outletId) throw httpError('outlet_id is required', 400);
  const mode = String(cogsMode || '').toUpperCase();
  if (!['PERIODIC', 'PHYSICAL'].includes(mode)) {
    throw httpError("cogs_mode must be 'PERIODIC' or 'PHYSICAL'", 400);
  }
  if (mode === 'PHYSICAL' && !physicalCogsStartDate) {
    throw httpError('physical_cogs_start_date is required when switching to PHYSICAL mode', 400);
  }
  if (physicalCogsStartDate) {
    const d = new Date(physicalCogsStartDate);
    if (Number.isNaN(d.getTime())) throw httpError('physical_cogs_start_date is not a valid date', 400);
  }

  const outlet = await query('SELECT id FROM outlets WHERE id = ?', [outletId]);
  if (outlet.length === 0) throw httpError('Outlet not found', 404);

  await query(
    `INSERT INTO outlet_cogs_settings (outlet_id, cogs_mode, physical_cogs_start_date, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       cogs_mode = VALUES(cogs_mode),
       physical_cogs_start_date = VALUES(physical_cogs_start_date),
       updated_by = VALUES(updated_by)`,
    [outletId, mode, mode === 'PHYSICAL' ? physicalCogsStartDate : null, userId, userId]
  );

  const [saved] = await getCogsSettings({ outletId });
  return saved;
};

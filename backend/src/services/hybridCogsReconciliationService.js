import { query } from '../config/database.js';
import { getOutletPL } from './plCalculator.js';
import { getTheoreticalConsumption } from './consumptionService.js';

// Phase 6A6 - HYBRID COGS reconciliation.
//
// READ-ONLY diagnostics. Two values are produced side by side and are NEVER
// merged:
//
//   A. FINANCIAL COGS (official P&L)
//      Verified Opening + Effective Purchases - Verified Closing, exactly as
//      getOutletPL() computes it. Nothing here changes that formula or feeds
//      anything back into it.
//
//   B. PHYSICAL COGS / physical consumption value (management reconciliation)
//      Movement-classified stock_ledger values for locations mapped to the
//      outlet via locations.outlet_id. Ledger value columns are NOT NULL, so
//      an "unvalued" movement is a row with quantity but zero recorded value;
//      such rows surface as PARTIAL valuation - the service never invents a
//      cost for them.
//
// No writes, no accounting_effects, no auto-posting of wastage/adjustment/
// variance. plCalculator, supplierLedgerService and the 6A3/6A4 purchase and
// credit rules are untouched.

const num = (value) => Number(value || 0);
const round2 = (n) => Math.round(n * 100) / 100;

const httpError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const monthRange = (month, year) => {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
  const priorEnd = new Date(year, month - 1, 0);
  const priorEndDate = priorEnd.toISOString().slice(0, 10);
  return { startDate, endDate, priorEndDate };
};

// Canonical stock-ledger transaction_type -> movement class.
// TRANSIT_DAMAGE / TRANSIT_SHORT are informational and excluded from
// balances by canonical getCurrentStock() - reported separately, never in
// any equation.
const MOVEMENT_CLASS = {
  OPENING: 'OPENING',
  GRN: 'EXTERNAL_RECEIPT',
  PURCHASE_GRN: 'EXTERNAL_RECEIPT',
  TRANSFER_IN: 'INTERNAL_TRANSFER_IN',
  TRANSFER_OUT: 'INTERNAL_TRANSFER_OUT',
  PRODUCTION_ISSUE: 'PRODUCTION_ISSUE',
  PRODUCTION_RECEIPT: 'PRODUCTION_RECEIPT',
  PURCHASE_RETURN: 'PURCHASE_RETURN',
  WASTAGE: 'WASTAGE',
  ADJUSTMENT_POSITIVE: 'ADJUSTMENT_POSITIVE',
  ADJUSTMENT_NEGATIVE: 'ADJUSTMENT_NEGATIVE',
  PHYSICAL_ADJUSTMENT: 'PHYSICAL_COUNT_ADJUSTMENT',
  OUTLET_CONSUMPTION: 'OUTLET_CONSUMPTION',
  TRANSIT_SHORT: 'INFORMATIONAL',
  TRANSIT_DAMAGE: 'INFORMATIONAL',
};

// Movement classes that count as physical consumption candidates.
// OUTLET_CONSUMPTION (Phase 6A7) is the explicit controlled sales-consumption
// channel - Posted outlet_consumptions documents only. Its presence upgrades
// the consumption model from INCOMPLETE to EXPLICIT; it is never synthesized
// from sales data.
const CONSUMPTION_CLASSES = new Set(['WASTAGE', 'ADJUSTMENT_NEGATIVE', 'PHYSICAL_COUNT_ADJUSTMENT', 'PRODUCTION_ISSUE', 'OUTLET_CONSUMPTION']);
const EXCLUDED_TYPES = new Set(['TRANSIT_DAMAGE', 'TRANSIT_SHORT']);

export const getHybridCogsReconciliation = async ({ outletId, month, year, outletScope = null }) => {
  if (!outletId) throw httpError('outlet_id is required', 400);
  if (!month || !year) throw httpError('month and year are required', 400);

  if (outletScope && !outletScope.all) {
    const allowed = (outletScope.outletIds || []).map(Number);
    if (!allowed.includes(Number(outletId))) {
      throw httpError('You do not have access to the requested outlet', 403);
    }
  }

  const { startDate, endDate, priorEndDate } = monthRange(Number(month), Number(year));

  // ---------- A. FINANCIAL SIDE (official P&L - unchanged formula) ----------
  const pl = await getOutletPL({ outletId: Number(outletId), month: Number(month), year: Number(year) });
  const financial = {
    opening_stock: num(pl.cost_of_goods.opening_stock),
    effective_purchases: num(pl.cost_of_goods.purchases),
    verified_closing_stock: num(pl.cost_of_goods.closing_stock),
    financial_cogs: num(pl.cost_of_goods.actual_consumption),
    rule: 'Verified Opening + Effective Purchases - Verified Closing (unchanged)',
  };

  // ---------- B. PHYSICAL SIDE ----------
  const locations = await query('SELECT id, location_name, location_type, outlet_id FROM locations');
  const locById = Object.fromEntries(locations.map((l) => [l.id, l]));
  const outletLocations = locations.filter((l) => l.outlet_id !== null && Number(l.outlet_id) === Number(outletId));
  const outletLocIds = outletLocations.map((l) => l.id);

  // Movement aggregation in period for the outlet's mapped locations.
  // in/out are tracked separately - some types (PHYSICAL_COUNT_ADJUSTMENT,
  // OTHER) can legitimately carry either direction.
  const zeroBucket = () => ({ qty_in: 0, qty_out: 0, value_in: 0, value_out: 0, rows: 0, unvalued_rows: 0 });
  const classes = {};
  for (const c of new Set(Object.values(MOVEMENT_CLASS))) classes[c] = zeroBucket();

  let unownedActivity = [];
  if (outletLocIds.length > 0) {
    const placeholders = outletLocIds.map(() => '?').join(',');
    const rows = await query(
      `SELECT location_id, transaction_type,
              COALESCE(SUM(qty_in),0) AS qty_in, COALESCE(SUM(qty_out),0) AS qty_out,
              COALESCE(SUM(value_in),0) AS value_in, COALESCE(SUM(value_out),0) AS value_out,
              SUM(CASE WHEN (qty_in > 0 AND COALESCE(value_in,0) = 0) OR (qty_out > 0 AND COALESCE(value_out,0) = 0) THEN 1 ELSE 0 END) AS unvalued_rows,
              COUNT(*) AS row_count
       FROM stock_ledger
       WHERE location_id IN (${placeholders}) AND transaction_date BETWEEN ? AND ?
       GROUP BY location_id, transaction_type`,
      [...outletLocIds, startDate, endDate]
    );
    for (const r of rows) {
      const cls = MOVEMENT_CLASS[r.transaction_type] || 'OTHER';
      const b = classes[cls] || (classes.OTHER = classes.OTHER || zeroBucket());
      b.qty_in += num(r.qty_in); b.qty_out += num(r.qty_out);
      b.value_in += num(r.value_in); b.value_out += num(r.value_out);
      b.rows += num(r.row_count);
      b.unvalued_rows += num(r.unvalued_rows);
    }
  }

  // Unowned/central activity for the same period (diagnostic, never allocated).
  const unownedLocs = locations.filter((l) => l.outlet_id === null);
  for (const loc of unownedLocs) {
    const rows = await query(
      `SELECT transaction_type,
              COALESCE(SUM(qty_in),0) AS qty_in, COALESCE(SUM(qty_out),0) AS qty_out,
              COALESCE(SUM(value_in),0) AS value_in, COALESCE(SUM(value_out),0) AS value_out
       FROM stock_ledger
       WHERE location_id = ? AND transaction_date BETWEEN ? AND ?
         AND transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT')
       GROUP BY transaction_type`,
      [loc.id, startDate, endDate]
    );
    for (const r of rows) {
      unownedActivity.push({
        location_id: loc.id, location_name: loc.location_name, location_type: loc.location_type,
        transaction_type: r.transaction_type,
        qty_in: num(r.qty_in), qty_out: num(r.qty_out),
        value_in: num(r.value_in), value_out: num(r.value_out),
        note: 'central/unowned - never allocated to an outlet',
      });
    }
  }

  // Physical opening/closing balances (qty + value) for outlet locations.
  const balanceFor = async (locId, asOf) => {
    const [r] = await query(
      `SELECT COALESCE(SUM(CASE WHEN transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN qty_in ELSE 0 END),0)
            - COALESCE(SUM(CASE WHEN transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN qty_out ELSE 0 END),0) AS qty,
              COALESCE(SUM(CASE WHEN transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN value_in ELSE 0 END),0)
            - COALESCE(SUM(CASE WHEN transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN value_out ELSE 0 END),0) AS value,
              SUM(CASE WHEN transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT')
                   AND ((qty_in > 0 AND COALESCE(value_in,0) = 0) OR (qty_out > 0 AND COALESCE(value_out,0) = 0)) THEN 1 ELSE 0 END) AS unvalued_rows
       FROM stock_ledger WHERE location_id = ? AND transaction_date <= ?`,
      [locId, asOf]
    );
    return { qty: num(r.qty), value: num(r.value), unvalued_rows: num(r.unvalued_rows) };
  };

  let physicalOpening = { qty: 0, value: 0, unvalued_rows: 0 };
  let physicalClosing = { qty: 0, value: 0, unvalued_rows: 0 };
  for (const locId of outletLocIds) {
    const o = await balanceFor(locId, priorEndDate);
    const c = await balanceFor(locId, endDate);
    physicalOpening.qty += o.qty; physicalOpening.value += o.value; physicalOpening.unvalued_rows += o.unvalued_rows;
    physicalClosing.qty += c.qty; physicalClosing.value += c.value; physicalClosing.unvalued_rows += c.unvalued_rows;
  }

  // ---------- physical equation ----------
  // Every non-informational type participates: in-direction rows raise the
  // balance, out-direction rows lower it. INFORMATIONAL (TRANSIT_*) rows are
  // excluded exactly as canonical getCurrentStock() excludes them.
  const ins = Object.entries(classes)
    .filter(([c]) => c !== 'INFORMATIONAL')
    .reduce((s, [, b]) => s + b.value_in, 0);
  const outs = Object.entries(classes)
    .filter(([c]) => c !== 'INFORMATIONAL')
    .reduce((s, [, b]) => s + b.value_out, 0);
  const expectedClosingValue = physicalOpening.value + ins - outs;
  const unexplainedResidualValue = round2(physicalClosing.value - expectedClosingValue);

  // ---------- physical consumption (diagnostic) ----------
  // Out-direction value of consumption-class movements only - a positive
  // count adjustment is an adjustment, not consumption.
  const consumptionClasses = [...CONSUMPTION_CLASSES];
  const consumptionRows = consumptionClasses.reduce((s, c) => s + num(classes[c].rows), 0);
  const consumptionUnvalued = consumptionClasses.reduce((s, c) => s + num(classes[c].unvalued_rows), 0);
  const consumptionValue = consumptionClasses.reduce((s, c) => s + num(classes[c].value_out), 0);
  const hasConsumptionActivity = consumptionRows > 0;
  const outletConsumptionRows = num(classes.OUTLET_CONSUMPTION?.rows);

  // EXPLICIT once at least one Posted outlet_consumptions document has written
  // OUTLET_CONSUMPTION rows in the period - the structural gap (no sales-
  // consumption transaction type) is closed by an explicit controlled posting,
  // never by deriving usage from sales. Whether the Posted documents cover
  // every sales day cannot be verified, so EXPLICIT is the ceiling here -
  // the model never claims full coverage.
  const physicalConsumptionModel = outletConsumptionRows > 0 ? 'EXPLICIT' : 'INCOMPLETE';

  const totalUnvalued =
    physicalOpening.unvalued_rows + physicalClosing.unvalued_rows +
    Object.values(classes).reduce((s, c) => s + c.unvalued_rows, 0);

  const anyPhysicalData =
    outletLocIds.length > 0 &&
    (physicalOpening.qty !== 0 || physicalClosing.qty !== 0 ||
     Object.values(classes).some((c) => c.rows > 0));

  // physical_diagnostic_cogs = deterministic physical consumption value.
  // Only meaningful where consumption-class movements exist and are valued;
  // otherwise reported as null rather than fabricated.
  const physicalDiagnosticCogs = hasConsumptionActivity && consumptionUnvalued === 0
    ? round2(consumptionValue)
    : hasConsumptionActivity && consumptionValue > 0
      ? round2(consumptionValue)
      : null;

  const valuationState = !anyPhysicalData
    ? 'UNAVAILABLE'
    : totalUnvalued > 0
      ? 'PARTIAL'
      : 'COMPLETE';

  const physicalCogsState = !anyPhysicalData
    ? 'INCOMPLETE'
    : (physicalConsumptionModel === 'INCOMPLETE' || totalUnvalued > 0)
      ? 'PARTIAL'
      : 'COMPLETE';

  const cogsVariance = physicalDiagnosticCogs !== null
    ? round2(physicalDiagnosticCogs - financial.financial_cogs)
    : null;

  // ---------- variance classification ----------
  let classification;
  if (!anyPhysicalData) classification = 'FINANCIAL_ONLY';
  else if (physicalConsumptionModel === 'INCOMPLETE' && !hasConsumptionActivity) classification = 'MISSING_PHYSICAL_CONSUMPTION';
  else if (totalUnvalued > 0) classification = 'VALUATION_INCOMPLETE';
  else if (physicalCogsState === 'PARTIAL') classification = 'PHYSICAL_PARTIAL';
  else if (physicalDiagnosticCogs !== null && Math.abs(cogsVariance) < 0.005) classification = 'PHYSICAL_COMPLETE_MATCH';
  else classification = 'PHYSICAL_COMPLETE_VARIANCE';

  // ---------- company-level transfer semantics ----------
  const companyTransfers = await query(
    `SELECT transaction_type,
            COALESCE(SUM(value_in),0) AS value_in, COALESCE(SUM(value_out),0) AS value_out
     FROM stock_ledger
     WHERE transaction_date BETWEEN ? AND ? AND transaction_type IN ('TRANSFER_IN','TRANSFER_OUT')
     GROUP BY transaction_type`,
    [startDate, endDate]
  );
  const tIn = num((companyTransfers.find((r) => r.transaction_type === 'TRANSFER_IN') || {}).value_in);
  const tOut = num((companyTransfers.find((r) => r.transaction_type === 'TRANSFER_OUT') || {}).value_out);

  // ---------- theoretical consumption (separate metric, never merged) ----------
  let theoretical = null;
  try {
    const t = await getTheoreticalConsumption({ outletId: Number(outletId), month: Number(month), year: Number(year) });
    const items = Array.isArray(t) ? t : (t.items || t.materials || []);
    theoretical = {
      separate_metric: true,
      item_count: items.length,
      note: 'Theoretical consumption from Verified item sales + recipes - shown side-by-side only, never merged into either COGS value',
    };
  } catch {
    theoretical = { separate_metric: true, item_count: null, note: 'theoretical consumption unavailable for this period' };
  }

  const bucket = (name) => ({
    qty_in: round2(num(classes[name]?.qty_in)),
    qty_out: round2(num(classes[name]?.qty_out)),
    value_in: round2(num(classes[name]?.value_in)),
    value_out: round2(num(classes[name]?.value_out)),
    rows: num(classes[name]?.rows),
    unvalued_rows: num(classes[name]?.unvalued_rows),
  });

  return {
    read_only: true,
    disclaimer: 'HYBRID COGS RECONCILIATION - financial COGS remains the official P&L figure; physical values are management diagnostics only and are never posted.',
    params: { outlet_id: Number(outletId), month: Number(month), year: Number(year), from_date: startDate, to_date: endDate },
    financial,
    physical: {
      opening: { qty: round2(physicalOpening.qty), value: round2(physicalOpening.value), unvalued_rows: physicalOpening.unvalued_rows },
      external_receipts: bucket('EXTERNAL_RECEIPT'),
      internal_transfer_in: bucket('INTERNAL_TRANSFER_IN'),
      internal_transfer_out: bucket('INTERNAL_TRANSFER_OUT'),
      production_receipt: bucket('PRODUCTION_RECEIPT'),
      production_issue: bucket('PRODUCTION_ISSUE'),
      purchase_return: bucket('PURCHASE_RETURN'),
      wastage: bucket('WASTAGE'),
      outlet_consumption: bucket('OUTLET_CONSUMPTION'),
      adjustment_positive: bucket('ADJUSTMENT_POSITIVE'),
      adjustment_negative: bucket('ADJUSTMENT_NEGATIVE'),
      physical_count_adjustment: bucket('PHYSICAL_COUNT_ADJUSTMENT'),
      opening_movement: bucket('OPENING'),
      informational_transit: bucket('INFORMATIONAL'),
      other: bucket('OTHER'),
      closing: { qty: round2(physicalClosing.qty), value: round2(physicalClosing.value), unvalued_rows: physicalClosing.unvalued_rows },
      expected_closing_value: round2(expectedClosingValue),
      unexplained_residual_value: unexplainedResidualValue,
      consumption: {
        model: physicalConsumptionModel,
        classes: consumptionClasses,
        value: hasConsumptionActivity ? round2(consumptionValue) : null,
        rows: consumptionRows,
        unvalued_rows: consumptionUnvalued,
        note: 'Value shown is explicitly posted physical movements (wastage/adjustment/production-issue/OUTLET_CONSUMPTION). Sales uploads never deduct stock automatically - consumption requires a Posted outlet_consumptions document.',
      },
      diagnostic_cogs: physicalDiagnosticCogs,
      valuation_state: valuationState,
      physical_cogs_state: physicalCogsState,
    },
    company_level: {
      transfer_in_value: round2(tIn),
      transfer_out_value: round2(tOut),
      net_pnl_effect: 0,
      note: 'Internal transfers net to zero at company level - never an external purchase or sale',
    },
    cogs_variance: cogsVariance,
    classification,
    theoretical_consumption: theoretical,
    unowned_physical_activity: unownedActivity,
    data_state: !anyPhysicalData ? 'DATA_LIMITED' : physicalCogsState === 'PARTIAL' ? 'PHYSICAL_INCOMPLETE' : 'OK',
  };
};

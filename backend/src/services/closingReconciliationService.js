import { query } from '../config/database.js';
import { findConversionFactor } from '../utils/uomUtils.js';

// Phase 6A5 - HYBRID closing-stock reconciliation + month-close readiness.
//
// READ-ONLY diagnostics. The FINANCIAL closing source is unchanged:
//   closing_stock_uploads.status='Completed' AND approval_status='Verified'
// Physical stock_ledger balances are used ONLY to compare, surface
// variance, expose unresolved physical conditions and decide month-close
// readiness. Nothing here writes, nothing here feeds plCalculator - COGS
// remains Opening + Effective Purchases - Verified Accounting Closing.
//
// Ownership rule is the same one the 6A2 shadow report and the 6A3 bridge
// use: a physical row maps to an accounting outlet only through
// locations.outlet_id. NULL-outlet locations (Central Warehouse / Central
// Kitchen) land in the unowned bucket - never allocated, never guessed.

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const QTY_EPSILON = 0.0005;
// Transit damage/short rows record stock that never became usable - the
// same exclusion getCurrentStock/getOutletReconciliation already apply.
const NON_STOCK_TYPES = ['TRANSIT_DAMAGE', 'TRANSIT_SHORT'];

const httpError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const monthBounds = (year, month) => ({
  fromDate: `${year}-${String(month).padStart(2, '0')}-01`,
  toDate: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
});

/**
 * @param {object} opts
 * @param {number} opts.outletId  required accounting outlet
 * @param {number} [opts.month]   with opts.year - the P&L bucket
 * @param {number} [opts.year]
 * @param {string} [opts.toDate]  alternative: derive month/year from a YYYY-MM-DD cutoff
 * @param {object} [opts.outletScope] req.outletScope from applyOutletScope
 */
export const getClosingReconciliation = async ({ outletId, month = null, year = null, toDate = null, outletScope = null }) => {
  if (!outletId) throw httpError('outlet_id is required');

  if (!(month && year)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(toDate || '').trim());
    if (!m) throw httpError('Provide month+year or a to_date in YYYY-MM-DD format');
    year = Number(m[1]); month = Number(m[2]);
  }
  month = Number(month); year = Number(year);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) throw httpError('Invalid month/year');
  const { fromDate, toDate: endDate } = monthBounds(year, month);

  if (outletScope && !outletScope.all) {
    const allowed = (outletScope.outletIds || []).map(Number);
    if (!allowed.includes(Number(outletId))) {
      throw httpError('You do not have access to the requested outlet', 403);
    }
  }

  const outlet = (await query('SELECT id, outlet_code, outlet_name FROM outlets WHERE id = ? LIMIT 1', [outletId]))[0];
  if (!outlet) throw httpError('Outlet not found', 404);

  // Every active location owned by this outlet contributes to its physical
  // side; NULL-outlet locations are never pulled in.
  const mappedLocations = await query(
    'SELECT id, location_name, location_type FROM locations WHERE outlet_id = ? AND is_active = 1',
    [outletId]
  );
  const locationIds = mappedLocations.map((l) => Number(l.id));
  const locIn = locationIds.length ? `(${locationIds.join(',')})` : '(NULL)';

  // ---------------- PHYSICAL CLOSING (canonical ledger balance) ----------------
  const physicalRows = locationIds.length
    ? await query(
        `SELECT sl.raw_material_id, rm.material_name, rm.material_code, rm.unit_id AS base_unit_id, bu.unit_name AS base_unit_name,
                COALESCE(SUM(sl.qty_in),0) - COALESCE(SUM(sl.qty_out),0) AS physical_qty,
                COALESCE(SUM(sl.value_in),0) - COALESCE(SUM(sl.value_out),0) AS physical_value
         FROM stock_ledger sl
         LEFT JOIN raw_materials rm ON rm.id = sl.raw_material_id
         LEFT JOIN units bu ON bu.id = rm.unit_id
         WHERE sl.location_id IN ${locIn} AND sl.transaction_date <= ?
           AND sl.transaction_type NOT IN ('${NON_STOCK_TYPES.join("','")}')
         GROUP BY sl.raw_material_id, rm.material_name, rm.material_code, rm.unit_id, bu.unit_name`,
        [endDate]
      )
    : [];
  const physicalByMaterial = new Map(physicalRows.map((r) => [Number(r.raw_material_id), r]));

  // ---------------- ACCOUNTING CLOSING (Completed + Verified only) ----------------
  const verifiedUploads = await query(
    `SELECT id, batch_id, month, year, status, approval_status
     FROM closing_stock_uploads
     WHERE outlet_id = ? AND month = ? AND year = ? AND status = 'Completed' AND approval_status = 'Verified'
     ORDER BY id DESC`,
    [outletId, month, year]
  );
  const accountingRows = verifiedUploads.length
    ? await query(
        `SELECT csi.raw_material_id, csi.raw_material_name, csi.qty, csi.unit_id, csi.value,
                rm.material_name, rm.unit_id AS base_unit_id, bu.unit_name AS base_unit_name
         FROM closing_stock_items csi
         INNER JOIN closing_stock_uploads csu ON csi.upload_id = csu.id
         LEFT JOIN raw_materials rm ON rm.id = csi.raw_material_id
         LEFT JOIN units bu ON bu.id = rm.unit_id
         WHERE csi.outlet_id = ? AND csu.status = 'Completed' AND csu.approval_status = 'Verified'
           AND csu.month = ? AND csu.year = ?`,
        [outletId, month, year]
      )
    : [];

  const accountingByMaterial = new Map();
  for (const row of accountingRows) {
    const key = row.raw_material_id === null ? `name:${row.raw_material_name}` : Number(row.raw_material_id);
    if (!accountingByMaterial.has(key)) {
      accountingByMaterial.set(key, { raw_material_id: row.raw_material_id, material_name: row.material_name || row.raw_material_name, base_unit_id: row.base_unit_id || null, base_unit: row.base_unit_name || null, rows: [] });
    }
    accountingByMaterial.get(key).rows.push(row);
  }

  // Conversion factors cached; a miss means non-comparable, never fake-zero.
  const factorCache = new Map();
  const factor = async (fromU, toU) => {
    const k = `${fromU}->${toU}`;
    if (!factorCache.has(k)) {
      try { factorCache.set(k, await findConversionFactor(fromU, toU)); }
      catch { factorCache.set(k, null); }
    }
    return factorCache.get(k);
  };

  const materialKeys = new Set([...accountingByMaterial.keys(), ...physicalByMaterial.keys()]);
  const materials = [];
  let varianceRowCount = 0;
  for (const key of materialKeys) {
    const acc = accountingByMaterial.get(key) || null;
    const phys = physicalByMaterial.get(key) || null;
    const baseUnitId = acc?.base_unit_id || phys?.base_unit_id || null;

    let accountingQty = null, accountingValue = null, accountingNote = null;
    if (acc) {
      accountingValue = acc.rows.reduce((s, r) => s + num(r.value), 0);
      if (!baseUnitId) accountingNote = 'Material has no base unit configured';
      else {
        let total = 0, failed = false;
        for (const r of acc.rows) {
          if (!r.unit_id) { failed = true; accountingNote = 'Upload row has no unit'; break; }
          const f = await factor(r.unit_id, baseUnitId);
          if (f === null) { failed = true; accountingNote = 'No UOM conversion to base unit'; break; }
          total += num(r.qty) * f;
        }
        if (!failed) accountingQty = total;
      }
    }

    const physicalQty = phys ? num(phys.physical_qty) : null;
    const physicalValue = phys ? num(phys.physical_value) : null;
    const mapping_state = acc && phys ? 'BOTH_SIDES' : acc ? 'ACCOUNTING_ONLY' : 'PHYSICAL_ONLY';
    const comparable = accountingQty !== null && physicalQty !== null;
    const qtyVariance = comparable ? physicalQty - accountingQty : null;
    const valueVariance = accountingValue !== null && physicalValue !== null ? physicalValue - accountingValue : null;
    const hasVariance = qtyVariance !== null
      ? Math.abs(qtyVariance) > QTY_EPSILON
      : (mapping_state !== 'BOTH_SIDES'); // one-sided rows are themselves variance
    if (hasVariance) varianceRowCount++;

    materials.push({
      raw_material_id: acc?.raw_material_id ?? phys?.raw_material_id ?? null,
      material_name: acc?.material_name || phys?.material_name || 'Unknown material',
      base_unit: acc?.base_unit || phys?.base_unit || null,
      physical_qty: physicalQty === null ? null : num(physicalQty.toFixed(4)),
      accounting_qty: accountingQty === null ? null : num(accountingQty.toFixed(4)),
      qty_variance: qtyVariance === null ? null : num(qtyVariance.toFixed(4)),
      physical_value: physicalValue,
      physical_value_state: phys ? 'AVAILABLE' : 'UNAVAILABLE',
      accounting_value: accountingValue,
      value_variance: valueVariance === null ? null : num(valueVariance.toFixed(4)),
      mapping_state,
      note: accountingNote || (mapping_state === 'BOTH_SIDES' ? null : mapping_state === 'PHYSICAL_ONLY'
        ? 'Physical ledger balance with no Verified accounting closing row'
        : 'Verified accounting closing row with no physical ledger activity'),
    });
  }
  materials.sort((a, b) => String(a.material_name).localeCompare(String(b.material_name)));

  // ---------------- LATEST VERIFIED PHYSICAL COUNTS ----------------
  // Posted/Locked counts are surfaced side-by-side with the ledger balance.
  // They NEVER replace the ledger - count_vs_ledger is a diagnostic only.
  const counts = locationIds.length
    ? await query(
        `SELECT pci.raw_material_id, rm.material_name, pc.id AS count_id, pc.count_no, pc.count_date, pc.status, pc.location_id,
                l.location_name,
                pci.system_qty, pci.counted_qty, pci.variance_qty, pci.variance_value
         FROM physical_stock_count_items pci
         JOIN physical_stock_counts pc ON pc.id = pci.physical_count_id
         LEFT JOIN raw_materials rm ON rm.id = pci.raw_material_id
         LEFT JOIN locations l ON l.id = pc.location_id
         WHERE pc.location_id IN ${locIn} AND pc.status IN ('Posted','Locked') AND pc.count_date <= ?
         ORDER BY pci.raw_material_id, pc.count_date DESC, pc.id DESC`,
        [endDate]
      )
    : [];
  const latestCountByMaterial = new Map();
  for (const c of counts) {
    const k = Number(c.raw_material_id);
    if (!latestCountByMaterial.has(k)) latestCountByMaterial.set(k, c); // ordered: first row is latest
  }
  const physicalCounts = [...latestCountByMaterial.values()].map((c) => {
    const phys = physicalByMaterial.get(Number(c.raw_material_id));
    const ledgerQty = phys ? num(phys.physical_qty) : null;
    return {
      raw_material_id: c.raw_material_id, material_name: c.material_name,
      count_id: c.count_id, count_no: c.count_no, count_date: c.count_date, status: c.status,
      location_id: c.location_id, location_name: c.location_name,
      system_qty: num(c.system_qty), counted_qty: num(c.counted_qty),
      variance_qty: num(c.variance_qty), variance_value: num(c.variance_value),
      ledger_closing_qty: ledgerQty,
      count_vs_ledger_variance: ledgerQty === null ? null : num((num(c.counted_qty) - ledgerQty).toFixed(4)),
    };
  });

  // ---------------- UNRESOLVED PHYSICAL CONDITIONS ----------------
  // Objective pending-workflow inventory inside the period. Counts + refs,
  // no mutation, no judgement beyond "still open".
  const pending = async (label, table, dateCol, locCol, extraWhere = '') => {
    if (!locationIds.length) return { count: 0, refs: [] };
    const rows = await query(
      `SELECT id FROM ${table} WHERE ${locCol} IN ${locIn} AND ${dateCol} BETWEEN ? AND ? ${extraWhere} ORDER BY id LIMIT 50`,
      [fromDate, endDate]
    );
    return { count: rows.length, refs: rows.map((r) => r.id) };
  };
  const unresolved = {
    unposted_grns: await pending('grns', 'grn', 'grn_date', 'warehouse_location_id', `AND status != 'Posted'`),
    in_transit_transfers: locationIds.length
      ? {
          count: (await query(
            `SELECT id FROM stock_transfers WHERE (from_location_id IN ${locIn} OR to_location_id IN ${locIn})
               AND status IN ('In Transit','Partially Received') AND dispatch_date <= ? ORDER BY id LIMIT 50`,
            [endDate]
          )).length,
          refs: (await query(
            `SELECT id FROM stock_transfers WHERE (from_location_id IN ${locIn} OR to_location_id IN ${locIn})
               AND status IN ('In Transit','Partially Received') AND dispatch_date <= ? ORDER BY id LIMIT 50`,
            [endDate]
          )).map((r) => r.id),
        }
      : { count: 0, refs: [] },
    unposted_purchase_returns: await pending('returns', 'purchase_returns', 'return_date', 'warehouse_location_id', `AND status NOT IN ('Posted','Locked','Rejected')`),
    unposted_physical_counts: await pending('counts', 'physical_stock_counts', 'count_date', 'location_id', `AND status NOT IN ('Posted','Locked','Rejected')`),
    unposted_adjustments: await pending('adjustments', 'stock_adjustments', 'adjustment_date', 'location_id', `AND status NOT IN ('Posted','Locked','Rejected')`),
    unposted_wastage: await pending('wastage', 'warehouse_wastage', 'wastage_date', 'location_id', `AND status NOT IN ('Posted','Locked','Rejected')`),
    unposted_production_wastage: await pending('production wastage', 'production_wastage', 'wastage_date', 'central_kitchen_id', `AND status NOT IN ('Posted','Locked','Rejected')`),
    unposted_production_batches: await pending('production batches', 'production_batches', 'mfg_date', 'central_kitchen_id', `AND status NOT IN ('Posted','Completed','Cancelled','Rejected')`),
    draft_accounting_effects: {
      count: (await query(
        `SELECT id FROM accounting_effects WHERE outlet_id = ? AND status = 'Draft' AND effective_date BETWEEN ? AND ? ORDER BY id LIMIT 50`,
        [outletId, fromDate, endDate]
      )).length,
      refs: (await query(
        `SELECT id FROM accounting_effects WHERE outlet_id = ? AND status = 'Draft' AND effective_date BETWEEN ? AND ? ORDER BY id LIMIT 50`,
        [outletId, fromDate, endDate]
      )).map((r) => r.id),
    },
  };

  // ---------------- PURCHASE BRIDGE READINESS ----------------
  // Every Posted GRN in the period at this outlet's locations gets its
  // bridge lifecycle classified. A Posted GRN with NO accounting_effect is
  // LEGACY_NO_EFFECT by construction - the 6A3 bridge writes the Draft
  // effect inside the same post transaction, so absence can only mean the
  // GRN predates the bridge. Historical GRNs therefore can never block.
  const bridgeGrns = locationIds.length
    ? await query(
        `SELECT g.id AS grn_id, g.grn_no, g.grn_date, ae.id AS effect_id, ae.status AS effect_status, ae.outlet_id AS effect_outlet_id, ae.claim_upload_item_id
         FROM grn g
         LEFT JOIN accounting_effects ae ON ae.source_type = 'GRN' AND ae.source_id = g.id AND ae.effect_type = 'PURCHASE'
         WHERE g.status = 'Posted' AND g.warehouse_location_id IN ${locIn} AND g.grn_date BETWEEN ? AND ?
         ORDER BY g.id`,
        [fromDate, endDate]
      )
    : [];
  const purchaseBridge = bridgeGrns.map((r) => ({
    grn_id: r.grn_id, grn_no: r.grn_no, grn_date: r.grn_date,
    accounting_effect_id: r.effect_id,
    classification: !r.effect_id
      ? 'LEGACY_NO_EFFECT'
      : r.effect_outlet_id === null
        ? 'UNRESOLVED_OWNER'
        : r.effect_status === 'Posted'
          ? (r.claim_upload_item_id ? 'CLAIMED_POSTED_EFFECT' : 'POSTED_ACCOUNTING_EFFECT')
          : 'DRAFT_ACCOUNTING_EFFECT',
  }));
  const bridgeBlocking = purchaseBridge.filter((b) => b.classification === 'DRAFT_ACCOUNTING_EFFECT' || b.classification === 'UNRESOLVED_OWNER');

  // ---------------- UNOWNED / CENTRAL ACTIVITY ----------------
  const unowned = await query(
    `SELECT sl.location_id, l.location_name, l.location_type, sl.raw_material_id, rm.material_name,
            COALESCE(SUM(sl.qty_in),0) - COALESCE(SUM(sl.qty_out),0) AS net_qty,
            COALESCE(SUM(sl.value_in),0) - COALESCE(SUM(sl.value_out),0) AS net_value
     FROM stock_ledger sl
     JOIN locations l ON l.id = sl.location_id AND l.outlet_id IS NULL
     LEFT JOIN raw_materials rm ON rm.id = sl.raw_material_id
     WHERE sl.transaction_date BETWEEN ? AND ?
       AND sl.transaction_type NOT IN ('${NON_STOCK_TYPES.join("','")}')
     GROUP BY sl.location_id, l.location_name, l.location_type, sl.raw_material_id, rm.material_name`,
    [fromDate, endDate]
  );

  // ---------------- CLOSING UPLOAD STATE ----------------
  const anyUpload = await query(
    `SELECT id, status, approval_status FROM closing_stock_uploads
     WHERE outlet_id = ? AND month = ? AND year = ? ORDER BY id DESC LIMIT 1`,
    [outletId, month, year]
  );
  const closingUploadState = {
    verified_upload_exists: verifiedUploads.length > 0,
    verified_upload_ids: verifiedUploads.map((u) => u.id),
    latest_upload_state: anyUpload[0] ? `${anyUpload[0].status}/${anyUpload[0].approval_status}` : 'NONE',
  };

  // ---------------- READINESS ----------------
  const blockers = [];
  if (!closingUploadState.verified_upload_exists) {
    blockers.push({ code: 'NO_VERIFIED_CLOSING', detail: `No Completed+Verified closing stock upload for ${year}-${String(month).padStart(2, '0')} (latest: ${closingUploadState.latest_upload_state})` });
  }
  for (const b of bridgeBlocking) {
    blockers.push({ code: `BRIDGE_${b.classification}`, detail: `GRN ${b.grn_no} accounting effect is ${b.classification === 'DRAFT_ACCOUNTING_EFFECT' ? 'still Draft - pending accounting review' : 'unresolvable - no accounting outlet'}` });
  }
  const pendingGroups = [
    ['UNPOSTED_GRNS', unresolved.unposted_grns, 'unposted GRN(s)'],
    ['IN_TRANSIT_TRANSFERS', unresolved.in_transit_transfers, 'in-transit/partially received transfer(s)'],
    ['UNPOSTED_PURCHASE_RETURNS', unresolved.unposted_purchase_returns, 'unposted purchase return(s)'],
    ['UNPOSTED_PHYSICAL_COUNTS', unresolved.unposted_physical_counts, 'unposted physical count(s)'],
    ['UNPOSTED_ADJUSTMENTS', unresolved.unposted_adjustments, 'unposted stock adjustment(s)'],
    ['UNPOSTED_WASTAGE', unresolved.unposted_wastage, 'unposted wastage record(s)'],
    ['UNPOSTED_PRODUCTION_WASTAGE', unresolved.unposted_production_wastage, 'unposted production wastage'],
    ['UNPOSTED_PRODUCTION_BATCHES', unresolved.unposted_production_batches, 'unposted production batch(es)'],
    ['DRAFT_ACCOUNTING_EFFECTS', unresolved.draft_accounting_effects, 'Draft accounting effect(s) awaiting review'],
  ];
  for (const [code, group, label] of pendingGroups) {
    if (group.count > 0) blockers.push({ code, detail: `${group.count} ${label} (refs: ${group.refs.join(', ')})` });
  }

  const readinessStatus = blockers.length > 0 ? 'NOT_READY' : varianceRowCount > 0 ? 'READY_WITH_VARIANCE' : 'READY';

  // Phase 6A6: hybrid-COGS diagnostic state is attached to readiness as
  // advisory context only - a physical/financial COGS difference never
  // blocks readiness and never changes financial COGS.
  let hybridCogs = null;
  try {
    const { getHybridCogsReconciliation } = await import('./hybridCogsReconciliationService.js');
    const h = await getHybridCogsReconciliation({ outletId: Number(outletId), month, year });
    hybridCogs = {
      state: h.physical.physical_cogs_state,
      classification: h.classification,
      financial_cogs: h.financial.financial_cogs,
      physical_diagnostic_cogs: h.physical.diagnostic_cogs,
      cogs_variance: h.cogs_variance,
      valuation_state: h.physical.valuation_state,
      consumption_model: h.physical.consumption.model,
    };
  } catch {
    hybridCogs = { state: 'UNAVAILABLE' };
  }

  return {
    read_only: true,
    disclaimer: 'RECONCILIATION ONLY - ACCOUNTING CLOSING REMAINS THE VERIFIED UPLOAD. Physical ledger and physical counts are diagnostics; nothing here writes or adjusts COGS.',
    outlet: { id: outlet.id, outlet_code: outlet.outlet_code, outlet_name: outlet.outlet_name },
    period: { month, year, from_date: fromDate, to_date: endDate },
    mapped_locations: mappedLocations,
    readiness: {
      status: readinessStatus,
      blockers,
      variance_rows: varianceRowCount,
      advisory_only: true,
      hybrid_cogs_state: hybridCogs,
      note: 'Advisory diagnostics only - finalization is not blocked by variance. Only an objectively missing Verified closing is reported as a structural gap.',
    },
    closing_upload_state: closingUploadState,
    summary: {
      materials_compared: materials.filter((m) => m.mapping_state === 'BOTH_SIDES').length,
      accounting_only: materials.filter((m) => m.mapping_state === 'ACCOUNTING_ONLY').length,
      physical_only: materials.filter((m) => m.mapping_state === 'PHYSICAL_ONLY').length,
      accounting_closing_qty: verifiedUploads.length ? num(materials.reduce((s, m) => s + (m.accounting_qty || 0), 0).toFixed(4)) : null,
      physical_closing_qty: physicalRows.length ? num(materials.reduce((s, m) => s + (m.physical_qty || 0), 0).toFixed(4)) : null,
      accounting_closing_value: verifiedUploads.length ? num(materials.reduce((s, m) => s + (m.accounting_value || 0), 0).toFixed(4)) : null,
      physical_closing_value: physicalRows.length ? num(materials.reduce((s, m) => s + (m.physical_value || 0), 0).toFixed(4)) : null,
      cost_basis_warning: 'Accounting and physical values use different cost bases - variances are diagnostic only.',
    },
    materials,
    physical_counts: physicalCounts,
    unresolved_conditions: unresolved,
    purchase_bridge: purchaseBridge,
    consumption_gap: {
      physical_consumption_model: 'INCOMPLETE',
      detail: 'No outlet-level issue/consumption stock_ledger transaction exists - ledger closing vs accounting closing variance partly reflects missing outlet consumption movements. Not auto-created by design.',
    },
    unowned_activity: unowned.map((r) => ({
      location_id: r.location_id, location_name: r.location_name, location_type: r.location_type,
      raw_material_id: r.raw_material_id, material_name: r.material_name,
      net_qty: num(r.net_qty), net_value: num(r.net_value),
      note: 'unowned physical activity - never allocated to an outlet',
    })),
  };
};

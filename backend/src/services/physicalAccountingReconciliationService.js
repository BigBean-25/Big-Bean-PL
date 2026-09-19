import { query } from '../config/database.js';

// Phase 6A2 - SHADOW physical <-> accounting reconciliation.
//
// READ-ONLY diagnostics. This service computes comparison views between the
// physical inventory track (GRN / stock_ledger / transfers / counts /
// wastage / adjustments) and the accounting track (Verified opening /
// material purchase / closing uploads). It performs NO writes - no
// accounting_effects rows, no status changes, no financial posting of any
// kind. Nothing here makes a physical transaction financially effective;
// plCalculator / supplierLedgerService / consumptionService remain the only
// sources of accounting truth and are unchanged.
//
// Grain: accounting rows are outlet_id-keyed, physical rows are
// location_id-keyed. The only legitimate bridge is locations.outlet_id.
// Locations without an outlet mapping (Central Warehouse, Central Kitchen)
// are reported in a separate unowned bucket - this service never guesses an
// outlet for them.

const num = (value) => Number(value || 0);

const httpError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

// Invoice numbers are matched only after a deterministic normalisation:
// uppercase + strip non-alphanumerics. Anything beyond that is fuzzy
// matching, which this phase deliberately does not do.
const normalizeInvoice = (value) =>
  value === null || value === undefined ? null : String(value).toUpperCase().replace(/[^A-Z0-9]/g, '') || null;

const isValidDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());

const loadLocationMap = async () => {
  const rows = await query('SELECT id, location_name, location_type, outlet_id FROM locations');
  const byId = {};
  for (const l of rows) byId[l.id] = l;
  return { byId, all: rows };
};

// Physical stock balance for one location up to and including a date, using
// the same exclusion canonical getCurrentStock() uses (TRANSIT_DAMAGE /
// TRANSIT_SHORT are informational, not real stock movement).
const physicalBalanceSql = `
  SELECT raw_material_id,
         COALESCE(SUM(CASE WHEN transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN qty_in ELSE 0 END),0)
       - COALESCE(SUM(CASE WHEN transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN qty_out ELSE 0 END),0) AS qty,
         COALESCE(SUM(CASE WHEN transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN value_in ELSE 0 END),0)
       - COALESCE(SUM(CASE WHEN transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN value_out ELSE 0 END),0) AS value
  FROM stock_ledger
  WHERE location_id = ? AND transaction_date <= ?
  GROUP BY raw_material_id`;

/**
 * Main shadow reconciliation entry point.
 *
 * @param {object} opts
 * @param {number|null} opts.outletId   accounting outlet to scope by (optional)
 * @param {string} opts.fromDate        YYYY-MM-DD, required
 * @param {string} opts.toDate          YYYY-MM-DD, required
 * @param {number|null} opts.supplierId optional filter
 * @param {number|null} opts.rawMaterialId optional filter
 * @param {object} opts.outletScope     req.outletScope from applyOutletScope
 */
export const getPhysicalAccountingReconciliation = async ({
  outletId = null,
  fromDate,
  toDate,
  supplierId = null,
  rawMaterialId = null,
  outletScope = null,
}) => {
  if (!isValidDate(fromDate) || !isValidDate(toDate)) {
    throw httpError('from_date and to_date are required in YYYY-MM-DD format', 400);
  }
  if (fromDate > toDate) {
    throw httpError('from_date must not be after to_date', 400);
  }

  if (outletScope && !outletScope.all) {
    const allowed = (outletScope.outletIds || []).map(Number);
    if (outletId && !allowed.includes(Number(outletId))) {
      throw httpError('You do not have access to the requested outlet', 403);
    }
    if (!outletId) outletId = allowed.length === 1 ? allowed[0] : null;
  }

  const { byId: locById } = await loadLocationMap();
  const outletOfLocation = (locId) => (locById[locId] ? locById[locId].outlet_id : null);
  const mappedOutletLocations = new Set(
    Object.values(locById).filter((l) => l.outlet_id !== null && (outletId === null || Number(l.outlet_id) === Number(outletId))).map((l) => l.id)
  );

  // ---------------- PHYSICAL PURCHASE VIEW (Posted GRNs only) ----------------
  const physParams = [fromDate, toDate];
  let physWhere = `g.status = 'Posted' AND g.grn_date BETWEEN ? AND ?`;
  if (supplierId) { physWhere += ' AND g.supplier_id = ?'; physParams.push(supplierId); }
  if (rawMaterialId) { physWhere += ' AND gi.raw_material_id = ?'; physParams.push(rawMaterialId); }
  const physicalPurchases = await query(
    `SELECT g.id AS grn_id, g.grn_no, g.grn_date, g.supplier_id, g.invoice_reference,
            g.warehouse_location_id, l.outlet_id AS mapped_outlet_id, l.location_name, l.location_type,
            gi.id AS grn_item_id, gi.raw_material_id, gi.accepted_qty, gi.unit_id,
            gi.rate, gi.tax_amount, gi.total_amount
     FROM grn g
     JOIN grn_items gi ON gi.grn_id = g.id
     LEFT JOIN locations l ON l.id = g.warehouse_location_id
     WHERE ${physWhere}
     ORDER BY g.grn_date, g.id, gi.id`,
    physParams
  );

  // ---------------- ACCOUNTING PURCHASE VIEW (Completed+Verified only) ----------------
  const acctParams = [fromDate, toDate];
  let acctWhere = `mpu.status = 'Completed' AND mpu.approval_status = 'Verified' AND mpi.date BETWEEN ? AND ?`;
  if (outletId) { acctWhere += ' AND mpi.outlet_id = ?'; acctParams.push(outletId); }
  if (supplierId) { acctWhere += ' AND mpi.supplier_id = ?'; acctParams.push(supplierId); }
  if (rawMaterialId) { acctWhere += ' AND mpi.raw_material_id = ?'; acctParams.push(rawMaterialId); }
  const accountingPurchases = await query(
    `SELECT mpi.id AS item_id, mpi.upload_id, mpu.batch_id, mpi.date, mpi.outlet_id,
            mpi.supplier_id, mpi.supplier_name, mpi.invoice_no, mpi.raw_material_id,
            mpi.qty, mpi.unit_id, mpi.rate, mpi.tax, mpi.total_amount
     FROM material_purchase_items mpi
     JOIN material_purchase_uploads mpu ON mpi.upload_id = mpu.id
     WHERE ${acctWhere}
     ORDER BY mpi.date, mpi.id`,
    acctParams
  );

  // ---------------- PURCHASE RECONCILIATION ----------------
  // Exact match evidence: same supplier + same normalised invoice + same
  // outlet (when the GRN's location maps to one). POSSIBLE_MATCH is
  // diagnostic-only (same supplier, near date, near amount) and never
  // establishes linkage.
  const acctBySupplierInvoice = new Map();
  for (const a of accountingPurchases) {
    const key = `${a.supplier_id}|${normalizeInvoice(a.invoice_no)}|${a.outlet_id}`;
    if (!acctBySupplierInvoice.has(key)) acctBySupplierInvoice.set(key, []);
    acctBySupplierInvoice.get(key).push(a);
  }
  const acctBySupplierInvoiceNoOutlet = new Map();
  for (const a of accountingPurchases) {
    const key = `${a.supplier_id}|${normalizeInvoice(a.invoice_no)}`;
    if (!acctBySupplierInvoiceNoOutlet.has(key)) acctBySupplierInvoiceNoOutlet.set(key, []);
    acctBySupplierInvoiceNoOutlet.get(key).push(a);
  }

  const matchedAcctItemIds = new Set();
  const purchaseReconciliation = [];
  for (const p of physicalPurchases) {
    const invNorm = normalizeInvoice(p.invoice_reference);
    const ownedOutlet = p.mapped_outlet_id !== null ? Number(p.mapped_outlet_id) : null;

    if (ownedOutlet === null) {
      purchaseReconciliation.push({
        classification: 'UNOWNED_LOCATION',
        match_reason: `${p.location_type || 'location'} '${p.location_name}' has no outlet mapping - no accounting owner`,
        grn_id: p.grn_id, grn_no: p.grn_no, grn_item_id: p.grn_item_id, grn_date: p.grn_date,
        supplier_id: p.supplier_id, invoice_reference: p.invoice_reference,
        location_id: p.warehouse_location_id, location_name: p.location_name, mapped_outlet_id: null,
        raw_material_id: p.raw_material_id, accepted_qty: p.accepted_qty,
        tax_amount: p.tax_amount, total_amount: p.total_amount,
        upload_item_ids: [],
      });
      continue;
    }

    if (outletId && Number(ownedOutlet) !== Number(outletId)) continue; // scoped out

    let candidates = invNorm ? (acctBySupplierInvoice.get(`${p.supplier_id}|${invNorm}|${ownedOutlet}`) || []) : [];
    // Outlet-keyed lookup may miss upload rows whose outlet differs - fall back
    // to supplier+invoice only so the mismatch is still surfaced as AMBIGUOUS
    // rather than silently PHYSICAL_ONLY.
    if (candidates.length === 0 && invNorm) {
      candidates = (acctBySupplierInvoiceNoOutlet.get(`${p.supplier_id}|${invNorm}`) || []);
    }

    if (invNorm && candidates.length === 1) {
      matchedAcctItemIds.add(candidates[0].item_id);
      purchaseReconciliation.push({
        classification: 'MATCHED_EXACT',
        match_reason: 'same supplier_id + normalized invoice + compatible outlet',
        grn_id: p.grn_id, grn_no: p.grn_no, grn_item_id: p.grn_item_id, grn_date: p.grn_date,
        supplier_id: p.supplier_id, invoice_reference: p.invoice_reference,
        location_id: p.warehouse_location_id, mapped_outlet_id: ownedOutlet,
        raw_material_id: p.raw_material_id, accepted_qty: p.accepted_qty,
        tax_amount: p.tax_amount, total_amount: p.total_amount,
        upload_item_ids: [candidates[0].item_id],
        upload_total_amount: candidates[0].total_amount,
        amount_difference: num(p.total_amount) - num(candidates[0].total_amount),
      });
    } else if (invNorm && candidates.length > 1) {
      candidates.forEach((c) => matchedAcctItemIds.add(c.item_id));
      purchaseReconciliation.push({
        classification: 'AMBIGUOUS',
        match_reason: `supplier + normalized invoice matches ${candidates.length} upload items - requires explicit review`,
        confidence_basis: 'deterministic key collision, multiple candidates',
        grn_id: p.grn_id, grn_no: p.grn_no, grn_item_id: p.grn_item_id, grn_date: p.grn_date,
        supplier_id: p.supplier_id, invoice_reference: p.invoice_reference,
        location_id: p.warehouse_location_id, mapped_outlet_id: ownedOutlet,
        raw_material_id: p.raw_material_id, accepted_qty: p.accepted_qty,
        tax_amount: p.tax_amount, total_amount: p.total_amount,
        upload_item_ids: candidates.map((c) => c.item_id),
      });
    } else {
      // POSSIBLE_MATCH: diagnostic proximity only - never linkage.
      const near = accountingPurchases.filter((a) =>
        Number(a.supplier_id) === Number(p.supplier_id) &&
        Number(a.outlet_id) === Number(ownedOutlet) &&
        Math.abs(num(a.total_amount) - num(p.total_amount)) <= Math.max(1, num(p.total_amount) * 0.02) &&
        Math.abs(new Date(a.date) - new Date(p.grn_date)) <= 7 * 86400000
      );
      purchaseReconciliation.push({
        classification: near.length ? 'POSSIBLE_MATCH' : 'PHYSICAL_ONLY',
        match_reason: near.length
          ? 'no exact supplier+invoice match - diagnostic proximity on supplier/outlet/amount/date only, NOT a linkage'
          : 'no accounting purchase candidate found',
        confidence_basis: near.length ? 'same supplier + outlet, amount within 2%, date within 7 days' : null,
        grn_id: p.grn_id, grn_no: p.grn_no, grn_item_id: p.grn_item_id, grn_date: p.grn_date,
        supplier_id: p.supplier_id, invoice_reference: p.invoice_reference,
        location_id: p.warehouse_location_id, mapped_outlet_id: ownedOutlet,
        raw_material_id: p.raw_material_id, accepted_qty: p.accepted_qty,
        tax_amount: p.tax_amount, total_amount: p.total_amount,
        upload_item_ids: near.map((c) => c.item_id),
      });
    }
  }
  const accountingOnly = accountingPurchases
    .filter((a) => !matchedAcctItemIds.has(a.item_id))
    .map((a) => ({
      classification: 'ACCOUNTING_ONLY',
      match_reason: 'Verified upload item with no matching Posted GRN (manual/accounting-only purchase)',
      upload_item_id: a.item_id, upload_id: a.upload_id, batch_id: a.batch_id, date: a.date,
      outlet_id: a.outlet_id, supplier_id: a.supplier_id, invoice_no: a.invoice_no,
      raw_material_id: a.raw_material_id, qty: a.qty, tax: a.tax, total_amount: a.total_amount,
    }));

  // ---------------- DUPLICATE INVOICE RISK ----------------
  // Same supplier + same normalized invoice appearing in BOTH a Posted GRN
  // and a Verified upload = the #1 future double-count risk. Detected, never
  // auto-resolved.
  const riskMap = new Map();
  for (const p of physicalPurchases) {
    const inv = normalizeInvoice(p.invoice_reference);
    if (!inv) continue;
    const key = `${p.supplier_id}|${inv}`;
    if (!riskMap.has(key)) riskMap.set(key, { supplier_id: p.supplier_id, invoice_reference: p.invoice_reference, grns: [], uploads: [] });
    const r = riskMap.get(key);
    if (!r.grns.some((g) => g.grn_id === p.grn_id)) {
      r.grns.push({ grn_id: p.grn_id, grn_no: p.grn_no, grn_date: p.grn_date, location_id: p.warehouse_location_id, mapped_outlet_id: p.mapped_outlet_id, total_amount: p.total_amount });
    }
  }
  for (const a of accountingPurchases) {
    const inv = normalizeInvoice(a.invoice_no);
    if (!inv) continue;
    const key = `${a.supplier_id}|${inv}`;
    if (!riskMap.has(key)) continue;
    const r = riskMap.get(key);
    if (!r.uploads.some((u) => u.upload_item_id === a.item_id)) {
      r.uploads.push({ upload_item_id: a.item_id, upload_id: a.upload_id, batch_id: a.batch_id, date: a.date, outlet_id: a.outlet_id, total_amount: a.total_amount });
    }
  }
  const duplicateInvoiceRisks = [...riskMap.values()]
    .filter((r) => r.grns.length && r.uploads.length)
    .map((r) => ({
      ...r,
      grn_total: r.grns.reduce((s, g) => s + num(g.total_amount), 0),
      upload_total: r.uploads.reduce((s, u) => s + num(u.total_amount), 0),
      difference: r.grns.reduce((s, g) => s + num(g.total_amount), 0) - r.uploads.reduce((s, u) => s + num(u.total_amount), 0),
    }));

  // ---------------- OPENING RECONCILIATION ----------------
  // Physical: stock_ledger OPENING rows per mapped location.
  // Accounting: Verified opening_stock uploads for the month of fromDate.
  const openMonth = Number(fromDate.slice(5, 7));
  const openYear = Number(fromDate.slice(0, 4));
  const physicalOpenings = await query(
    `SELECT location_id, raw_material_id,
            COALESCE(SUM(qty_in),0) AS qty, COALESCE(SUM(value_in),0) AS value
     FROM stock_ledger
     WHERE transaction_type = 'OPENING'
     GROUP BY location_id, raw_material_id`
  );
  const acctOpenParams = [openMonth, openYear];
  let acctOpenWhere = `osu.status = 'Completed' AND osu.approval_status = 'Verified' AND osu.month = ? AND osu.year = ?`;
  if (outletId) { acctOpenWhere += ' AND osi.outlet_id = ?'; acctOpenParams.push(outletId); }
  const accountingOpenings = await query(
    `SELECT osi.outlet_id, osi.raw_material_id,
            COALESCE(SUM(osi.qty),0) AS qty, COALESCE(SUM(osi.value),0) AS value
     FROM opening_stock_items osi
     JOIN opening_stock_uploads osu ON osi.upload_id = osu.id
     WHERE ${acctOpenWhere}
     GROUP BY osi.outlet_id, osi.raw_material_id`,
    acctOpenParams
  );
  const openingReconciliation = [];
  const openKey = (o, m) => `${o}|${m}`;
  const physOpenMap = new Map();
  for (const p of physicalOpenings) {
    const outlet = outletOfLocation(p.location_id);
    if (outlet === null) continue; // unowned bucket covers central openings
    if (outletId && Number(outlet) !== Number(outletId)) continue;
    const k = openKey(outlet, p.raw_material_id);
    const cur = physOpenMap.get(k) || { outlet_id: Number(outlet), raw_material_id: p.raw_material_id, qty: 0, value: 0, locations: [] };
    cur.qty += num(p.qty); cur.value += num(p.value);
    cur.locations.push(p.location_id);
    physOpenMap.set(k, cur);
  }
  const acctOpenMap = new Map(accountingOpenings.map((a) => [openKey(a.outlet_id, a.raw_material_id), a]));
  for (const [k, p] of physOpenMap) {
    const a = acctOpenMap.get(k);
    openingReconciliation.push({
      outlet_id: p.outlet_id, raw_material_id: p.raw_material_id,
      physical_opening_qty: p.qty, physical_opening_value: p.value,
      accounting_opening_qty: a ? num(a.qty) : 0, accounting_opening_value: a ? num(a.value) : 0,
      qty_variance: p.qty - (a ? num(a.qty) : 0),
      value_variance: p.value - (a ? num(a.value) : 0),
      mapping_state: a ? 'BOTH_SIDES' : 'PHYSICAL_ONLY',
    });
  }
  for (const [k, a] of acctOpenMap) {
    if (!physOpenMap.has(k)) {
      openingReconciliation.push({
        outlet_id: a.outlet_id, raw_material_id: a.raw_material_id,
        physical_opening_qty: 0, physical_opening_value: 0,
        accounting_opening_qty: num(a.qty), accounting_opening_value: num(a.value),
        qty_variance: -num(a.qty), value_variance: -num(a.value),
        mapping_state: 'ACCOUNTING_ONLY',
      });
    }
  }

  // ---------------- CLOSING RECONCILIATION ----------------
  // Physical: stock_ledger balance at toDate per mapped location.
  // Accounting: Verified closing_stock uploads for the month of toDate.
  const closeMonth = Number(toDate.slice(5, 7));
  const closeYear = Number(toDate.slice(0, 4));
  const physicalClosings = [];
  for (const locId of mappedOutletLocations) {
    const rows = await query(physicalBalanceSql, [locId, toDate]);
    for (const r of rows) physicalClosings.push({ location_id: locId, outlet_id: outletOfLocation(locId), ...r });
  }
  const acctCloseParams = [closeMonth, closeYear];
  let acctCloseWhere = `csu.status = 'Completed' AND csu.approval_status = 'Verified' AND csu.month = ? AND csu.year = ?`;
  if (outletId) { acctCloseWhere += ' AND csi.outlet_id = ?'; acctCloseParams.push(outletId); }
  const accountingClosings = await query(
    `SELECT csi.outlet_id, csi.raw_material_id,
            COALESCE(SUM(csi.qty),0) AS qty, COALESCE(SUM(csi.value),0) AS value
     FROM closing_stock_items csi
     JOIN closing_stock_uploads csu ON csi.upload_id = csu.id
     WHERE ${acctCloseWhere}
     GROUP BY csi.outlet_id, csi.raw_material_id`,
    acctCloseParams
  );
  const physCloseMap = new Map();
  for (const p of physicalClosings) {
    const k = openKey(p.outlet_id, p.raw_material_id);
    const cur = physCloseMap.get(k) || { outlet_id: Number(p.outlet_id), raw_material_id: p.raw_material_id, qty: 0, value: 0 };
    cur.qty += num(p.qty); cur.value += num(p.value);
    physCloseMap.set(k, cur);
  }
  const acctCloseMap = new Map(accountingClosings.map((a) => [openKey(a.outlet_id, a.raw_material_id), a]));
  const closingReconciliation = [];
  for (const [k, p] of physCloseMap) {
    const a = acctCloseMap.get(k);
    closingReconciliation.push({
      outlet_id: p.outlet_id, raw_material_id: p.raw_material_id,
      physical_qty: p.qty, accounting_qty: a ? num(a.qty) : 0,
      qty_variance: p.qty - (a ? num(a.qty) : 0),
      physical_value: p.value, accounting_value: a ? num(a.value) : 0,
      value_variance: p.value - (a ? num(a.value) : 0),
      mapping_state: a ? 'BOTH_SIDES' : 'PHYSICAL_ONLY',
    });
  }
  for (const [k, a] of acctCloseMap) {
    if (!physCloseMap.has(k)) {
      closingReconciliation.push({
        outlet_id: a.outlet_id, raw_material_id: a.raw_material_id,
        physical_qty: 0, accounting_qty: num(a.qty),
        qty_variance: -num(a.qty),
        physical_value: 0, accounting_value: num(a.value),
        value_variance: -num(a.value),
        mapping_state: 'ACCOUNTING_ONLY',
      });
    }
  }

  // ---------------- MOVEMENT RECONCILIATION ----------------
  // Physical movements in [fromDate, toDate] grouped by mapped
  // outlet/material/transaction_type - uses the same canonical exclusion as
  // getCurrentStock (TRANSIT_* informational types are not stock movement).
  const movementRows = await query(
    `SELECT location_id, raw_material_id, transaction_type,
            COALESCE(SUM(qty_in),0) AS qty_in, COALESCE(SUM(qty_out),0) AS qty_out,
            COALESCE(SUM(value_in),0) AS value_in, COALESCE(SUM(value_out),0) AS value_out
     FROM stock_ledger
     WHERE transaction_date BETWEEN ? AND ?
       AND transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT')
     GROUP BY location_id, raw_material_id, transaction_type`,
    [fromDate, toDate]
  );
  const movementByKey = new Map();
  const bump = (k, init) => {
    if (!movementByKey.has(k)) movementByKey.set(k, init);
    return movementByKey.get(k);
  };
  for (const m of movementRows) {
    const outlet = outletOfLocation(m.location_id);
    if (outlet === null) continue;
    if (outletId && Number(outlet) !== Number(outletId)) continue;
    const k = openKey(outlet, m.raw_material_id);
    const cur = bump(k, {
      outlet_id: Number(outlet), raw_material_id: m.raw_material_id,
      purchase_grn_in: 0, transfer_in: 0, transfer_out: 0, production_issue: 0,
      production_receipt: 0, wastage_out: 0, adjustment_in: 0, adjustment_out: 0,
      purchase_return_out: 0, other_in: 0, other_out: 0,
    });
    const qi = num(m.qty_in), qo = num(m.qty_out);
    switch (m.transaction_type) {
      case 'PURCHASE_GRN': case 'GRN': cur.purchase_grn_in += qi; break;
      case 'TRANSFER_IN': cur.transfer_in += qi; break;
      case 'TRANSFER_OUT': cur.transfer_out += qo; break;
      case 'PRODUCTION_ISSUE': cur.production_issue += qo; break;
      case 'PRODUCTION_RECEIPT': cur.production_receipt += qi; break;
      case 'WASTAGE': cur.wastage_out += qo; break;
      case 'ADJUSTMENT_POSITIVE': cur.adjustment_in += qi; break;
      case 'ADJUSTMENT_NEGATIVE': cur.adjustment_out += qo; break;
      case 'PHYSICAL_ADJUSTMENT': cur.adjustment_in += qi; cur.adjustment_out += qo; break;
      case 'PURCHASE_RETURN': cur.purchase_return_out += qo; break;
      case 'OPENING': cur.other_in += qi; break;
      default: cur.other_in += qi; cur.other_out += qo;
    }
  }
  const movementReconciliation = [...movementByKey.values()].map((m) => {
    const physNet = m.purchase_grn_in + m.transfer_in + m.production_receipt + m.adjustment_in
      - m.transfer_out - m.production_issue - m.wastage_out - m.adjustment_out - m.purchase_return_out;
    const openK = openKey(m.outlet_id, m.raw_material_id);
    const acctOpen = acctOpenMap.get(openK);
    const acctClose = acctCloseMap.get(openK);
    const acctPurch = accountingPurchases
      .filter((a) => Number(a.outlet_id) === m.outlet_id && Number(a.raw_material_id) === m.raw_material_id)
      .reduce((s, a) => s + num(a.qty), 0);
    return {
      ...m,
      physical_net_movement_qty: physNet,
      accounting_opening_qty: acctOpen ? num(acctOpen.qty) : 0,
      accounting_purchase_qty: acctPurch,
      accounting_closing_qty: acctClose ? num(acctClose.qty) : 0,
      accounting_consumption_basis_qty:
        (acctOpen ? num(acctOpen.qty) : 0) + acctPurch - (acctClose ? num(acctClose.qty) : 0),
      reconciliation_note: 'Difference between physical net movement and accounting consumption basis is a RECONCILIATION VARIANCE - not an accounting entry',
    };
  });

  // ---------------- OUTLET CONSUMPTION GAP ----------------
  // There is deliberately no physical sales/recipe issue transaction at
  // outlets, so the physical ledger cannot compute outlet consumption.
  const consumptionGap = {
    physical_consumption_model: 'INCOMPLETE',
    detail: 'No outlet-level issue/consumption stock_ledger transaction exists. Physical closing for outlets reflects receipts minus transfers/returns only - sales-driven consumption is accounting-side (Verified uploads) and theoretical (recipes) only.',
  };

  // ---------------- PURCHASE RETURN ALIGNMENT ----------------
  const returnRows = await query(
    `SELECT pr.id, pr.return_no, pr.return_date, pr.supplier_id, pr.warehouse_location_id, pr.status,
            l.outlet_id AS mapped_outlet_id, l.location_name,
            pri.raw_material_id, pri.return_qty, pri.base_qty,
            pri.supplier_credit_value, pri.inventory_value,
            sc.credit_amount, sc.status AS credit_status
     FROM purchase_returns pr
     LEFT JOIN purchase_return_items pri ON pri.purchase_return_id = pr.id
     LEFT JOIN supplier_credits sc ON sc.purchase_return_id = pr.id
     LEFT JOIN locations l ON l.id = pr.warehouse_location_id
     WHERE pr.status IN ('Posted','Locked') AND pr.return_date BETWEEN ? AND ?
     ORDER BY pr.id`,
    [fromDate, toDate]
  );
  const purchaseReturns = returnRows
    .filter((r) => !outletId || (r.mapped_outlet_id !== null && Number(r.mapped_outlet_id) === Number(outletId)))
    .map((r) => ({
      return_id: r.id, return_no: r.return_no, return_date: r.return_date, status: r.status,
      supplier_id: r.supplier_id, location_id: r.warehouse_location_id, location_name: r.location_name,
      mapped_outlet_id: r.mapped_outlet_id, raw_material_id: r.raw_material_id,
      physical_qty_reduction: r.base_qty ?? r.return_qty,
      inventory_value: r.inventory_value, supplier_credit_value: r.supplier_credit_value,
      supplier_credit_amount: r.credit_amount, credit_status: r.credit_status,
    }));

  // ---------------- WASTAGE / ADJUSTMENT VIEW (physical-only) ----------------
  const physDocs = [];
  const docQueries = [
    ['warehouse_wastage', `SELECT id, wastage_no AS doc_no, wastage_date AS doc_date, location_id, status FROM warehouse_wastage WHERE status IN ('Posted','Locked') AND wastage_date BETWEEN ? AND ?`,
      `SELECT warehouse_wastage_id, raw_material_id, qty, unit_id FROM warehouse_wastage_items`, 'warehouse_wastage_id'],
    ['production_wastage', `SELECT id, wastage_no AS doc_no, wastage_date AS doc_date, central_kitchen_id AS location_id, status FROM production_wastage WHERE status IN ('Posted','Locked') AND wastage_date BETWEEN ? AND ?`,
      `SELECT production_wastage_id, raw_material_id, qty, unit_id FROM production_wastage_items`, 'production_wastage_id'],
    ['stock_adjustments', `SELECT id, adjustment_no AS doc_no, adjustment_date AS doc_date, location_id, status FROM stock_adjustments WHERE status IN ('Posted','Locked') AND adjustment_date BETWEEN ? AND ?`,
      `SELECT stock_adjustment_id, raw_material_id, qty, unit_id FROM stock_adjustment_items`, 'stock_adjustment_id'],
    ['physical_stock_counts', `SELECT id, count_no AS doc_no, count_date AS doc_date, location_id, status FROM physical_stock_counts WHERE status IN ('Posted','Locked') AND count_date BETWEEN ? AND ?`,
      `SELECT physical_count_id, raw_material_id, variance_qty AS qty, unit_id FROM physical_stock_count_items`, 'physical_count_id'],
  ];
  for (const [kind, docSql, itemSql, itemFk] of docQueries) {
    const docs = await query(docSql, [fromDate, toDate]).catch(() => []);
    for (const d of docs) {
      const items = await query(`${itemSql} WHERE ${itemFk} = ?`, [d.id]).catch(() => []);
      for (const it of items) {
        physDocs.push({
          kind, doc_id: d.id, doc_no: d.doc_no, doc_date: d.doc_date, status: d.status,
          location_id: d.location_id, location_name: locById[d.location_id]?.location_name || null,
          mapped_outlet_id: outletOfLocation(d.location_id),
          raw_material_id: it.raw_material_id, qty_impact: it.qty, unit_id: it.unit_id,
          accounting_effect: 'NONE - physical only by design',
        });
      }
    }
  }
  const wastageAdjustments = physDocs.filter((d) => !outletId || (d.mapped_outlet_id !== null && Number(d.mapped_outlet_id) === Number(outletId)));

  // ---------------- CENTRAL / UNOWNED LOCATION BUCKET ----------------
  const unownedLocations = Object.values(locById).filter((l) => l.outlet_id === null);
  const unownedActivity = [];
  for (const loc of unownedLocations) {
    const rows = await query(
      `SELECT raw_material_id, transaction_type,
              COALESCE(SUM(qty_in),0) AS qty_in, COALESCE(SUM(qty_out),0) AS qty_out,
              COALESCE(SUM(value_in),0) AS value_in, COALESCE(SUM(value_out),0) AS value_out
       FROM stock_ledger
       WHERE location_id = ? AND transaction_date BETWEEN ? AND ?
         AND transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT')
       GROUP BY raw_material_id, transaction_type`,
      [loc.id, fromDate, toDate]
    );
    for (const r of rows) {
      unownedActivity.push({
        location_id: loc.id, location_name: loc.location_name, location_type: loc.location_type,
        raw_material_id: r.raw_material_id, transaction_type: r.transaction_type,
        qty_in: num(r.qty_in), qty_out: num(r.qty_out),
        value_in: num(r.value_in), value_out: num(r.value_out),
        accounting_owner: null,
        note: 'unowned physical activity - never allocated to an outlet',
      });
    }
  }

  return {
    shadow: true,
    read_only: true,
    disclaimer: 'SHADOW RECONCILIATION - diagnostic comparison only. No accounting_effects rows are created; nothing here is a financial posting.',
    params: { outlet_id: outletId, from_date: fromDate, to_date: toDate, supplier_id: supplierId, raw_material_id: rawMaterialId },
    purchase_reconciliation: purchaseReconciliation,
    accounting_only_purchases: accountingOnly,
    duplicate_invoice_risks: duplicateInvoiceRisks,
    opening_reconciliation: openingReconciliation,
    closing_reconciliation: closingReconciliation,
    movement_reconciliation: movementReconciliation,
    consumption_gap: consumptionGap,
    purchase_returns: purchaseReturns,
    wastage_adjustments: wastageAdjustments,
    unowned_physical_activity: unownedActivity,
  };
};

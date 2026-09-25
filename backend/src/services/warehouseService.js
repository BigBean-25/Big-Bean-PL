import pool, { query, getConnection } from '../config/database.js';
import { getUnit, getMaterialBaseUnit, findConversionFactor, convertToBase, normalizeRateToBase } from '../utils/uomUtils.js';
import { allocateFEFO } from './warehouseBatchService.js';
import { updatePOStatusAfterGRN } from './warehousePurchaseOrderService.js';
import { getSettingValue } from './warehouseSettingService.js';
import { validateContactFields } from '../utils/validators.js';
import { canAccessAllOutlets } from '../utils/roleAccess.js';
import { assertNotOwnDocument } from '../utils/makerChecker.js';
import { createEffectInTransaction, resolveAccountingOwner } from './accountingEffectService.js';

const num = (value) => (value === null || value === undefined || value === '' ? 0 : Number(value));

export const getAllowedLocations = async (user, scope = 'all') => {
  const roleName = user.role_name;
  if (scope === 'central_warehouse') {
    return query("SELECT * FROM locations WHERE location_type = 'Central Warehouse' AND is_active = 1 ORDER BY location_name");
  }
  // canAccessAllOutlets(roleName), not a separately-maintained role list -
  // Central Kitchen Admin (explicit locations.can_view=1), Technical Admin
  // (blanket edit grant) and Viewer/Viewer Auditor (retains locations.can_view=1
  // via its blanket view-only sweep) all have real view permission on
  // locations but would otherwise fall through to the outlet-scoped branch
  // below and, with empty outlet_ids (the norm for an all-outlet role), only
  // ever see Central Warehouse locations instead of everything.
  if (canAccessAllOutlets(roleName) && roleName !== 'Warehouse Admin') {
    return query("SELECT * FROM locations WHERE is_active = 1 ORDER BY location_name");
  }
  if (roleName === 'Warehouse Admin') {
    return query("SELECT * FROM locations WHERE location_type = 'Central Warehouse' AND is_active = 1 ORDER BY location_name");
  }
  // Outlet-scoped roles (Outlet Admin/Staff) need their own outlet's location
  // PLUS every active Central Warehouse - the Central Warehouse has
  // outlet_id = NULL, so an outlet_id-only filter can never return it, which
  // left the "Select Warehouse" / "Requested Warehouse" picker empty for
  // them even though they have real warehouse_requisitions/warehouse_stock
  // access. They still can't see other outlets' locations.
  const assigned = (user.outlet_ids || []).map(Number).filter(Boolean);
  if (assigned.length === 0) {
    return query("SELECT * FROM locations WHERE location_type = 'Central Warehouse' AND is_active = 1 ORDER BY location_name");
  }
  return query(
    `SELECT * FROM locations WHERE (outlet_id IN (${assigned.map(() => '?').join(',')}) OR location_type = 'Central Warehouse') AND is_active = 1 ORDER BY location_name`,
    assigned
  );
};

export const getLocationById = async (id) => {
  const rows = await query("SELECT * FROM locations WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
};

const LOCATION_TYPES = ['Outlet', 'Central Warehouse', 'Central Kitchen', 'Corporate Office', 'Dark Store'];
const NON_OUTLET_INVENTORY_TYPES = ['Central Warehouse', 'Central Kitchen', 'Dark Store'];

export const getLocationsForManagement = async (filters = {}) => {
  const { search, location_type, is_active, is_inventory_location } = filters;
  let sql = `SELECT l.*, o.outlet_name FROM locations l LEFT JOIN outlets o ON o.id = l.outlet_id WHERE 1=1`;
  const params = [];
  if (search) {
    sql += ' AND (l.location_code LIKE ? OR l.location_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (location_type) { sql += ' AND l.location_type = ?'; params.push(location_type); }
  if (is_active !== undefined && is_active !== '') { sql += ' AND l.is_active = ?'; params.push(Number(is_active)); }
  if (is_inventory_location !== undefined && is_inventory_location !== '') { sql += ' AND l.is_inventory_location = ?'; params.push(Number(is_inventory_location)); }
  sql += ' ORDER BY l.location_type, l.location_name';
  return query(sql, params);
};

const locationHasTransactions = async (id) => {
  const [ledger, grnRows, reqRows, transferRows] = await Promise.all([
    query('SELECT id FROM stock_ledger WHERE location_id = ? LIMIT 1', [id]),
    query('SELECT id FROM grn WHERE warehouse_location_id = ? LIMIT 1', [id]),
    query('SELECT id FROM stock_requisitions WHERE from_location_id = ? OR to_location_id = ? LIMIT 1', [id, id]),
    query('SELECT id FROM stock_transfers WHERE from_location_id = ? OR to_location_id = ? LIMIT 1', [id, id]),
  ]);
  return ledger.length > 0 || grnRows.length > 0 || reqRows.length > 0 || transferRows.length > 0;
};

const hasUnresolvedWarehouseActivity = async (id) => {
  const stock = await getCurrentStock(id);
  if (stock.some((r) => num(r.current_qty) !== 0)) return true;
  const pendingGRN = await query("SELECT id FROM grn WHERE warehouse_location_id = ? AND status = 'Draft' LIMIT 1", [id]);
  if (pendingGRN.length > 0) return true;
  const pendingReq = await query(
    "SELECT id FROM stock_requisitions WHERE (from_location_id = ? OR to_location_id = ?) AND status NOT IN ('Received','Rejected','Cancelled') LIMIT 1",
    [id, id]
  );
  if (pendingReq.length > 0) return true;
  const inTransit = await query(
    "SELECT id FROM stock_transfers WHERE (from_location_id = ? OR to_location_id = ?) AND status NOT IN ('Received','Cancelled') LIMIT 1",
    [id, id]
  );
  if (inTransit.length > 0) return true;
  return false;
};

export const getLocationOperationalSummary = async (id) => {
  const [current, pendingGRN, pendingReq, inTransit] = await Promise.all([
    getCurrentStock(id),
    query("SELECT COUNT(*) as c FROM grn WHERE warehouse_location_id = ? AND status = 'Draft'", [id]),
    query("SELECT COUNT(*) as c FROM stock_requisitions WHERE (from_location_id = ? OR to_location_id = ?) AND status NOT IN ('Received','Rejected','Cancelled')", [id, id]),
    query("SELECT COUNT(*) as c FROM stock_transfers WHERE (from_location_id = ? OR to_location_id = ?) AND status NOT IN ('Received','Cancelled')", [id, id]),
  ]);
  return {
    current_stock_value: current.reduce((s, r) => s + num(r.total_value), 0),
    material_count: current.length,
    pending_grns: pendingGRN[0]?.c || 0,
    pending_requisitions: pendingReq[0]?.c || 0,
    in_transit_transfers: inTransit[0]?.c || 0,
  };
};

export const createLocation = async (data, createdBy) => {
  let { location_code, location_name, location_type, outlet_id, is_inventory_location, is_active = 1 } = data;
  if (!location_code || !location_name || !location_type) throw new Error('location_code, location_name and location_type are required');
  if (!LOCATION_TYPES.includes(location_type)) throw new Error('Invalid location_type');

  location_code = String(location_code).trim().toUpperCase();
  location_name = String(location_name).trim();

  const existingCode = await query('SELECT id FROM locations WHERE location_code = ? LIMIT 1', [location_code]);
  if (existingCode.length > 0) throw new Error('Location code already exists.');

  if (location_type === 'Outlet') {
    if (!outlet_id) throw new Error('Mapped outlet is required for Outlet type locations');
    const existingOutlet = await query('SELECT id FROM locations WHERE outlet_id = ? LIMIT 1', [outlet_id]);
    if (existingOutlet.length > 0) throw new Error('This outlet is already mapped to an active location.');
    if (is_inventory_location === undefined) is_inventory_location = 1;
  } else {
    outlet_id = null;
    if (NON_OUTLET_INVENTORY_TYPES.includes(location_type)) {
      is_inventory_location = 1;
    } else if (location_type === 'Corporate Office' && is_inventory_location === undefined) {
      is_inventory_location = 0;
    }
  }

  const res = await query(
    `INSERT INTO locations (location_code, location_name, location_type, outlet_id, is_inventory_location, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
    [location_code, location_name, location_type, outlet_id || null, Number(Boolean(is_inventory_location)), Number(Boolean(is_active))]
  );
  return getLocationById(res.insertId);
};

export const updateLocation = async (id, data) => {
  const loc = await getLocationById(id);
  if (!loc) throw new Error('Location not found');

  const { location_code, location_name, location_type, outlet_id, is_inventory_location, is_active, gstin, address, city, state, pincode, phone, email } = data;

  const contactError = validateContactFields({ gstin, email, phone });
  if (contactError) throw new Error(contactError);

  const nextCode = location_code !== undefined ? String(location_code).trim().toUpperCase() : loc.location_code;
  const nextType = location_type !== undefined ? location_type : loc.location_type;
  let nextOutlet = outlet_id !== undefined ? (outlet_id || null) : loc.outlet_id;

  const structuralChangeRequested =
    nextCode !== loc.location_code ||
    nextType !== loc.location_type ||
    Number(nextOutlet || null) !== Number(loc.outlet_id || null);

  if (structuralChangeRequested) {
    const hasTransactions = await locationHasTransactions(id);
    if (hasTransactions) {
      throw new Error('This location already has inventory transactions. Location code, type and outlet mapping cannot be changed.');
    }
  }

  if (nextType && !LOCATION_TYPES.includes(nextType)) throw new Error('Invalid location_type');

  if (nextCode !== loc.location_code) {
    const existingCode = await query('SELECT id FROM locations WHERE location_code = ? AND id != ? LIMIT 1', [nextCode, id]);
    if (existingCode.length > 0) throw new Error('Location code already exists.');
  }

  let nextInventory = is_inventory_location !== undefined ? Number(Boolean(is_inventory_location)) : loc.is_inventory_location;

  if (NON_OUTLET_INVENTORY_TYPES.includes(nextType)) {
    nextOutlet = null;
    nextInventory = 1;
  } else if (nextType === 'Outlet') {
    if (!nextOutlet) throw new Error('Mapped outlet is required for Outlet type locations');
    if (Number(nextOutlet) !== Number(loc.outlet_id || 0)) {
      const existingOutlet = await query('SELECT id FROM locations WHERE outlet_id = ? AND id != ? LIMIT 1', [nextOutlet, id]);
      if (existingOutlet.length > 0) throw new Error('This outlet is already mapped to an active location.');
    }
  }

  const nextActive = is_active !== undefined ? Number(Boolean(is_active)) : loc.is_active;
  if (nextActive === 0 && Number(loc.is_active) === 1) {
    const blocked = await hasUnresolvedWarehouseActivity(id);
    if (blocked) {
      throw new Error('Location cannot be deactivated while stock or pending warehouse transactions exist.');
    }
  }

  await query(
    `UPDATE locations SET location_code = ?, location_name = ?, location_type = ?, outlet_id = ?, is_inventory_location = ?, is_active = ?,
      gstin = ?, address = ?, city = ?, state = ?, pincode = ?, phone = ?, email = ? WHERE id = ?`,
    [
      nextCode,
      location_name !== undefined ? String(location_name).trim() : loc.location_name,
      nextType,
      nextOutlet || null,
      nextInventory,
      nextActive,
      gstin !== undefined ? (gstin || null) : loc.gstin,
      address !== undefined ? (address || null) : loc.address,
      city !== undefined ? (city || null) : loc.city,
      state !== undefined ? (state || null) : loc.state,
      pincode !== undefined ? (pincode || null) : loc.pincode,
      phone !== undefined ? (phone || null) : loc.phone,
      email !== undefined ? (email || null) : loc.email,
      id,
    ]
  );
  return getLocationById(id);
};

export const postOpening = async (data, createdBy) => {
  const { location_id, raw_material_id, transaction_date, qty, unit_id, unit_cost, batch_no, expiry_date } = data;
  if (!location_id || !raw_material_id || !transaction_date || !qty || !unit_id) throw new Error('Missing required opening fields');
  const loc = await getLocationById(location_id);
  if (!loc) throw new Error('Location not found');
  const baseUnit = await getMaterialBaseUnit(raw_material_id);
  const inputQty = num(qty);
  const inputCost = num(unit_cost);
  const valueIn = inputQty * inputCost;
  const qtyIn = await convertToBase(inputQty, unit_id, baseUnit.id);
  const cost = await normalizeRateToBase(inputCost, unit_id, baseUnit.id);
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const existing = await connection.execute(
      `SELECT id FROM stock_ledger WHERE location_id = ? AND raw_material_id = ? AND transaction_type = 'OPENING' AND reference_type = 'OPENING' AND reference_id = 0 LIMIT 1`,
      [location_id, raw_material_id]
    );
    if (existing[0].length > 0) {
      await connection.rollback();
      throw new Error('Opening stock already posted for this location/material');
    }
    const [res] = await connection.execute(
      `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
       VALUES (?, ?, ?, 'OPENING', 'OPENING', 0, ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)`,
      [location_id, raw_material_id, transaction_date, raw_material_id, qtyIn, baseUnit.id, cost, valueIn, batch_no || null, expiry_date || null, createdBy]
    );
    await connection.commit();
    return { id: res.insertId, qty_in: qtyIn, value_in: valueIn, base_unit_id: baseUnit.id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const createGRN = async (data, createdBy) => {
  const { grn_no, grn_date, supplier_id, warehouse_location_id, purchase_order_id, purchase_reference, invoice_reference, remarks, items } = data;
  if (!grn_no || !grn_date || !warehouse_location_id || !items || items.length === 0) throw new Error('GRN number, date, warehouse and items are required');
  const loc = await getLocationById(warehouse_location_id);
  if (!loc) throw new Error('Warehouse location not found');
  const requirePoForGrn = await getSettingValue(warehouse_location_id, 'require_po_for_grn');
  if (requirePoForGrn && !purchase_order_id) throw new Error('This warehouse requires a Purchase Order for GRNs (see Warehouse Settings)');
  const allowOverReceipt = await getSettingValue(warehouse_location_id, 'allow_over_receipt');
  const overReceiptTolerancePct = num(await getSettingValue(warehouse_location_id, 'over_receipt_tolerance_pct'));
  const requireBatchForBatchTracked = await getSettingValue(warehouse_location_id, 'require_batch_for_batch_tracked');
  // 7E1A: per-PO-LINE remaining quantities keyed by purchase_order_items.id.
  // A PO may legally contain the same raw_material_id on multiple lines, so
  // material-grain tracking is ambiguous. Linked historical rows attribute
  // exactly; unlinked legacy rows attribute only when the PO has a single
  // item for that material - otherwise receiving is blocked rather than
  // guessed (an over-receipt is worse than a blocked receipt).
  let poRemaining = {};   // purchase_order_item_id -> remaining base qty
  let poItemsById = new Map();
  let poItemsByMaterial = new Map(); // raw_material_id -> [items]
  if (purchase_order_id) {
    const [po] = await query('SELECT * FROM purchase_orders WHERE id = ?', [purchase_order_id]);
    if (!po) throw new Error('Purchase order not found');
    if (String(po.supplier_id) !== String(supplier_id)) throw new Error('GRN supplier does not match PO supplier');
    if (String(po.warehouse_location_id) !== String(warehouse_location_id)) throw new Error('GRN warehouse does not match PO warehouse');
    if (!['Approved','Sent','Partially Received'].includes(po.status)) throw new Error('PO is not ready for GRN');
    const poItems = await query('SELECT id, raw_material_id, ordered_qty, unit_id FROM purchase_order_items WHERE purchase_order_id = ?', [purchase_order_id]);
    poItemsById = new Map(poItems.map((pi) => [Number(pi.id), pi]));
    for (const pi of poItems) {
      const k = Number(pi.raw_material_id);
      if (!poItemsByMaterial.has(k)) poItemsByMaterial.set(k, []);
      poItemsByMaterial.get(k).push(pi);
    }
    // Ambiguity guard: unlinked legacy receipts + duplicate-material lines
    // can never be allocated per line safely - block with a clear error.
    const dupMaterials = [...poItemsByMaterial.keys()].filter((k) => poItemsByMaterial.get(k).length > 1);
    if (dupMaterials.length) {
      const unlinked = await query(
        `SELECT gri.raw_material_id FROM grn g JOIN grn_items gri ON gri.grn_id = g.id
         WHERE g.purchase_order_id = ? AND gri.purchase_order_item_id IS NULL AND g.status = 'Posted'
           AND gri.raw_material_id IN (${dupMaterials.map(() => '?').join(',')})`,
        [purchase_order_id, ...dupMaterials]
      );
      if (unlinked.length) {
        throw new Error('This PO has multiple lines for the same material with unlinked historical receipts; per-line remaining quantity cannot be established - link the historical GRN items first');
      }
    }
    for (const pi of poItems) {
      const baseUnit = await getMaterialBaseUnit(pi.raw_material_id);
      const orderedBase = await convertToBase(num(pi.ordered_qty), pi.unit_id, baseUnit.id);
      // Accepted = linked rows for THIS line + unlinked legacy rows only when
      // the material maps to exactly one line (single-line => attributable).
      // Per-row conversion in the RECEIPT'S UOM - more faithful than the old
      // SUM-then-convert-by-PO-unit behavior for mixed-UOM receipts.
      const accRows = await query(
        `SELECT gri.accepted_qty, gri.unit_id
         FROM grn g JOIN grn_items gri ON gri.grn_id = g.id
         WHERE g.purchase_order_id = ? AND g.status = 'Posted'
           AND (gri.purchase_order_item_id = ?
                OR (gri.purchase_order_item_id IS NULL AND gri.raw_material_id = ? AND ? = 1))`,
        [purchase_order_id, pi.id, pi.raw_material_id, poItemsByMaterial.get(Number(pi.raw_material_id)).length]
      );
      let acceptedBase = 0;
      for (const r of accRows) acceptedBase += await convertToBase(num(r.accepted_qty), r.unit_id, baseUnit.id);
      poRemaining[Number(pi.id)] = Math.max(0, orderedBase - acceptedBase);
    }
  }
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const existing = await connection.execute('SELECT id FROM grn WHERE grn_no = ? LIMIT 1', [grn_no]);
    if (existing[0].length > 0) {
      await connection.rollback();
      throw new Error('GRN number already exists');
    }
    const totalAmount = items.reduce((sum, it) => sum + (Math.max(0, num(it.received_qty) - num(it.rejected_qty)) * num(it.rate) + num(it.tax_amount)), 0);
    const [grnRes] = await connection.execute(
      `INSERT INTO grn (grn_no, grn_date, supplier_id, warehouse_location_id, purchase_order_id, purchase_reference, invoice_reference, total_amount, status, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?)`,
      [grn_no, grn_date, supplier_id || null, warehouse_location_id, purchase_order_id || null, purchase_reference || null, invoice_reference || null, totalAmount, remarks || null, createdBy]
    );
    const grnId = grnRes.insertId;
    const acceptedThisGRN = {}; // po_item_id -> base qty accepted in THIS GRN
    for (const it of items) {
      const received = num(it.received_qty);
      const rejected = num(it.rejected_qty);
      const accepted = received - rejected;
      if (received < 0 || rejected < 0 || rejected > received || accepted < 0) throw new Error('Invalid GRN item quantities');
      if (num(it.rate) < 0) throw new Error('Rate cannot be negative');
      if (num(it.tax_amount) < 0) throw new Error('Tax amount cannot be negative');
      // 7E1A: resolve source PO line - validated identity, unique inference,
      // or explicit ambiguity rejection. Never trusted blindly from client.
      let poItemId = null;
      if (purchase_order_id) {
        if (it.purchase_order_item_id) {
          const pi = poItemsById.get(Number(it.purchase_order_item_id));
          if (!pi) {
            await connection.rollback();
            throw new Error('Purchase order item does not belong to this purchase order');
          }
          if (Number(pi.raw_material_id) !== Number(it.raw_material_id)) {
            await connection.rollback();
            throw new Error('GRN item material does not match the selected purchase order line');
          }
          poItemId = pi.id;
        } else {
          const candidates = poItemsByMaterial.get(Number(it.raw_material_id)) || [];
          if (candidates.length > 1) {
            await connection.rollback();
            throw new Error('Purchase order contains multiple lines for this material; select the source PO line');
          }
          if (candidates.length === 1) poItemId = candidates[0].id;
        }
        const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
        const acceptedBase = await convertToBase(accepted, it.unit_id, baseUnit.id);
        const already = num(poItemId ? acceptedThisGRN[poItemId] : 0);
        const remaining = num(poItemId ? poRemaining[poItemId] : 0);
        const allowedCeiling = allowOverReceipt ? remaining * (1 + overReceiptTolerancePct / 100) : remaining;
        if (already + acceptedBase > allowedCeiling + 0.0001) {
          await connection.rollback();
          throw new Error(allowOverReceipt
            ? `Accepted quantity exceeds remaining PO quantity plus the ${overReceiptTolerancePct}% over-receipt tolerance`
            : 'Accepted quantity exceeds remaining PO quantity');
        }
        if (poItemId) acceptedThisGRN[poItemId] = already + acceptedBase;
      }
      if (requireBatchForBatchTracked) {
        const [matInfo] = await query('SELECT is_batch_tracked FROM raw_materials WHERE id = ?', [it.raw_material_id]);
        if (matInfo?.is_batch_tracked && !it.batch_no) {
          await connection.rollback();
          throw new Error(`Batch number is required for material ${it.raw_material_id} (see Warehouse Settings)`);
        }
      }
      const itemTotal = accepted * num(it.rate) + num(it.tax_amount);
      await connection.execute(
        `INSERT INTO grn_items (grn_id, purchase_order_item_id, raw_material_id, ordered_qty, received_qty, rejected_qty, accepted_qty, unit_id, rate, tax_amount, total_amount, batch_no, expiry_date, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [grnId, poItemId, it.raw_material_id, it.ordered_qty ? num(it.ordered_qty) : null, received, rejected, accepted, it.unit_id, it.rate, num(it.tax_amount), itemTotal, it.batch_no || null, it.expiry_date || null, it.remarks || null]
      );
    }
    await connection.commit();
    return { id: grnId, grn_no, total_amount: totalAmount, items };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const postGRN = async (grnId, postedBy) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const [grnRows] = await connection.execute('SELECT * FROM grn WHERE id = ? FOR UPDATE', [grnId]);
    if (grnRows.length === 0) throw new Error('GRN not found');
    const grn = grnRows[0];
    if (grn.status === 'Posted') {
      await connection.rollback();
      throw new Error('GRN already posted');
    }
    const [items] = await connection.execute('SELECT * FROM grn_items WHERE grn_id = ?', [grnId]);
    if (grn.purchase_order_id) {
      // Lock the PO row so two GRNs against the same PO can't both post past its
      // remaining quantity - createGRN's own remaining-qty check only sees
      // already-Posted GRNs at creation time, so two Draft GRNs can both pass it
      // before either posts. Re-checking here, serialized on this lock, closes
      // that window.
      await connection.execute('SELECT id FROM purchase_orders WHERE id = ? FOR UPDATE', [grn.purchase_order_id]);
      const allowOverReceipt = await getSettingValue(grn.warehouse_location_id, 'allow_over_receipt');
      const overReceiptTolerancePct = num(await getSettingValue(grn.warehouse_location_id, 'over_receipt_tolerance_pct'));
      const [poItems] = await connection.execute('SELECT id, raw_material_id, ordered_qty, unit_id FROM purchase_order_items WHERE purchase_order_id = ?', [grn.purchase_order_id]);
      const poItemsById = new Map(poItems.map((pi) => [Number(pi.id), pi]));
      const poItemsByMaterial = new Map();
      for (const pi of poItems) {
        const k = Number(pi.raw_material_id);
        if (!poItemsByMaterial.has(k)) poItemsByMaterial.set(k, []);
        poItemsByMaterial.get(k).push(pi);
      }
      // 7E1A: same per-line attribution rules as createGRN - linked rows
      // resolve to their exact PO line; unlinked legacy rows resolve only
      // when the material maps to a single line, else posting is blocked.
      const thisAccepted = {};
      for (const it of items) {
        let pi = it.purchase_order_item_id ? poItemsById.get(Number(it.purchase_order_item_id)) : null;
        if (!pi && it.purchase_order_item_id) {
          await connection.rollback();
          throw new Error('Linked purchase order item no longer belongs to this purchase order');
        }
        if (!pi) {
          const candidates = poItemsByMaterial.get(Number(it.raw_material_id)) || [];
          if (candidates.length > 1) {
            await connection.rollback();
            throw new Error('Cannot post: PO has multiple lines for this material and the receipt is unlinked - link the GRN item first');
          }
          pi = candidates[0] || null;
        }
        if (!pi) continue;
        const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
        const orderedBase = await convertToBase(num(pi.ordered_qty), pi.unit_id, baseUnit.id);
        const [acc] = await connection.execute(
          `SELECT gri.accepted_qty, gri.unit_id
           FROM grn g JOIN grn_items gri ON gri.grn_id = g.id
           WHERE g.purchase_order_id = ? AND g.status = 'Posted' AND g.id != ?
             AND (gri.purchase_order_item_id = ?
                  OR (gri.purchase_order_item_id IS NULL AND gri.raw_material_id = ? AND ? = 1))`,
          [grn.purchase_order_id, grnId, pi.id, pi.raw_material_id, poItemsByMaterial.get(Number(pi.raw_material_id)).length]
        );
        let alreadyAcceptedBase = 0;
        for (const r of acc[0]) alreadyAcceptedBase += await convertToBase(num(r.accepted_qty), r.unit_id, baseUnit.id);
        const thisAcceptedBase = await convertToBase(num(it.accepted_qty), it.unit_id, baseUnit.id);
        const already = num(thisAccepted[pi.id]);
        const remaining = Math.max(0, orderedBase - alreadyAcceptedBase);
        const allowedCeiling = allowOverReceipt ? remaining * (1 + overReceiptTolerancePct / 100) : remaining;
        if (already + thisAcceptedBase > allowedCeiling + 0.0001) {
          await connection.rollback();
          throw new Error(allowOverReceipt
            ? `Cannot post: accepted quantity now exceeds remaining PO quantity plus the ${overReceiptTolerancePct}% over-receipt tolerance (another GRN against this PO was posted first)`
            : 'Cannot post: accepted quantity now exceeds remaining PO quantity (another GRN against this PO was posted first)');
        }
        thisAccepted[pi.id] = already + thisAcceptedBase;
      }
    }
    for (const it of items) {
      const existing = await connection.execute(
        'SELECT id FROM stock_ledger WHERE transaction_type = "PURCHASE_GRN" AND reference_type = "GRN" AND reference_id = ? AND reference_item_id = ? LIMIT 1',
        [grnId, it.id]
      );
      if (existing[0].length > 0) continue;
      const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
      const inputAccepted = num(it.accepted_qty);
      const inputRate = num(it.rate);
      const valueIn = inputAccepted * inputRate;
      const qtyIn = await convertToBase(inputAccepted, it.unit_id, baseUnit.id);
      const unitCost = await normalizeRateToBase(inputRate, it.unit_id, baseUnit.id);
      await connection.execute(
        `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
         VALUES (?, ?, ?, 'PURCHASE_GRN', 'GRN', ?, ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)`,
        [grn.warehouse_location_id, it.raw_material_id, grn.grn_date, grnId, it.id, qtyIn, baseUnit.id, unitCost, valueIn, it.batch_no || null, it.expiry_date || null, postedBy]
      );
    }
    // Phase 6A3: every accepted GRN item creates a Draft PURCHASE accounting
    // effect in the SAME transaction. GRN Posting itself is still not a
    // financial event - the effect stays Draft until an accounting checker
    // (who cannot be this poster) runs verify-post. Owner resolution never
    // guesses: an unmapped central location yields outlet_id NULL, and such
    // effects can never be posted financially.
    const accountingOwner = await resolveAccountingOwner(grn.warehouse_location_id);
    for (const it of items) {
      if (num(it.accepted_qty) <= 0) continue; // fully-rejected items carry no purchase
      await createEffectInTransaction(connection, {
        effect_type: 'PURCHASE',
        source_type: 'GRN',
        source_id: grnId,
        source_item_id: it.id,
        outlet_id: accountingOwner.accounting_outlet_id,
        location_id: grn.warehouse_location_id,
        supplier_id: grn.supplier_id,
        raw_material_id: it.raw_material_id,
        effective_date: grn.grn_date,
        quantity: it.accepted_qty,
        unit_id: it.unit_id,
        base_amount: num(it.accepted_qty) * num(it.rate),
        tax_amount: num(it.tax_amount),
        total_amount: num(it.total_amount),
        metadata_json: { grn_no: grn.grn_no, invoice_reference: grn.invoice_reference || null },
      }, postedBy);
    }
    await connection.execute("UPDATE grn SET status = 'Posted' WHERE id = ?", [grnId]);
    if (grn.purchase_order_id) await updatePOStatusAfterGRN(connection, grn.purchase_order_id);
    await connection.commit();
    return { id: grnId, status: 'Posted' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const getGRNs = async (filters) => {
  const { location_id, status, page, limit, allowedLocationIds } = filters || {};
  // Same WHERE clause reused for both the COUNT and the page SELECT, so the
  // total always matches what the filters actually restrict - built once
  // here rather than duplicated as two separately-maintained strings.
  let whereSql = 'WHERE 1=1';
  const whereParams = [];
  if (location_id) { whereSql += ' AND g.warehouse_location_id = ?'; whereParams.push(location_id); }
  if (status) { whereSql += ' AND g.status = ?'; whereParams.push(status); }
  // Confines a location-scoped caller to GRNs at a location they're actually
  // allowed to see, regardless of location_id above - see resolveScopedLocationIds
  // in warehouseMiddleware.js. undefined means the caller has full access.
  if (allowedLocationIds) {
    if (allowedLocationIds.length) {
      whereSql += ` AND g.warehouse_location_id IN (${allowedLocationIds.map(() => '?').join(',')})`;
      whereParams.push(...allowedLocationIds);
    } else {
      whereSql += ' AND 1=0';
    }
  }

  const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM grn g ${whereSql}`, whereParams);
  const total = countRows[0]?.total || 0;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 25);
  const offset = (pageNum - 1) * limitNum;

  const [rows] = await pool.query(
    `SELECT g.*, s.supplier_name, l.location_name FROM grn g LEFT JOIN suppliers s ON s.id = g.supplier_id LEFT JOIN locations l ON l.id = g.warehouse_location_id ${whereSql} ORDER BY g.created_at DESC LIMIT ? OFFSET ?`,
    [...whereParams, limitNum, offset]
  );
  return { data: rows, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) || 1 } };
};

export const getGRNById = async (id) => {
  const [grn] = await query(
    `SELECT g.*, s.supplier_name, s.gstin, s.address as supplier_address, s.city as supplier_city,
      s.state as supplier_state, s.pincode as supplier_pincode, s.phone as supplier_phone, s.email as supplier_email,
      l.location_name, l.gstin as location_gstin, l.address as location_address, l.city as location_city,
      l.state as location_state, l.pincode as location_pincode
     FROM grn g
     LEFT JOIN suppliers s ON s.id = g.supplier_id
     LEFT JOIN locations l ON l.id = g.warehouse_location_id
     WHERE g.id = ? LIMIT 1`,
    [id]
  );
  const items = await query(
    `SELECT gri.*, rm.material_name, rm.material_code, rm.hsn_code, rm.gst_rate, u.unit_name
     FROM grn_items gri
     LEFT JOIN raw_materials rm ON rm.id = gri.raw_material_id
     LEFT JOIN units u ON u.id = gri.unit_id
     WHERE gri.grn_id = ?`,
    [id]
  );
  return { ...grn, items };
};

export const getCurrentStock = async (locationId, options = {}) => {
  const { materialRole } = options;
  const rows = await query(`
    SELECT
      sl.raw_material_id,
      rm.material_code,
      rm.material_name,
      rm.material_role,
      c.category_name as category,
      u.unit_name,
      rm.min_stock_qty,
      rm.reorder_level,
      COALESCE(SUM(CASE WHEN sl.transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN sl.qty_in ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN sl.transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN sl.qty_out ELSE 0 END), 0) as current_qty,
      COALESCE(SUM(CASE WHEN sl.transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN sl.value_in ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN sl.transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT') THEN sl.value_out ELSE 0 END), 0) as total_value
    FROM stock_ledger sl
    LEFT JOIN raw_materials rm ON rm.id = sl.raw_material_id
    LEFT JOIN categories c ON c.id = rm.category_id
    LEFT JOIN units u ON u.id = sl.unit_id
    WHERE sl.location_id = ?
      AND (? IS NULL OR rm.material_role = ?)
    GROUP BY sl.raw_material_id, rm.material_code, rm.material_name, rm.material_role, c.category_name, u.unit_name, rm.min_stock_qty, rm.reorder_level
  `, [locationId, materialRole || null, materialRole || null]);
  return rows.map((r) => {
    const currentQty = num(r.current_qty);
    const totalValue = num(r.total_value);
    const avgCost = currentQty > 0 ? totalValue / currentQty : 0;
    let status = 'In Stock';
    if (currentQty <= 0) status = 'Out of Stock';
    else if (currentQty <= num(r.min_stock_qty)) status = 'Low Stock';
    return { ...r, current_qty: currentQty, total_value: totalValue, average_cost: avgCost, status };
  });
};

export const getStockLedger = async (filters) => {
  const { location_id, raw_material_id, transaction_type, from_date, to_date, allowedLocationIds } = filters || {};
  let sql = `SELECT sl.*, rm.material_name, rm.material_code, u.unit_name, l.location_name, us.full_name as created_by_name
    FROM stock_ledger sl
    LEFT JOIN raw_materials rm ON rm.id = sl.raw_material_id
    LEFT JOIN units u ON u.id = sl.unit_id
    LEFT JOIN locations l ON l.id = sl.location_id
    LEFT JOIN users us ON us.id = sl.created_by
    WHERE 1=1`;
  const params = [];
  if (location_id) { sql += ' AND sl.location_id = ?'; params.push(location_id); }
  if (raw_material_id) { sql += ' AND sl.raw_material_id = ?'; params.push(raw_material_id); }
  if (transaction_type) { sql += ' AND sl.transaction_type = ?'; params.push(transaction_type); }
  if (from_date && to_date) { sql += ' AND sl.transaction_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  // Confines a location-scoped caller to their own location's ledger, same as
  // every other list endpoint in this file - see resolveScopedLocationIds in
  // warehouseMiddleware.js. Filtering here (not just after) also keeps the
  // running balance below correct for a scoped caller: it must only ever
  // accumulate from rows they're actually allowed to see.
  if (allowedLocationIds) {
    if (allowedLocationIds.length) {
      sql += ` AND sl.location_id IN (${allowedLocationIds.map(() => '?').join(',')})`;
      params.push(...allowedLocationIds);
    } else {
      sql += ' AND 1=0';
    }
  }
  sql += ' ORDER BY sl.transaction_date, sl.id';
  const rows = await query(sql, params);
  let balance = 0;
  return rows.map((r) => {
    balance += num(r.qty_in) - num(r.qty_out);
    return { ...r, running_balance: balance };
  });
};

export const getDashboardMetrics = async (locationId) => {
  const current = await getCurrentStock(locationId);
  const totalMaterials = current.length;
  const totalValue = current.reduce((s, r) => s + r.total_value, 0);
  const inStock = current.filter((r) => r.status === 'In Stock').length;
  const lowStock = current.filter((r) => r.status === 'Low Stock').length;
  const outOfStock = current.filter((r) => r.status === 'Out of Stock').length;
  const pendingGRNs = await query("SELECT COUNT(*) as c FROM grn WHERE warehouse_location_id = ? AND status = 'Draft'", [locationId]);
  const pendingReceipts = await query(
    "SELECT COUNT(*) as c FROM stock_transfers WHERE to_location_id = ? AND status IN ('In Transit', 'Partially Received')",
    [locationId]
  );
  const pendingRequisitions = await query(
    "SELECT COUNT(*) as c FROM stock_requisitions WHERE from_location_id = ? AND status IN ('Submitted', 'Approved', 'Partially Approved')",
    [locationId]
  );
  const inTransitTransfers = await query(
    "SELECT COUNT(*) as c FROM stock_transfers WHERE from_location_id = ? AND status = 'In Transit'",
    [locationId]
  );
  const completedTodayTransfers = await query(
    "SELECT COUNT(*) as c FROM stock_transfers WHERE from_location_id = ? AND status = 'Received' AND DATE(received_at) = CURDATE()",
    [locationId]
  );
  const expiryRows = await query(`
    SELECT sl.raw_material_id, sl.batch_no, sl.expiry_date, SUM(sl.qty_in) - COALESCE((SELECT SUM(qty_out) FROM stock_ledger s2 WHERE s2.location_id = ? AND s2.raw_material_id = sl.raw_material_id AND s2.batch_no = sl.batch_no AND s2.transaction_type NOT IN ('OPENING','PURCHASE_GRN')), 0) as batch_qty
    FROM stock_ledger sl
    WHERE sl.location_id = ? AND sl.expiry_date IS NOT NULL
    GROUP BY sl.raw_material_id, sl.batch_no, sl.expiry_date
    HAVING batch_qty > 0
  `, [locationId, locationId]);
  const now = new Date();
  const nearExpiry = expiryRows.filter((r) => {
    const exp = new Date(r.expiry_date);
    const diff = (exp - now) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }).length;
  const expired = expiryRows.filter((r) => new Date(r.expiry_date) < now).length;
  return {
    current_stock_value: totalValue,
    total_materials: totalMaterials,
    in_stock: inStock,
    low_stock: lowStock,
    out_of_stock: outOfStock,
    near_expiry: nearExpiry,
    expired,
    pending_grns: pendingGRNs[0]?.c || 0,
    pending_requisitions: pendingRequisitions[0]?.c || 0,
    in_transit_transfers: inTransitTransfers[0]?.c || 0,
    completed_today_transfers: completedTodayTransfers[0]?.c || 0,
    pending_receipts: pendingReceipts[0]?.c || 0,
  };
};

// --- Phase 2B: Requisitions & Stock Transfers ---

export const getRequisitions = async (filters = {}) => {
  const { location_id, from_location_id, to_location_id, status, allowedLocationIds, page, limit } = filters;
  // Same WHERE clause reused for both the COUNT and the page SELECT (see
  // getGRNs above), so the total always matches what allowedLocationIds
  // actually restricts.
  let whereSql = 'WHERE 1=1';
  const whereParams = [];
  if (location_id) { whereSql += ' AND (sr.from_location_id = ? OR sr.to_location_id = ?)'; whereParams.push(location_id, location_id); }
  if (from_location_id) { whereSql += ' AND sr.from_location_id = ?'; whereParams.push(from_location_id); }
  if (to_location_id) { whereSql += ' AND sr.to_location_id = ?'; whereParams.push(to_location_id); }
  if (status) { whereSql += ' AND sr.status = ?'; whereParams.push(status); }
  // Confines a location-scoped caller (e.g. an outlet user, or Warehouse
  // Admin) to requisitions touching a location they're actually allowed to
  // see, regardless of whatever from/to/location_id filter (or lack of one)
  // the client sent - see resolveScopedLocationIds in warehouseMiddleware.js.
  if (allowedLocationIds) {
    // allowedLocationIds is an array (possibly empty - e.g. a Warehouse
    // Admin when no Central Warehouse location is active) whenever the
    // caller is location-scoped; undefined means full access, no restriction.
    if (allowedLocationIds.length) {
      const placeholders = allowedLocationIds.map(() => '?').join(',');
      whereSql += ` AND (sr.from_location_id IN (${placeholders}) OR sr.to_location_id IN (${placeholders}))`;
      whereParams.push(...allowedLocationIds, ...allowedLocationIds);
    } else {
      whereSql += ' AND 1=0';
    }
  }

  const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM stock_requisitions sr ${whereSql}`, whereParams);
  const total = countRows[0]?.total || 0;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 25);
  const offset = (pageNum - 1) * limitNum;

  const [rows] = await pool.query(
    `SELECT sr.*, fl.location_name as from_location, tl.location_name as to_location, u.full_name as created_by_name
    FROM stock_requisitions sr
    LEFT JOIN locations fl ON fl.id = sr.from_location_id
    LEFT JOIN locations tl ON tl.id = sr.to_location_id
    LEFT JOIN users u ON u.id = sr.created_by
    ${whereSql} ORDER BY sr.created_at DESC LIMIT ? OFFSET ?`,
    [...whereParams, limitNum, offset]
  );
  return { data: rows, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) || 1 } };
};

export const getRequisitionById = async (id) => {
  const [req] = await query('SELECT * FROM stock_requisitions WHERE id = ? LIMIT 1', [id]);
  if (!req) return null;
  const items = await query(`SELECT sri.*, rm.material_name, rm.material_code, u.unit_name
    FROM stock_requisition_items sri
    LEFT JOIN raw_materials rm ON rm.id = sri.raw_material_id
    LEFT JOIN units u ON u.id = sri.unit_id
    WHERE sri.requisition_id = ?`, [id]);
  return { ...req, items };
};

// Phase 7B1: the Outlet Purchase Order number is generated server-side. Any
// `requisition_no` sent by the client is deliberately ignored - a caller must
// never be able to pick (or squat on) a document number.
const OPO_NO_MAX_ATTEMPTS = 5;

const sanitizeOutletCode = (raw) => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

const generateOutletPoNo = async (connection, toLocationId, requestDate) => {
  const [locRows] = await connection.execute(
    `SELECT l.id, l.location_code, o.outlet_code
     FROM locations l LEFT JOIN outlets o ON o.id = l.outlet_id
     WHERE l.id = ? LIMIT 1`,
    [toLocationId]
  );
  const loc = locRows[0];
  if (!loc) throw new Error('Destination outlet/location not found');
  // Prefer the outlet master code (HSR, KOR, ...) over the location_code which
  // is auto-generated as <OUTLET>-<id>; fall back to LOC<id> so a number can
  // still be issued if a location has neither code populated.
  const code = sanitizeOutletCode(loc.outlet_code || loc.location_code) || `LOC${loc.id}`;
  const year = new Date(requestDate).getFullYear();
  const prefix = `OPO-${code}-${year}-`;
  // Locking read over this outlet+year's requisition_no index range. Under the
  // pool's default InnoDB REPEATABLE READ isolation the next-key locks serialize
  // concurrent creators so two transactions cannot read the same max sequence;
  // the ER_DUP_ENTRY retry in createRequisition covers any residual race (e.g.
  // if the server is ever switched to READ COMMITTED where gap locks don't
  // exist). The sanitized code contains only [A-Z0-9], so no LIKE wildcards can
  // leak into the prefix.
  const [rows] = await connection.execute(
    `SELECT requisition_no FROM stock_requisitions
     WHERE requisition_no LIKE ?
     ORDER BY CAST(SUBSTRING_INDEX(requisition_no, '-', -1) AS UNSIGNED) DESC
     LIMIT 1 FOR UPDATE`,
    [`${prefix}%`]
  );
  const lastSeq = rows.length ? Number(String(rows[0].requisition_no).split('-').pop()) || 0 : 0;
  return `${prefix}${String(lastSeq + 1).padStart(6, '0')}`;
};

// Valid UOM options for one material's Outlet PO line: the base unit plus
// every active unit the SAME findConversionFactor() used by create validation
// can convert into base - so a selector built on this list can never offer a
// unit the backend would reject. The pure selector is exported separately so
// it can be exercised with fixtures without a database.
export const computeValidUnits = async (baseUnit, units, factorLookup = findConversionFactor) => {
  const valid = [];
  for (const u of units) {
    if (Number(u.id) === Number(baseUnit.id)) { valid.push({ ...u, is_base: 1 }); continue; }
    try { await factorLookup(u.id, baseUnit.id); valid.push({ ...u, is_base: 0 }); }
    catch { /* different dimension or no defined conversion - not a valid option */ }
  }
  return valid;
};

export const getValidUnitsForMaterial = async (rawMaterialId) => {
  const baseUnit = await getMaterialBaseUnit(rawMaterialId); // throws if material/base unit missing
  const units = await query('SELECT id, unit_name, unit_symbol, unit_type FROM units WHERE is_active = 1 ORDER BY unit_name');
  return computeValidUnits(baseUnit, units);
};

export const createRequisition = async (data, userId) => {
  // `requisition_no` is intentionally NOT read from the payload - see above.
  const { from_location_id, to_location_id, request_date, required_date, remarks, items } = data;
  if (!from_location_id || !to_location_id || !request_date || !items?.length) throw new Error('Missing required Outlet Purchase Order fields');

  const reqDate = new Date(request_date);
  if (isNaN(reqDate.getTime())) throw new Error('Invalid Request Date');
  if (required_date) {
    const expDate = new Date(required_date);
    if (isNaN(expDate.getTime())) throw new Error('Invalid Expected Delivery Date');
    if (expDate < reqDate) throw new Error('Expected Delivery Date cannot be before Request Date');
  }

  const [fromLoc] = await query('SELECT id FROM locations WHERE id = ? LIMIT 1', [from_location_id]);
  if (!fromLoc) throw new Error('Source warehouse/location not found');

  // Line validation before opening a transaction: material existence and base
  // unit, positive quantity, deterministic duplicate rejection, and UOM
  // convertibility via the shared uom_conversions rules (findConversionFactor
  // throws on a missing unit, a cross-dimension pair, or no defined factor -
  // the backend stays authoritative for all conversion maths).
  const seenMaterials = new Set();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const matId = Number(it.raw_material_id);
    const qty = num(it.requested_qty);
    if (!matId || !it.unit_id) throw new Error(`Invalid item on line ${i + 1}`);
    if (!(qty > 0)) throw new Error(`Requested quantity must be greater than 0 on line ${i + 1}`);
    if (seenMaterials.has(matId)) throw new Error(`Duplicate material on line ${i + 1} - combine it into one line`);
    seenMaterials.add(matId);
    const baseUnit = await getMaterialBaseUnit(matId); // throws if material/base unit missing
    try {
      await findConversionFactor(it.unit_id, baseUnit.id);
    } catch (e) {
      throw new Error(`Line ${i + 1}: ${e.message}`);
    }
  }

  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    let requisitionId = null;
    for (let attempt = 0; attempt < OPO_NO_MAX_ATTEMPTS && !requisitionId; attempt++) {
      const requisition_no = await generateOutletPoNo(connection, to_location_id, request_date);
      try {
        const [res] = await connection.execute(
          `INSERT INTO stock_requisitions (requisition_no, from_location_id, to_location_id, request_date, required_date, status, remarks, created_by)
           VALUES (?, ?, ?, ?, ?, 'Draft', ?, ?)`,
          [requisition_no, from_location_id, to_location_id, request_date, required_date || null, remarks || null, userId]
        );
        requisitionId = res.insertId;
      } catch (e) {
        // Duplicate requisition_no - another creator won the race between the
        // sequence read and this insert. Roll forward with a fresh number;
        // any other failure aborts the transaction as before.
        if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) continue;
        throw e;
      }
    }
    if (!requisitionId) throw new Error('Could not allocate an Outlet Purchase Order number - please retry');
    for (const it of items) {
      await connection.execute(
        `INSERT INTO stock_requisition_items (requisition_id, raw_material_id, requested_qty, unit_id, remarks)
         VALUES (?, ?, ?, ?, ?)`,
        [requisitionId, it.raw_material_id, num(it.requested_qty), it.unit_id, it.remarks || null]
      );
    }
    await connection.commit();
    return getRequisitionById(requisitionId);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

export const submitRequisition = async (id, userId) => {
  const [req] = await query('SELECT status FROM stock_requisitions WHERE id = ?', [id]);
  if (!req) throw new Error('Outlet Purchase Order not found');
  if (req.status !== 'Draft') throw new Error('Only a Draft Outlet Purchase Order can be submitted');
  await query(`UPDATE stock_requisitions SET status = 'Submitted', submitted_by = ?, submitted_at = NOW() WHERE id = ?`, [userId, id]);
  return getRequisitionById(id);
};

export const approveRequisition = async (id, data, userId) => {
  const { items, remarks, rejection_reason } = data || {};
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const [reqRows] = await connection.execute('SELECT * FROM stock_requisitions WHERE id = ? FOR UPDATE', [id]);
    if (!reqRows.length) throw new Error('Outlet Purchase Order not found');
    const req = reqRows[0];
    // Explicit single from-status: this endpoint decides Approved /
    // Partially Approved / Rejected, all of which may only ever be reached from
    // Submitted. Anything already Approved, Partially Approved, Rejected,
    // Dispatched, Received or Cancelled must not be re-reviewed here.
    if (req.status !== 'Submitted') throw new Error('Only a Submitted Outlet Purchase Order can be reviewed');
    // Approving (or rejecting) an Outlet Purchase Order authorises the warehouse
    // to hand over stock, so it is the checker step - the raising outlet user must
    // not also be the one who signs it off. Same rule the rest of this codebase's
    // approval workflows already enforce. The final argument is the user-facing
    // document label in the 403 message, so it uses the outlet-facing wording.
    assertNotOwnDocument(req, userId, 'created_by', 'approve or reject', 'Outlet Purchase Order');

    const [itemRows] = await connection.execute(
      `SELECT sri.*, rm.material_name, rm.material_code, u.unit_name
       FROM stock_requisition_items sri
       LEFT JOIN raw_materials rm ON rm.id = sri.raw_material_id
       LEFT JOIN units u ON u.id = sri.unit_id
       WHERE sri.requisition_id = ?`,
      [id]
    );
    if (!items || items.length !== itemRows.length) throw new Error('Approval quantities required for all items');

    const approvedItems = [];
    for (const it of items) {
      const item = itemRows.find((x) => x.id === Number(it.id));
      if (!item) throw new Error('Invalid item');
      const approved = num(it.approved_qty);
      if (approved < 0 || approved > num(item.requested_qty)) throw new Error('Approved qty cannot exceed requested or be negative');
      // Validate against available stock at warehouse
      const stock = await getCurrentStock(req.from_location_id);
      const matStock = stock.find((s) => Number(s.raw_material_id) === Number(item.raw_material_id));
      const available = num(matStock?.current_qty);
      const baseUnit = await getMaterialBaseUnit(item.raw_material_id);
      const approvedBase = await convertToBase(approved, item.unit_id, baseUnit.id);
      if (approvedBase > available) throw new Error(`Insufficient stock for ${item.material_name}`);
      approvedItems.push({ ...item, approved_qty: approved, approved_base: approvedBase });
      await connection.execute('UPDATE stock_requisition_items SET approved_qty = ? WHERE id = ?', [approved, it.id]);
    }

    const totalApproved = approvedItems.reduce((s, i) => s + num(i.approved_qty), 0);
    const totalRequested = itemRows.reduce((s, i) => s + num(i.requested_qty), 0);
    let status = 'Approved';
    if (totalApproved === 0) status = 'Rejected';
    else if (totalApproved < totalRequested) status = 'Partially Approved';
    if (status === 'Rejected' && !rejection_reason) throw new Error('Rejection reason required');

    await connection.execute(
      `UPDATE stock_requisitions SET status = ?, approved_by = ?, approved_at = NOW(), remarks = ?, rejection_reason = ? WHERE id = ?`,
      [status, userId, remarks || req.remarks, status === 'Rejected' ? (rejection_reason || null) : null, id]
    );
    await connection.commit();
    return getRequisitionById(id);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

export const dispatchRequisition = async (id, data, userId) => {
  const { transfer_no, dispatch_date, vehicle_no, driver_name, dispatch_reference, remarks, items } = data;
  const req = await getRequisitionById(id);
  if (!req) throw new Error('Outlet Purchase Order not found');
  if (req.status !== 'Approved' && req.status !== 'Partially Approved') throw new Error('Only an Approved Outlet Purchase Order can be dispatched');
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const existing = await connection.execute('SELECT id FROM stock_transfers WHERE transfer_no = ? LIMIT 1', [transfer_no]);
    if (existing[0].length > 0) { await connection.rollback(); throw new Error('Transfer number already exists'); }
    const [res] = await connection.execute(
      `INSERT INTO stock_transfers (transfer_no, requisition_id, from_location_id, to_location_id, dispatch_date, status, vehicle_no, driver_name, dispatch_reference, remarks, dispatched_by)
       VALUES (?, ?, ?, ?, ?, 'In Transit', ?, ?, ?, ?, ?)`,
      [transfer_no, id, req.from_location_id, req.to_location_id, dispatch_date, vehicle_no || null, driver_name || null, dispatch_reference || null, remarks || null, userId]
    );
    const transferId = res.insertId;

    for (const it of items) {
      const reqItem = req.items.find((x) => Number(x.raw_material_id) === Number(it.raw_material_id));
      if (!reqItem) { await connection.rollback(); throw new Error('Invalid transfer item'); }
      const dispatchQty = num(it.dispatched_qty);
      if (dispatchQty <= 0 || dispatchQty > num(reqItem.approved_qty)) { await connection.rollback(); throw new Error('Dispatch qty must be > 0 and <= approved'); }
      const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
      const baseQty = await convertToBase(dispatchQty, it.unit_id, baseUnit.id);
      const stock = await getCurrentStock(req.from_location_id);
      const matStock = stock.find((s) => Number(s.raw_material_id) === Number(it.raw_material_id));
      const available = num(matStock?.current_qty);
      if (baseQty > available) { await connection.rollback(); throw new Error('Insufficient warehouse stock for dispatch'); }
      const unitCost = matStock ? (num(matStock.total_value) / num(matStock.current_qty)) : 0;

      const matRows = await query('SELECT is_batch_tracked, transfer_price FROM raw_materials WHERE id = ? LIMIT 1', [it.raw_material_id]);
      const isBatchTracked = num(matRows[0]?.is_batch_tracked) === 1;
      // Warehouse "sale" price to the outlet - independent of purchase cost.
      // Snapshotted at dispatch time (like unit_cost already is) so a later
      // price-list change doesn't retroactively shift a past transfer's
      // recorded margin. Null (not 0) when no transfer price has been set
      // for this material yet, so the profit report can show that
      // distinctly rather than silently reporting zero margin.
      const transferPrice = matRows[0]?.transfer_price !== null && matRows[0]?.transfer_price !== undefined ? num(matRows[0].transfer_price) : null;

      if (isBatchTracked) {
        const allocations = await allocateFEFO(req.from_location_id, it.raw_material_id, baseQty);
        for (const alloc of allocations) {
          const valueOut = num(alloc.allocated_qty) * unitCost;
          const saleValue = transferPrice !== null ? num(alloc.allocated_qty) * transferPrice : null;
          await connection.execute(
            `INSERT INTO stock_transfer_items (transfer_id, raw_material_id, approved_qty, dispatched_qty, unit_id, unit_cost, transfer_price, sale_value, batch_no, expiry_date, remarks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [transferId, it.raw_material_id, 0, alloc.allocated_qty, baseUnit.id, unitCost, transferPrice, saleValue, alloc.batch_no || null, alloc.expiry_date || null, it.remarks || null]
          );
          await connection.execute(
            `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
             VALUES (?, ?, ?, 'TRANSFER_OUT', 'TRANSFER', ?, LAST_INSERT_ID(), 0, ?, ?, ?, 0, ?, ?, ?, ?)`,
            [req.from_location_id, it.raw_material_id, dispatch_date, transferId, alloc.allocated_qty, baseUnit.id, unitCost, valueOut, alloc.batch_no || null, alloc.expiry_date || null, userId]
          );
        }
      } else {
        const valueOut = baseQty * unitCost;
        const saleValue = transferPrice !== null ? baseQty * transferPrice : null;
        await connection.execute(
          `INSERT INTO stock_transfer_items (transfer_id, raw_material_id, approved_qty, dispatched_qty, unit_id, unit_cost, transfer_price, sale_value, batch_no, expiry_date, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [transferId, it.raw_material_id, num(reqItem.approved_qty), dispatchQty, it.unit_id, unitCost, transferPrice, saleValue, it.batch_no || null, it.expiry_date || null, it.remarks || null]
        );
        await connection.execute(
          `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
           VALUES (?, ?, ?, 'TRANSFER_OUT', 'TRANSFER', ?, LAST_INSERT_ID(), 0, ?, ?, ?, 0, ?, ?, ?, ?)`,
          [req.from_location_id, it.raw_material_id, dispatch_date, transferId, baseQty, baseUnit.id, unitCost, valueOut, it.batch_no || null, it.expiry_date || null, userId]
        );
      }
    }

    await connection.execute(`UPDATE stock_requisitions SET status = 'In Transit' WHERE id = ?`, [id]);
    await connection.commit();
    return getTransferById(transferId);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

export const getTransfers = async (filters = {}) => {
  const { location_id, from_location_id, to_location_id, status, requisition_id, allowedLocationIds, search, type, date_from, date_to, raw_material_id } = filters;
  let sql = `SELECT st.*, fl.location_name as from_location, tl.location_name as to_location, sr.requisition_no,
      CASE
        WHEN st.requisition_id IS NULL AND st.production_request_id IS NULL THEN 'Outlet Transfer'
        WHEN st.requisition_id IS NOT NULL THEN 'Requisition'
        WHEN st.production_request_id IS NOT NULL THEN 'Production'
        ELSE 'Other'
      END as transfer_type,
      COALESCE(agg.item_count, 0) as item_count,
      COALESCE(agg.planned_qty, 0) as planned_qty,
      COALESCE(agg.dispatched_qty, 0) as dispatched_qty,
      COALESCE(agg.received_qty, 0) as received_qty,
      COALESCE(agg.damaged_qty, 0) as damaged_qty,
      COALESCE(agg.short_qty, 0) as short_qty,
      GREATEST(COALESCE(agg.dispatched_qty, 0) - COALESCE(agg.received_qty, 0) - COALESCE(agg.damaged_qty, 0) - COALESCE(agg.short_qty, 0), 0) as unaccounted_qty,
      COALESCE(agg.total_value, 0) as total_value,
      u1.full_name as dispatched_by_name, u2.full_name as received_by_name
    FROM stock_transfers st
    LEFT JOIN locations fl ON fl.id = st.from_location_id
    LEFT JOIN locations tl ON tl.id = st.to_location_id
    LEFT JOIN stock_requisitions sr ON sr.id = st.requisition_id
    LEFT JOIN users u1 ON u1.id = st.dispatched_by
    LEFT JOIN users u2 ON u2.id = st.received_by
    LEFT JOIN (
      SELECT
        transfer_id,
        COUNT(*) AS item_count,
        SUM(approved_qty) AS planned_qty,
        SUM(dispatched_qty) AS dispatched_qty,
        SUM(received_qty) AS received_qty,
        SUM(damaged_qty) AS damaged_qty,
        SUM(short_qty) AS short_qty,
        SUM(dispatched_qty * COALESCE(unit_cost, 0)) AS total_value
      FROM stock_transfer_items
      GROUP BY transfer_id
    ) agg ON agg.transfer_id = st.id
    WHERE 1=1`;
  const params = [];
  if (location_id) { sql += ' AND (st.from_location_id = ? OR st.to_location_id = ?)'; params.push(location_id, location_id); }
  if (from_location_id) { sql += ' AND st.from_location_id = ?'; params.push(from_location_id); }
  if (to_location_id) { sql += ' AND st.to_location_id = ?'; params.push(to_location_id); }
  if (status) { sql += ' AND st.status = ?'; params.push(status); }
  if (requisition_id) { sql += ' AND st.requisition_id = ?'; params.push(requisition_id); }
  if (search) {
    sql += ' AND (st.transfer_no LIKE ? OR sr.requisition_no LIKE ? OR fl.location_name LIKE ? OR tl.location_name LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  // Req #18 transfer-type filter: whitelisted values only, mapped to fixed
  // predicates - never concatenated from the raw user value.
  if (type === 'outlet') { sql += ' AND st.requisition_id IS NULL AND st.production_request_id IS NULL'; }
  else if (type === 'requisition') { sql += ' AND st.requisition_id IS NOT NULL'; }
  else if (type === 'production') { sql += ' AND st.production_request_id IS NOT NULL'; }
  // History/report date: dispatched transfers filter by dispatch date; Drafts
  // (dispatch_date NULL by #16 design) filter by creation date so they stay visible.
  if (date_from) { sql += ' AND DATE(COALESCE(st.dispatch_date, st.created_at)) >= ?'; params.push(date_from); }
  if (date_to) { sql += ' AND DATE(COALESCE(st.dispatch_date, st.created_at)) <= ?'; params.push(date_to); }
  if (raw_material_id) {
    sql += ' AND EXISTS (SELECT 1 FROM stock_transfer_items sti_filter WHERE sti_filter.transfer_id = st.id AND sti_filter.raw_material_id = ?)';
    params.push(raw_material_id);
  }
  // See getRequisitions() above - confines a location-scoped caller to
  // transfers touching a location they're allowed to see.
  if (allowedLocationIds) {
    if (allowedLocationIds.length) {
      const placeholders = allowedLocationIds.map(() => '?').join(',');
      sql += ` AND (st.from_location_id IN (${placeholders}) OR st.to_location_id IN (${placeholders}))`;
      params.push(...allowedLocationIds, ...allowedLocationIds);
    } else {
      sql += ' AND 1=0';
    }
  }
  sql += ' ORDER BY st.created_at DESC';
  return query(sql, params);
};

export const getTransferById = async (id) => {
  const [t] = await query(`
    SELECT st.*,
      fl.location_name as from_location_name, fl.address as from_location_address, fl.city as from_location_city,
      fl.state as from_location_state, fl.pincode as from_location_pincode, fl.gstin as from_location_gstin,
      tl.location_name as to_location_name, tl.address as to_location_address, tl.city as to_location_city,
      tl.state as to_location_state, tl.pincode as to_location_pincode, tl.gstin as to_location_gstin,
      u1.full_name as dispatched_by_name, u2.full_name as received_by_name
    FROM stock_transfers st
    LEFT JOIN locations fl ON fl.id = st.from_location_id
    LEFT JOIN locations tl ON tl.id = st.to_location_id
    LEFT JOIN users u1 ON u1.id = st.dispatched_by
    LEFT JOIN users u2 ON u2.id = st.received_by
    WHERE st.id = ? LIMIT 1`, [id]);
  if (!t) return null;
  const items = await query(`SELECT sti.*, rm.material_name, rm.material_code, rm.hsn_code, rm.gst_rate, u.unit_name
    FROM stock_transfer_items sti
    LEFT JOIN raw_materials rm ON rm.id = sti.raw_material_id
    LEFT JOIN units u ON u.id = sti.unit_id
    WHERE sti.transfer_id = ?`, [id]);
  return { ...t, items };
};

// Req #17: receipt-side variance posting. Production's uq_stock_ledger is
// (transaction_type, reference_type, reference_id, reference_item_key,
// batch_key) on generated columns - one ledger row per transaction type +
// transfer + item + batch, BY DESIGN. A second partial receipt of the same
// item+batch therefore must accumulate into that row via additive upsert;
// a plain second INSERT is an ER_DUP_ENTRY that rolls the whole receipt back.
// baseQty/value are THIS call's deltas, never cumulative totals.
const postReceiptVariance = async (connection, txDate, locationId, materialId, unitId, unitCost, baseQty, value, transactionType, referenceId, referenceItemId, batchNo, expiryDate, userId) => {
  if (baseQty <= 0) return;
  await connection.execute(
    `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
     VALUES (?, ?, ?, ?, 'TRANSFER', ?, ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)
     ON DUPLICATE KEY UPDATE qty_in = qty_in + VALUES(qty_in), value_in = value_in + VALUES(value_in)`,
    [locationId, materialId, txDate, transactionType, referenceId, referenceItemId, baseQty, unitId, unitCost, value, batchNo || null, expiryDate || null, userId]
  );
};

export const receiveTransfer = async (id, data, userId) => {
  const { items } = data;
  if (!items?.length) throw new Error('No receipt items provided');
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    // The transfer-row lock serializes every receipt against the same
    // transfer; items are re-read under lock so cumulative validation sees
    // the latest committed quantities, not a pre-transaction snapshot.
    const [tRows] = await connection.execute('SELECT * FROM stock_transfers WHERE id = ? FOR UPDATE', [id]);
    const transfer = tRows[0];
    if (!transfer) { await connection.rollback(); throw new Error('Transfer not found'); }
    // Only a dispatched transfer may be received - Draft (direct #16 creates),
    // Dispatched, Cancelled and Received all stay out of receipt processing.
    if (transfer.status !== 'In Transit' && transfer.status !== 'Partially Received') {
      await connection.rollback(); throw new Error('Only an in-transit or partially received transfer can be received');
    }
    const [itemRows] = await connection.execute('SELECT * FROM stock_transfer_items WHERE transfer_id = ? FOR UPDATE', [id]);

    const seenIds = new Set();
    let anyPositive = false;
    const txDate = new Date().toISOString().split('T')[0];

    for (const it of items) {
      const itemId = Number(it.id);
      if (!itemId || seenIds.has(itemId)) { await connection.rollback(); throw new Error('Duplicate or invalid transfer item in receipt'); }
      seenIds.add(itemId);
      const ti = itemRows.find((x) => Number(x.id) === itemId);
      if (!ti) { await connection.rollback(); throw new Error('Invalid transfer item'); }

      const additionalReceived = num(it.received_qty);
      const additionalDamaged = num(it.damaged_qty);
      const additionalShort = num(it.short_qty);
      if (additionalReceived < 0 || additionalDamaged < 0 || additionalShort < 0) { await connection.rollback(); throw new Error('Negative receipt quantities not allowed'); }
      if (additionalReceived + additionalDamaged + additionalShort > 0) anyPositive = true;

      const newReceived = num(ti.received_qty) + additionalReceived;
      const newDamaged = num(ti.damaged_qty) + additionalDamaged;
      const newShort = num(ti.short_qty) + additionalShort;
      if ((newReceived + newDamaged + newShort) > num(ti.dispatched_qty)) { await connection.rollback(); throw new Error('Cumulative received + damaged + short cannot exceed dispatched'); }

      const baseUnit = await getMaterialBaseUnit(ti.raw_material_id);
      const baseReceived = await convertToBase(additionalReceived, ti.unit_id, baseUnit.id);
      const baseDamaged = await convertToBase(additionalDamaged, ti.unit_id, baseUnit.id);
      const baseShort = await convertToBase(additionalShort, ti.unit_id, baseUnit.id);

      const valueIn = baseReceived * num(ti.unit_cost);
      const damageValue = baseDamaged * num(ti.unit_cost);
      const shortValue = baseShort * num(ti.unit_cost);

      await connection.execute(
        `UPDATE stock_transfer_items SET received_qty = ?, short_qty = ?, damaged_qty = ?, remarks = ? WHERE id = ?`,
        [newReceived, newShort, newDamaged, it.remarks || ti.remarks, ti.id]
      );

      // TRANSFER_IN upserts the same way: one ledger row per transfer-item+
      // batch that accumulates across partial receipts (see postReceiptVariance).
      if (baseReceived > 0) {
        await connection.execute(
          `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
           VALUES (?, ?, ?, 'TRANSFER_IN', 'TRANSFER', ?, ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)
           ON DUPLICATE KEY UPDATE qty_in = qty_in + VALUES(qty_in), value_in = value_in + VALUES(value_in)`,
          [transfer.to_location_id, ti.raw_material_id, txDate, id, ti.id, baseReceived, baseUnit.id, ti.unit_cost, valueIn, ti.batch_no || null, ti.expiry_date || null, userId]
        );
      }

      if (baseDamaged > 0) await postReceiptVariance(connection, txDate, transfer.to_location_id, ti.raw_material_id, baseUnit.id, ti.unit_cost, baseDamaged, damageValue, 'TRANSIT_DAMAGE', id, ti.id, ti.batch_no, ti.expiry_date, userId);
      if (baseShort > 0) await postReceiptVariance(connection, txDate, transfer.to_location_id, ti.raw_material_id, baseUnit.id, ti.unit_cost, baseShort, shortValue, 'TRANSIT_SHORT', id, ti.id, ti.batch_no, ti.expiry_date, userId);
    }

    if (!anyPositive) { await connection.rollback(); throw new Error('Receipt must record at least one received, damaged or short quantity'); }

    // Re-read the locked rows for the status recompute - they now carry every
    // update made above.
    const [updatedRows] = await connection.execute('SELECT * FROM stock_transfer_items WHERE transfer_id = ?', [id]);
    const totalDispatched = updatedRows.reduce((s, i) => s + num(i.dispatched_qty), 0);
    const totalReceived = updatedRows.reduce((s, i) => s + num(i.received_qty), 0);
    const totalShort = updatedRows.reduce((s, i) => s + num(i.short_qty), 0);
    const totalDamaged = updatedRows.reduce((s, i) => s + num(i.damaged_qty), 0);
    const status = (totalReceived + totalShort + totalDamaged) >= totalDispatched ? 'Received' : 'Partially Received';

    await connection.execute(
      `UPDATE stock_transfers SET status = ?, received_by = ?, received_at = NOW() WHERE id = ?`,
      [status, userId, id]
    );
    const reqStatus = status === 'Received' ? 'Received' : 'Partially Received';
    await connection.execute(`UPDATE stock_requisitions SET status = ? WHERE id = ?`, [reqStatus, transfer.requisition_id]);
    await connection.commit();
    return getTransferById(id);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

// Req #16: direct Outlet -> Outlet transfer. The transfer number is generated
// server-side with the same locked-sequence pattern as generateOutletPoNo -
// a caller must never be able to pick (or squat on) a document number.
const TRF_NO_MAX_ATTEMPTS = 5;

const generateDirectTransferNo = async (connection) => {
  const year = new Date().getFullYear();
  const prefix = `TRF-${year}-`;
  const [rows] = await connection.execute(
    `SELECT transfer_no FROM stock_transfers
     WHERE transfer_no LIKE ?
     ORDER BY CAST(SUBSTRING_INDEX(transfer_no, '-', -1) AS UNSIGNED) DESC
     LIMIT 1 FOR UPDATE`,
    [`${prefix}%`]
  );
  const lastSeq = rows.length ? Number(String(rows[0].transfer_no).split('-').pop()) || 0 : 0;
  return `${prefix}${String(lastSeq + 1).padStart(6, '0')}`;
};

// Creates a Draft direct transfer between two Outlet locations. Location
// ACCESS is the route's job (isLocationAccessible on both ends); this function
// is authoritative for existence/activity/type validation and item rules.
// A Draft is intent only: no dispatched qty, no receipt, and absolutely no
// stock_ledger write - stock moves only when the later dispatch/receive
// workflow (#17) acts on it.
export const createDirectTransfer = async (data, userId) => {
  const { from_location_id, to_location_id, remarks, items } = data;
  // transfer_no is deliberately NOT read from the payload.
  if (!from_location_id || !to_location_id) throw new Error('Source and destination outlets are required');
  if (Number(from_location_id) === Number(to_location_id)) throw new Error('Source and destination cannot be the same outlet');
  if (!items?.length) throw new Error('At least one item is required');

  const locRows = await query(
    `SELECT id, location_type, is_active, is_inventory_location FROM locations WHERE id IN (?, ?)`,
    [from_location_id, to_location_id]
  );
  const locById = Object.fromEntries(locRows.map((l) => [Number(l.id), l]));
  for (const [label, locId] of [['Source', from_location_id], ['Destination', to_location_id]]) {
    const loc = locById[Number(locId)];
    if (!loc) throw new Error(`${label} outlet location not found`);
    if (loc.location_type !== 'Outlet') throw new Error(`${label} must be an Outlet location`);
    if (num(loc.is_active) !== 1) throw new Error(`${label} outlet is not active`);
    if (num(loc.is_inventory_location) !== 1) throw new Error(`${label} outlet is not an inventory location`);
  }

  const seenMaterials = new Set();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const matId = Number(it.raw_material_id);
    const qty = num(it.quantity);
    if (!matId || !it.unit_id) throw new Error(`Invalid item on line ${i + 1}`);
    if (!(qty > 0)) throw new Error(`Quantity must be greater than 0 on line ${i + 1}`);
    if (seenMaterials.has(matId)) throw new Error(`Duplicate material on line ${i + 1} - combine it into one line`);
    seenMaterials.add(matId);
    const [mat] = await query('SELECT id FROM raw_materials WHERE id = ? AND is_active = 1 LIMIT 1', [matId]);
    if (!mat) throw new Error(`Raw material on line ${i + 1} not found or inactive`);
    const baseUnit = await getMaterialBaseUnit(matId);
    try {
      await findConversionFactor(it.unit_id, baseUnit.id);
    } catch (e) {
      throw new Error(`Line ${i + 1}: ${e.message}`);
    }
  }

  // A Draft has not been dispatched - dispatch_date is NULL by definition
  // (nullable since allow_null_transfer_dispatch_date.sql).
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    let transferId = null;
    for (let attempt = 0; attempt < TRF_NO_MAX_ATTEMPTS && !transferId; attempt++) {
      const transfer_no = await generateDirectTransferNo(connection);
      try {
        const [res] = await connection.execute(
          `INSERT INTO stock_transfers (transfer_no, requisition_id, production_request_id, from_location_id, to_location_id, dispatch_date, status, remarks, dispatched_by)
           VALUES (?, NULL, NULL, ?, ?, NULL, 'Draft', ?, NULL)`,
          [transfer_no, from_location_id, to_location_id, remarks || null]
        );
        transferId = res.insertId;
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) continue;
        throw e;
      }
    }
    if (!transferId) throw new Error('Could not allocate a transfer number - please retry');
    for (const it of items) {
      // Intended quantity lives in approved_qty for a Draft: dispatched/
      // received/short/damaged all stay 0, unit_cost stays 0, and the
      // warehouse->outlet margin columns stay NULL - outlet-to-outlet has no
      // sale semantics.
      await connection.execute(
        `INSERT INTO stock_transfer_items (transfer_id, raw_material_id, approved_qty, dispatched_qty, received_qty, short_qty, damaged_qty, unit_id, unit_cost, transfer_price, sale_value, remarks)
         VALUES (?, ?, ?, 0, 0, 0, 0, ?, 0, NULL, NULL, ?)`,
        [transferId, it.raw_material_id, num(it.quantity), it.unit_id, it.remarks || null]
      );
    }
    await connection.commit();
    return getTransferById(transferId);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};

// Req #17: post a Draft direct (Outlet -> Outlet) transfer. This is the ONLY
// moment source stock moves for a direct transfer: TRANSFER_OUT ledger rows at
// the source, one per FEFO allocation. Requisition transfers dispatch through
// dispatchRequisition and production dispatches through postProductionDispatch -
// both are deliberately rejected here so their reservation/fulfilment
// accounting is never bypassed.
//
// Locking: the transfer row is taken FOR UPDATE (same-document replay safety),
// then BOTH location rows are locked in deterministic id order - that pair lock
// is the stable serialization point: two direct dispatches out of the same
// source outlet cannot run availability concurrently. Stock is only read AFTER
// these locks are held.
export const dispatchDirectTransfer = async (id, userId) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const [tRows] = await connection.execute('SELECT * FROM stock_transfers WHERE id = ? FOR UPDATE', [id]);
    const transfer = tRows[0];
    if (!transfer) { await connection.rollback(); throw new Error('Transfer not found'); }
    if (transfer.requisition_id !== null || transfer.production_request_id !== null) {
      await connection.rollback(); throw new Error('Only direct outlet transfers can be dispatched here');
    }
    if (transfer.status !== 'Draft') { await connection.rollback(); throw new Error('Only a Draft transfer can be dispatched'); }

    // Deterministic-order lock on both endpoint locations (id order avoids
    // deadlock between A->B and B->A dispatches).
    const [locRows] = await connection.execute(
      'SELECT id, location_type, is_active, is_inventory_location FROM locations WHERE id IN (?, ?) ORDER BY id FOR UPDATE',
      [transfer.from_location_id, transfer.to_location_id]
    );
    const locById = Object.fromEntries(locRows.map((l) => [Number(l.id), l]));
    if (Number(transfer.from_location_id) === Number(transfer.to_location_id)) { await connection.rollback(); throw new Error('Source and destination cannot be the same outlet'); }
    for (const [label, locId] of [['Source', transfer.from_location_id], ['Destination', transfer.to_location_id]]) {
      const loc = locById[Number(locId)];
      if (!loc) { await connection.rollback(); throw new Error(`${label} outlet location not found`); }
      if (loc.location_type !== 'Outlet') { await connection.rollback(); throw new Error(`${label} must be an Outlet location`); }
      if (num(loc.is_active) !== 1) { await connection.rollback(); throw new Error(`${label} outlet is not active`); }
      if (num(loc.is_inventory_location) !== 1) { await connection.rollback(); throw new Error(`${label} outlet is not an inventory location`); }
    }

    const [itemRows] = await connection.execute('SELECT * FROM stock_transfer_items WHERE transfer_id = ?', [id]);
    if (!itemRows.length) { await connection.rollback(); throw new Error('Transfer has no items'); }

    // Read AFTER the locks: availability must reflect the latest committed
    // ledger, not a snapshot taken before serialization.
    const stock = await getCurrentStock(transfer.from_location_id);
    const dispatchDate = new Date().toISOString().split('T')[0];

    for (const it of itemRows) {
      const approved = num(it.approved_qty);
      if (!(approved > 0)) { await connection.rollback(); throw new Error(`Invalid planned quantity for item ${it.id}`); }
      const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
      const baseQty = await convertToBase(approved, it.unit_id, baseUnit.id);
      const matStock = stock.find((s) => Number(s.raw_material_id) === Number(it.raw_material_id));
      const available = num(matStock?.current_qty);
      if (baseQty > available) { await connection.rollback(); throw new Error('Insufficient source stock for dispatch'); }
      const unitCost = matStock ? (num(matStock.total_value) / num(matStock.current_qty)) : 0;

      const matRows = await query('SELECT is_batch_tracked FROM raw_materials WHERE id = ? LIMIT 1', [it.raw_material_id]);
      const isBatchTracked = num(matRows[0]?.is_batch_tracked) === 1;
      // Outlet -> Outlet is a stock move, not a warehouse "sale" -
      // transfer_price/sale_value stay NULL on every row.
      if (isBatchTracked) {
        const allocations = await allocateFEFO(transfer.from_location_id, it.raw_material_id, baseQty);
        for (let ai = 0; ai < allocations.length; ai++) {
          const alloc = allocations[ai];
          const valueOut = num(alloc.allocated_qty) * unitCost;
          let itemId;
          if (ai === 0) {
            // Row #1: the original Draft line becomes the first allocation row.
            // unit_id and BOTH quantity columns move to base units together so
            // a row never expresses a qty in a unit its unit_id doesn't name.
            await connection.execute(
              `UPDATE stock_transfer_items SET unit_id = ?, approved_qty = ?, dispatched_qty = ?, unit_cost = ?, batch_no = ?, expiry_date = ? WHERE id = ?`,
              [baseUnit.id, baseQty, alloc.allocated_qty, unitCost, alloc.batch_no || null, alloc.expiry_date || null, it.id]
            );
            itemId = it.id;
          } else {
            const [ins] = await connection.execute(
              `INSERT INTO stock_transfer_items (transfer_id, raw_material_id, approved_qty, dispatched_qty, received_qty, short_qty, damaged_qty, unit_id, unit_cost, transfer_price, sale_value, batch_no, expiry_date, remarks)
               VALUES (?, ?, 0, ?, 0, 0, 0, ?, ?, NULL, NULL, ?, ?, ?)`,
              [id, it.raw_material_id, alloc.allocated_qty, baseUnit.id, unitCost, alloc.batch_no || null, alloc.expiry_date || null, it.remarks || null]
            );
            itemId = ins.insertId;
          }
          await connection.execute(
            `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
             VALUES (?, ?, ?, 'TRANSFER_OUT', 'TRANSFER', ?, ?, 0, ?, ?, ?, 0, ?, ?, ?, ?)`,
            [transfer.from_location_id, it.raw_material_id, dispatchDate, id, itemId, alloc.allocated_qty, baseUnit.id, unitCost, valueOut, alloc.batch_no || null, alloc.expiry_date || null, userId]
          );
        }
      } else {
        // Non-batch: keep the Draft line's original unit and dispatched_qty in
        // that unit (same convention as dispatchRequisition); the ledger row
        // carries the converted base quantity.
        const valueOut = baseQty * unitCost;
        await connection.execute(
          `UPDATE stock_transfer_items SET dispatched_qty = ?, unit_cost = ? WHERE id = ?`,
          [approved, unitCost, it.id]
        );
        await connection.execute(
          `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
           VALUES (?, ?, ?, 'TRANSFER_OUT', 'TRANSFER', ?, ?, 0, ?, ?, ?, 0, ?, ?, ?, ?)`,
          [transfer.from_location_id, it.raw_material_id, dispatchDate, id, it.id, baseQty, baseUnit.id, unitCost, valueOut, it.batch_no || null, it.expiry_date || null, userId]
        );
      }
    }

    await connection.execute(
      `UPDATE stock_transfers SET dispatch_date = CURDATE(), dispatched_by = ?, status = 'In Transit' WHERE id = ?`,
      [userId, id]
    );
    await connection.commit();
    return getTransferById(id);
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
};


import { query, getConnection } from '../config/database.js';
import { getUnit, getMaterialBaseUnit, convertToBase, normalizeRateToBase } from '../utils/uomUtils.js';
import { allocateFEFO } from './warehouseBatchService.js';
import { updatePOStatusAfterGRN } from './warehousePurchaseOrderService.js';
import { getSettingValue } from './warehouseSettingService.js';
import { validateContactFields } from '../utils/validators.js';

const num = (value) => (value === null || value === undefined || value === '' ? 0 : Number(value));

export const getAllowedLocations = async (user, scope = 'all') => {
  const roleName = user.role_name;
  if (scope === 'central_warehouse') {
    return query("SELECT * FROM locations WHERE location_type = 'Central Warehouse' AND is_active = 1 ORDER BY location_name");
  }
  if (['Super Admin', 'Admin', 'Developer'].includes(roleName)) {
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
  let poRemaining = {};
  if (purchase_order_id) {
    const [po] = await query('SELECT * FROM purchase_orders WHERE id = ?', [purchase_order_id]);
    if (!po) throw new Error('Purchase order not found');
    if (String(po.supplier_id) !== String(supplier_id)) throw new Error('GRN supplier does not match PO supplier');
    if (String(po.warehouse_location_id) !== String(warehouse_location_id)) throw new Error('GRN warehouse does not match PO warehouse');
    if (!['Approved','Sent','Partially Received'].includes(po.status)) throw new Error('PO is not ready for GRN');
    const poItems = await query('SELECT id, raw_material_id, ordered_qty, unit_id FROM purchase_order_items WHERE purchase_order_id = ?', [purchase_order_id]);
    for (const pi of poItems) {
      const baseUnit = await getMaterialBaseUnit(pi.raw_material_id);
      const orderedBase = await convertToBase(num(pi.ordered_qty), pi.unit_id, baseUnit.id);
      const [acc] = await query(`
        SELECT COALESCE(SUM(gri.accepted_qty), 0) as total
        FROM grn g
        JOIN grn_items gri ON gri.grn_id = g.id
        WHERE g.purchase_order_id = ? AND gri.raw_material_id = ? AND g.status = 'Posted'
      `, [purchase_order_id, pi.raw_material_id]);
      const acceptedBase = await convertToBase(num(acc.total), pi.unit_id, baseUnit.id);
      poRemaining[pi.raw_material_id] = Math.max(0, orderedBase - acceptedBase);
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
    for (const it of items) {
      const received = num(it.received_qty);
      const rejected = num(it.rejected_qty);
      const accepted = received - rejected;
      if (received < 0 || rejected < 0 || rejected > received || accepted < 0) throw new Error('Invalid GRN item quantities');
      if (num(it.rate) < 0) throw new Error('Rate cannot be negative');
      if (num(it.tax_amount) < 0) throw new Error('Tax amount cannot be negative');
      if (purchase_order_id) {
        const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
        const acceptedBase = await convertToBase(accepted, it.unit_id, baseUnit.id);
        const remaining = num(poRemaining[it.raw_material_id]);
        const allowedCeiling = allowOverReceipt ? remaining * (1 + overReceiptTolerancePct / 100) : remaining;
        if (acceptedBase > allowedCeiling + 0.0001) {
          await connection.rollback();
          throw new Error(allowOverReceipt
            ? `Accepted quantity exceeds remaining PO quantity plus the ${overReceiptTolerancePct}% over-receipt tolerance`
            : 'Accepted quantity exceeds remaining PO quantity');
        }
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
        `INSERT INTO grn_items (grn_id, raw_material_id, ordered_qty, received_qty, rejected_qty, accepted_qty, unit_id, rate, tax_amount, total_amount, batch_no, expiry_date, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [grnId, it.raw_material_id, it.ordered_qty ? num(it.ordered_qty) : null, received, rejected, accepted, it.unit_id, it.rate, num(it.tax_amount), itemTotal, it.batch_no || null, it.expiry_date || null, it.remarks || null]
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
      const poItemByMaterial = Object.fromEntries(poItems.map((pi) => [Number(pi.raw_material_id), pi]));
      for (const it of items) {
        const pi = poItemByMaterial[Number(it.raw_material_id)];
        if (!pi) continue;
        const baseUnit = await getMaterialBaseUnit(it.raw_material_id);
        const orderedBase = await convertToBase(num(pi.ordered_qty), pi.unit_id, baseUnit.id);
        const [acc] = await connection.execute(
          `SELECT COALESCE(SUM(gri.accepted_qty), 0) as total
           FROM grn g JOIN grn_items gri ON gri.grn_id = g.id
           WHERE g.purchase_order_id = ? AND gri.raw_material_id = ? AND g.status = 'Posted' AND g.id != ?`,
          [grn.purchase_order_id, it.raw_material_id, grnId]
        );
        const alreadyAcceptedBase = await convertToBase(num(acc[0].total), pi.unit_id, baseUnit.id);
        const thisAcceptedBase = await convertToBase(num(it.accepted_qty), it.unit_id, baseUnit.id);
        const remaining = Math.max(0, orderedBase - alreadyAcceptedBase);
        const allowedCeiling = allowOverReceipt ? remaining * (1 + overReceiptTolerancePct / 100) : remaining;
        if (thisAcceptedBase > allowedCeiling + 0.0001) {
          await connection.rollback();
          throw new Error(allowOverReceipt
            ? `Cannot post: accepted quantity now exceeds remaining PO quantity plus the ${overReceiptTolerancePct}% over-receipt tolerance (another GRN against this PO was posted first)`
            : 'Cannot post: accepted quantity now exceeds remaining PO quantity (another GRN against this PO was posted first)');
        }
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
  const { location_id, status } = filters || {};
  let sql = `SELECT g.*, s.supplier_name, l.location_name FROM grn g LEFT JOIN suppliers s ON s.id = g.supplier_id LEFT JOIN locations l ON l.id = g.warehouse_location_id WHERE 1=1`;
  const params = [];
  if (location_id) { sql += ' AND g.warehouse_location_id = ?'; params.push(location_id); }
  if (status) { sql += ' AND g.status = ?'; params.push(status); }
  sql += ' ORDER BY g.created_at DESC';
  return query(sql, params);
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
  const { location_id, raw_material_id, transaction_type, from_date, to_date } = filters || {};
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
  const { location_id, from_location_id, to_location_id, status, allowedLocationIds } = filters;
  let sql = `SELECT sr.*, fl.location_name as from_location, tl.location_name as to_location, u.full_name as created_by_name
    FROM stock_requisitions sr
    LEFT JOIN locations fl ON fl.id = sr.from_location_id
    LEFT JOIN locations tl ON tl.id = sr.to_location_id
    LEFT JOIN users u ON u.id = sr.created_by
    WHERE 1=1`;
  const params = [];
  if (location_id) { sql += ' AND (sr.from_location_id = ? OR sr.to_location_id = ?)'; params.push(location_id, location_id); }
  if (from_location_id) { sql += ' AND sr.from_location_id = ?'; params.push(from_location_id); }
  if (to_location_id) { sql += ' AND sr.to_location_id = ?'; params.push(to_location_id); }
  if (status) { sql += ' AND sr.status = ?'; params.push(status); }
  // Confines a location-scoped caller (e.g. an outlet user, or Warehouse
  // Admin) to requisitions touching a location they're actually allowed to
  // see, regardless of whatever from/to/location_id filter (or lack of one)
  // the client sent - see resolveScopedLocationIds in warehouseMiddleware.js.
  if (allowedLocationIds) {
    // allowedLocationIds is an array (possibly empty - e.g. a Warehouse
    // Admin when no Central Warehouse location is active) whenever the
    // caller is location-scoped; undefined means full access, no restriction.
    sql += allowedLocationIds.length
      ? ' AND (sr.from_location_id IN (?) OR sr.to_location_id IN (?))'
      : ' AND 1=0';
    if (allowedLocationIds.length) params.push(allowedLocationIds, allowedLocationIds);
  }
  sql += ' ORDER BY sr.created_at DESC';
  return query(sql, params);
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

export const createRequisition = async (data, userId) => {
  const { requisition_no, from_location_id, to_location_id, request_date, required_date, remarks, items } = data;
  if (!requisition_no || !from_location_id || !to_location_id || !request_date || !items?.length) throw new Error('Missing required requisition fields');
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const existing = await connection.execute('SELECT id FROM stock_requisitions WHERE requisition_no = ? LIMIT 1', [requisition_no]);
    if (existing[0].length > 0) { await connection.rollback(); throw new Error('Requisition number already exists'); }
    const [res] = await connection.execute(
      `INSERT INTO stock_requisitions (requisition_no, from_location_id, to_location_id, request_date, required_date, status, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, 'Draft', ?, ?)`,
      [requisition_no, from_location_id, to_location_id, request_date, required_date || null, remarks || null, userId]
    );
    const requisitionId = res.insertId;
    for (const it of items) {
      if (!it.raw_material_id || !it.requested_qty || !it.unit_id) { await connection.rollback(); throw new Error('Invalid requisition item'); }
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
  if (!req) throw new Error('Requisition not found');
  if (req.status !== 'Draft') throw new Error('Only Draft requisition can be submitted');
  await query(`UPDATE stock_requisitions SET status = 'Submitted', submitted_by = ?, submitted_at = NOW() WHERE id = ?`, [userId, id]);
  return getRequisitionById(id);
};

export const approveRequisition = async (id, data, userId) => {
  const { items, remarks, rejection_reason } = data || {};
  const req = await getRequisitionById(id);
  if (!req) throw new Error('Requisition not found');
  if (req.status !== 'Submitted') throw new Error('Only Submitted requisitions can be reviewed');
  if (!items || items.length !== req.items.length) throw new Error('Approval quantities required for all items');

  const approvedItems = [];
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    for (const it of items) {
      const item = req.items.find((x) => x.id === Number(it.id));
      if (!item) { await connection.rollback(); throw new Error('Invalid item'); }
      const approved = num(it.approved_qty);
      if (approved < 0 || approved > num(item.requested_qty)) { await connection.rollback(); throw new Error('Approved qty cannot exceed requested or be negative'); }
      // Validate against available stock at warehouse
      const stock = await getCurrentStock(req.from_location_id);
      const matStock = stock.find((s) => Number(s.raw_material_id) === Number(item.raw_material_id));
      const available = num(matStock?.current_qty);
      const baseUnit = await getMaterialBaseUnit(item.raw_material_id);
      const approvedBase = await convertToBase(approved, item.unit_id, baseUnit.id);
      if (approvedBase > available) { await connection.rollback(); throw new Error(`Insufficient stock for ${item.material_name}`); }
      approvedItems.push({ ...item, approved_qty: approved, approved_base: approvedBase });
      await connection.execute('UPDATE stock_requisition_items SET approved_qty = ? WHERE id = ?', [approved, it.id]);
    }

    const totalApproved = approvedItems.reduce((s, i) => s + num(i.approved_qty), 0);
    const totalRequested = req.items.reduce((s, i) => s + num(i.requested_qty), 0);
    let status = 'Approved';
    if (totalApproved === 0) status = 'Rejected';
    else if (totalApproved < totalRequested) status = 'Partially Approved';
    if (status === 'Rejected' && !rejection_reason) { await connection.rollback(); throw new Error('Rejection reason required'); }

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
  if (!req) throw new Error('Requisition not found');
  if (req.status !== 'Approved' && req.status !== 'Partially Approved') throw new Error('Only Approved requisitions can be dispatched');
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
  const { from_location_id, to_location_id, status, requisition_id, allowedLocationIds } = filters;
  let sql = `SELECT st.*, fl.location_name as from_location, tl.location_name as to_location, sr.requisition_no
    FROM stock_transfers st
    LEFT JOIN locations fl ON fl.id = st.from_location_id
    LEFT JOIN locations tl ON tl.id = st.to_location_id
    LEFT JOIN stock_requisitions sr ON sr.id = st.requisition_id
    WHERE 1=1`;
  const params = [];
  if (from_location_id) { sql += ' AND st.from_location_id = ?'; params.push(from_location_id); }
  if (to_location_id) { sql += ' AND st.to_location_id = ?'; params.push(to_location_id); }
  if (status) { sql += ' AND st.status = ?'; params.push(status); }
  if (requisition_id) { sql += ' AND st.requisition_id = ?'; params.push(requisition_id); }
  // See getRequisitions() above - confines a location-scoped caller to
  // transfers touching a location they're allowed to see.
  if (allowedLocationIds) {
    sql += allowedLocationIds.length
      ? ' AND (st.from_location_id IN (?) OR st.to_location_id IN (?))'
      : ' AND 1=0';
    if (allowedLocationIds.length) params.push(allowedLocationIds, allowedLocationIds);
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

const postLedgerVariance = async (connection, txDate, locationId, materialId, unitId, unitCost, baseQty, value, transactionType, referenceId, referenceItemId, batchNo, expiryDate, userId) => {
  const existing = await connection.execute(
    'SELECT id FROM stock_ledger WHERE transaction_type = ? AND reference_type = "TRANSFER" AND reference_id = ? AND reference_item_id = ? LIMIT 1',
    [transactionType, referenceId, referenceItemId]
  );
  if (existing[0].length === 0 && baseQty > 0) {
    await connection.execute(
      `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
       VALUES (?, ?, ?, ?, 'TRANSFER', ?, ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)`,
      [locationId, materialId, txDate, transactionType, referenceId, referenceItemId, baseQty, unitId, unitCost, value, batchNo || null, expiryDate || null, userId]
    );
  }
};

export const receiveTransfer = async (id, data, userId) => {
  const { items } = data;
  const transfer = await getTransferById(id);
  if (!transfer) throw new Error('Transfer not found');
  if (transfer.status === 'Received') throw new Error('Transfer already received');
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const txDate = new Date().toISOString().split('T')[0];

    for (const it of items) {
      const ti = transfer.items.find((x) => Number(x.id) === Number(it.id));
      if (!ti) { await connection.rollback(); throw new Error('Invalid transfer item'); }

      const additionalReceived = num(it.received_qty);
      const additionalDamaged = num(it.damaged_qty);
      const additionalShort = num(it.short_qty);
      if (additionalReceived < 0 || additionalDamaged < 0 || additionalShort < 0) { await connection.rollback(); throw new Error('Negative receipt quantities not allowed'); }

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
        [newReceived, newShort, newDamaged, it.remarks || ti.remarks, it.id]
      );

      if (baseReceived > 0) {
        const existing = await connection.execute(
          'SELECT id FROM stock_ledger WHERE transaction_type = "TRANSFER_IN" AND reference_type = "TRANSFER" AND reference_id = ? AND reference_item_id = ? LIMIT 1',
          [id, ti.id]
        );
        if (existing[0].length === 0) {
          await connection.execute(
            `INSERT INTO stock_ledger (location_id, raw_material_id, transaction_date, transaction_type, reference_type, reference_id, reference_item_id, qty_in, qty_out, unit_id, unit_cost, value_in, value_out, batch_no, expiry_date, created_by)
             VALUES (?, ?, ?, 'TRANSFER_IN', 'TRANSFER', ?, ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)`,
            [transfer.to_location_id, ti.raw_material_id, txDate, id, ti.id, baseReceived, baseUnit.id, ti.unit_cost, valueIn, ti.batch_no || null, ti.expiry_date || null, userId]
          );
        }
      }

      if (baseDamaged > 0) await postLedgerVariance(connection, txDate, transfer.to_location_id, ti.raw_material_id, baseUnit.id, ti.unit_cost, baseDamaged, damageValue, 'TRANSIT_DAMAGE', id, ti.id, ti.batch_no, ti.expiry_date, userId);
      if (baseShort > 0) await postLedgerVariance(connection, txDate, transfer.to_location_id, ti.raw_material_id, baseUnit.id, ti.unit_cost, baseShort, shortValue, 'TRANSIT_SHORT', id, ti.id, ti.batch_no, ti.expiry_date, userId);
    }

    const [updatedRows] = await connection.execute('SELECT * FROM stock_transfer_items WHERE transfer_id = ?', [id]);
    const updatedItems = updatedRows;
    const totalDispatched = updatedItems.reduce((s, i) => s + num(i.dispatched_qty), 0);
    const totalReceived = updatedItems.reduce((s, i) => s + num(i.received_qty), 0);
    const totalShort = updatedItems.reduce((s, i) => s + num(i.short_qty), 0);
    const totalDamaged = updatedItems.reduce((s, i) => s + num(i.damaged_qty), 0);
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


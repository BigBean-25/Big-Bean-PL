import { query } from '../config/database.js';
import { getCurrentStock, getStockLedger } from './warehouseService.js';
import { getReorderData } from './warehouseReorderService.js';
import ExcelJS from 'exceljs';

const num = v => v === null || v === undefined || v === '' ? 0 : Number(v);

export const getReportSummary = async (locationId) => {
  const current = await getCurrentStock(locationId);
  const totalValue = current.reduce((s, r) => s + r.total_value, 0);
  const lowStock = current.filter(r => r.status === 'Low Stock').length;
  const outOfStock = current.filter(r => r.status === 'Out of Stock').length;

  const expiry = await query(
    `SELECT sl.raw_material_id, sl.batch_no, sl.expiry_date,
            SUM(sl.qty_in) - COALESCE((SELECT SUM(qty_out) FROM stock_ledger s2 WHERE s2.location_id = ? AND s2.raw_material_id = sl.raw_material_id AND s2.batch_no = sl.batch_no AND s2.transaction_type NOT IN ('OPENING','PURCHASE_GRN')), 0) as batch_qty
     FROM stock_ledger sl
     WHERE sl.location_id = ? AND sl.expiry_date IS NOT NULL
     GROUP BY sl.raw_material_id, sl.batch_no, sl.expiry_date
     HAVING batch_qty > 0`,
    [locationId, locationId]
  );
  const now = new Date();
  const nearExpiry = expiry.filter(r => { const d = (new Date(r.expiry_date) - now) / 86400000; return d >= 0 && d <= 7; }).length;
  const expired = expiry.filter(r => new Date(r.expiry_date) < now).length;

  const pendingRequisitions = await query(
    `SELECT COUNT(*) as c FROM stock_requisitions WHERE (from_location_id = ? OR to_location_id = ?) AND status IN ('Draft','Submitted','Approved')`,
    [locationId, locationId]
  );

  const inTransit = await query(
    `SELECT COUNT(*) as c FROM stock_transfers WHERE status = 'In Transit' AND (from_location_id = ? OR to_location_id = ?)`,
    [locationId, locationId]
  );

  const wastageValue = await query(
    `SELECT COALESCE(SUM(total_value), 0) as v FROM warehouse_wastage WHERE location_id = ? AND status IN ('Posted','Approved')`,
    [locationId]
  );

  const adjustmentValue = await query(
    `SELECT COALESCE(SUM(total_value), 0) as v FROM stock_adjustments WHERE location_id = ? AND status IN ('Posted','Approved')`,
    [locationId]
  );

  return {
    current_stock_value: totalValue,
    low_stock: lowStock,
    out_of_stock: outOfStock,
    near_expiry: nearExpiry,
    expired,
    pending_requisitions: pendingRequisitions[0]?.c || 0,
    in_transit: inTransit[0]?.c || 0,
    wastage_value: num(wastageValue[0]?.v),
    adjustment_value: num(adjustmentValue[0]?.v),
  };
};

export const getCurrentStockReport = async (locationId) => {
  const rows = await getCurrentStock(locationId);
  return rows.map(r => ({
    material_code: r.material_code,
    material_name: r.material_name,
    category: r.category,
    current_qty: num(r.current_qty),
    unit: r.unit_name,
    wac: num(r.average_cost),
    stock_value: num(r.total_value),
    min_stock: num(r.min_stock_qty),
    reorder_level: num(r.reorder_level),
    max_stock: num(r.max_stock_qty),
    stock_status: r.status,
  }));
};

export const getStockLedgerReport = async (filters) => {
  return getStockLedger(filters);
};

export const getStockValuationReport = async (locationId) => {
  const rows = await getCurrentStock(locationId);
  const byCategory = {};
  let total = 0;
  for (const r of rows) {
    const cat = r.category || 'Uncategorized';
    if (!byCategory[cat]) byCategory[cat] = 0;
    byCategory[cat] += num(r.total_value);
    total += num(r.total_value);
  }
  return rows.map(r => ({
    material_code: r.material_code,
    material_name: r.material_name,
    category: r.category,
    current_qty: num(r.current_qty),
    unit: r.unit_name,
    wac: num(r.average_cost),
    value: num(r.total_value),
  }));
};

export const getBatchReport = async (locationId) => {
  const rows = await query(
    `SELECT sl.raw_material_id, rm.material_name, rm.material_code, sl.batch_no, sl.expiry_date,
            COALESCE(SUM(sl.qty_in), 0) - COALESCE(SUM(sl.qty_out), 0) as remaining_qty,
            (SELECT g.grn_no FROM grn g WHERE g.id = (SELECT reference_id FROM stock_ledger s3 WHERE s3.location_id = sl.location_id AND s3.raw_material_id = sl.raw_material_id AND s3.batch_no = sl.batch_no AND s3.transaction_type = 'PURCHASE_GRN' ORDER BY s3.id DESC LIMIT 1)) as grn_no,
            (SELECT s.supplier_name FROM suppliers s WHERE s.id = (SELECT g.supplier_id FROM grn g WHERE g.id = (SELECT reference_id FROM stock_ledger s3 WHERE s3.location_id = sl.location_id AND s3.raw_material_id = sl.raw_material_id AND s3.batch_no = sl.batch_no AND s3.transaction_type = 'PURCHASE_GRN' ORDER BY s3.id DESC LIMIT 1))) as supplier_name
     FROM stock_ledger sl
     LEFT JOIN raw_materials rm ON rm.id = sl.raw_material_id
     WHERE sl.location_id = ? AND sl.batch_no IS NOT NULL AND sl.batch_no != ''
     GROUP BY sl.raw_material_id, sl.batch_no, sl.expiry_date, sl.location_id
     HAVING remaining_qty > 0`,
    [locationId]
  );
  return rows.map(r => ({
    ...r,
    remaining_qty: num(r.remaining_qty),
    status: r.expiry_date && new Date(r.expiry_date) < new Date() ? 'Expired' : 'Active',
  }));
};

export const getExpiryReport = async (locationId) => {
  const rows = await query(
    `SELECT sl.raw_material_id, rm.material_name, rm.material_code, sl.batch_no, sl.expiry_date,
            SUM(sl.qty_in) - COALESCE(SUM(sl.qty_out), 0) as remaining_qty
     FROM stock_ledger sl
     LEFT JOIN raw_materials rm ON rm.id = sl.raw_material_id
     WHERE sl.location_id = ? AND sl.expiry_date IS NOT NULL
     GROUP BY sl.raw_material_id, sl.batch_no, sl.expiry_date
     HAVING remaining_qty > 0`,
    [locationId]
  );
  const now = new Date();
  return rows.map(r => {
    const days = Math.ceil((new Date(r.expiry_date) - now) / 86400000);
    let bucket = 'Healthy';
    if (days < 0) bucket = 'Expired';
    else if (days <= 7) bucket = '0-7';
    else if (days <= 15) bucket = '8-15';
    else if (days <= 30) bucket = '16-30';
    else if (days <= 60) bucket = '31-60';
    return { ...r, remaining_qty: num(r.remaining_qty), days_to_expiry: days, bucket };
  });
};

export const getLowStockReport = async (locationId) => {
  const data = await getReorderData({ locationId });
  return data.filter(d => ['OUT OF STOCK', 'CRITICAL', 'REORDER REQUIRED'].includes(d.physical_status));
};

export const getOutOfStockReport = async (locationId) => {
  const data = await getReorderData({ locationId });
  return data.filter(d => d.physical_status === 'OUT OF STOCK');
};

export const getGRNReport = async (filters) => {
  const { location_id, from_date, to_date, supplier_id } = filters;
  let sql = `SELECT g.id, g.grn_no, g.grn_date, g.status, g.invoice_reference, g.purchase_reference, g.total_amount,
                    s.supplier_name, l.location_name,
                    gi.raw_material_id, rm.material_name, rm.material_code,
                    gi.received_qty, gi.rejected_qty, (gi.received_qty - gi.rejected_qty) as accepted_qty,
                    u.unit_name, gi.rate, gi.batch_no, gi.expiry_date
             FROM grn g
             LEFT JOIN grn_items gi ON gi.grn_id = g.id
             LEFT JOIN raw_materials rm ON rm.id = gi.raw_material_id
             LEFT JOIN suppliers s ON s.id = g.supplier_id
             LEFT JOIN locations l ON l.id = g.warehouse_location_id
             LEFT JOIN units u ON u.id = gi.unit_id
             WHERE g.status = 'Posted'`;
  const params = [];
  if (location_id) { sql += ' AND g.warehouse_location_id = ?'; params.push(location_id); }
  if (supplier_id) { sql += ' AND g.supplier_id = ?'; params.push(supplier_id); }
  if (from_date && to_date) { sql += ' AND g.grn_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  sql += ' ORDER BY g.grn_date DESC';
  return query(sql, params);
};

export const getSupplierReceiptReport = async (filters) => {
  const rows = await getGRNReport(filters);
  return rows.map(r => ({
    supplier: r.supplier_name,
    grn_no: r.grn_no,
    grn_date: r.grn_date,
    material_code: r.material_code,
    material_name: r.material_name,
    accepted_qty: num(r.accepted_qty),
    unit: r.unit_name,
    rate: num(r.rate),
    value: num(r.accepted_qty) * num(r.rate),
    batch_no: r.batch_no,
    expiry_date: r.expiry_date,
  }));
};

export const getPurchaseReturnReport = async (filters) => {
  const { location_id, from_date, to_date } = filters;
  let sql = `SELECT pr.id, pr.return_no, pr.return_date, pr.status, pr.total_return_value, pr.supplier_credit_note_no,
                    s.supplier_name, g.grn_no, g.grn_date,
                    pri.raw_material_id, rm.material_name, rm.material_code,
                    pri.return_qty, pri.input_unit_id, u.unit_name, pri.original_purchase_rate,
                    pri.supplier_credit_value, pri.inventory_value, pri.base_qty,
                    pri.batch_no, pri.expiry_date, sc.credit_amount, sc.status as credit_status
             FROM purchase_returns pr
             LEFT JOIN purchase_return_items pri ON pri.purchase_return_id = pr.id
             LEFT JOIN raw_materials rm ON rm.id = pri.raw_material_id
             LEFT JOIN suppliers s ON s.id = pr.supplier_id
             LEFT JOIN grn g ON g.id = pr.grn_id
             LEFT JOIN supplier_credits sc ON sc.purchase_return_id = pr.id
             LEFT JOIN units u ON u.id = pri.input_unit_id
             WHERE pr.status = 'Posted'`;
  const params = [];
  if (location_id) { sql += ' AND pr.warehouse_location_id = ?'; params.push(location_id); }
  if (from_date && to_date) { sql += ' AND pr.return_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  sql += ' ORDER BY pr.return_date DESC';
  return query(sql, params);
};

export const getRequisitionReport = async (filters) => {
  const { location_id, from_date, to_date } = filters;
  let sql = `SELECT sr.id, sr.requisition_no, sr.request_date, sr.required_date, sr.status,
                    fl.location_name as from_location, tl.location_name as to_location,
                    sri.raw_material_id, rm.material_name, rm.material_code,
                    sri.requested_qty, sri.approved_qty,
                    (sri.requested_qty - sri.approved_qty) as remaining_qty,
                    u.unit_name
             FROM stock_requisitions sr
             LEFT JOIN stock_requisition_items sri ON sri.requisition_id = sr.id
             LEFT JOIN raw_materials rm ON rm.id = sri.raw_material_id
             LEFT JOIN locations fl ON fl.id = sr.from_location_id
             LEFT JOIN locations tl ON tl.id = sr.to_location_id
             LEFT JOIN units u ON u.id = sri.unit_id
             WHERE 1=1`;
  const params = [];
  if (location_id) { sql += ' AND (sr.from_location_id = ? OR sr.to_location_id = ?)'; params.push(location_id, location_id); }
  if (from_date && to_date) { sql += ' AND sr.request_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  sql += ' ORDER BY sr.request_date DESC';
  return query(sql, params);
};

export const getPendingRequisitionReport = async (filters) => {
  const all = await getRequisitionReport(filters);
  return all.filter(r => ['Draft', 'Submitted', 'Approved'].includes(r.status)).map(r => ({
    ...r,
    age_days: Math.floor((new Date() - new Date(r.request_date)) / 86400000),
  }));
};

export const getTransferReport = async (filters) => {
  const { location_id, from_date, to_date, status } = filters;
  let sql = `SELECT st.id, st.transfer_no, st.dispatch_date as transfer_date, st.status,
                    st.dispatched_by, st.received_by, st.received_at as receipt_date,
                    fl.location_name as from_location, tl.location_name as to_location,
                    sti.raw_material_id, rm.material_name, rm.material_code,
                    sti.dispatched_qty, sti.received_qty, sti.damaged_qty, sti.short_qty,
                    u.unit_name, sti.unit_cost
             FROM stock_transfers st
             LEFT JOIN stock_transfer_items sti ON sti.transfer_id = st.id
             LEFT JOIN raw_materials rm ON rm.id = sti.raw_material_id
             LEFT JOIN locations fl ON fl.id = st.from_location_id
             LEFT JOIN locations tl ON tl.id = st.to_location_id
             LEFT JOIN units u ON u.id = sti.unit_id
             WHERE 1=1`;
  const params = [];
  if (location_id) { sql += ' AND (st.from_location_id = ? OR st.to_location_id = ?)'; params.push(location_id, location_id); }
  if (Array.isArray(status) && status.length > 0) { sql += ` AND st.status IN (${status.map(() => '?').join(',')})`; params.push(...status); }
  else if (status) { sql += ' AND st.status = ?'; params.push(status); }
  if (from_date && to_date) { sql += ' AND st.dispatch_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  sql += ' ORDER BY st.dispatch_date DESC';
  return query(sql, params);
};

// 'Dispatched' was never an actual stock_transfers.status value (the real
// values are Draft/In Transit/Partially Received/Received - dispatching a
// transfer moves it straight to 'In Transit'), so this always returned zero
// rows. A dispatch report should show everything that has actually left,
// i.e. anything past Draft.
export const getDispatchReport = async (filters) => getTransferReport({ ...filters, status: ['In Transit', 'Partially Received', 'Received'] });
export const getTransitReport = async (filters) => getTransferReport({ ...filters, status: 'In Transit' });
export const getReceiptReport = async (filters) => getTransferReport({ ...filters, status: 'Received' });

export const getTransitDamageReport = async (filters) => {
  const all = await getTransferReport(filters);
  return all.filter(r => num(r.damaged_qty) > 0).map(r => ({
    transfer_no: r.transfer_no,
    outlet: r.to_location,
    material_code: r.material_code,
    material_name: r.material_name,
    batch_no: r.batch_no,
    qty: num(r.damaged_qty),
    unit: r.unit_name,
    value: num(r.damaged_qty) * num(r.unit_cost),
    date: r.transfer_date,
  }));
};

export const getTransitShortReport = async (filters) => {
  const all = await getTransferReport(filters);
  return all.filter(r => num(r.short_qty) > 0).map(r => ({
    transfer_no: r.transfer_no,
    outlet: r.to_location,
    material_code: r.material_code,
    material_name: r.material_name,
    batch_no: r.batch_no,
    qty: num(r.short_qty),
    unit: r.unit_name,
    value: num(r.short_qty) * num(r.unit_cost),
    date: r.transfer_date,
  }));
};

export const getPhysicalCountReport = async (filters) => {
  const { location_id, from_date, to_date } = filters;
  let sql = `SELECT psc.id, psc.count_no, psc.count_date, psc.status, l.location_name,
                    psci.raw_material_id, rm.material_name, rm.material_code,
                    psci.system_qty, psci.counted_qty, psci.variance_qty,
                    u.unit_name, psci.unit_cost, psci.variance_value,
                    psci.reason
             FROM physical_stock_counts psc
             LEFT JOIN physical_stock_count_items psci ON psci.physical_count_id = psc.id
             LEFT JOIN raw_materials rm ON rm.id = psci.raw_material_id
             LEFT JOIN locations l ON l.id = psc.location_id
             LEFT JOIN units u ON u.id = psci.unit_id
             WHERE 1=1`;
  const params = [];
  if (location_id) { sql += ' AND psc.location_id = ?'; params.push(location_id); }
  if (from_date && to_date) { sql += ' AND psc.count_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  sql += ' ORDER BY psc.count_date DESC';
  return query(sql, params);
};

export const getVarianceReport = async (filters) => {
  const all = await getPhysicalCountReport(filters);
  return all.filter(r => num(r.variance_qty) !== 0);
};

export const getWastageReport = async (filters) => {
  const { location_id, from_date, to_date } = filters;
  let sql = `SELECT ww.id, ww.wastage_no, ww.wastage_date, ww.status, l.location_name,
                    wwi.raw_material_id, rm.material_name, rm.material_code,
                    wwi.qty, u.unit_name, wwi.unit_cost, wwi.batch_no, wwi.expiry_date,
                    wwi.value, wwi.reason, us.full_name as created_by_name
             FROM warehouse_wastage ww
             LEFT JOIN warehouse_wastage_items wwi ON wwi.warehouse_wastage_id = ww.id
             LEFT JOIN raw_materials rm ON rm.id = wwi.raw_material_id
             LEFT JOIN locations l ON l.id = ww.location_id
             LEFT JOIN units u ON u.id = wwi.unit_id
             LEFT JOIN users us ON us.id = ww.created_by
             WHERE ww.status IN ('Posted','Approved')`;
  const params = [];
  if (location_id) { sql += ' AND ww.location_id = ?'; params.push(location_id); }
  if (from_date && to_date) { sql += ' AND ww.wastage_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  sql += ' ORDER BY ww.wastage_date DESC';
  return query(sql, params);
};

export const getAdjustmentReport = async (filters) => {
  const { location_id, from_date, to_date } = filters;
  let sql = `SELECT sa.id, sa.adjustment_no, sa.adjustment_date, sa.status, l.location_name,
                    sai.raw_material_id, rm.material_name, rm.material_code,
                    sai.qty, u.unit_name, sai.unit_cost, sai.value,
                    sai.reason, sai.adjustment_type, us.full_name as created_by_name
             FROM stock_adjustments sa
             LEFT JOIN stock_adjustment_items sai ON sai.stock_adjustment_id = sa.id
             LEFT JOIN raw_materials rm ON rm.id = sai.raw_material_id
             LEFT JOIN locations l ON l.id = sa.location_id
             LEFT JOIN units u ON u.id = sai.unit_id
             LEFT JOIN users us ON us.id = sa.created_by
             WHERE sa.status IN ('Posted','Approved')`;
  const params = [];
  if (location_id) { sql += ' AND sa.location_id = ?'; params.push(location_id); }
  if (from_date && to_date) { sql += ' AND sa.adjustment_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  sql += ' ORDER BY sa.adjustment_date DESC';
  return query(sql, params);
};

export const getMaterialMovementReport = async (filters) => {
  const { location_id, raw_material_id, from_date, to_date } = filters;
  let sql = `SELECT sl.transaction_date, sl.transaction_type, sl.reference_type, sl.reference_id,
                    sl.qty_in, sl.qty_out, u.unit_name, sl.batch_no, sl.expiry_date,
                    rm.material_name, rm.material_code, l.location_name
             FROM stock_ledger sl
             LEFT JOIN raw_materials rm ON rm.id = sl.raw_material_id
             LEFT JOIN locations l ON l.id = sl.location_id
             LEFT JOIN units u ON u.id = sl.unit_id
             WHERE 1=1`;
  const params = [];
  if (location_id) { sql += ' AND sl.location_id = ?'; params.push(location_id); }
  if (raw_material_id) { sql += ' AND sl.raw_material_id = ?'; params.push(raw_material_id); }
  if (from_date && to_date) { sql += ' AND sl.transaction_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  sql += ' ORDER BY sl.transaction_date, sl.id';
  const rows = await query(sql, params);
  let opening = 0;
  return rows.map(r => {
    opening += num(r.qty_in) - num(r.qty_out);
    return { ...r, running_balance: opening };
  });
};

export const getMovementTrend = async (filters) => {
  const { location_id, raw_material_id, from_date, to_date } = filters;
  let sql = `SELECT DATE_FORMAT(sl.transaction_date, '%Y-%m') as month, sl.transaction_type,
                    SUM(sl.qty_out) as total_out
             FROM stock_ledger sl
             WHERE sl.location_id = ? AND sl.qty_out > 0`;
  const params = [location_id];
  if (raw_material_id) { sql += ' AND sl.raw_material_id = ?'; params.push(raw_material_id); }
  if (from_date && to_date) { sql += ' AND sl.transaction_date BETWEEN ? AND ?'; params.push(from_date, to_date); }
  sql += ` GROUP BY DATE_FORMAT(sl.transaction_date, '%Y-%m'), sl.transaction_type ORDER BY month DESC`;
  return query(sql, params);
};

export const getClosingStockReport = async (filters) => {
  const { location_id, from_date, to_date } = filters;
  const from = from_date || '1970-01-01';
  const to = to_date || new Date().toISOString().slice(0, 10);
  const rows = await query(
    `SELECT
       rm.id as raw_material_id,
       rm.material_code,
       rm.material_name,
       c.category_name,
       u.unit_name,
       rm.min_stock_qty,
       rm.reorder_level,
       (SELECT COALESCE(SUM(qty_in - qty_out), 0)
        FROM stock_ledger sl
        WHERE sl.location_id = ? AND sl.raw_material_id = rm.id AND sl.transaction_date < ?
          AND sl.transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT')) as opening,
       (SELECT COALESCE(SUM(qty_in), 0)
        FROM stock_ledger sl
        WHERE sl.location_id = ? AND sl.raw_material_id = rm.id AND sl.transaction_date BETWEEN ? AND ? AND sl.transaction_type = 'PURCHASE_GRN') as purchase,
       (SELECT COALESCE(SUM(qty_in), 0)
        FROM stock_ledger sl
        WHERE sl.location_id = ? AND sl.raw_material_id = rm.id AND sl.transaction_date BETWEEN ? AND ? AND sl.transaction_type = 'TRANSFER_IN') as transfer_in,
       (SELECT COALESCE(SUM(qty_out), 0)
        FROM stock_ledger sl
        WHERE sl.location_id = ? AND sl.raw_material_id = rm.id AND sl.transaction_date BETWEEN ? AND ? AND sl.transaction_type = 'TRANSFER_OUT') as transfer_out,
       (SELECT COALESCE(SUM(qty_out), 0)
        FROM stock_ledger sl
        WHERE sl.location_id = ? AND sl.raw_material_id = rm.id AND sl.transaction_date BETWEEN ? AND ? AND sl.transaction_type = 'PURCHASE_RETURN') as purchase_return,
       (SELECT COALESCE(SUM(qty_out), 0)
        FROM stock_ledger sl
        WHERE sl.location_id = ? AND sl.raw_material_id = rm.id AND sl.transaction_date BETWEEN ? AND ? AND sl.transaction_type = 'WASTAGE') as wastage,
       (SELECT COALESCE(SUM(qty_out), 0)
        FROM stock_ledger sl
        WHERE sl.location_id = ? AND sl.raw_material_id = rm.id AND sl.transaction_date BETWEEN ? AND ? AND sl.transaction_type = 'ADJUSTMENT_NEGATIVE') as adjustment_out,
       (SELECT COALESCE(SUM(qty_in), 0)
        FROM stock_ledger sl
        WHERE sl.location_id = ? AND sl.raw_material_id = rm.id AND sl.transaction_date BETWEEN ? AND ? AND sl.transaction_type = 'ADJUSTMENT_POSITIVE') as adjustment_in,
       (SELECT COALESCE(SUM(qty_in - qty_out), 0)
        FROM stock_ledger sl
        WHERE sl.location_id = ? AND sl.raw_material_id = rm.id AND sl.transaction_date <= ?
          AND sl.transaction_type NOT IN ('TRANSIT_DAMAGE','TRANSIT_SHORT')) as closing
     FROM raw_materials rm
     LEFT JOIN categories c ON c.id = rm.category_id
     LEFT JOIN units u ON u.id = rm.unit_id
     WHERE rm.is_active = 1`,
    [location_id, from, location_id, from, to, location_id, from, to, location_id, from, to, location_id, from, to, location_id, from, to, location_id, from, to, location_id, from, to, location_id, to]
  );
  return rows.map(r => ({
    ...r,
    opening: num(r.opening),
    purchase: num(r.purchase),
    transfer_in: num(r.transfer_in),
    transfer_out: num(r.transfer_out),
    purchase_return: num(r.purchase_return),
    wastage: num(r.wastage),
    adjustment_in: num(r.adjustment_in),
    adjustment_out: num(r.adjustment_out),
    closing: num(r.closing),
  }));
};

export const getStockAgeingReport = async (filters) => {
  const { location_id, raw_material_id, category_id, supplier_id, batch_no, from_date, to_date } = filters || {};
  if (!location_id) throw new Error('Location is required');
  const from = from_date || '1970-01-01';
  const to = to_date || '2100-12-31';
  const currentStock = await getCurrentStock(location_id);
  const wacMap = new Map(currentStock.map(r => [Number(r.raw_material_id), num(r.average_cost)]));

  const rows = await query(
    `WITH remaining AS (
       SELECT raw_material_id, batch_no, expiry_date,
              SUM(qty_in) - SUM(qty_out) as remaining_qty
       FROM stock_ledger
       WHERE location_id = ?
         AND transaction_date BETWEEN ? AND ?
       GROUP BY raw_material_id, batch_no, expiry_date
       HAVING remaining_qty > 0
     ),
     first_receipt AS (
       SELECT raw_material_id, batch_no, expiry_date, transaction_date, transaction_type, reference_id, reference_type,
              ROW_NUMBER() OVER (PARTITION BY raw_material_id, batch_no, expiry_date ORDER BY transaction_date, id) as rn
       FROM stock_ledger
       WHERE location_id = ? AND qty_in > 0
     )
     SELECT
       r.raw_material_id,
       rm.material_code,
       rm.material_name,
       rm.category_id,
       c.category_name,
       u.unit_name,
       l.location_name,
       r.batch_no,
       r.expiry_date,
       r.remaining_qty,
       fr.transaction_date as receipt_date,
       fr.transaction_type as receipt_source,
       fr.reference_type as receipt_reference_type,
       fr.reference_id as receipt_reference_id,
       g.grn_no,
       s.id as supplier_id,
       s.supplier_name,
       s.supplier_code
     FROM remaining r
     JOIN first_receipt fr ON fr.raw_material_id = r.raw_material_id
       AND (fr.batch_no = r.batch_no OR (fr.batch_no IS NULL AND r.batch_no IS NULL))
       AND (fr.expiry_date = r.expiry_date OR (fr.expiry_date IS NULL AND r.expiry_date IS NULL))
       AND fr.rn = 1
     LEFT JOIN raw_materials rm ON rm.id = r.raw_material_id
     LEFT JOIN categories c ON c.id = rm.category_id
     LEFT JOIN units u ON u.id = rm.unit_id
     LEFT JOIN locations l ON l.id = ?
     LEFT JOIN grn g ON g.id = fr.reference_id AND fr.reference_type = 'GRN'
     LEFT JOIN suppliers s ON s.id = g.supplier_id
     WHERE 1=1`,
    [location_id, from, to, location_id, location_id]
  );

  let result = rows.map(r => {
    const ageDays = r.receipt_date ? Math.floor((new Date() - new Date(r.receipt_date)) / 86400000) : 0;
    let bucket = 'Unknown';
    if (ageDays <= 30) bucket = '0-30 Days';
    else if (ageDays <= 60) bucket = '31-60 Days';
    else if (ageDays <= 90) bucket = '61-90 Days';
    else if (ageDays <= 180) bucket = '91-180 Days';
    else bucket = '180+ Days';
    const wac = wacMap.get(Number(r.raw_material_id)) || 0;
    const value = num(r.remaining_qty) * wac;
    let expiryStatus = '-';
    if (r.expiry_date) {
      const days = Math.floor((new Date(r.expiry_date) - new Date()) / 86400000);
      expiryStatus = days < 0 ? 'Expired' : days <= 7 ? 'Near Expiry' : 'Healthy';
    }
    return {
      material_code: r.material_code,
      material_name: r.material_name,
      category_id: r.category_id,
      category: r.category_name,
      supplier_id: r.supplier_id,
      batch_no: r.batch_no || '-',
      receipt_source: r.receipt_source,
      receipt_reference: r.grn_no || r.receipt_reference_type || '-',
      supplier: r.supplier_name || '-',
      supplier_code: r.supplier_code,
      receipt_date: r.receipt_date,
      age_days: ageDays,
      remaining_qty: num(r.remaining_qty),
      unit: r.unit_name,
      wac,
      stock_value: value,
      expiry_date: r.expiry_date,
      expiry_status: expiryStatus,
      age_bucket: bucket,
      location: r.location_name,
    };
  });

  if (raw_material_id) result = result.filter(r => Number(r.raw_material_id) === Number(raw_material_id));
  if (category_id) result = result.filter(r => Number(r.category_id) === Number(category_id));
  if (supplier_id) result = result.filter(r => Number(r.supplier_id) === Number(supplier_id));
  if (batch_no) result = result.filter(r => (r.batch_no || '').toLowerCase().includes(batch_no.toLowerCase()));
  return result;
};

const writeSheet = (ws, rows, headers) => {
  if (!headers.length) { ws.addRow(['No data']); return; }
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).freeze = true;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  if (rows.length === 0) {
    ws.addRow(['No data for selected filters']);
  } else {
    rows.forEach(r => ws.addRow(headers.map(h => r[h])));
  }
  ws.columns = headers.map(h => ({ width: Math.max(12, h.length + 3) }));
};

export const getReportPack = async (filters) => {
  const { location_id, from_date, to_date } = filters || {};
  const wb = new ExcelJS.Workbook();

  // Summary sheet
  const summary = await getReportSummary(location_id);
  const sumWs = wb.addWorksheet('01 Summary');
  sumWs.addRow(['Warehouse', location_id || '']);
  sumWs.addRow(['From Date', from_date || '']);
  sumWs.addRow(['To Date', to_date || '']);
  sumWs.addRow(['Generated At', new Date().toISOString()]);
  sumWs.addRow([]);
  sumWs.addRow(['KPI', 'Value']);
  sumWs.addRow(['Current Stock Value', num(summary.current_stock_value)]);
  sumWs.addRow(['Low Stock', summary.low_stock]);
  sumWs.addRow(['Out of Stock', summary.out_of_stock]);
  sumWs.addRow(['Near Expiry', summary.near_expiry]);
  sumWs.addRow(['Expired', summary.expired]);
  sumWs.addRow(['Pending Requisitions', summary.pending_requisitions]);
  sumWs.addRow(['In Transit', summary.in_transit]);
  sumWs.addRow(['Wastage Value', num(summary.wastage_value)]);
  sumWs.addRow(['Adjustment Value', num(summary.adjustment_value)]);
  sumWs.columns = [{ width: 28 }, { width: 18 }];

  const commonFilters = { location_id, from_date, to_date };
  const reportDefs = [
    { name: '02 Current Stock', fn: getCurrentStockReport, array: true },
    { name: '03 Stock Ledger', fn: getStockLedgerReport, array: true },
    { name: '04 Stock Valuation', fn: getStockValuationReport, array: true },
    { name: '05 Stock Ageing', fn: getStockAgeingReport, array: true },
    { name: '06 Batch', fn: getBatchReport, array: true },
    { name: '07 Expiry', fn: getExpiryReport, array: true },
    { name: '08 Low Stock', fn: getLowStockReport, array: true },
    { name: '09 Out of Stock', fn: getOutOfStockReport, array: true },
    { name: '10 GRN', fn: getGRNReport, array: true },
    { name: '11 Supplier Receipts', fn: getSupplierReceiptReport, array: true },
    { name: '12 Purchase Returns', fn: getPurchaseReturnReport, array: true },
    { name: '13 Requisitions', fn: getRequisitionReport, array: true },
    { name: '14 Pending Requisitions', fn: getPendingRequisitionReport, array: true },
    { name: '15 Dispatch', fn: getDispatchReport, array: true },
    { name: '16 Transit', fn: getTransitReport, array: true },
    { name: '17 Receipts', fn: getReceiptReport, array: true },
    { name: '18 Transit Damage', fn: getTransitDamageReport, array: true },
    { name: '19 Transit Short', fn: getTransitShortReport, array: true },
    { name: '20 Warehouse-to-Outlet', fn: getTransferReport, array: true },
    { name: '21 Physical Count', fn: getPhysicalCountReport, array: true },
    { name: '22 Stock Variance', fn: getVarianceReport, array: true },
    { name: '23 Wastage', fn: getWastageReport, array: true },
    { name: '24 Adjustments', fn: getAdjustmentReport, array: true },
    { name: '25 Material Movement', fn: getMaterialMovementReport, array: true },
    { name: '26 Movement Trend', fn: getMovementTrend, array: true },
    { name: '27 Closing Stock', fn: getClosingStockReport, array: true },
  ];

  for (const def of reportDefs) {
    const data = await def.fn(commonFilters);
    const rows = Array.isArray(data) ? data : [];
    const ws = wb.addWorksheet(def.name);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    writeSheet(ws, rows, headers);
  }

  return await wb.xlsx.writeBuffer();
};

// Warehouse profit: what the warehouse paid suppliers (GRN) vs what it
// "sold" outlets for when dispatching (stock_transfer_items.sale_value,
// snapshotted from raw_materials.transfer_price at dispatch time - see
// dispatchRequisition in warehouseService.js). Gross profit is matched
// against dispatched_qty * unit_cost (the same cost value already posted to
// the stock ledger as TRANSFER_OUT), not against period purchases, since
// purchases and dispatches in the same window aren't the same units.
export const getWarehouseProfitReport = async (filters) => {
  const { location_id, from_date, to_date } = filters;
  if (!from_date || !to_date) throw new Error('from_date and to_date are required');

  let purchaseSql = `
    SELECT COALESCE(SUM((gi.received_qty - gi.rejected_qty) * gi.rate + gi.tax_amount), 0) as total_purchase_value
    FROM grn g
    INNER JOIN grn_items gi ON gi.grn_id = g.id
    WHERE g.status = 'Posted' AND g.grn_date BETWEEN ? AND ?`;
  const purchaseParams = [from_date, to_date];
  if (location_id) { purchaseSql += ' AND g.warehouse_location_id = ?'; purchaseParams.push(location_id); }
  const [purchaseRow] = await query(purchaseSql, purchaseParams);

  let transferSql = `
    SELECT rm.id as raw_material_id, rm.material_name, rm.material_code,
      SUM(sti.dispatched_qty) as total_qty,
      SUM(sti.dispatched_qty * sti.unit_cost) as total_cost,
      SUM(sti.sale_value) as total_sale_value,
      SUM(CASE WHEN sti.sale_value IS NULL THEN sti.dispatched_qty ELSE 0 END) as unpriced_qty
    FROM stock_transfer_items sti
    INNER JOIN stock_transfers st ON st.id = sti.transfer_id
    LEFT JOIN raw_materials rm ON rm.id = sti.raw_material_id
    WHERE st.dispatch_date BETWEEN ? AND ?`;
  const transferParams = [from_date, to_date];
  if (location_id) { transferSql += ' AND st.from_location_id = ?'; transferParams.push(location_id); }
  transferSql += ' GROUP BY rm.id, rm.material_name, rm.material_code ORDER BY rm.material_name';
  const byMaterial = await query(transferSql, transferParams);

  const totals = byMaterial.reduce((acc, r) => {
    acc.totalCost += num(r.total_cost);
    acc.totalSaleValue += num(r.total_sale_value);
    acc.unpricedQty += num(r.unpriced_qty);
    return acc;
  }, { totalCost: 0, totalSaleValue: 0, unpricedQty: 0 });

  return {
    from_date,
    to_date,
    total_purchase_value: num(purchaseRow?.total_purchase_value),
    total_transfer_cost: totals.totalCost,
    total_transfer_sale_value: totals.totalSaleValue,
    gross_profit: totals.totalSaleValue - totals.totalCost,
    unpriced_dispatch_qty: totals.unpricedQty,
    by_material: byMaterial.map((r) => ({
      raw_material_id: r.raw_material_id,
      material_name: r.material_name,
      material_code: r.material_code,
      qty: num(r.total_qty),
      cost_value: num(r.total_cost),
      sale_value: num(r.total_sale_value),
      profit: num(r.total_sale_value) - num(r.total_cost),
      unpriced_qty: num(r.unpriced_qty),
    })),
  };
};

// GSTR-3B Table 4 (Eligible ITC) for the warehouse's purchase side. Rate is
// read from raw_materials.gst_rate (same source the GRN Tax Invoice print
// already uses) since grn_items itself doesn't store a rate column - only
// the resulting tax_amount. Tax is split CGST/SGST 50/50, matching the
// intra-state assumption already used everywhere else in this codebase's
// GST-related printing (GRN/PO invoices never compute IGST).
export const getGSTR3BWarehouseReport = async (filters) => {
  const { location_id, from_date, to_date } = filters;
  if (!from_date || !to_date) throw new Error('from_date and to_date are required');

  let sql = `SELECT gi.raw_material_id, rm.material_name, rm.hsn_code, rm.gst_rate,
      (gi.total_amount - gi.tax_amount) as taxable_value, gi.tax_amount
    FROM grn g
    INNER JOIN grn_items gi ON gi.grn_id = g.id
    LEFT JOIN raw_materials rm ON rm.id = gi.raw_material_id
    WHERE g.status = 'Posted' AND g.grn_date BETWEEN ? AND ?`;
  const params = [from_date, to_date];
  if (location_id) { sql += ' AND g.warehouse_location_id = ?'; params.push(location_id); }
  const rows = await query(sql, params);

  const byRate = {};
  const byHsn = {};
  let unratedValue = 0, unratedTax = 0, unratedCount = 0;

  for (const r of rows) {
    const taxable = num(r.taxable_value);
    const tax = num(r.tax_amount);
    if (r.gst_rate === null || r.gst_rate === undefined) {
      unratedValue += taxable;
      unratedTax += tax;
      unratedCount += 1;
      continue;
    }
    const rate = Number(r.gst_rate);
    const rKey = rate.toFixed(2);
    if (!byRate[rKey]) byRate[rKey] = { rate, taxable_value: 0, cgst: 0, sgst: 0, total_tax: 0 };
    byRate[rKey].taxable_value += taxable;
    byRate[rKey].cgst += tax / 2;
    byRate[rKey].sgst += tax / 2;
    byRate[rKey].total_tax += tax;

    const hKey = r.hsn_code || 'Not Mapped';
    if (!byHsn[hKey]) byHsn[hKey] = { hsn_code: hKey, description: r.material_name, taxable_value: 0, rate, tax_amount: 0 };
    byHsn[hKey].taxable_value += taxable;
    byHsn[hKey].tax_amount += tax;
  }

  const itcByRate = Object.values(byRate).sort((a, b) => a.rate - b.rate);
  const hsnSummary = Object.values(byHsn).sort((a, b) => (a.hsn_code > b.hsn_code ? 1 : -1));
  const totalTaxable = itcByRate.reduce((s, r) => s + r.taxable_value, 0);
  const totalTax = itcByRate.reduce((s, r) => s + r.total_tax, 0);

  return {
    from_date,
    to_date,
    total_taxable_value: totalTaxable,
    total_eligible_itc: totalTax,
    itc_by_rate: itcByRate,
    hsn_summary: hsnSummary,
    unrated: { taxable_value: unratedValue, tax: unratedTax, row_count: unratedCount },
  };
};

// Purchase returns to suppliers, GST-rate-wise. This is the closest thing a
// warehouse produces to a "GSTR-1"-relevant document - a debit note against
// a supplier - but it's supplementary/reconciliation data, not a real
// outward-supply return (the warehouse itself has no outward taxable
// supplies; see getGSTR1Report for the actual GSTR-1 source, outlet sales).
// purchase_return_items has no stored tax split, so tax is derived from
// raw_materials.gst_rate the same way GRN's rate-wise report does.
export const getPurchaseReturnGSTSummary = async (filters) => {
  const { location_id, from_date, to_date } = filters;
  if (!from_date || !to_date) throw new Error('from_date and to_date are required');

  let sql = `SELECT pr.return_no, pr.return_date, pr.supplier_id, s.supplier_name, s.gstin,
      pri.raw_material_id, rm.material_name, rm.hsn_code, rm.gst_rate,
      pri.return_qty, pri.supplier_credit_value
    FROM purchase_returns pr
    INNER JOIN purchase_return_items pri ON pri.purchase_return_id = pr.id
    LEFT JOIN suppliers s ON s.id = pr.supplier_id
    LEFT JOIN raw_materials rm ON rm.id = pri.raw_material_id
    WHERE pr.status = 'Posted' AND pr.return_date BETWEEN ? AND ?`;
  const params = [from_date, to_date];
  if (location_id) { sql += ' AND pr.warehouse_location_id = ?'; params.push(location_id); }
  const rows = await query(sql, params);

  const bySupplier = {};
  let totalTaxable = 0, totalTax = 0;

  for (const r of rows) {
    const rate = r.gst_rate !== null && r.gst_rate !== undefined ? Number(r.gst_rate) : 0;
    const creditValue = num(r.supplier_credit_value);
    const taxable = rate > 0 ? creditValue / (1 + rate / 100) : creditValue;
    const tax = creditValue - taxable;
    totalTaxable += taxable;
    totalTax += tax;

    const key = r.supplier_id || 'unknown';
    if (!bySupplier[key]) bySupplier[key] = { supplier_id: r.supplier_id, supplier_name: r.supplier_name, gstin: r.gstin, taxable_value: 0, cgst: 0, sgst: 0, total_tax: 0, credit_value: 0, return_count: 0 };
    bySupplier[key].taxable_value += taxable;
    bySupplier[key].cgst += tax / 2;
    bySupplier[key].sgst += tax / 2;
    bySupplier[key].total_tax += tax;
    bySupplier[key].credit_value += creditValue;
    bySupplier[key].return_count += 1;
  }

  return {
    from_date,
    to_date,
    total_taxable_value: totalTaxable,
    total_tax: totalTax,
    total_credit_value: totalTaxable + totalTax,
    by_supplier: Object.values(bySupplier).sort((a, b) => (a.supplier_name > b.supplier_name ? 1 : -1)),
  };
};

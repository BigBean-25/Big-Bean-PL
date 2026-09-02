import { query } from '../config/database.js';
import { getSupplierLedgerSummary } from './supplierLedgerService.js';

const num = v => v === null || v === undefined || v === '' ? 0 : Number(v);

const buildWhere = (clauses, params) => {
  if (!clauses.length) return '';
  return 'WHERE ' + clauses.join(' AND ');
};

export const getSupplierHistorySummary = async ({
  locationId,
  supplierId,
  materialId,
  from,
  to,
  documentType,
  search,
}) => {
  const clauses = ['s.is_active = 1'];
  const params = [];
  if (locationId) {
    clauses.push('EXISTS (SELECT 1 FROM purchase_orders po WHERE po.supplier_id = s.id AND po.warehouse_location_id = ? LIMIT 1)');
    params.push(locationId);
  }
  if (supplierId) {
    clauses.push('s.id = ?');
    params.push(supplierId);
  }
  if (search) {
    clauses.push('(s.supplier_code LIKE ? OR s.supplier_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const sql = `
    SELECT s.id, s.supplier_code, s.supplier_name, s.phone, s.email,
      (SELECT COUNT(DISTINCT po.id) FROM purchase_orders po WHERE po.supplier_id = s.id) AS po_count,
      (SELECT COUNT(DISTINCT g.id) FROM grn g WHERE g.supplier_id = s.id) AS grn_count,
      (SELECT COUNT(DISTINCT pr.id) FROM purchase_returns pr WHERE pr.supplier_id = s.id AND pr.status = 'Posted') AS return_count
    FROM suppliers s
    ${buildWhere(clauses, params)}
    ORDER BY s.supplier_name
  `;
  const suppliers = await query(sql, params);

  const result = [];
  for (const s of suppliers) {
    const locWhere = locationId ? 'AND warehouse_location_id = ?' : '';
    const poValue = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS v FROM purchase_orders WHERE supplier_id = ? AND status NOT IN ('Rejected', 'Closed') ${locWhere}`,
      locationId ? [s.id, locationId] : [s.id]
    );
    const grnValue = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS v FROM grn WHERE supplier_id = ? AND status = 'Posted' ${locWhere}`,
      locationId ? [s.id, locationId] : [s.id]
    );
    const returnCredit = await query(
      `SELECT COALESCE(SUM(pr.total_return_value), 0) AS v
       FROM purchase_returns pr
       WHERE pr.supplier_id = ? AND pr.status = 'Posted' ${locWhere}`,
      locationId ? [s.id, locationId] : [s.id]
    );
    const payments = await query(
      `SELECT COALESCE(SUM(paid_amount), 0) AS v FROM supplier_payments WHERE supplier_id = ?`,
      [s.id]
    );
    let outstanding = 0;
    let outstandingUnavailable = false;
    if (!locationId) {
      try {
        const summary = await getSupplierLedgerSummary({
          outletId: 1,
          supplierId: s.id,
          date: new Date().toISOString().slice(0, 10),
        });
        outstanding = summary.current_outstanding;
      } catch (error) {
        console.error(`Supplier ledger summary failed for supplier ${s.id}:`, error);
        outstandingUnavailable = true;
      }
    }
    const materialsSupplied = await query(
      `SELECT COUNT(DISTINCT raw_material_id) AS c
       FROM grn_items gi
       INNER JOIN grn g ON g.id = gi.grn_id
       WHERE g.supplier_id = ? ${locWhere}`,
      locationId ? [s.id, locationId] : [s.id]
    );
    const lastPurchase = await query(
      `SELECT MAX(grn_date) AS d FROM grn WHERE supplier_id = ? AND status = 'Posted' ${locWhere}`,
      locationId ? [s.id, locationId] : [s.id]
    );
    result.push({
      id: s.id,
      supplier_code: s.supplier_code,
      supplier_name: s.supplier_name,
      po_value: num(poValue[0].v),
      grn_value: num(grnValue[0].v),
      return_credit: num(returnCredit[0].v),
      payments: num(payments[0].v),
      outstanding: num(outstanding),
      outstanding_unavailable: outstandingUnavailable,
      materials_supplied: num(materialsSupplied[0].c),
      last_purchase_date: lastPurchase[0].d,
    });
  }
  return result;
};

export const getSupplierHistoryDetail = async (supplierId, locationId) => {
  const [supplier] = await query('SELECT * FROM suppliers WHERE id = ? AND is_active = 1', [supplierId]);
  if (!supplier) throw new Error('Supplier not found');

  const locWhere = locationId ? 'AND warehouse_location_id = ?' : '';
  const poParams = locationId ? [supplierId, locationId] : [supplierId];
  const poHistory = await query(
    `SELECT po.id, po.po_no, po.po_date, po.status, po.total_amount, po.expected_delivery_date, l.location_name
     FROM purchase_orders po
     LEFT JOIN locations l ON l.id = po.warehouse_location_id
     WHERE po.supplier_id = ? AND po.status NOT IN ('Rejected', 'Closed') ${locWhere}
     ORDER BY po.po_date DESC`,
    poParams
  );

  const grnParams = locationId ? [supplierId, locationId] : [supplierId];
  const grnHistory = await query(
    `SELECT g.id, g.grn_no, g.grn_date, g.status, g.total_amount, g.purchase_reference, g.invoice_reference, l.location_name
     FROM grn g
     LEFT JOIN locations l ON l.id = g.warehouse_location_id
     WHERE g.supplier_id = ? AND g.status = 'Posted' ${locWhere}
     ORDER BY g.grn_date DESC`,
    grnParams
  );

  const returnHistory = await query(
    `SELECT pr.id, pr.return_no, pr.return_date, pr.status, pr.total_return_value, pr.supplier_credit_note_no, sc.credit_amount, sc.status AS credit_status
     FROM purchase_returns pr
     LEFT JOIN supplier_credits sc ON sc.purchase_return_id = pr.id
     WHERE pr.supplier_id = ? AND pr.status = 'Posted'
     ORDER BY pr.return_date DESC`,
    [supplierId]
  );

  const creditHistory = await query(
    `SELECT sc.id, sc.credit_note_no, sc.credit_amount, sc.status AS credit_status, pr.return_no
     FROM supplier_credits sc
     LEFT JOIN purchase_returns pr ON pr.id = sc.purchase_return_id
     WHERE sc.supplier_id = ?`,
    [supplierId]
  );

  const paymentHistory = await query(
    `SELECT sp.id, sp.reference_no as payment_no, sp.date, sp.paid_amount, pm.mode_name as payment_mode, sp.remarks
     FROM supplier_payments sp
     LEFT JOIN payment_modes pm ON pm.id = sp.payment_mode_id
     WHERE sp.supplier_id = ?
     ORDER BY sp.date DESC`,
    [supplierId]
  );

  let outstanding = 0;
  let outstandingUnavailable = false;
  if (!locationId) {
    try {
      const summary = await getSupplierLedgerSummary({
        outletId: 1,
        supplierId,
        date: new Date().toISOString().slice(0, 10),
      });
      outstanding = summary.current_outstanding;
    } catch (error) {
      console.error(`Supplier ledger summary failed for supplier ${supplierId}:`, error);
      outstandingUnavailable = true;
    }
  }

  return {
    supplier,
    summary: {
      po_value: poHistory.reduce((s, r) => s + num(r.total_amount), 0),
      grn_value: grnHistory.reduce((s, r) => s + num(r.total_amount), 0),
      return_credit: returnHistory.reduce((s, r) => s + num(r.credit_amount), 0),
      payments: paymentHistory.reduce((s, r) => s + num(r.paid_amount), 0),
      outstanding: num(outstanding),
      outstanding_unavailable: outstandingUnavailable,
    },
    po_history: poHistory,
    grn_history: grnHistory,
    return_history: returnHistory,
    credit_history: creditHistory,
    payment_history: paymentHistory,
  };
};

export const getSupplierMaterialHistory = async (supplierId, locationId, materialId) => {
  const where = ['g.supplier_id = ?', 'g.status = "Posted"'];
  const params = [supplierId];
  if (locationId) { where.push('g.warehouse_location_id = ?'); params.push(locationId); }
  if (materialId) { where.push('gi.raw_material_id = ?'); params.push(materialId); }

  const rows = await query(
    `SELECT rm.id AS material_id, rm.material_code, rm.material_name, u.unit_name,
            gi.rate,
            SUM(gi.received_qty - gi.rejected_qty) AS accepted_qty,
            SUM((gi.received_qty - gi.rejected_qty) * gi.rate) AS purchase_value,
            SUM(gi.received_qty) AS received_qty,
            MAX(g.grn_date) AS last_purchase_date
     FROM grn_items gi
     INNER JOIN grn g ON g.id = gi.grn_id
     INNER JOIN raw_materials rm ON rm.id = gi.raw_material_id
     LEFT JOIN units u ON u.id = gi.unit_id
     WHERE ${where.join(' AND ')}
     GROUP BY rm.id, rm.material_code, rm.material_name, u.unit_name, gi.rate
     ORDER BY rm.material_name`,
    params
  );

  const grouped = {};
  for (const r of rows) {
    const key = r.material_id;
    if (!grouped[key]) grouped[key] = { ...r, rates: [] };
    grouped[key].rates.push(num(r.rate));
  }

  return Object.values(grouped).map(g => ({
    material_id: g.material_id,
    material_code: g.material_code,
    material_name: g.material_name,
    unit_name: g.unit_name,
    last_purchase_date: g.last_purchase_date,
    last_supplier_rate: g.rates[g.rates.length - 1],
    average_rate: g.rates.reduce((a, b) => a + b, 0) / (g.rates.length || 1),
    lowest_rate: Math.min(...g.rates),
    highest_rate: Math.max(...g.rates),
    total_qty_purchased: num(g.accepted_qty),
    total_purchase_value: num(g.purchase_value),
  }));
};

export const getSupplierPriceMovement = async (supplierId, locationId, materialId) => {
  const where = ['g.supplier_id = ?', 'g.status = "Posted"'];
  const params = [supplierId];
  if (locationId) { where.push('g.warehouse_location_id = ?'); params.push(locationId); }
  if (materialId) { where.push('gi.raw_material_id = ?'); params.push(materialId); }

  const rows = await query(
    `SELECT g.grn_date, g.grn_no, g.invoice_reference, rm.material_name, u.unit_name,
            gi.rate, (gi.received_qty - gi.rejected_qty) AS accepted_qty,
            (SELECT po.rate FROM purchase_order_items po
             INNER JOIN purchase_orders p ON p.id = po.purchase_order_id
             WHERE p.supplier_id = g.supplier_id AND po.raw_material_id = gi.raw_material_id
             ORDER BY p.po_date DESC LIMIT 1) AS po_rate
     FROM grn_items gi
     INNER JOIN grn g ON g.id = gi.grn_id
     INNER JOIN raw_materials rm ON rm.id = gi.raw_material_id
     LEFT JOIN units u ON u.id = gi.unit_id
     WHERE ${where.join(' AND ')}
     ORDER BY g.grn_date ASC, g.id ASC`,
    params
  );

  const result = [];
  let prevRate = null;
  for (const r of rows) {
    const rate = num(r.rate);
    const change = prevRate === null ? null : rate - prevRate;
    const changePct = prevRate && prevRate !== 0 ? ((change / prevRate) * 100).toFixed(2) : null;
    result.push({
      grn_date: r.grn_date,
      grn_no: r.grn_no,
      invoice_reference: r.invoice_reference,
      material_name: r.material_name,
      unit_name: r.unit_name,
      po_rate: num(r.po_rate),
      actual_rate: rate,
      accepted_qty: num(r.accepted_qty),
      change: change,
      change_pct: changePct,
    });
    prevRate = rate;
  }
  return result;
};

export const getSupplierTimeline = async (supplierId, locationId) => {
  const out = [];
  const po = await query(
    `SELECT po_no, po_date, status, 'PO Created' AS event FROM purchase_orders WHERE supplier_id = ? ${locationId ? 'AND warehouse_location_id = ?' : ''}
     UNION ALL
     SELECT po_no, approved_at, 'Approved', 'PO Approved' FROM purchase_orders WHERE supplier_id = ? AND approved_at IS NOT NULL ${locationId ? 'AND warehouse_location_id = ?' : ''}
     UNION ALL
     SELECT g.grn_no, g.grn_date, g.status, 'GRN Posted' FROM grn g WHERE g.supplier_id = ? AND g.status = 'Posted' ${locationId ? 'AND g.warehouse_location_id = ?' : ''}
     UNION ALL
     SELECT pr.return_no, pr.return_date, pr.status, 'Purchase Return Posted' FROM purchase_returns pr WHERE pr.supplier_id = ? AND pr.status = 'Posted' ${locationId ? 'AND warehouse_location_id = ?' : ''}
     UNION ALL
     SELECT sp.reference_no, sp.date, 'Completed', 'Supplier Payment' FROM supplier_payments sp WHERE sp.supplier_id = ?
     ORDER BY po_date DESC`,
    locationId
      ? [supplierId, locationId, supplierId, locationId, supplierId, locationId, supplierId, locationId, supplierId]
      : [supplierId, supplierId, supplierId, supplierId, supplierId]
  );
  return po;
};

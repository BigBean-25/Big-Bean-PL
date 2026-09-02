import { query } from '../config/database.js';
import { getCurrentStock } from './warehouseService.js';
import { findConversionFactor } from '../utils/uomUtils.js';
import { createPO } from './warehousePurchaseOrderService.js';

const num = v => v === null || v === undefined || v === '' ? 0 : Number(v);

export const getStockStatus = (current, min, reorder, max) => {
  if (current <= 0) return 'OUT OF STOCK';
  if (current <= num(min)) return 'CRITICAL';
  if (max > 0 && current > num(max)) return 'OVERSTOCK';
  if (current <= num(reorder)) return 'REORDER REQUIRED';
  return 'HEALTHY';
};

const toBaseQty = async (qty, fromUnitId, baseUnitId) => {
  if (Number(fromUnitId) === Number(baseUnitId)) return num(qty);
  const factor = await findConversionFactor(fromUnitId, baseUnitId).catch(() => 1);
  return num(qty) * factor;
};

const getMaterialBaseUnitId = async (materialId) => {
  const rows = await query('SELECT unit_id FROM raw_materials WHERE id = ?', [materialId]);
  return rows[0]?.unit_id;
};

export const getPendingPOQty = async (materialId, locationId) => {
  const baseUnitId = await getMaterialBaseUnitId(materialId);
  if (!baseUnitId) return { base_qty: 0, original_qty: 0 };

  const openStatuses = ['Approved', 'Sent', 'Partially Received'];
  const items = await query(
    `SELECT poi.ordered_qty, poi.unit_id, poi.purchase_order_id
     FROM purchase_order_items poi
     INNER JOIN purchase_orders po ON po.id = poi.purchase_order_id
     WHERE poi.raw_material_id = ?
       AND po.warehouse_location_id = ?
       AND po.status IN (${openStatuses.map(() => '?').join(',')})`,
    [materialId, locationId, ...openStatuses]
  );

  let totalBase = 0;
  for (const it of items) {
    const orderedBase = await toBaseQty(it.ordered_qty, it.unit_id, baseUnitId);
    const acceptedRows = await query(
      `SELECT gi.received_qty, gi.rejected_qty, gi.unit_id
       FROM grn_items gi
       INNER JOIN grn g ON g.id = gi.grn_id
       WHERE g.purchase_order_id = ? AND gi.raw_material_id = ?`,
      [it.purchase_order_id, materialId]
    );
    const acceptedBase = (await Promise.all(acceptedRows.map(async r => {
      const accepted = num(r.received_qty) - num(r.rejected_qty);
      return toBaseQty(accepted, r.unit_id, baseUnitId);
    }))).reduce((s, v) => s + v, 0);
    totalBase += Math.max(0, orderedBase - acceptedBase);
  }
  return { base_qty: totalBase, original_qty: items.length };
};

export const getLastPurchaseRate = async (materialId, supplierId) => {
  const where = ['gi.raw_material_id = ?', 'g.status = "Posted"'];
  const params = [materialId];
  if (supplierId) { where.push('g.supplier_id = ?'); params.push(supplierId); }
  const rows = await query(
    `SELECT gi.rate, gi.unit_id, g.grn_date, g.supplier_id
     FROM grn_items gi
     INNER JOIN grn g ON g.id = gi.grn_id
     WHERE ${where.join(' AND ')}
     ORDER BY g.grn_date DESC, g.id DESC
     LIMIT 1`,
    params
  );
  if (!rows.length) return null;
  const r = rows[0];
  const baseUnitId = await getMaterialBaseUnitId(materialId);
  const normalized = baseUnitId ? await (async () => {
    try { const f = await findConversionFactor(r.unit_id, baseUnitId); return num(r.rate) / f; } catch { return num(r.rate); }
  })() : num(r.rate);
  return { rate: normalized, date: r.grn_date, supplier_id: r.supplier_id };
};

export const getReorderData = async ({ locationId, categoryId, statusFilter, supplierId, search }) => {
  const stockRows = await getCurrentStock(locationId);
  const params = [];
  const clauses = ['rm.is_active = 1'];
  if (categoryId) { clauses.push('rm.category_id = ?'); params.push(categoryId); }
  if (supplierId) { clauses.push('rm.preferred_supplier_id = ?'); params.push(supplierId); }
  if (search) { clauses.push('(rm.material_code LIKE ? OR rm.material_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  const materials = await query(
    `SELECT rm.id, rm.material_code, rm.material_name, rm.category_id, rm.unit_id,
            rm.min_stock_qty, rm.max_stock_qty, rm.reorder_level, rm.safety_stock_qty,
            rm.lead_time_days, rm.preferred_supplier_id,
            c.category_name, u.unit_name, u.unit_symbol,
            s.supplier_code, s.supplier_name
     FROM raw_materials rm
     LEFT JOIN categories c ON c.id = rm.category_id
     LEFT JOIN units u ON u.id = rm.unit_id
     LEFT JOIN suppliers s ON s.id = rm.preferred_supplier_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY rm.material_name`,
    params
  );

  const result = [];
  for (const m of materials) {
    const stockRow = stockRows.find(s => Number(s.raw_material_id) === m.id);
    const current = num(stockRow?.current_qty);
    const pending = await getPendingPOQty(m.id, locationId);
    const projected = current + pending.base_qty;
    const min = num(m.min_stock_qty);
    const reorder = num(m.reorder_level);
    const max = num(m.max_stock_qty);
    const safety = num(m.safety_stock_qty);
    const physicalStatus = getStockStatus(current, min, reorder, max);
    const projectedStatus = getStockStatus(projected, min, reorder, max);
    const target = max > 0 ? max : (reorder + safety);
    const suggested = Math.max(0, target - projected);
    const lastRate = m.preferred_supplier_id
      ? await getLastPurchaseRate(m.id, m.preferred_supplier_id)
      : await getLastPurchaseRate(m.id, null);
    const estimatedValue = lastRate ? suggested * lastRate.rate : 0;

    if (statusFilter && physicalStatus !== statusFilter) continue;

    result.push({
      material_id: m.id,
      material_code: m.material_code,
      material_name: m.material_name,
      category: m.category_name,
      base_unit: m.unit_name,
      base_unit_id: m.unit_id,
      current_qty: current,
      min_stock_qty: min,
      reorder_level: reorder,
      max_stock_qty: max,
      safety_stock_qty: safety,
      lead_time_days: m.lead_time_days,
      preferred_supplier_id: m.preferred_supplier_id,
      preferred_supplier: m.supplier_name ? `${m.supplier_code} — ${m.supplier_name}` : null,
      preferred_supplier_name: m.supplier_name,
      preferred_supplier_code: m.supplier_code,
      pending_po_qty: pending.base_qty,
      projected_stock: projected,
      physical_status: physicalStatus,
      projected_status: projectedStatus,
      suggested_purchase_qty: suggested,
      last_purchase_rate: lastRate?.rate || null,
      last_purchase_date: lastRate?.date || null,
      last_purchase_supplier_id: lastRate?.supplier_id || null,
      estimated_reorder_value: estimatedValue,
    });
  }
  return result;
};

export const updateReorderSettings = async (materialId, data) => {
  const { min_stock_qty, reorder_level, max_stock_qty, safety_stock_qty, lead_time_days, preferred_supplier_id } = data;
  const min = num(min_stock_qty);
  const reorder = num(reorder_level);
  const max = num(max_stock_qty);
  if (reorder < min) throw new Error('Reorder level must be >= minimum stock');
  if (max > 0 && max < reorder) throw new Error('Maximum stock must be >= reorder level');
  await query(
    `UPDATE raw_materials SET
       min_stock_qty = ?, reorder_level = ?, max_stock_qty = ?, safety_stock_qty = ?,
       lead_time_days = ?, preferred_supplier_id = ?, updated_at = NOW()
     WHERE id = ?`,
    [min, reorder, max, num(safety_stock_qty), lead_time_days ? Number(lead_time_days) : null, preferred_supplier_id ? Number(preferred_supplier_id) : null, materialId]
  );
  return { id: materialId };
};

export const createDraftPOFromReorder = async (materialIds, locationId, userId) => {
  if (!Array.isArray(materialIds) || !materialIds.length) throw new Error('No materials selected');
  const ids = materialIds.map(Number);
  const rows = await query(
    `SELECT rm.id, rm.material_code, rm.material_name, rm.unit_id, rm.preferred_supplier_id,
            rm.reorder_level, rm.max_stock_qty, rm.safety_stock_qty
     FROM raw_materials rm
     WHERE rm.id IN (${ids.map(() => '?').join(',')})`,
    ids
  );

  const bySupplier = {};
  for (const m of rows) {
    if (!m.preferred_supplier_id) throw new Error(`Material ${m.material_name} has no preferred supplier`);
    const pending = await getPendingPOQty(m.id, locationId);
    const stockRows = await getCurrentStock(locationId);
    const current = num(stockRows.find(s => Number(s.raw_material_id) === m.id)?.current_qty);
    const target = num(m.max_stock_qty) > 0 ? num(m.max_stock_qty) : (num(m.reorder_level) + num(m.safety_stock_qty));
    const suggested = Math.max(0, target - (current + pending.base_qty));
    if (suggested <= 0) continue;
    if (!bySupplier[m.preferred_supplier_id]) bySupplier[m.preferred_supplier_id] = [];
    bySupplier[m.preferred_supplier_id].push({
      raw_material_id: m.id,
      ordered_qty: suggested,
      unit_id: m.unit_id,
      rate: 0,
    });
  }

  const created = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const supplierId of Object.keys(bySupplier)) {
    const items = bySupplier[supplierId];
    if (!items.length) continue;
    const po = await createPO({
      po_date: today,
      supplier_id: Number(supplierId),
      warehouse_location_id: Number(locationId),
      expected_delivery_date: today,
      payment_terms: '',
      reference: 'AUTO-REORDER',
      remarks: 'Created from Low Stock / Reorder',
      items: items.map(it => ({ ...it, discount: 0, tax: 0, batch_required: 0, expiry_required: 0, remarks: '' })),
    }, userId);
    created.push(po);
  }
  return created;
};

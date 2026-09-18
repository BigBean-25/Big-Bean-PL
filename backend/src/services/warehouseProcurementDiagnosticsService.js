import { query } from '../config/database.js';

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

const httpError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const assertDate = (value, label) => {
  const text = String(value || '').trim();
  if (!DATE_RE.test(text)) throw httpError(`${label} must be a valid YYYY-MM-DD date`);
  return text;
};

const assertDateRange = (fromDate, toDate) => {
  if (fromDate > toDate) throw httpError('from_date must be on or before to_date');
};

const monthBuckets = (fromDate, toDate) => {
  const buckets = [];
  const cursor = new Date(`${fromDate}T00:00:00Z`);
  cursor.setUTCDate(1);
  const end = new Date(`${toDate}T00:00:00Z`);
  end.setUTCDate(1);

  while (cursor <= end) {
    const month = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
    buckets.push({ month, warehouse_grn_value: 0, outlet_direct_purchase_value: 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return buckets;
};

const scopeIncludes = (scope, key, value) => {
  if (!scope || scope.all) return true;
  const allowed = (scope[key] || []).map(Number);
  return allowed.includes(Number(value));
};

const supplierKeyFor = (supplierId, supplierName) => {
  if (supplierId !== null && supplierId !== undefined && supplierId !== '') return `id:${Number(supplierId)}`;
  return `name:${String(supplierName || 'Unknown').trim().toLowerCase()}`;
};

const materialKeyFor = (rawMaterialId, materialName, unitId, unitName) => {
  const materialKey = rawMaterialId !== null && rawMaterialId !== undefined && rawMaterialId !== ''
    ? `id:${Number(rawMaterialId)}`
    : `name:${String(materialName || 'Unknown').trim().toLowerCase()}`;
  return `${materialKey}::unit:${unitId !== null && unitId !== undefined && unitId !== '' ? Number(unitId) : String(unitName || '').trim().toLowerCase()}`;
};

const aggregateWarehouseGRN = (rows, fromDate, toDate) => {
  const grnIds = new Set();
  const supplierMap = new Map();
  const materialMap = new Map();
  const monthlyMap = new Map();
  let value = 0;

  for (const row of rows) {
    const itemValue = num(row.item_value);
    const month = String(row.month_key || '').slice(0, 7);
    const supplierKey = supplierKeyFor(row.supplier_id, row.supplier_name);
    const materialKey = materialKeyFor(row.raw_material_id, row.material_name, row.unit_id, row.unit_name);
    const materialIdentityKey = row.raw_material_id !== null && row.raw_material_id !== undefined && row.raw_material_id !== ''
      ? `id:${Number(row.raw_material_id)}`
      : `name:${String(row.material_name || 'Unknown').trim().toLowerCase()}`;

    grnIds.add(Number(row.grn_id));
    value += itemValue;

    if (!supplierMap.has(supplierKey)) {
      supplierMap.set(supplierKey, {
        supplier_id: row.supplier_id ?? null,
        supplier_name: row.supplier_name || null,
        grn_ids: new Set(),
        value: 0,
      });
    }
    const supplierEntry = supplierMap.get(supplierKey);
    supplierEntry.grn_ids.add(Number(row.grn_id));
    supplierEntry.value += itemValue;

    if (!materialMap.has(materialKey)) {
      materialMap.set(materialKey, {
        raw_material_id: row.raw_material_id ?? null,
        material_name: row.material_name || 'Unknown material',
        quantity: 0,
        unit: row.unit_name || null,
        value: 0,
      });
    }
    const materialEntry = materialMap.get(materialKey);
    materialEntry.quantity += num(row.accepted_qty);
    materialEntry.value += itemValue;
    if (!materialEntry.unit && row.unit_name) materialEntry.unit = row.unit_name;

    if (!monthlyMap.has(month)) monthlyMap.set(month, 0);
    monthlyMap.set(month, monthlyMap.get(month) + itemValue);

    // Distinct materials are counted by raw material identity, not unit.
    if (!materialEntry.material_identity_key) materialEntry.material_identity_key = materialIdentityKey;
  }

  const months = monthBuckets(fromDate, toDate).map((bucket) => ({
    ...bucket,
    warehouse_grn_value: num(monthlyMap.get(bucket.month)),
  }));

  return {
    summary: {
      value,
      grn_count: grnIds.size,
      supplier_count: supplierMap.size,
      material_count: new Set([...materialMap.values()].map((m) => m.raw_material_id !== null && m.raw_material_id !== undefined ? `id:${m.raw_material_id}` : `name:${String(m.material_name).trim().toLowerCase()}`)).size,
      has_data: grnIds.size > 0,
    },
    suppliers: [...supplierMap.values()]
      .map((r) => ({
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_name,
        grn_count: r.grn_ids.size,
        value: num(r.value),
      }))
      .sort((a, b) => String(a.supplier_name || '').localeCompare(String(b.supplier_name || ''))),
    materials: [...materialMap.values()]
      .map((r) => ({
        raw_material_id: r.raw_material_id,
        material_name: r.material_name,
        quantity: num(r.quantity),
        unit: r.unit,
        value: num(r.value),
      }))
      .sort((a, b) => String(a.material_name || '').localeCompare(String(b.material_name || '')) || String(a.unit || '').localeCompare(String(b.unit || ''))),
    monthly: months,
  };
};

const aggregateOutletPurchases = (rows, fromDate, toDate) => {
  const uploadIds = new Set();
  const supplierMap = new Map();
  const materialMap = new Map();
  const monthlyMap = new Map();
  let value = 0;

  for (const row of rows) {
    const itemValue = num(row.item_value);
    const month = String(row.month_key || '').slice(0, 7);
    const supplierKey = supplierKeyFor(row.supplier_id, row.supplier_name);
    const materialKey = materialKeyFor(row.raw_material_id, row.material_name, row.unit_id, row.unit_name);
    const materialIdentityKey = row.raw_material_id !== null && row.raw_material_id !== undefined && row.raw_material_id !== ''
      ? `id:${Number(row.raw_material_id)}`
      : `name:${String(row.material_name || 'Unknown').trim().toLowerCase()}`;

    uploadIds.add(Number(row.upload_id));
    value += itemValue;

    if (!supplierMap.has(supplierKey)) {
      supplierMap.set(supplierKey, {
        supplier_id: row.supplier_id ?? null,
        supplier_name: row.supplier_name || null,
        item_count: 0,
        value: 0,
      });
    }
    const supplierEntry = supplierMap.get(supplierKey);
    supplierEntry.item_count += 1;
    supplierEntry.value += itemValue;

    if (!materialMap.has(materialKey)) {
      materialMap.set(materialKey, {
        raw_material_id: row.raw_material_id ?? null,
        material_name: row.material_name || 'Unknown material',
        quantity: 0,
        unit: row.unit_name || null,
        value: 0,
      });
    }
    const materialEntry = materialMap.get(materialKey);
    materialEntry.quantity += num(row.qty);
    materialEntry.value += itemValue;
    if (!materialEntry.unit && row.unit_name) materialEntry.unit = row.unit_name;

    if (!monthlyMap.has(month)) monthlyMap.set(month, 0);
    monthlyMap.set(month, monthlyMap.get(month) + itemValue);

    if (!materialEntry.material_identity_key) materialEntry.material_identity_key = materialIdentityKey;
  }

  const months = monthBuckets(fromDate, toDate).map((bucket) => ({
    ...bucket,
    outlet_direct_purchase_value: num(monthlyMap.get(bucket.month)),
  }));

  return {
    summary: {
      value,
      upload_count: uploadIds.size,
      item_count: rows.length,
      supplier_count: supplierMap.size,
      material_count: new Set([...materialMap.values()].map((m) => m.raw_material_id !== null && m.raw_material_id !== undefined ? `id:${m.raw_material_id}` : `name:${String(m.material_name).trim().toLowerCase()}`)).size,
      has_data: uploadIds.size > 0,
    },
    suppliers: [...supplierMap.values()]
      .map((r) => ({
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_name,
        item_count: r.item_count,
        value: num(r.value),
      }))
      .sort((a, b) => String(a.supplier_name || '').localeCompare(String(b.supplier_name || ''))),
    materials: [...materialMap.values()]
      .map((r) => ({
        raw_material_id: r.raw_material_id,
        material_name: r.material_name,
        quantity: num(r.quantity),
        unit: r.unit,
        value: num(r.value),
      }))
      .sort((a, b) => String(a.material_name || '').localeCompare(String(b.material_name || '')) || String(a.unit || '').localeCompare(String(b.unit || ''))),
    monthly: months,
  };
};

export const getProcurementSources = async ({
  locationId,
  outletId,
  fromDate,
  toDate,
  locationScope,
  outletScope,
}) => {
  const parsedLocationId = Number(locationId);
  const parsedOutletId = Number(outletId);
  const startDate = assertDate(fromDate, 'from_date');
  const endDate = assertDate(toDate, 'to_date');
  if (!Number.isFinite(parsedLocationId) || parsedLocationId <= 0) throw httpError('location_id is required');
  if (!Number.isFinite(parsedOutletId) || parsedOutletId <= 0) throw httpError('outlet_id is required');
  assertDateRange(startDate, endDate);

  if (!scopeIncludes(locationScope, 'locationIds', parsedLocationId)) {
    throw httpError('You do not have access to the requested location', 403);
  }
  if (!scopeIncludes(outletScope, 'outletIds', parsedOutletId)) {
    throw httpError('You do not have access to the requested outlet', 403);
  }

  const [locationRows, outletRows] = await Promise.all([
    query(
      `SELECT id, location_code, location_name, location_type, is_active, is_inventory_location
       FROM locations
       WHERE id = ? LIMIT 1`,
      [parsedLocationId]
    ),
    query(
      `SELECT id, outlet_code, outlet_name, is_active
       FROM outlets
       WHERE id = ? LIMIT 1`,
      [parsedOutletId]
    ),
  ]);

  const location = locationRows[0] || null;
  if (!location) throw httpError('Warehouse location not found', 404);
  if (location.location_type !== 'Central Warehouse' || Number(location.is_active) !== 1) {
    throw httpError('Selected warehouse location must be an active Central Warehouse', 400);
  }

  const outlet = outletRows[0] || null;
  if (!outlet) throw httpError('Outlet not found', 404);
  if (Number(outlet.is_active) !== 1) {
    throw httpError('Selected outlet must be active', 400);
  }

  const warehouseRows = await query(
    `SELECT g.id AS grn_id, g.grn_date, g.supplier_id, s.supplier_name,
            gi.id AS grn_item_id, gi.raw_material_id, rm.material_name,
            gi.accepted_qty, gi.unit_id, u.unit_name, gi.total_amount AS item_value,
            DATE_FORMAT(g.grn_date, '%Y-%m') AS month_key
     FROM grn g
     INNER JOIN grn_items gi ON gi.grn_id = g.id
     LEFT JOIN suppliers s ON s.id = g.supplier_id
     LEFT JOIN raw_materials rm ON rm.id = gi.raw_material_id
     LEFT JOIN units u ON u.id = gi.unit_id
     WHERE g.status = 'Posted'
       AND g.warehouse_location_id = ?
       AND g.grn_date BETWEEN ? AND ?
     ORDER BY g.grn_date, g.id, gi.id`,
    [parsedLocationId, startDate, endDate]
  );

  const outletRowsData = await query(
    `SELECT mpi.upload_id, mpu.batch_id, mpu.status,
            mpi.id AS item_id, mpi.supplier_id, mpi.supplier_name,
            mpi.raw_material_id, mpi.raw_material_name, mpi.qty,
            mpi.unit_id, u.unit_name, mpi.total_amount AS item_value,
            DATE_FORMAT(mpi.date, '%Y-%m') AS month_key
     FROM material_purchase_items mpi
     INNER JOIN material_purchase_uploads mpu ON mpu.id = mpi.upload_id AND mpu.status = 'Completed' AND mpu.approval_status = 'Verified'
     LEFT JOIN units u ON u.id = mpi.unit_id
     WHERE mpi.outlet_id = ?
       AND mpu.outlet_id = ?
       AND mpi.date BETWEEN ? AND ?
     ORDER BY mpi.date, mpu.id, mpi.id`,
    [parsedOutletId, parsedOutletId, startDate, endDate]
  );

  const warehouse = aggregateWarehouseGRN(warehouseRows, startDate, endDate);
  const outletPurchases = aggregateOutletPurchases(outletRowsData, startDate, endDate);

  return {
    scope: {
      warehouse_location: {
        id: location.id,
        location_code: location.location_code,
        location_name: location.location_name,
        location_type: location.location_type,
      },
      outlet: {
        id: outlet.id,
        outlet_code: outlet.outlet_code,
        outlet_name: outlet.outlet_name,
      },
      from_date: startDate,
      to_date: endDate,
      disclaimer: 'These sources represent different business scopes and are not transaction-matched.',
    },
    warehouse_grn: {
      ...warehouse.summary,
      suppliers: warehouse.suppliers,
      materials: warehouse.materials,
    },
    outlet_direct_purchase: {
      ...outletPurchases.summary,
      suppliers: outletPurchases.suppliers,
      materials: outletPurchases.materials,
    },
    monthly_trend: warehouse.monthly.map((bucket) => {
      const purchaseBucket = outletPurchases.monthly.find((m) => m.month === bucket.month);
      return {
        month: bucket.month,
        warehouse_grn_value: bucket.warehouse_grn_value,
        outlet_direct_purchase_value: purchaseBucket ? purchaseBucket.outlet_direct_purchase_value : 0,
      };
    }),
  };
};

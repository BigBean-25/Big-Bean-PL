import { query } from '../config/database.js';
import { resolveActiveRecipe } from './recipeService.js';
import { findConversionFactor } from '../utils/uomUtils.js';

const num = (value) => (value === null || value === undefined || value === '' ? 0 : Number(value));
const toInt = (value) => Number.parseInt(String(value), 10);

const httpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isValidMonth = (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 12;
const isValidYear = (value) => Number.isInteger(Number(value)) && Number(value) >= 2000 && Number(value) <= 3000;

const buildPeriod = (month, year) => {
  const monthNum = Number(month);
  const yearNum = Number(year);
  const endDay = new Date(yearNum, monthNum, 0).getDate();
  return {
    month: monthNum,
    year: yearNum,
    startDate: `${yearNum}-${String(monthNum).padStart(2, '0')}-01`,
    endDate: `${yearNum}-${String(monthNum).padStart(2, '0')}-${endDay}`,
  };
};

const loadOutlet = async (outletId) => {
  const rows = await query('SELECT id, outlet_code, outlet_name, is_active FROM outlets WHERE id = ? LIMIT 1', [outletId]);
  return rows[0] || null;
};

const loadInventoryLocationCandidates = async (outletId) => query(
  `SELECT id, location_code, location_name
   FROM locations
   WHERE outlet_id = ? AND location_type = 'Outlet' AND is_active = 1 AND is_inventory_location = 1
   ORDER BY id`,
  [outletId]
);

const loadActualUploadCount = async (tableName, outletId, month, year) => {
  const rows = await query(
    `SELECT COUNT(*) AS upload_count
     FROM ${tableName}
     WHERE outlet_id = ? AND month = ? AND year = ? AND status = 'Completed' AND approval_status = 'Verified'`,
    [outletId, month, year]
  );
  return Number(rows[0]?.upload_count || 0);
};

const loadPurchaseCoverage = async ({ outletId, startDate, endDate }) => {
  const rows = await query(
    `SELECT
       COUNT(DISTINCT mpu.id) AS upload_count,
       COUNT(*) AS item_count,
       COUNT(DISTINCT CASE WHEN mpi.raw_material_id IS NOT NULL THEN mpi.raw_material_id END) AS mapped_material_count,
       SUM(CASE WHEN mpi.raw_material_id IS NULL THEN 1 ELSE 0 END) AS unmapped_material_count,
       COUNT(DISTINCT mpi.unit_id) AS unit_count
     FROM material_purchase_items mpi
     INNER JOIN material_purchase_uploads mpu ON mpi.upload_id = mpu.id
     WHERE mpi.outlet_id = ? AND mpi.date >= ? AND mpi.date <= ?
     AND mpu.status = 'Completed' AND mpu.approval_status = 'Verified'`,
    [outletId, startDate, endDate]
  );
  const row = rows[0] || {};
  return {
    upload_count: Number(row.upload_count || 0),
    item_count: Number(row.item_count || 0),
    mapped_material_count: Number(row.mapped_material_count || 0),
    unmapped_material_count: Number(row.unmapped_material_count || 0),
    unit_count: Number(row.unit_count || 0),
  };
};

const loadOpeningRows = async ({ outletId, month, year }) => query(
  `SELECT osi.upload_id, osi.raw_material_id, osi.raw_material_name, osi.qty, osi.unit_id, u.unit_name,
          osi.value, rm.material_code, rm.material_name, rm.unit_id AS base_unit_id, bu.unit_name AS base_unit_name
   FROM opening_stock_uploads osu
   INNER JOIN opening_stock_items osi ON osi.upload_id = osu.id
   LEFT JOIN raw_materials rm ON rm.id = osi.raw_material_id
   LEFT JOIN units u ON u.id = osi.unit_id
   LEFT JOIN units bu ON bu.id = rm.unit_id
   WHERE osu.outlet_id = ? AND osu.month = ? AND osu.year = ? AND osu.status = 'Completed' AND osu.approval_status = 'Verified'
   ORDER BY osi.id`,
  [outletId, month, year]
);

const loadPurchaseRows = async ({ outletId, startDate, endDate }) => query(
  `SELECT mpi.upload_id, mpi.raw_material_id, mpi.raw_material_name, mpi.qty, mpi.unit_id, u.unit_name,
          mpi.total_amount AS value, rm.material_code, rm.material_name, rm.unit_id AS base_unit_id, bu.unit_name AS base_unit_name
   FROM material_purchase_uploads mpu
   INNER JOIN material_purchase_items mpi ON mpi.upload_id = mpu.id
   LEFT JOIN raw_materials rm ON rm.id = mpi.raw_material_id
   LEFT JOIN units u ON u.id = mpi.unit_id
   LEFT JOIN units bu ON bu.id = rm.unit_id
   WHERE mpu.outlet_id = ? AND mpu.status = 'Completed' AND mpu.approval_status = 'Verified'
     AND mpi.date BETWEEN ? AND ?
   ORDER BY mpi.id`,
  [outletId, startDate, endDate]
);

const loadClosingRows = async ({ outletId, month, year }) => query(
  `SELECT csi.upload_id, csi.raw_material_id, csi.raw_material_name, csi.qty, csi.unit_id, u.unit_name,
          csi.value, rm.material_code, rm.material_name, rm.unit_id AS base_unit_id, bu.unit_name AS base_unit_name
   FROM closing_stock_uploads csu
   INNER JOIN closing_stock_items csi ON csi.upload_id = csu.id
   LEFT JOIN raw_materials rm ON rm.id = csi.raw_material_id
   LEFT JOIN units u ON u.id = csi.unit_id
   LEFT JOIN units bu ON bu.id = rm.unit_id
   WHERE csu.outlet_id = ? AND csu.month = ? AND csu.year = ? AND csu.status = 'Completed' AND csu.approval_status = 'Verified'
   ORDER BY csi.id`,
  [outletId, month, year]
);

const loadSalesRows = async ({ outletId, startDate, endDate }) => query(
  `SELECT isi.upload_id, isi.menu_item_id, mi.item_name, mi.item_code, mi.category_id, c.category_name, isi.qty_sold,
          isu.id AS sales_upload_id
   FROM item_sales_uploads isu
   INNER JOIN item_sales_items isi ON isi.upload_id = isu.id
   LEFT JOIN menu_items mi ON mi.id = isi.menu_item_id
   LEFT JOIN categories c ON c.id = mi.category_id
   WHERE isu.outlet_id = ? AND isu.status = 'Completed'
     AND isi.date BETWEEN ? AND ?
     AND isi.menu_item_id IS NOT NULL
   ORDER BY isi.id`,
  [outletId, startDate, endDate]
);

const loadRecipeItems = async (recipeId) => query(
  `SELECT ri.id, ri.raw_material_id, ri.unit_id, ri.qty_per_item, ri.waste_percentage,
          rm.material_code, rm.material_name, rm.unit_id AS base_unit_id, bu.unit_name AS base_unit_name,
          u.unit_name AS recipe_unit_name
   FROM recipe_items ri
   LEFT JOIN raw_materials rm ON rm.id = ri.raw_material_id
   LEFT JOIN units u ON u.id = ri.unit_id
   LEFT JOIN units bu ON bu.id = rm.unit_id
   WHERE ri.recipe_id = ?
   ORDER BY ri.display_order, ri.id`,
  [recipeId]
);

const createActualMaterialEntry = (row) => ({
  raw_material_id: row.raw_material_id,
  material_code: row.material_code || row.raw_material_code || null,
  material_name: row.material_name || row.raw_material_name || 'Unknown material',
  base_unit_id: row.base_unit_id || null,
  base_unit_name: row.base_unit_name || null,
  actual: {
    present: false,
    qty: null,
    unit_id: null,
    unit_name: null,
    qty_base: null,
    opening_present: false,
    purchases_present: false,
    closing_present: false,
    opening_rows: 0,
    purchase_rows: 0,
    closing_rows: 0,
  },
  theoretical: {
    present: false,
    qty: null,
    unit_id: null,
    unit_name: null,
    qty_base: null,
    sales_present: false,
    recipe_present: false,
    recipe_item_count: 0,
    mapped_recipe_ingredient_count: 0,
    unmapped_recipe_ingredient_count: 0,
    recipe_units_present: 0,
    recipe_units_missing: 0,
  },
  comparison: {
    comparable: false,
    actual_qty_base: null,
    theoretical_qty_base: null,
    base_unit_id: row.base_unit_id || null,
    base_unit_name: row.base_unit_name || null,
    normalized_quantity_delta: null,
    non_comparable_reason: null,
  },
  _actual: {
    raw_qty_total: 0,
    base_qty_total: 0,
    unit_ids: new Set(),
    unit_names: new Set(),
    normalization_ok: true,
    normalization_reason: null,
  },
  _theoretical: {
    raw_qty_total: 0,
    base_qty_total: 0,
    unit_ids: new Set(),
    unit_names: new Set(),
    normalization_ok: true,
    normalization_reason: null,
  },
});

const finalizeSide = (side, internal) => {
  const unitIds = [...internal.unit_ids].filter((id) => id !== null && id !== undefined);
  const unitNames = [...internal.unit_names].filter(Boolean);
  const hasSingleUnit = unitIds.length === 1 && unitNames.length === 1;
  return {
    present: side.present,
    qty: hasSingleUnit ? num(internal.raw_qty_total.toFixed(4)) : null,
    unit_id: hasSingleUnit ? unitIds[0] : null,
    unit_name: hasSingleUnit ? unitNames[0] : null,
    qty_base: internal.normalization_ok ? num(internal.base_qty_total.toFixed(4)) : null,
  };
};

const coverageReason = (coverage) => {
  if (!coverage.actualSourceComplete) {
    if (!coverage.openingPresent) return 'missing_opening_stock';
    if (!coverage.purchasesPresent) return 'missing_purchase_data';
    if (!coverage.closingPresent) return 'missing_closing_stock';
  }
  if (!coverage.theoreticalSalesPresent) return 'missing_sales';
  return null;
};

const applyActualRow = async (entry, row, sourceKey, sign) => {
  entry.actual.present = true;
  entry.actual[`${sourceKey}_present`] = true;
  entry.actual[`${sourceKey}_rows`] += 1;
  entry._actual.raw_qty_total += sign * num(row.qty);
  if (row.unit_id) {
    entry._actual.unit_ids.add(Number(row.unit_id));
  } else {
    entry._actual.normalization_ok = false;
    if (!entry._actual.normalization_reason) entry._actual.normalization_reason = 'actual_unit_missing';
  }
  if (row.unit_name) entry._actual.unit_names.add(row.unit_name);
  if (!row.base_unit_id) {
    entry._actual.normalization_ok = false;
    if (!entry._actual.normalization_reason) entry._actual.normalization_reason = 'mapping_missing';
    return;
  }
  try {
    const factor = await findConversionFactor(row.unit_id, row.base_unit_id);
    entry._actual.base_qty_total += sign * num(row.qty) * factor;
  } catch (error) {
    entry._actual.normalization_ok = false;
    if (!entry._actual.normalization_reason) {
      entry._actual.normalization_reason = /different dimensions/i.test(String(error.message || ''))
        ? 'dimension_mismatch'
        : 'conversion_missing';
    }
  }
};

const applyTheoreticalContribution = async (entry, row, qty, recipeUnitId, recipeUnitName, wasteMultiplier) => {
  entry.theoretical.present = true;
  entry.theoretical.recipe_present = true;
  entry.theoretical.recipe_item_count += 1;
  if (row.raw_material_id === null || row.raw_material_id === undefined) {
    entry.theoretical.unmapped_recipe_ingredient_count += 1;
    return null;
  }
  entry.theoretical.mapped_recipe_ingredient_count += 1;
  entry._theoretical.raw_qty_total += num(qty) * wasteMultiplier;
  if (recipeUnitId) {
    entry._theoretical.unit_ids.add(Number(recipeUnitId));
  } else {
    entry._theoretical.normalization_ok = false;
    if (!entry._theoretical.normalization_reason) entry._theoretical.normalization_reason = 'theoretical_unit_missing';
  }
  if (recipeUnitName) entry._theoretical.unit_names.add(recipeUnitName);
  if (!row.base_unit_id) {
    entry._theoretical.normalization_ok = false;
    if (!entry._theoretical.normalization_reason) entry._theoretical.normalization_reason = 'mapping_missing';
    return row.raw_material_id;
  }
  try {
    const factor = await findConversionFactor(recipeUnitId, row.base_unit_id);
    entry._theoretical.base_qty_total += num(qty) * wasteMultiplier * factor;
  } catch (error) {
    entry._theoretical.normalization_ok = false;
    if (!entry._theoretical.normalization_reason) {
      entry._theoretical.normalization_reason = /different dimensions/i.test(String(error.message || ''))
        ? 'dimension_mismatch'
        : 'conversion_missing';
    }
  }
  return row.raw_material_id;
};

const finalizeMaterialRows = (entries, coverage = {}) => {
  const rows = [];
  const coverageMissingReason = coverageReason(coverage);
  for (const entry of entries.values()) {
    const actual = finalizeSide(entry.actual, entry._actual);
    const theoretical = finalizeSide(entry.theoretical, entry._theoretical);
    const hasActual = entry.actual.present;
    const hasTheoretical = entry.theoretical.present;

    let reason = null;
    if (hasActual && !hasTheoretical) {
      reason = 'actual_only';
    } else if (!hasActual && hasTheoretical) {
      reason = 'theoretical_only';
    } else if (hasActual && hasTheoretical) {
      reason = coverageMissingReason || (!entry._actual.normalization_ok ? entry._actual.normalization_reason : null) || (!entry._theoretical.normalization_ok ? entry._theoretical.normalization_reason : null);
      if (!reason && (!entry.base_unit_id || actual.qty_base === null || theoretical.qty_base === null)) {
        reason = 'conversion_missing';
      }
    }

    const comparable = Boolean(
      hasActual
      && hasTheoretical
      && !reason
      && actual.qty_base !== null
      && theoretical.qty_base !== null
      && entry.base_unit_id
    );

    rows.push({
      raw_material_id: entry.raw_material_id,
      material_code: entry.material_code,
      material_name: entry.material_name,
      actual: {
        present: hasActual,
        qty: actual.qty,
        unit_id: actual.unit_id,
        unit_name: actual.unit_name,
      },
      theoretical: {
        present: hasTheoretical,
        qty: theoretical.qty,
        unit_id: theoretical.unit_id,
        unit_name: theoretical.unit_name,
      },
      comparison: {
        comparable,
        actual_qty_base: comparable ? num(actual.qty_base) : null,
        theoretical_qty_base: comparable ? num(theoretical.qty_base) : null,
        base_unit_id: entry.base_unit_id,
        base_unit_name: entry.base_unit_name,
        normalized_quantity_delta: comparable ? num((num(actual.qty_base) - num(theoretical.qty_base)).toFixed(4)) : null,
        non_comparable_reason: comparable ? null : reason || 'conversion_missing',
      },
      _reason: reason || null,
    });
  }

  rows.sort((a, b) => String(a.material_name || '').localeCompare(String(b.material_name || '')) || String(a.material_code || '').localeCompare(String(b.material_code || '')));
  return rows;
};

const loadPhysicalContext = async ({ outletId, startDate, endDate }) => {
  const candidates = await loadInventoryLocationCandidates(outletId);
  const context = {
    location_state: 'NONE',
    location_count: candidates.length,
    location: null,
    candidates: [],
    movement_totals: null,
  };

  if (candidates.length === 0) {
    return context;
  }

  if (candidates.length > 1) {
    context.location_state = 'AMBIGUOUS';
    context.candidates = candidates.map((candidate) => ({
      id: candidate.id,
      location_code: candidate.location_code,
      location_name: candidate.location_name,
    }));
    return context;
  }

  const location = candidates[0];
  context.location_state = 'UNIQUE';
  context.location = {
    id: location.id,
    location_code: location.location_code,
    location_name: location.location_name,
  };

  const rows = await query(
    `SELECT
       CASE
         WHEN transaction_type IN ('GRN', 'PURCHASE_GRN') THEN 'GRN'
         WHEN transaction_type = 'TRANSFER_IN' THEN 'TRANSFER_IN'
         WHEN transaction_type = 'TRANSFER_OUT' THEN 'TRANSFER_OUT'
         WHEN transaction_type = 'WASTAGE' THEN 'WASTAGE'
         WHEN transaction_type = 'PRODUCTION_ISSUE' THEN 'PRODUCTION_ISSUE'
         WHEN transaction_type = 'PRODUCTION_RECEIPT' THEN 'PRODUCTION_RECEIPT'
         WHEN transaction_type = 'PHYSICAL_ADJUSTMENT' THEN 'PHYSICAL_ADJUSTMENT'
         WHEN transaction_type = 'PURCHASE_RETURN' THEN 'PURCHASE_RETURN'
       END AS movement_type,
       COALESCE(SUM(qty_in), 0) AS qty_in,
       COALESCE(SUM(qty_out), 0) AS qty_out
     FROM stock_ledger
     WHERE location_id = ?
       AND transaction_date BETWEEN ? AND ?
       AND transaction_type IN ('GRN', 'PURCHASE_GRN', 'TRANSFER_IN', 'TRANSFER_OUT', 'WASTAGE', 'PRODUCTION_ISSUE', 'PRODUCTION_RECEIPT', 'PHYSICAL_ADJUSTMENT', 'PURCHASE_RETURN')
     GROUP BY movement_type`,
    [location.id, startDate, endDate]
  );

  const totals = {
    grn: { qty_in: 0, qty_out: 0 },
    transfer_in: { qty_in: 0, qty_out: 0 },
    transfer_out: { qty_in: 0, qty_out: 0 },
    wastage: { qty_in: 0, qty_out: 0 },
    production_issue: { qty_in: 0, qty_out: 0 },
    production_receipt: { qty_in: 0, qty_out: 0 },
    physical_adjustment: { qty_in: 0, qty_out: 0 },
    purchase_return: { qty_in: 0, qty_out: 0 },
  };

  for (const row of rows) {
    if (row.movement_type && totals[row.movement_type]) {
      totals[row.movement_type].qty_in = num(row.qty_in);
      totals[row.movement_type].qty_out = num(row.qty_out);
    }
  }

  context.movement_totals = totals;
  return context;
};

export const getConsumptionVarianceDiagnostics = async ({ outletId, month, year, outletScope }) => {
  if (!outletId || !month || !year) {
    throw httpError('Outlet, month, and year are required', 400);
  }

  if (!isValidMonth(month) || !isValidYear(year)) {
    throw httpError('Month and year are invalid', 400);
  }

  const outlet = await loadOutlet(outletId);
  if (!outlet) {
    throw httpError('Outlet not found', 404);
  }

  if (outletScope && !outletScope.all) {
    const allowedOutlets = (outletScope.outletIds || []).map(Number);
    if (!allowedOutlets.includes(Number(outletId))) {
      throw httpError('You do not have access to the requested outlet', 403);
    }
  }

  const period = buildPeriod(month, year);
  const [openingUploadCount, closingUploadCount, purchaseCoverage] = await Promise.all([
    loadActualUploadCount('opening_stock_uploads', outletId, period.month, period.year),
    loadActualUploadCount('closing_stock_uploads', outletId, period.month, period.year),
    loadPurchaseCoverage({ outletId, startDate: period.startDate, endDate: period.endDate }),
  ]);

  const [openingRows, purchaseRows, closingRows, salesRows] = await Promise.all([
    loadOpeningRows({ outletId, month: period.month, year: period.year }),
    loadPurchaseRows({ outletId, startDate: period.startDate, endDate: period.endDate }),
    loadClosingRows({ outletId, month: period.month, year: period.year }),
    loadSalesRows({ outletId, startDate: period.startDate, endDate: period.endDate }),
  ]);

  const actualCoverage = {
    opening_stock: {
      allowed: true,
      completed_upload_present: openingUploadCount > 0,
      upload_count: openingUploadCount,
      item_count: openingRows.length,
      mapped_material_count: new Set(openingRows.filter((row) => row.raw_material_id !== null && row.raw_material_id !== undefined).map((row) => Number(row.raw_material_id))).size,
      unmapped_material_count: openingRows.filter((row) => row.raw_material_id === null || row.raw_material_id === undefined).length,
      unit_count: new Set(openingRows.filter((row) => row.unit_id !== null && row.unit_id !== undefined).map((row) => Number(row.unit_id))).size,
    },
    material_purchase: {
      allowed: true,
      completed_upload_present: purchaseCoverage.upload_count > 0,
      upload_count: purchaseCoverage.upload_count,
      item_count: purchaseCoverage.item_count,
      mapped_material_count: purchaseCoverage.mapped_material_count,
      unmapped_material_count: purchaseCoverage.unmapped_material_count,
      unit_count: purchaseCoverage.unit_count,
    },
    closing_stock: {
      allowed: true,
      completed_upload_present: closingUploadCount > 0,
      upload_count: closingUploadCount,
      item_count: closingRows.length,
      mapped_material_count: new Set(closingRows.filter((row) => row.raw_material_id !== null && row.raw_material_id !== undefined).map((row) => Number(row.raw_material_id))).size,
      unmapped_material_count: closingRows.filter((row) => row.raw_material_id === null || row.raw_material_id === undefined).length,
      unit_count: new Set(closingRows.filter((row) => row.unit_id !== null && row.unit_id !== undefined).map((row) => Number(row.unit_id))).size,
    },
  };

  const theoreticalCoverage = {
    item_sales: {
      allowed: true,
      completed_item_sales_present: false,
      upload_count: 0,
      item_count: 0,
      sales_menu_item_count: 0,
      sales_qty_total: null,
    },
    recipes: {
      allowed: true,
      menu_items_with_recipe: 0,
      menu_items_without_recipe: 0,
      recipe_ingredient_count: 0,
      mapped_recipe_ingredient_count: 0,
      unmapped_recipe_ingredient_count: 0,
      recipe_units_present: 0,
      recipe_units_missing: 0,
    },
  };

  const salesCoverageRows = await query(
    `SELECT
       COUNT(DISTINCT isu.id) AS upload_count,
       COUNT(*) AS item_count,
       COUNT(DISTINCT isi.menu_item_id) AS menu_item_count,
       COALESCE(SUM(isi.qty_sold), 0) AS qty_total
     FROM item_sales_uploads isu
     INNER JOIN item_sales_items isi ON isi.upload_id = isu.id
     WHERE isu.outlet_id = ? AND isu.status = 'Completed'
       AND isi.date BETWEEN ? AND ?
       AND isi.menu_item_id IS NOT NULL`,
    [outletId, period.startDate, period.endDate]
  );
  const salesCoverageRow = salesCoverageRows[0] || {};
  theoreticalCoverage.item_sales.upload_count = Number(salesCoverageRow.upload_count || 0);
  theoreticalCoverage.item_sales.item_count = Number(salesCoverageRow.item_count || 0);
  theoreticalCoverage.item_sales.completed_item_sales_present = theoreticalCoverage.item_sales.upload_count > 0;
  theoreticalCoverage.item_sales.sales_menu_item_count = Number(salesCoverageRow.menu_item_count || 0);
  theoreticalCoverage.item_sales.sales_qty_total = Number(salesCoverageRow.qty_total || 0);

  const materialEntries = new Map();
  const actualMaterialIds = new Set();
  const theoreticalMaterialIds = new Set();
  let menuItemsWithRecipe = 0;
  let menuItemsWithoutRecipe = 0;
  let recipeIngredientCount = 0;
  let mappedRecipeIngredientCount = 0;
  let unmappedRecipeIngredientCount = 0;
  let recipeUnitsPresent = 0;
  let recipeUnitsMissing = 0;

  for (const sale of salesRows) {
    const recipe = await resolveActiveRecipe({ menu_item_id: sale.menu_item_id, outlet_id: outletId, as_of_date: period.endDate });
    if (!recipe) {
      menuItemsWithoutRecipe += 1;
      continue;
    }

    menuItemsWithRecipe += 1;
    const recipeItems = await loadRecipeItems(recipe.id);
    const wasteMultiplierBase = 1 + (Number(recipe.waste_percentage) || 0) / 100;

    for (const recipeItem of recipeItems) {
      recipeIngredientCount += 1;
      if (recipeItem.raw_material_id === null || recipeItem.raw_material_id === undefined) {
        unmappedRecipeIngredientCount += 1;
      } else {
        mappedRecipeIngredientCount += 1;
        theoreticalMaterialIds.add(Number(recipeItem.raw_material_id));
        if (!materialEntries.has(Number(recipeItem.raw_material_id))) {
          materialEntries.set(Number(recipeItem.raw_material_id), createActualMaterialEntry(recipeItem));
        }
      }

      if (recipeItem.unit_id && recipeItem.recipe_unit_name) recipeUnitsPresent += 1;
      else recipeUnitsMissing += 1;

      if (recipeItem.raw_material_id === null || recipeItem.raw_material_id === undefined) {
        continue;
      }

      const entry = materialEntries.get(Number(recipeItem.raw_material_id));
      entry.theoretical.present = true;
      entry.theoretical.recipe_present = true;
      entry.theoretical.sales_present = true;
      entry.theoretical.recipe_item_count += 1;
      entry.theoretical.mapped_recipe_ingredient_count += 1;
      entry._theoretical.raw_qty_total += num(sale.qty_sold) * num(recipeItem.qty_per_item) * wasteMultiplierBase;

      if (recipeItem.unit_id) {
        entry._theoretical.unit_ids.add(Number(recipeItem.unit_id));
      } else {
        entry._theoretical.normalization_ok = false;
        if (!entry._theoretical.normalization_reason) entry._theoretical.normalization_reason = 'theoretical_unit_missing';
      }
      if (recipeItem.recipe_unit_name) entry._theoretical.unit_names.add(recipeItem.recipe_unit_name);

      if (!recipeItem.base_unit_id) {
        entry._theoretical.normalization_ok = false;
        if (!entry._theoretical.normalization_reason) entry._theoretical.normalization_reason = 'mapping_missing';
        continue;
      }

      try {
        const factor = await findConversionFactor(recipeItem.unit_id, recipeItem.base_unit_id);
        entry._theoretical.base_qty_total += num(sale.qty_sold) * num(recipeItem.qty_per_item) * wasteMultiplierBase * factor;
      } catch (error) {
        entry._theoretical.normalization_ok = false;
        if (!entry._theoretical.normalization_reason) {
          entry._theoretical.normalization_reason = /different dimensions/i.test(String(error.message || ''))
            ? 'dimension_mismatch'
            : 'conversion_missing';
        }
      }
    }
  }

  theoreticalCoverage.recipes.menu_items_with_recipe = menuItemsWithRecipe;
  theoreticalCoverage.recipes.menu_items_without_recipe = menuItemsWithoutRecipe;
  theoreticalCoverage.recipes.recipe_ingredient_count = recipeIngredientCount;
  theoreticalCoverage.recipes.mapped_recipe_ingredient_count = mappedRecipeIngredientCount;
  theoreticalCoverage.recipes.unmapped_recipe_ingredient_count = unmappedRecipeIngredientCount;
  theoreticalCoverage.recipes.recipe_units_present = recipeUnitsPresent;
  theoreticalCoverage.recipes.recipe_units_missing = recipeUnitsMissing;

  for (const row of openingRows) {
    if (row.raw_material_id === null || row.raw_material_id === undefined) continue;
    const key = Number(row.raw_material_id);
    if (!materialEntries.has(key)) materialEntries.set(key, createActualMaterialEntry(row));
    actualMaterialIds.add(key);
    await applyActualRow(materialEntries.get(key), row, 'opening', 1);
  }

  for (const row of purchaseRows) {
    if (row.raw_material_id === null || row.raw_material_id === undefined) continue;
    const key = Number(row.raw_material_id);
    if (!materialEntries.has(key)) materialEntries.set(key, createActualMaterialEntry(row));
    actualMaterialIds.add(key);
    await applyActualRow(materialEntries.get(key), row, 'purchases', 1);
  }

  for (const row of closingRows) {
    if (row.raw_material_id === null || row.raw_material_id === undefined) continue;
    const key = Number(row.raw_material_id);
    if (!materialEntries.has(key)) materialEntries.set(key, createActualMaterialEntry(row));
    actualMaterialIds.add(key);
    await applyActualRow(materialEntries.get(key), row, 'closing', -1);
  }

  for (const [rawMaterialId, entry] of materialEntries.entries()) {
    if (!entry.theoretical.present) {
      entry.theoretical.sales_present = theoreticalCoverage.item_sales.completed_item_sales_present;
    }
    if (!entry.actual.present) {
      entry.actual.opening_present = openingRows.some((row) => Number(row.raw_material_id) === Number(rawMaterialId));
      entry.actual.purchases_present = purchaseRows.some((row) => Number(row.raw_material_id) === Number(rawMaterialId));
      entry.actual.closing_present = closingRows.some((row) => Number(row.raw_material_id) === Number(rawMaterialId));
    }
  }

  const materialRows = finalizeMaterialRows(materialEntries, {
    actualSourceComplete: actualCoverage.opening_stock.completed_upload_present
      && actualCoverage.material_purchase.completed_upload_present
      && actualCoverage.closing_stock.completed_upload_present,
    openingPresent: actualCoverage.opening_stock.completed_upload_present,
    purchasesPresent: actualCoverage.material_purchase.completed_upload_present,
    closingPresent: actualCoverage.closing_stock.completed_upload_present,
    theoreticalSalesPresent: theoreticalCoverage.item_sales.completed_item_sales_present,
  });

  const physical = await loadPhysicalContext({ outletId, startDate: period.startDate, endDate: period.endDate });

  const summary = {
    actual_source_complete: actualCoverage.opening_stock.completed_upload_present
      && actualCoverage.material_purchase.completed_upload_present
      && actualCoverage.closing_stock.completed_upload_present,
    theoretical_sales_present: theoreticalCoverage.item_sales.completed_item_sales_present,
    materials_total: materialRows.length,
    comparable_material_count: materialRows.filter((row) => row.comparison.comparable).length,
    non_comparable_material_count: materialRows.filter((row) => !row.comparison.comparable).length,
    actual_only_count: materialRows.filter((row) => row.comparison.non_comparable_reason === 'actual_only').length,
    theoretical_only_count: materialRows.filter((row) => row.comparison.non_comparable_reason === 'theoretical_only').length,
    mapping_missing_count: materialRows.filter((row) => row.comparison.non_comparable_reason === 'mapping_missing').length,
    conversion_missing_count: materialRows.filter((row) => ['actual_unit_missing', 'theoretical_unit_missing', 'conversion_missing', 'dimension_mismatch'].includes(row.comparison.non_comparable_reason)).length,
  };

  return {
    outlet: {
      id: outlet.id,
      outlet_code: outlet.outlet_code,
      outlet_name: outlet.outlet_name,
      is_active: Boolean(Number(outlet.is_active)),
    },
    period,
    source_coverage: {
      actual: actualCoverage,
      theoretical: theoreticalCoverage,
    },
    materials: materialRows.map((row) => ({
      raw_material_id: row.raw_material_id,
      material_code: row.material_code,
      material_name: row.material_name,
      actual: row.actual,
      theoretical: row.theoretical,
      comparison: row.comparison,
    })),
    physical_movement_context: {
      location_state: physical.location_state,
      location_count: physical.location_count,
      location: physical.location,
      candidates: physical.candidates,
      movement_totals: physical.movement_totals,
      disclaimer: 'Physical ledger movements are operational context only. Internal transfers, production movements, wastage and supplier returns are not equivalent to normal material consumption.',
    },
    summary,
    disclaimers: [
      'Existing Consumption Variance remains accounting-vs-theoretical. Diagnostic normalization shown here does not modify the report calculation.',
      'Physical ledger movements are shown as operational context only and are not treated as material consumption.',
    ],
  };
};

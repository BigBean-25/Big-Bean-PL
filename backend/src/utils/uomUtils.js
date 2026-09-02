import { query } from '../config/database.js';

export const getUnit = async (unitId) => {
  const rows = await query('SELECT id, unit_name, unit_symbol, unit_type FROM units WHERE id = ? LIMIT 1', [unitId]);
  return rows[0] || null;
};

export const getMaterialBaseUnit = async (rawMaterialId) => {
  const rows = await query('SELECT unit_id FROM raw_materials WHERE id = ? LIMIT 1', [rawMaterialId]);
  if (!rows.length) throw new Error('Raw material not found');
  const unit = await getUnit(rows[0].unit_id);
  if (!unit) throw new Error('Raw material base unit not found');
  return unit;
};

export const findConversionFactor = async (fromUnitId, toUnitId) => {
  if (Number(fromUnitId) === Number(toUnitId)) return 1;
  const [fromUnit, toUnit] = await Promise.all([getUnit(fromUnitId), getUnit(toUnitId)]);
  if (!fromUnit || !toUnit) throw new Error('Invalid unit');
  if (fromUnit.unit_type !== toUnit.unit_type) throw new Error(`Cannot convert ${fromUnit.unit_name} to ${toUnit.unit_name}: different dimensions`);
  const rows = await query(
    'SELECT from_unit_id, to_unit_id, conversion_factor FROM uom_conversions WHERE (from_unit_id = ? AND to_unit_id = ?) OR (from_unit_id = ? AND to_unit_id = ?)',
    [fromUnitId, toUnitId, toUnitId, fromUnitId]
  );
  if (!rows.length) throw new Error(`No conversion defined from ${fromUnit.unit_name} to ${toUnit.unit_name}`);
  const row = rows[0];
  if (Number(row.from_unit_id) === Number(fromUnitId) && Number(row.to_unit_id) === Number(toUnitId)) return Number(row.conversion_factor);
  return 1 / Number(row.conversion_factor);
};

export const convertToBase = async (qty, fromUnitId, baseUnitId) => {
  const factor = await findConversionFactor(fromUnitId, baseUnitId);
  return Number(qty) * factor;
};

export const normalizeRateToBase = async (rate, fromUnitId, baseUnitId) => {
  const factor = await findConversionFactor(fromUnitId, baseUnitId);
  return Number(rate) / factor;
};

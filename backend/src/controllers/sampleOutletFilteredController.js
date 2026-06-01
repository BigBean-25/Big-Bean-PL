import { query } from '../config/database.js';

const outletFilter = (alias, scope) => {
  if (!scope || scope.all) return { sql: '', params: [] };
  const outletIds = scope.outletIds || [];
  if (outletIds.length === 0) return { sql: ` AND ${alias}.outlet_id IN (NULL)`, params: [] };
  return { sql: ` AND ${alias}.outlet_id IN (${outletIds.map(() => '?').join(',')})`, params: outletIds };
};

export const getOpeningStockUploads = async (req, res) => {
  try {
    const filter = outletFilter('osu', req.outletScope);
    const rows = await query(
      `SELECT osu.*, o.outlet_name, u.full_name uploaded_by_name
       FROM opening_stock_uploads osu
       LEFT JOIN outlets o ON o.id = osu.outlet_id
       LEFT JOIN users u ON u.id = osu.uploaded_by
       WHERE 1=1${filter.sql}
       ORDER BY osu.created_at DESC`,
      filter.params
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching opening stock uploads', error: error.message });
  }
};

export const getMaterialPurchaseUploads = async (req, res) => {
  try {
    const filter = outletFilter('mpu', req.outletScope);
    const rows = await query(
      `SELECT mpu.*, o.outlet_name, u.full_name uploaded_by_name
       FROM material_purchase_uploads mpu
       LEFT JOIN outlets o ON o.id = mpu.outlet_id
       LEFT JOIN users u ON u.id = mpu.uploaded_by
       WHERE 1=1${filter.sql}
       ORDER BY mpu.created_at DESC`,
      filter.params
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching purchase uploads', error: error.message });
  }
};

export const getPetPoojaItemSales = async (req, res) => {
  try {
    const filter = outletFilter('pis', req.outletScope);
    const rows = await query(
      `SELECT pis.*, o.outlet_name, u.full_name uploaded_by_name
       FROM petpooja_item_sales pis
       LEFT JOIN outlets o ON o.id = pis.outlet_id
       LEFT JOIN users u ON u.id = pis.uploaded_by
       WHERE 1=1${filter.sql}
       ORDER BY pis.sales_date DESC, pis.created_at DESC`,
      filter.params
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching PetPooja item sales', error: error.message });
  }
};

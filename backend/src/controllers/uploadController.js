import xlsx from 'xlsx';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { query, getConnection } from '../config/database.js';
import { generateUploadBatchId, parseExcelDate, sanitizeString, parseNumber } from '../utils/helpers.js';
import { logUploadError } from '../utils/logger.js';
import { notifyAdmins } from '../utils/notificationService.js';

const MAX_UPLOAD_ROWS = 5000;

const parseExcelFile = (filePath, maxRows = MAX_UPLOAD_ROWS) => {
  try {
    const workbook = xlsx.readFile(filePath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
    if (data.length > maxRows) {
      throw new Error(`This file has ${data.length} rows, which exceeds the ${maxRows}-row limit per upload. Please split it into smaller files.`);
    }
    return data;
  } catch (error) {
    throw new Error(error.message.startsWith('This file has') ? error.message : `Failed to parse Excel file: ${error.message}`);
  }
};

const toMySQLDate = (year, month, day) => {
  const date = new Date(year, month - 1, day);
  if (
    isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Normalizes an Opening Stock 'Date' cell (Excel Date object, Excel serial
// number, or DD-MM-YYYY / DD/MM/YYYY / YYYY-MM-DD strings) to MySQL 'YYYY-MM-DD'.
// Returns null if the value cannot be parsed as a valid date.
const parseOpeningStockDate = (value) => {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return toMySQLDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return null;
    return toMySQLDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    let match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) {
      const [, y, m, d] = match;
      return toMySQLDate(Number(y), Number(m), Number(d));
    }

    match = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (match) {
      const [, d, m, y] = match;
      return toMySQLDate(Number(y), Number(m), Number(d));
    }

    return null;
  }

  return null;
};

// Normalizes a Closing Stock 'Date' cell (Excel Date object, Excel serial
// number, or DD-MM-YYYY / DD/MM/YYYY / YYYY-MM-DD / YYYY/MM/DD strings) to
// MySQL 'YYYY-MM-DD'. Returns null if the value cannot be parsed as a valid
// date. Scoped ONLY to Closing Stock — does not affect parseOpeningStockDate.
const parseClosingStockDate = (value) => {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return toMySQLDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return null;
    return toMySQLDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    let match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) {
      const [, y, m, d] = match;
      return toMySQLDate(Number(y), Number(m), Number(d));
    }

    match = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (match) {
      const [, d, m, y] = match;
      return toMySQLDate(Number(y), Number(m), Number(d));
    }

    return null;
  }

  return null;
};

// Normalizes a Material Purchase 'Date' cell (Excel Date object, Excel serial
// number, or DD-MM-YYYY / DD/MM/YYYY / YYYY-MM-DD / YYYY/MM/DD strings) to
// MySQL 'YYYY-MM-DD'. Returns null if the value cannot be parsed as a valid
// date. Scoped ONLY to Material Purchase — does not affect
// parseOpeningStockDate or parseClosingStockDate.
const parseMaterialPurchaseDate = (value) => {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return toMySQLDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return null;
    return toMySQLDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    let match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) {
      const [, y, m, d] = match;
      return toMySQLDate(Number(y), Number(m), Number(d));
    }

    match = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (match) {
      const [, d, m, y] = match;
      return toMySQLDate(Number(y), Number(m), Number(d));
    }

    return null;
  }

  return null;
};

// Each finder prefers an exact (case-insensitive) match over the fuzzy LIKE
// fallback, so e.g. an exact material named "Milk" is never shadowed by a
// nondeterministic LIKE '%Milk%' hit on "Butter Milk" (LIKE has no ORDER BY,
// so which row wins is whatever the storage engine happens to return first).
const findMaterialByName = async (materialName) => {
  const exact = await query(
    'SELECT * FROM raw_materials WHERE LOWER(material_name) = LOWER(?) LIMIT 1',
    [materialName]
  );
  if (exact.length > 0) return exact[0];
  const materials = await query(
    'SELECT * FROM raw_materials WHERE material_name LIKE ? LIMIT 1',
    [`%${materialName}%`]
  );
  return materials.length > 0 ? materials[0] : null;
};

const findSupplierByName = async (supplierName) => {
  const exact = await query(
    'SELECT * FROM suppliers WHERE LOWER(supplier_name) = LOWER(?) LIMIT 1',
    [supplierName]
  );
  if (exact.length > 0) return exact[0];
  const suppliers = await query(
    'SELECT * FROM suppliers WHERE supplier_name LIKE ? LIMIT 1',
    [`%${supplierName}%`]
  );
  return suppliers.length > 0 ? suppliers[0] : null;
};

const findMenuItemByName = async (itemName) => {
  const exact = await query(
    'SELECT * FROM menu_items WHERE LOWER(item_name) = LOWER(?) LIMIT 1',
    [itemName]
  );
  if (exact.length > 0) return exact[0];
  const items = await query(
    'SELECT * FROM menu_items WHERE item_name LIKE ? LIMIT 1',
    [`%${itemName}%`]
  );
  return items.length > 0 ? items[0] : null;
};

const findCategoryByName = async (categoryName) => {
  const exact = await query(
    'SELECT * FROM categories WHERE LOWER(category_name) = LOWER(?) LIMIT 1',
    [categoryName]
  );
  if (exact.length > 0) return exact[0];
  const categories = await query(
    'SELECT * FROM categories WHERE category_name LIKE ? LIMIT 1',
    [`%${categoryName}%`]
  );
  return categories.length > 0 ? categories[0] : null;
};

const findUnitByName = async (unitName) => {
  const exact = await query(
    'SELECT * FROM units WHERE LOWER(unit_name) = LOWER(?) OR LOWER(unit_symbol) = LOWER(?) LIMIT 1',
    [unitName, unitName]
  );
  if (exact.length > 0) return exact[0];
  const units = await query(
    'SELECT * FROM units WHERE unit_name LIKE ? OR unit_symbol LIKE ? LIMIT 1',
    [`%${unitName}%`, `%${unitName}%`]
  );
  return units.length > 0 ? units[0] : null;
};

export const uploadOpeningStock = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { month, year, outlet_id } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    if (!month || !year || !outlet_id) {
      return res.status(400).json({
        success: false,
        message: 'Month, year, and outlet are required'
      });
    }

    // Unlike item_sales (checked below by date-range overlap), opening stock
    // has no existing-batch check at all - re-uploading for a month that
    // already has a Processing/Completed batch silently adds a second set of
    // opening_stock_items, which plCalculator.js sums unconditionally,
    // doubling that month's opening stock value in the P&L. Mirrors the
    // item_sales overlap check already established in uploadItemSales below.
    const [existingBatch] = await connection.execute(
      `SELECT id, batch_id FROM opening_stock_uploads
       WHERE outlet_id = ? AND month = ? AND year = ? AND status IN ('Processing', 'Completed')
       LIMIT 1`,
      [outlet_id, month, year]
    );
    if (existingBatch.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Opening stock already uploaded for this outlet/month in batch ${existingBatch[0].batch_id}. Delete it first if you need to re-upload.`
      });
    }

    await connection.beginTransaction();

    const batchId = generateUploadBatchId();

    const uploadResult = await connection.execute(
      `INSERT INTO opening_stock_uploads (batch_id, month, year, outlet_id, file_name, file_path, status, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Processing', ?, NOW())`,
      [batchId, month, year, outlet_id, file.originalname, file.path, req.user.id]
    );

    const uploadId = uploadResult[0].insertId;

    const rows = parseExcelFile(file.path);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        const materialName = sanitizeString(row['Material Name'] || row['Item Name'] || row['Raw Material']);
        const qty = parseNumber(row['Qty'] || row['Quantity']);
        const rate = parseNumber(row['Rate'] || row['Price']);
        const unitName = sanitizeString(row['Unit']);
        const remarks = sanitizeString(row['Remarks']) || null;

        const rawDate = row['Date'];
        let dateStr = null;
        if (rawDate !== undefined && rawDate !== null && rawDate !== '') {
          dateStr = parseOpeningStockDate(rawDate);
          if (!dateStr) {
            throw new Error(`Invalid date value: '${rawDate}' for column 'Date'. Expected DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, or a valid Excel date.`);
          }
        }

        if (!materialName || !qty || !rate || !unitName) {
          throw new Error('Missing required fields: Material Name, Qty, Rate, or Unit');
        }

        const material = await findMaterialByName(materialName);
        if (!material) {
          throw new Error(`Raw material not found in master: ${materialName}`);
        }

        const unit = await findUnitByName(unitName);
        if (!unit) {
          throw new Error(`Unit not found in master: ${unitName}`);
        }

        if (!material.category_id) {
          throw new Error(`Category not found in master for raw material: ${materialName}`);
        }

        await connection.execute(
          `INSERT INTO opening_stock_items (upload_id, date, outlet_id, raw_material_id, raw_material_code, raw_material_name, category_id, qty, unit_id, rate, remarks, original_row, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            uploadId,
            dateStr || `${year}-${String(month).padStart(2, '0')}-01`,
            outlet_id,
            material.id,
            material.material_code || null,
            materialName,
            material.category_id,
            qty,
            unit.id,
            rate,
            remarks,
            JSON.stringify(row)
          ]
        );

        successCount++;
      } catch (error) {
        await logUploadError(uploadId, i + 1, error.message, row, 'opening_stock');
        failCount++;
      }
    }

    const finalStatus = successCount === 0 && failCount > 0 ? 'Failed' : 'Completed';

    await connection.execute(
      `UPDATE opening_stock_uploads SET total_rows = ?, success_rows = ?, failed_rows = ?, status = ? WHERE id = ?`,
      [rows.length, successCount, failCount, finalStatus, uploadId]
    );

    await connection.commit();

    await notifyAdmins({
      actorId: req.user.id,
      outletId: outlet_id,
      type: successCount === 0 ? 'danger' : failCount > 0 ? 'warning' : 'success',
      title: failCount > 0 ? 'Opening Stock Upload — Partial' : 'Opening Stock Uploaded',
      message: `Opening stock upload completed: ${successCount} rows processed${failCount > 0 ? `, ${failCount} failed` : ''}.`,
      referenceType: 'opening_stock_upload',
      referenceId: uploadId,
      navPath: '/stock/opening-stock'
    });

    res.status(200).json({
      success: true,
      message: 'Opening stock uploaded successfully',
      data: {
        batchId,
        totalRows: rows.length,
        successRows: successCount,
        failedRows: failCount
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Upload opening stock error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error uploading opening stock'
    });
  } finally {
    connection.release();
  }
};

export const uploadClosingStock = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { month, year, outlet_id } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    if (!month || !year || !outlet_id) {
      return res.status(400).json({
        success: false,
        message: 'Month, year, and outlet are required'
      });
    }

    // Same gap as uploadOpeningStock above - re-uploading for a month that
    // already has a Processing/Completed batch silently doubles that month's
    // closing stock value in plCalculator.js.
    const [existingBatch] = await connection.execute(
      `SELECT id, batch_id FROM closing_stock_uploads
       WHERE outlet_id = ? AND month = ? AND year = ? AND status IN ('Processing', 'Completed')
       LIMIT 1`,
      [outlet_id, month, year]
    );
    if (existingBatch.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Closing stock already uploaded for this outlet/month in batch ${existingBatch[0].batch_id}. Delete it first if you need to re-upload.`
      });
    }

    await connection.beginTransaction();

    const batchId = generateUploadBatchId();

    const uploadResult = await connection.execute(
      `INSERT INTO closing_stock_uploads (batch_id, month, year, outlet_id, file_name, file_path, status, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Processing', ?, NOW())`,
      [batchId, month, year, outlet_id, file.originalname, file.path, req.user.id]
    );

    const uploadId = uploadResult[0].insertId;

    const rows = parseExcelFile(file.path);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        const materialName = sanitizeString(row['Material Name'] || row['Item Name'] || row['Raw Material']);
        const qty = parseNumber(row['Qty'] || row['Quantity']);
        const rate = parseNumber(row['Rate'] || row['Price']);
        const unitName = sanitizeString(row['Unit']);
        const remarks = sanitizeString(row['Remarks']) || null;

        const rawDate = row['Date'];
        let dateStr = null;
        if (rawDate !== undefined && rawDate !== null && rawDate !== '') {
          dateStr = parseClosingStockDate(rawDate);
          if (!dateStr) {
            throw new Error(`Invalid date value: '${rawDate}' for column 'Date'. Expected DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, or a valid Excel date.`);
          }
        }

        if (!materialName || !qty || !rate || !unitName) {
          throw new Error('Missing required fields: Material Name, Qty, Rate, or Unit');
        }

        const material = await findMaterialByName(materialName);
        if (!material) {
          throw new Error(`Raw material not found in master: ${materialName}`);
        }

        const unit = await findUnitByName(unitName);
        if (!unit) {
          throw new Error(`Unit not found in master: ${unitName}`);
        }

        if (!material.category_id) {
          throw new Error(`Category not found in master for raw material: ${materialName}`);
        }

        await connection.execute(
          `INSERT INTO closing_stock_items (upload_id, date, outlet_id, raw_material_id, raw_material_code, raw_material_name, category_id, qty, unit_id, rate, remarks, original_row, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            uploadId,
            dateStr || `${year}-${String(month).padStart(2, '0')}-28`,
            outlet_id,
            material.id,
            material.material_code || null,
            materialName,
            material.category_id,
            qty,
            unit.id,
            rate,
            remarks,
            JSON.stringify(row)
          ]
        );

        successCount++;
      } catch (error) {
        await logUploadError(uploadId, i + 1, error.message, row, 'closing_stock');
        failCount++;
      }
    }

    const finalStatus = successCount === 0 && failCount > 0 ? 'Failed' : 'Completed';

    await connection.execute(
      `UPDATE closing_stock_uploads SET total_rows = ?, success_rows = ?, failed_rows = ?, status = ? WHERE id = ?`,
      [rows.length, successCount, failCount, finalStatus, uploadId]
    );

    await connection.commit();

    await notifyAdmins({
      actorId: req.user.id,
      outletId: outlet_id,
      type: successCount === 0 ? 'danger' : failCount > 0 ? 'warning' : 'success',
      title: failCount > 0 ? 'Closing Stock Upload — Partial' : 'Closing Stock Uploaded',
      message: `Closing stock upload completed: ${successCount} rows processed${failCount > 0 ? `, ${failCount} failed` : ''}.`,
      referenceType: 'closing_stock_upload',
      referenceId: uploadId,
      navPath: '/stock/closing-stock'
    });

    res.status(200).json({
      success: true,
      message: 'Closing stock uploaded successfully',
      data: {
        batchId,
        totalRows: rows.length,
        successRows: successCount,
        failedRows: failCount
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Upload closing stock error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error uploading closing stock'
    });
  } finally {
    connection.release();
  }
};

export const uploadMaterialPurchase = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { outlet_id } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    if (!outlet_id) {
      return res.status(400).json({
        success: false,
        message: 'Outlet is required'
      });
    }

    await connection.beginTransaction();

    const batchId = generateUploadBatchId();

    const uploadResult = await connection.execute(
      `INSERT INTO material_purchase_uploads (batch_id, outlet_id, file_name, file_path, status, uploaded_by, created_at) 
       VALUES (?, ?, ?, ?, 'Processing', ?, NOW())`,
      [batchId, outlet_id, file.originalname, file.path, req.user.id]
    );

    const uploadId = uploadResult[0].insertId;

    const rows = parseExcelFile(file.path);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        const rawDate = row['Date'] || row['Purchase Date'] || row['Bill Date'];
        const supplierName = sanitizeString(row['Supplier'] || row['Vendor'] || row['Party Name']);
        const materialName = sanitizeString(row['Material Name'] || row['Item Name'] || row['Product'] || row['Material']);
        const rawQty = row['Qty'] || row['Quantity'];
        const rawRate = row['Rate'] || row['Price'] || row['Unit Price'];
        const rawAmount = row['Amount'] || row['Total'] || row['Total Amount'];
        const unitName = sanitizeString(row['Unit'] || row['UOM']);
        const invoiceNo = sanitizeString(row['Invoice No'] || row['Bill No']) || null;
        const remarks = sanitizeString(row['Remarks']) || null;
        const paidByRaw = sanitizeString(row['Paid By']).toLowerCase();
        const paidBy = paidByRaw === 'management' || paidByRaw === 'hq' || paidByRaw === 'management/hq' ? 'Management' : 'Outlet';
        const paymentMode = sanitizeString(row['Payment Mode']) || null;

        // 1. Date normalization (mandatory — material_purchase_items.date is NOT NULL,
        // and this table has no month/year header to fall back on)
        if (rawDate === undefined || rawDate === null || rawDate === '') {
          throw new Error('Missing required field: Date');
        }
        const dateStr = parseMaterialPurchaseDate(rawDate);
        if (!dateStr) {
          throw new Error(`Invalid date value: '${rawDate}' for column 'Date'.`);
        }

        if (!supplierName) {
          throw new Error('Missing required field: Supplier');
        }
        if (!materialName) {
          throw new Error('Missing required field: Material');
        }
        if (!unitName) {
          throw new Error('Missing required field: Unit');
        }

        // 6. Quantity / Rate validation
        const qty = parseNumber(rawQty);
        if (rawQty === undefined || rawQty === null || rawQty === '' || !isFinite(qty) || qty <= 0) {
          throw new Error(`Invalid quantity: ${rawQty}`);
        }
        const rate = parseNumber(rawRate);
        if (rawRate === undefined || rawRate === null || rawRate === '' || !isFinite(rate) || rate < 0) {
          throw new Error(`Invalid rate: ${rawRate}`);
        }

        // 2. Supplier validation — mandatory
        const supplier = await findSupplierByName(supplierName);
        if (!supplier) {
          throw new Error(`Supplier not found in master: ${supplierName}`);
        }

        // 3. Raw Material validation — mandatory
        const material = await findMaterialByName(materialName);
        if (!material) {
          throw new Error(`Raw material not found in master: ${materialName}`);
        }

        // 4. Unit validation — mandatory
        const unit = await findUnitByName(unitName);
        if (!unit) {
          throw new Error(`Unit not found in master: ${unitName}`);
        }

        // 5. Category mapping — from the matched Raw Material master
        if (!material.category_id) {
          throw new Error(`Category not found in master for raw material: ${materialName}`);
        }

        // 7. Amount validation — Qty x Rate is the source of truth.
        // material_purchase_items.total_amount is a normal stored column (NOT
        // a generated column), so it must be computed and inserted explicitly.
        const calculatedAmount = Math.round(qty * rate * 100) / 100;
        if (rawAmount !== undefined && rawAmount !== null && rawAmount !== '') {
          const uploadedAmount = parseNumber(rawAmount);
          if (Math.abs(uploadedAmount - calculatedAmount) > 0.02) {
            throw new Error(`Amount mismatch. Expected ${calculatedAmount.toFixed(2)}, received ${uploadedAmount.toFixed(2)}`);
          }
        }

        await connection.execute(
          `INSERT INTO material_purchase_items (upload_id, date, outlet_id, supplier_id, supplier_name, raw_material_id, raw_material_code, raw_material_name, category_id, qty, unit_id, rate, total_amount, invoice_no, paid_by, payment_mode, remarks, original_row, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            uploadId,
            dateStr,
            outlet_id,
            supplier.id,
            supplier.supplier_name,
            material.id,
            material.material_code || null,
            materialName,
            material.category_id,
            qty,
            unit.id,
            rate,
            calculatedAmount,
            invoiceNo,
            paidBy,
            paymentMode,
            remarks,
            JSON.stringify(row)
          ]
        );

        successCount++;
      } catch (error) {
        await logUploadError(uploadId, i + 1, error.message, row, 'material_purchase');
        failCount++;
      }
    }

    const finalStatus = successCount === 0 && failCount > 0 ? 'Failed' : 'Completed';

    // material_purchase has no month/year header (rows carry their own date,
    // parsed per-row above), so the overlap check has to run after parsing,
    // against the date range of what actually got inserted for this upload -
    // unlike opening/closing stock's simpler month/year check above, or
    // item_sales' pre-parse-then-check ordering. Without this, re-uploading
    // (accidentally or to fix a mistake without deleting the old batch first)
    // silently doubles material purchase cost in plCalculator.js for any
    // overlapping date.
    if (finalStatus === 'Completed' && successCount > 0) {
      const [[dateRange]] = await connection.execute(
        `SELECT MIN(date) as min_date, MAX(date) as max_date FROM material_purchase_items WHERE upload_id = ?`,
        [uploadId]
      );
      if (dateRange && dateRange.min_date) {
        const [overlap] = await connection.execute(
          `SELECT u.id, u.batch_id
           FROM material_purchase_uploads u
           INNER JOIN material_purchase_items i ON i.upload_id = u.id
           WHERE u.outlet_id = ? AND u.status IN ('Processing', 'Completed') AND u.id != ?
             AND i.date BETWEEN ? AND ?
           GROUP BY u.id, u.batch_id
           LIMIT 1`,
          [outlet_id, uploadId, dateRange.min_date, dateRange.max_date]
        );
        if (overlap.length > 0) {
          await connection.rollback();
          return res.status(409).json({
            success: false,
            message: `Material purchase already uploaded for this outlet in batch ${overlap[0].batch_id} covering an overlapping date range. Delete it first if you need to re-upload.`
          });
        }
      }
    }

    await connection.execute(
      `UPDATE material_purchase_uploads SET total_rows = ?, success_rows = ?, failed_rows = ?, status = ? WHERE id = ?`,
      [rows.length, successCount, failCount, finalStatus, uploadId]
    );

    await connection.commit();

    await notifyAdmins({
      actorId: req.user.id,
      outletId: outlet_id,
      type: successCount === 0 ? 'danger' : failCount > 0 ? 'warning' : 'success',
      title: failCount > 0 ? 'Material Purchase Upload — Partial' : 'Material Purchase Uploaded',
      message: `Material purchase upload completed: ${successCount} rows processed${failCount > 0 ? `, ${failCount} failed` : ''}.`,
      referenceType: 'material_purchase_upload',
      referenceId: uploadId,
      navPath: '/purchases/material-purchase'
    });

    res.status(200).json({
      success: true,
      message: 'Material purchase uploaded successfully',
      data: {
        batchId,
        totalRows: rows.length,
        successRows: successCount,
        failedRows: failCount
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Upload material purchase error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error uploading material purchase'
    });
  } finally {
    connection.release();
  }
};

export const uploadItemSales = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { outlet_id } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    if (!outlet_id) {
      return res.status(400).json({
        success: false,
        message: 'Outlet is required'
      });
    }

    const rows = parseExcelFile(file.path);
    const parsedRows = [];
    const parseIssues = [];
    let minDate = null;
    let maxDate = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        const dateStr = parseExcelDate(row['Date'] || row['Sale Date'] || row['Order Date']);
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) {
          throw new Error(`Missing or invalid Date (row ${i + 1})`);
        }

        const categoryName = sanitizeString(row['Category'] || row['Item Category']);
        const itemName = sanitizeString(row['Item Name'] || row['Product'] || row['Item']);
        if (!itemName) throw new Error(`Missing Item Name (row ${i + 1})`);

        const qtyRaw = row['Qty'] || row['Quantity'] || row['Qty Sold'];
        if (qtyRaw === null || qtyRaw === undefined || qtyRaw === '') {
          throw new Error(`Missing Qty (row ${i + 1})`);
        }
        const qtySold = parseNumber(qtyRaw);
        if (Number.isNaN(qtySold) || qtySold <= 0) throw new Error(`Qty must be a positive number (row ${i + 1})`);

        const grossSales = parseNumber(row['Gross Sales'] || row['Gross Amount'] || row['Amount']);
        const discount = parseNumber(row['Discount']);
        const tax = parseNumber(row['Tax'] || row['GST']);
        const netSales = parseNumber(row['Net Sales'] || row['Net Amount']);

        if (Number.isNaN(grossSales) || grossSales < 0) throw new Error(`Gross sales cannot be negative (row ${i + 1})`);
        if (Number.isNaN(discount) || discount < 0) throw new Error(`Discount cannot be negative (row ${i + 1})`);
        if (Number.isNaN(tax) || tax < 0) throw new Error(`Tax cannot be negative (row ${i + 1})`);
        if (Number.isNaN(netSales) || netSales < 0) throw new Error(`Net sales cannot be negative (row ${i + 1})`);

        parsedRows.push({ row, dateStr, itemName, qtySold, grossSales, discount, tax, netSales, categoryName, rowNumber: i + 1 });

        if (!minDate || dateStr < minDate) minDate = dateStr;
        if (!maxDate || dateStr > maxDate) maxDate = dateStr;
      } catch (error) {
        parseIssues.push({ rowNumber: i + 1, message: error.message, row });
      }
    }

    if (minDate && maxDate) {
      const [overlap] = await connection.execute(
        `SELECT u.id, u.batch_id
         FROM item_sales_uploads u
         INNER JOIN item_sales_items i ON i.upload_id = u.id
         WHERE u.outlet_id = ? AND u.status IN ('Processing', 'Completed')
           AND i.date BETWEEN ? AND ?
         GROUP BY u.id, u.batch_id
         LIMIT 1`,
        [outlet_id, minDate, maxDate]
      );
      if (overlap.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Item sales already uploaded for this outlet in batch ${overlap[0].batch_id} covering the selected date range.`
        });
      }
    }

    await connection.beginTransaction();

    const batchId = generateUploadBatchId();

    const uploadResult = await connection.execute(
      `INSERT INTO item_sales_uploads (batch_id, outlet_id, file_name, file_path, status, uploaded_by, created_at) 
       VALUES (?, ?, ?, ?, 'Processing', ?, NOW())`,
      [batchId, outlet_id, file.originalname, file.path, req.user.id]
    );

    const uploadId = uploadResult[0].insertId;

    let successCount = 0;
    let failCount = parseIssues.length;

    for (const p of parsedRows) {
      try {
        const menuItem = await findMenuItemByName(p.itemName);
        if (!menuItem) {
          throw new Error(`Item not found in Menu Items master: "${p.itemName}"`);
        }
        const category = p.categoryName ? await findCategoryByName(p.categoryName) : null;

        await connection.execute(
          `INSERT INTO item_sales_items (upload_id, date, outlet_id, category_id, category_name, menu_item_id, item_name, qty_sold, gross_sales, discount, tax, net_sales, original_row, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            uploadId,
            p.dateStr,
            outlet_id,
            category?.id || null,
            p.categoryName || 'Uncategorized',
            menuItem.id,
            p.itemName,
            p.qtySold,
            p.grossSales || 0,
            p.discount || 0,
            p.tax || 0,
            p.netSales || p.grossSales || 0,
            JSON.stringify(p.row)
          ]
        );

        successCount++;
      } catch (error) {
        await logUploadError(uploadId, p.rowNumber, error.message, p.row, 'item_sales');
        failCount++;
      }
    }

    for (const issue of parseIssues) {
      await logUploadError(uploadId, issue.rowNumber, issue.message, issue.row, 'item_sales');
    }

    const finalStatus = failCount === 0 ? 'Completed' : (successCount === 0 ? 'Failed' : 'Completed');

    await connection.execute(
      `UPDATE item_sales_uploads SET total_rows = ?, success_rows = ?, failed_rows = ?, status = ? WHERE id = ?`,
      [rows.length, successCount, failCount, finalStatus, uploadId]
    );

    await connection.commit();

    await notifyAdmins({
      actorId: req.user.id,
      outletId: outlet_id,
      type: successCount === 0 ? 'danger' : failCount > 0 ? 'warning' : 'success',
      title: failCount > 0 ? 'Item Sales Upload — Partial' : 'Item Sales Uploaded',
      message: `Item sales upload completed: ${successCount} rows processed${failCount > 0 ? `, ${failCount} failed` : ''}.`,
      referenceType: 'item_sales_upload',
      referenceId: uploadId,
      navPath: '/sales/item-sales'
    });

    res.status(200).json({
      success: true,
      message: 'Item sales uploaded successfully',
      data: {
        batchId,
        totalRows: rows.length,
        successRows: successCount,
        failedRows: failCount
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Upload item sales error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error uploading item sales'
    });
  } finally {
    connection.release();
  }
};

const UPLOAD_TYPE_CONFIG = {
  opening_stock: { masterTable: 'opening_stock_uploads', itemsTable: 'opening_stock_items' },
  closing_stock: { masterTable: 'closing_stock_uploads', itemsTable: 'closing_stock_items' },
  material_purchase: { masterTable: 'material_purchase_uploads', itemsTable: 'material_purchase_items' },
  item_sales: { masterTable: 'item_sales_uploads', itemsTable: 'item_sales_items' },
};

export const downloadItemSalesTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const itemSheet = workbook.addWorksheet('Item Sales');

    itemSheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Item Name', key: 'itemName', width: 26 },
      { header: 'Qty', key: 'qty', width: 10 },
      { header: 'Gross Sales', key: 'gross', width: 15 },
      { header: 'Discount', key: 'discount', width: 12 },
      { header: 'Tax', key: 'tax', width: 12 },
      { header: 'Net Sales', key: 'net', width: 15 },
    ];

    itemSheet.getRow(1).font = { bold: true };
    itemSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAE7F9' } };
    itemSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    itemSheet.addRow({
      date: new Date('2026-08-01'),
      category: 'Beverage',
      itemName: 'Cappuccino',
      qty: 2,
      gross: 300,
      discount: 0,
      tax: 0,
      net: 300,
    });

    itemSheet.getColumn(1).numFmt = 'yyyy-mm-dd';
    itemSheet.getColumn(4).numFmt = '0';
    itemSheet.getColumn(5).numFmt = '#,##0.00';
    itemSheet.getColumn(6).numFmt = '#,##0.00';
    itemSheet.getColumn(7).numFmt = '#,##0.00';
    itemSheet.getColumn(8).numFmt = '#,##0.00';

    const instructionSheet = workbook.addWorksheet('Instructions');
    const instructions = [
      '1. Date format must be YYYY-MM-DD',
      '2. One row = one menu item sold for that date',
      '3. Qty must be 0 or greater',
      '4. Negative quantity is not allowed',
      '5. Gross Sales / Discount / Tax / Net Sales must be numeric',
      '6. Outlet is selected in the ERP before upload',
      '7. Do not add Total / Sub Total rows',
      '8. Do not rename required columns',
      '9. Sales dates are read from the Excel file',
      '10. Unknown menu items may upload but cannot map to SOP until mapped in Menu Items',
    ];
    instructions.forEach((text, i) => {
      instructionSheet.getCell(i + 1, 1).value = text;
    });
    instructionSheet.getColumn(1).width = 80;

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Disposition', 'attachment; filename="Item_Sales_Upload_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Item sales template error:', error);
    res.status(500).json({ success: false, message: 'Error generating template' });
  }
};

export const deleteUpload = async (req, res) => {
  const connection = await getConnection();

  try {
    const { type, id } = req.params;
    const config = UPLOAD_TYPE_CONFIG[type];

    if (!config) {
      connection.release();
      return res.status(400).json({ success: false, message: 'Invalid upload type' });
    }

    await connection.beginTransaction();

    const [records] = await connection.execute(
      `SELECT * FROM ${config.masterTable} WHERE id = ?`,
      [id]
    );

    if (records.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Upload record not found' });
    }

    const record = records[0];

    if (req.outletScope && !req.outletScope.all) {
      if (!req.outletScope.outletIds.includes(Number(record.outlet_id))) {
        await connection.rollback();
        connection.release();
        return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
      }
    }

    await connection.execute(
      `DELETE FROM ${config.itemsTable} WHERE upload_id = ?`,
      [id]
    );

    await connection.execute(
      `DELETE FROM upload_error_logs WHERE upload_id = ? AND upload_type = ?`,
      [id, type]
    );

    await connection.execute(
      `DELETE FROM ${config.masterTable} WHERE id = ?`,
      [id]
    );

    await connection.commit();

    const uploadDir = path.resolve(process.env.UPLOAD_PATH || './uploads');
    const filePath = record.file_path ? path.resolve(record.file_path) : null;

    if (filePath && filePath.startsWith(uploadDir + path.sep)) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error('Delete physical file error:', err);
      }
    }

    res.status(200).json({
      success: true,
      message: type === 'opening_stock'
        ? 'Opening stock upload deleted successfully'
        : 'Upload deleted successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Delete upload error:', error);
    res.status(500).json({ success: false, message: 'Error deleting upload' });
  } finally {
    connection.release();
  }
};

export const getUploadHistory = async (req, res) => {
  try {
    const type = req.params.type || req.query.type;
    const { outlet_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const scope = req.outletScope || { all: false, outletIds: [] };

    let tableName = '';
    if (type === 'opening_stock') tableName = 'opening_stock_uploads';
    else if (type === 'closing_stock') tableName = 'closing_stock_uploads';
    else if (type === 'material_purchase') tableName = 'material_purchase_uploads';
    else if (type === 'item_sales') tableName = 'item_sales_uploads';
    else {
      return res.status(400).json({
        success: false,
        message: 'Invalid upload type'
      });
    }

    let whereClause = '1=1';
    const params = [];

    const requestedOutlet = outlet_id ? Number(outlet_id) : null;

    if (!scope.all) {
      const allowed = scope.outletIds || [];
      if (allowed.length === 0) {
        return res.status(403).json({ success: false, message: 'No authorized outlets' });
      }
      if (requestedOutlet) {
        if (!allowed.includes(requestedOutlet)) {
          return res.status(403).json({ success: false, message: 'Requested outlet is outside your scope' });
        }
        whereClause += ' AND u.outlet_id = ?';
        params.push(requestedOutlet);
      } else {
        whereClause += ` AND u.outlet_id IN (${allowed.map(() => '?').join(',')})`;
        params.push(...allowed);
      }
    } else if (requestedOutlet) {
      whereClause += ' AND u.outlet_id = ?';
      params.push(requestedOutlet);
    }

    let extraSelect = '';
    let extraJoin = '';
    if (type === 'item_sales') {
      extraSelect = `,
        agg.date_from,
        agg.date_to,
        agg.total_qty,
        agg.gross_sales_total,
        agg.discount_total,
        agg.tax_total,
        agg.net_sales_total`;
      extraJoin = `
        LEFT JOIN (
          SELECT
            upload_id,
            MIN(date) AS date_from,
            MAX(date) AS date_to,
            COALESCE(SUM(qty_sold), 0) AS total_qty,
            COALESCE(SUM(gross_sales), 0) AS gross_sales_total,
            COALESCE(SUM(discount), 0) AS discount_total,
            COALESCE(SUM(tax), 0) AS tax_total,
            COALESCE(SUM(net_sales), 0) AS net_sales_total
          FROM item_sales_items
          GROUP BY upload_id
        ) agg ON agg.upload_id = u.id`;
    }

    const totalAmountSelect =
      type === 'material_purchase'
        ? `, COALESCE((SELECT SUM(mpi.total_amount) FROM material_purchase_items mpi WHERE mpi.upload_id = u.id), 0) AS total_amount`
        : '';

    const uploads = await query(
      `SELECT u.*, o.id as outlet_id, o.outlet_name${totalAmountSelect}${extraSelect}
       FROM ${tableName} u
       LEFT JOIN outlets o ON u.outlet_id = o.id
       ${extraJoin}
       WHERE ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    res.status(200).json({
      success: true,
      data: uploads
    });
  } catch (error) {
    console.error('Get upload history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching upload history'
    });
  }
};

const resolveUploadOutletId = async (uploadId) => {
  const masterTables = [
    'item_sales_uploads',
    'opening_stock_uploads',
    'closing_stock_uploads',
    'material_purchase_uploads'
  ];
  for (const table of masterTables) {
    const rows = await query(`SELECT outlet_id FROM ${table} WHERE id = ?`, [uploadId]);
    if (rows.length > 0) return rows[0].outlet_id;
  }
  return null;
};

export const getUploadErrors = async (req, res) => {
  try {
    const { upload_id } = req.params;

    const uploadOutletId = await resolveUploadOutletId(upload_id);
    if (uploadOutletId === null) {
      return res.status(404).json({ success: false, message: 'Upload record not found' });
    }

    const scope = req.outletScope || { all: false, outletIds: [] };
    if (!scope.all && !scope.outletIds.includes(Number(uploadOutletId))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    const { upload_type } = req.query;
    let errorQuery = 'SELECT * FROM upload_error_logs WHERE upload_id = ?';
    const errorParams = [upload_id];
    if (upload_type) {
      errorQuery += ' AND upload_type = ?';
      errorParams.push(upload_type);
    }
    errorQuery += ' ORDER BY `row_number`';
    const errors = await query(errorQuery, errorParams);

    res.status(200).json({
      success: true,
      data: errors
    });
  } catch (error) {
    console.error('Get upload errors error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching upload errors'
    });
  }
};

export const getItemSalesUploadById = async (req, res) => {
  try {
    const { id } = req.params;
    const scope = req.outletScope || { all: false, outletIds: [] };

    const uploads = await query(
      `SELECT u.*, o.outlet_name
       FROM item_sales_uploads u
       LEFT JOIN outlets o ON u.outlet_id = o.id
       WHERE u.id = ?`,
      [id]
    );

    if (uploads.length === 0) {
      return res.status(404).json({ success: false, message: 'Upload not found' });
    }

    const upload = uploads[0];
    if (!scope.all && !scope.outletIds.includes(Number(upload.outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    const items = await query(
      `SELECT id, date, category_name, item_name, item_code, qty_sold, gross_sales, discount, tax, net_sales, original_row
       FROM item_sales_items
       WHERE upload_id = ?
       ORDER BY id`,
      [id]
    );

    const summary = await query(
      `SELECT
        MIN(date) AS date_from,
        MAX(date) AS date_to,
        COALESCE(SUM(qty_sold), 0) AS total_qty,
        COALESCE(SUM(gross_sales), 0) AS gross_sales_total,
        COALESCE(SUM(discount), 0) AS discount_total,
        COALESCE(SUM(tax), 0) AS tax_total,
        COALESCE(SUM(net_sales), 0) AS net_sales_total
       FROM item_sales_items
       WHERE upload_id = ?`,
      [id]
    );

    const errors = await query(
      `SELECT COUNT(*) AS error_count FROM upload_error_logs WHERE upload_id = ? AND upload_type = 'item_sales'`,
      [id]
    );

    res.status(200).json({
      success: true,
      data: {
        upload,
        items,
        summary: summary[0],
        error_count: errors[0].error_count
      }
    });
  } catch (error) {
    console.error('Get item sales upload detail error:', error);
    res.status(500).json({ success: false, message: 'Error fetching item sales upload detail' });
  }
};

const getOpeningStockUploadForScope = async (req, id) => {
  const records = await query('SELECT * FROM opening_stock_uploads WHERE id = ?', [id]);
  if (records.length === 0) return { record: null, forbidden: false };

  const record = records[0];

  if (req.outletScope && !req.outletScope.all) {
    if (!req.outletScope.outletIds.includes(Number(record.outlet_id))) {
      return { record, forbidden: true };
    }
  }

  return { record, forbidden: false };
};

export const downloadOpeningStockOriginal = async (req, res) => {
  try {
    const { id } = req.params;

    const { record, forbidden } = await getOpeningStockUploadForScope(req, id);

    if (!record) {
      return res.status(404).json({ success: false, message: 'Upload record not found' });
    }

    if (forbidden) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    if (!record.file_path) {
      return res.status(404).json({ success: false, message: 'Original file is not available for this upload' });
    }

    const uploadDir = path.resolve(process.env.UPLOAD_PATH || './uploads');
    const filePath = path.resolve(record.file_path);

    if (!filePath.startsWith(uploadDir + path.sep) || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Original file is not available for this upload' });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.download(filePath, record.file_name || `opening-stock-${id}.xlsx`);
  } catch (error) {
    console.error('Download opening stock original error:', error);
    res.status(500).json({ success: false, message: 'Error downloading original file' });
  }
};

export const downloadOpeningStockProcessed = async (req, res) => {
  try {
    const { id } = req.params;

    const { record, forbidden } = await getOpeningStockUploadForScope(req, id);

    if (!record) {
      return res.status(404).json({ success: false, message: 'Upload record not found' });
    }

    if (forbidden) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    const rows = await query(
      `SELECT osi.upload_id, osi.date, osi.outlet_id, o.outlet_name,
              osi.raw_material_id, osi.raw_material_code, osi.raw_material_name,
              osi.category_id, c.category_name,
              osi.qty, osi.unit_id, u.unit_name, osi.rate, osi.value, osi.remarks
       FROM opening_stock_items osi
       LEFT JOIN outlets o ON osi.outlet_id = o.id
       LEFT JOIN categories c ON osi.category_id = c.id
       LEFT JOIN units u ON osi.unit_id = u.id
       WHERE osi.upload_id = ?
       ORDER BY osi.id`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No processed rows available for this upload.' });
    }

    const sheetRows = rows.map((row) => ({
      'Upload ID': row.upload_id,
      'Date': row.date,
      'Outlet ID': row.outlet_id,
      'Outlet Name': row.outlet_name || '',
      'Raw Material ID': row.raw_material_id,
      'Raw Material Code': row.raw_material_code || '',
      'Raw Material Name': row.raw_material_name || '',
      'Category ID': row.category_id,
      'Category Name': row.category_name || '',
      'Qty': row.qty,
      'Unit ID': row.unit_id,
      'Unit': row.unit_name || '',
      'Rate': row.rate,
      'Value': row.value,
      'Remarks': row.remarks || '',
    }));

    const worksheet = xlsx.utils.json_to_sheet(sheetRows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Processed Rows');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="opening-stock-processed-${id}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(buffer);
  } catch (error) {
    console.error('Download opening stock processed error:', error);
    res.status(500).json({ success: false, message: 'Error downloading processed rows' });
  }
};

export const downloadOpeningStockErrors = async (req, res) => {
  try {
    const { id } = req.params;

    const { record, forbidden } = await getOpeningStockUploadForScope(req, id);

    if (!record) {
      return res.status(404).json({ success: false, message: 'Upload record not found' });
    }

    if (forbidden) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    const rows = await query(
      `SELECT \`row_number\`, error_message, row_data, created_at
       FROM upload_error_logs
       WHERE upload_id = ? AND upload_type = 'opening_stock'
       ORDER BY \`row_number\``,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No error rows available for this upload.' });
    }

    const sheetRows = rows.map((row) => ({
      'Row Number': row.row_number,
      'Error Message': row.error_message,
      'Row Data': typeof row.row_data === 'string' ? row.row_data : JSON.stringify(row.row_data),
      'Created At': row.created_at,
    }));

    const worksheet = xlsx.utils.json_to_sheet(sheetRows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Error Report');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="opening-stock-errors-${id}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(buffer);
  } catch (error) {
    console.error('Download opening stock errors error:', error);
    res.status(500).json({ success: false, message: 'Error downloading error report' });
  }
};

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

export const downloadOpeningStockTemplate = async (req, res) => {
  try {
    const now = new Date();
    let monthNum = parseInt(req.query.month, 10);
    let yearNum = parseInt(req.query.year, 10);

    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      monthNum = now.getMonth() + 1;
    }
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
      yearNum = now.getFullYear();
    }

    const monthName = MONTH_NAMES[monthNum - 1];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template');

    worksheet.columns = [
      { key: 'date', width: 16 },
      { key: 'material_name', width: 28 },
      { key: 'qty', width: 12 },
      { key: 'unit', width: 14 },
      { key: 'rate', width: 12 },
      { key: 'remarks', width: 24 },
    ];

    // Row 1-2: merged title area
    worksheet.mergeCells('A1:F2');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `BIG BEAN CAFE - OPENING STOCK - ${monthName} ${yearNum}`;
    titleCell.font = { bold: true, size: 18, color: { argb: 'FF000000' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFE699' },
    };
    worksheet.getRow(1).height = 30;
    worksheet.getRow(2).height = 30;
    // Fill the rest of the merged region so the yellow background spans A1:F2
    ['B1', 'C1', 'D1', 'E1', 'F1', 'A2', 'B2', 'C2', 'D2', 'E2', 'F2'].forEach((ref) => {
      worksheet.getCell(ref).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE699' },
      };
    });

    // Row 3: blank spacing row
    worksheet.getRow(3).height = 10;

    // Row 4: column headers
    const headerRow = worksheet.getRow(4);
    headerRow.values = ['Date', 'Material Name', 'Qty', 'Unit', 'Rate', 'Remarks'];
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' },
    };

    // Row 5: example data
    const exampleRow = worksheet.getRow(5);
    exampleRow.values = [new Date(yearNum, monthNum - 1, 1), 'COCOA DUST', 2, 'Dash', 50, 'Opening stock'];
    exampleRow.getCell(1).numFmt = 'dd-mm-yyyy';
    exampleRow.getCell(3).numFmt = '0.000';
    exampleRow.getCell(5).numFmt = '0.00';

    const monthLabel = monthName.charAt(0) + monthName.slice(1).toLowerCase();
    const fileName = `Opening_Stock_Template_${monthLabel}_${yearNum}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Download opening stock template error:', error);
    res.status(500).json({ success: false, message: 'Error generating template' });
  }
};

const getClosingStockUploadForScope = async (req, id) => {
  const records = await query('SELECT * FROM closing_stock_uploads WHERE id = ?', [id]);
  if (records.length === 0) return { record: null, forbidden: false };

  const record = records[0];

  if (req.outletScope && !req.outletScope.all) {
    if (!req.outletScope.outletIds.includes(Number(record.outlet_id))) {
      return { record, forbidden: true };
    }
  }

  return { record, forbidden: false };
};

export const downloadClosingStockOriginal = async (req, res) => {
  try {
    const { id } = req.params;

    const { record, forbidden } = await getClosingStockUploadForScope(req, id);

    if (!record) {
      return res.status(404).json({ success: false, message: 'Upload record not found' });
    }

    if (forbidden) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    if (!record.file_path) {
      return res.status(404).json({ success: false, message: 'Original file is not available for this upload' });
    }

    const uploadDir = path.resolve(process.env.UPLOAD_PATH || './uploads');
    const filePath = path.resolve(record.file_path);

    if (!filePath.startsWith(uploadDir + path.sep) || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Original file is not available for this upload' });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.download(filePath, record.file_name || `closing-stock-${id}.xlsx`);
  } catch (error) {
    console.error('Download closing stock original error:', error);
    res.status(500).json({ success: false, message: 'Error downloading original file' });
  }
};

export const downloadClosingStockProcessed = async (req, res) => {
  try {
    const { id } = req.params;

    const { record, forbidden } = await getClosingStockUploadForScope(req, id);

    if (!record) {
      return res.status(404).json({ success: false, message: 'Upload record not found' });
    }

    if (forbidden) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    const rows = await query(
      `SELECT csi.upload_id, csi.date, csi.outlet_id, o.outlet_name,
              csi.raw_material_id, csi.raw_material_code, csi.raw_material_name,
              csi.category_id, c.category_name,
              csi.qty, csi.unit_id, u.unit_name, csi.rate, csi.value, csi.remarks
       FROM closing_stock_items csi
       LEFT JOIN outlets o ON csi.outlet_id = o.id
       LEFT JOIN categories c ON csi.category_id = c.id
       LEFT JOIN units u ON csi.unit_id = u.id
       WHERE csi.upload_id = ?
       ORDER BY csi.id`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No processed rows available for this upload.' });
    }

    const toExcelDate = (mysqlDate) => {
      if (!mysqlDate) return null;

      let year;
      let month;
      let day;

      if (typeof mysqlDate === 'string') {
        // Expected format: YYYY-MM-DD
        [year, month, day] = mysqlDate.slice(0, 10).split('-').map((v) => parseInt(v, 10));
      } else {
        // mysql2 (without dateStrings) returns a JS Date whose LOCAL Y/M/D
        // match the DB value. Using toISOString() here would convert to UTC
        // and shift the date, so we read local components instead.
        year = mysqlDate.getFullYear();
        month = mysqlDate.getMonth() + 1;
        day = mysqlDate.getDate();
      }

      if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
      }

      // Excel 1900 date system day 0 = 1899-12-30 (UTC); this avoids JS local time shifts
      const epoch = Date.UTC(1899, 11, 30);
      return (Date.UTC(year, month - 1, day) - epoch) / 86400000;
    };

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Processed Rows');

    worksheet.columns = [
      { header: 'Upload ID', key: 'upload_id', width: 12 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Outlet ID', key: 'outlet_id', width: 12 },
      { header: 'Outlet Name', key: 'outlet_name', width: 20 },
      { header: 'Raw Material ID', key: 'raw_material_id', width: 16 },
      { header: 'Raw Material Code', key: 'raw_material_code', width: 18 },
      { header: 'Raw Material Name', key: 'raw_material_name', width: 26 },
      { header: 'Category ID', key: 'category_id', width: 14 },
      { header: 'Category Name', key: 'category_name', width: 20 },
      { header: 'Qty', key: 'qty', width: 12 },
      { header: 'Unit ID', key: 'unit_id', width: 10 },
      { header: 'Unit', key: 'unit_name', width: 14 },
      { header: 'Rate', key: 'rate', width: 12 },
      { header: 'Value', key: 'value', width: 12 },
      { header: 'Remarks', key: 'remarks', width: 24 },
    ];
    worksheet.getRow(1).font = { bold: true };

    rows.forEach((row) => {
      worksheet.addRow({
        upload_id: row.upload_id,
        date: toExcelDate(row.date),
        outlet_id: row.outlet_id,
        outlet_name: row.outlet_name || '',
        raw_material_id: row.raw_material_id,
        raw_material_code: row.raw_material_code || '',
        raw_material_name: row.raw_material_name || '',
        category_id: row.category_id,
        category_name: row.category_name || '',
        qty: row.qty,
        unit_id: row.unit_id,
        unit_name: row.unit_name || '',
        rate: row.rate,
        value: row.value,
        remarks: row.remarks || '',
      });
    });

    worksheet.getColumn('date').numFmt = 'dd-mm-yyyy';
    worksheet.getColumn('qty').numFmt = '0.000';
    worksheet.getColumn('rate').numFmt = '0.00';
    worksheet.getColumn('value').numFmt = '0.00';

    const fileName = `closing-stock-processed-${id}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Download closing stock processed error:', error);
    res.status(500).json({ success: false, message: 'Error downloading processed rows' });
  }
};

export const downloadClosingStockErrors = async (req, res) => {
  try {
    const { id } = req.params;

    const { record, forbidden } = await getClosingStockUploadForScope(req, id);

    if (!record) {
      return res.status(404).json({ success: false, message: 'Upload record not found' });
    }

    if (forbidden) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    const rows = await query(
      `SELECT \`row_number\`, error_message, row_data, created_at
       FROM upload_error_logs
       WHERE upload_id = ? AND upload_type = 'closing_stock'
       ORDER BY \`row_number\``,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No error rows available for this upload.' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Error Report');

    worksheet.columns = [
      { header: 'Row Number', key: 'row_number', width: 12 },
      { header: 'Error Message', key: 'error_message', width: 55 },
      { header: 'Row Data', key: 'row_data', width: 80 },
      { header: 'Created At', key: 'created_at', width: 22 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' },
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });

    rows.forEach((row) => {
      const addedRow = worksheet.addRow({
        row_number: row.row_number,
        error_message: row.error_message,
        row_data: typeof row.row_data === 'string' ? row.row_data : JSON.stringify(row.row_data),
        created_at: row.created_at ? new Date(row.created_at) : null,
      });

      addedRow.getCell('error_message').alignment = { wrapText: true, vertical: 'top' };
      addedRow.getCell('row_data').alignment = { wrapText: true, vertical: 'top' };
      addedRow.height = 45;
    });

    worksheet.getColumn('created_at').numFmt = 'dd-mm-yyyy hh:mm:ss';

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const fileName = `closing-stock-errors-${id}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Download closing stock errors error:', error);
    res.status(500).json({ success: false, message: 'Error downloading error report' });
  }
};

export const downloadClosingStockTemplate = async (req, res) => {
  try {
    const now = new Date();
    let monthNum = parseInt(req.query.month, 10);
    let yearNum = parseInt(req.query.year, 10);

    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      monthNum = now.getMonth() + 1;
    }
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
      yearNum = now.getFullYear();
    }

    const monthName = MONTH_NAMES[monthNum - 1];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template');

    worksheet.columns = [
      { key: 'date', width: 16 },
      { key: 'material_name', width: 28 },
      { key: 'qty', width: 12 },
      { key: 'unit', width: 14 },
      { key: 'rate', width: 12 },
      { key: 'remarks', width: 24 },
    ];

    // Row 1-2: merged title area
    worksheet.mergeCells('A1:F2');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `BIG BEAN CAFE - CLOSING STOCK - ${monthName} ${yearNum}`;
    titleCell.font = { bold: true, size: 18, color: { argb: 'FF000000' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFE699' },
    };
    worksheet.getRow(1).height = 30;
    worksheet.getRow(2).height = 30;
    ['B1', 'C1', 'D1', 'E1', 'F1', 'A2', 'B2', 'C2', 'D2', 'E2', 'F2'].forEach((ref) => {
      worksheet.getCell(ref).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE699' },
      };
    });

    // Row 3: blank spacing row
    worksheet.getRow(3).height = 10;

    // Row 4: column headers
    const headerRow = worksheet.getRow(4);
    headerRow.values = ['Date', 'Material Name', 'Qty', 'Unit', 'Rate', 'Remarks'];
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' },
    };

    // Row 5: example data
    const exampleRow = worksheet.getRow(5);
    exampleRow.values = [new Date(yearNum, monthNum - 1, 1), 'COCOA DUST', 2, 'Dash', 50, 'Closing stock'];
    exampleRow.getCell(1).numFmt = 'dd-mm-yyyy';
    exampleRow.getCell(3).numFmt = '0.000';
    exampleRow.getCell(5).numFmt = '0.00';

    const monthLabel = monthName.charAt(0) + monthName.slice(1).toLowerCase();
    const fileName = `Closing_Stock_Template_${monthLabel}_${yearNum}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Download closing stock template error:', error);
    res.status(500).json({ success: false, message: 'Error generating template' });
  }
};

const getMaterialPurchaseUploadForScope = async (req, id) => {
  const records = await query('SELECT * FROM material_purchase_uploads WHERE id = ?', [id]);
  if (records.length === 0) return { record: null, forbidden: false };

  const record = records[0];

  if (req.outletScope && !req.outletScope.all) {
    if (!req.outletScope.outletIds.includes(Number(record.outlet_id))) {
      return { record, forbidden: true };
    }
  }

  return { record, forbidden: false };
};

export const downloadMaterialPurchaseOriginal = async (req, res) => {
  try {
    const { id } = req.params;

    const { record, forbidden } = await getMaterialPurchaseUploadForScope(req, id);

    if (!record) {
      return res.status(404).json({ success: false, message: 'Upload record not found' });
    }

    if (forbidden) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    if (!record.file_path) {
      return res.status(404).json({ success: false, message: 'Original file is not available for this upload' });
    }

    const uploadDir = path.resolve(process.env.UPLOAD_PATH || './uploads');
    const filePath = path.resolve(record.file_path);

    if (!filePath.startsWith(uploadDir + path.sep) || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Original file is not available for this upload' });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.download(filePath, record.file_name || `material-purchase-${id}.xlsx`);
  } catch (error) {
    console.error('Download material purchase original error:', error);
    res.status(500).json({ success: false, message: 'Error downloading original file' });
  }
};

export const downloadMaterialPurchaseProcessed = async (req, res) => {
  try {
    const { id } = req.params;

    const { record, forbidden } = await getMaterialPurchaseUploadForScope(req, id);

    if (!record) {
      return res.status(404).json({ success: false, message: 'Upload record not found' });
    }

    if (forbidden) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    if (!record.success_rows || Number(record.success_rows) === 0) {
      return res.status(404).json({ success: false, message: 'No processed rows available for this upload.' });
    }

    const rows = await query(
      `SELECT mpi.upload_id, mpi.date, mpi.outlet_id, o.outlet_name,
              mpi.supplier_id, mpi.supplier_name,
              mpi.raw_material_id, mpi.raw_material_code, mpi.raw_material_name,
              mpi.category_id, c.category_name,
              mpi.qty, mpi.unit_id, u.unit_name, mpi.rate, mpi.total_amount,
              mpi.invoice_no, mpi.paid_by, mpi.payment_mode, mpi.remarks
       FROM material_purchase_items mpi
       LEFT JOIN outlets o ON mpi.outlet_id = o.id
       LEFT JOIN categories c ON mpi.category_id = c.id
       LEFT JOIN units u ON mpi.unit_id = u.id
       WHERE mpi.upload_id = ?
       ORDER BY mpi.id`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No processed rows available for this upload.' });
    }

    // Material Purchase DB DATE values are date-only business values. Read
    // local Y/M/D components (never toISOString/UTC) to avoid a one-day
    // timezone shift when converting to an Excel serial date.
    const toExcelDate = (mysqlDate) => {
      if (!mysqlDate) return null;

      let year;
      let month;
      let day;

      if (typeof mysqlDate === 'string') {
        [year, month, day] = mysqlDate.slice(0, 10).split('-').map((v) => parseInt(v, 10));
      } else {
        year = mysqlDate.getFullYear();
        month = mysqlDate.getMonth() + 1;
        day = mysqlDate.getDate();
      }

      if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
      }

      const epoch = Date.UTC(1899, 11, 30);
      return (Date.UTC(year, month - 1, day) - epoch) / 86400000;
    };

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Processed Rows');

    worksheet.columns = [
      { header: 'Upload ID', key: 'upload_id', width: 12 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Outlet ID', key: 'outlet_id', width: 12 },
      { header: 'Outlet Name', key: 'outlet_name', width: 20 },
      { header: 'Supplier ID', key: 'supplier_id', width: 12 },
      { header: 'Supplier Name', key: 'supplier_name', width: 22 },
      { header: 'Raw Material ID', key: 'raw_material_id', width: 16 },
      { header: 'Raw Material Code', key: 'raw_material_code', width: 18 },
      { header: 'Raw Material Name', key: 'raw_material_name', width: 26 },
      { header: 'Category ID', key: 'category_id', width: 14 },
      { header: 'Category Name', key: 'category_name', width: 20 },
      { header: 'Qty', key: 'qty', width: 12 },
      { header: 'Unit ID', key: 'unit_id', width: 10 },
      { header: 'Unit', key: 'unit_name', width: 14 },
      { header: 'Rate', key: 'rate', width: 12 },
      { header: 'Total Amount', key: 'total_amount', width: 14 },
      { header: 'Invoice No', key: 'invoice_no', width: 18 },
      { header: 'Paid By', key: 'paid_by', width: 14 },
      { header: 'Payment Mode', key: 'payment_mode', width: 16 },
      { header: 'Remarks', key: 'remarks', width: 24 },
    ];
    worksheet.getRow(1).font = { bold: true };

    rows.forEach((row) => {
      worksheet.addRow({
        upload_id: row.upload_id,
        date: toExcelDate(row.date),
        outlet_id: row.outlet_id,
        outlet_name: row.outlet_name || '',
        supplier_id: row.supplier_id,
        supplier_name: row.supplier_name || '',
        raw_material_id: row.raw_material_id,
        raw_material_code: row.raw_material_code || '',
        raw_material_name: row.raw_material_name || '',
        paid_by: row.paid_by || 'Outlet',
        payment_mode: row.payment_mode || '',
        category_id: row.category_id,
        category_name: row.category_name || '',
        qty: row.qty,
        unit_id: row.unit_id,
        unit_name: row.unit_name || '',
        rate: row.rate,
        total_amount: row.total_amount,
        invoice_no: row.invoice_no || '',
        remarks: row.remarks || '',
      });
    });

    worksheet.getColumn('date').numFmt = 'dd-mm-yyyy';
    worksheet.getColumn('qty').numFmt = '0.000';
    worksheet.getColumn('rate').numFmt = '0.00';
    worksheet.getColumn('total_amount').numFmt = '0.00';

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const fileName = `material-purchase-processed-${id}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Download material purchase processed error:', error);
    res.status(500).json({ success: false, message: 'Error downloading processed rows' });
  }
};

export const downloadMaterialPurchaseErrors = async (req, res) => {
  try {
    const { id } = req.params;

    const { record, forbidden } = await getMaterialPurchaseUploadForScope(req, id);

    if (!record) {
      return res.status(404).json({ success: false, message: 'Upload record not found' });
    }

    if (forbidden) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    if (!record.failed_rows || Number(record.failed_rows) === 0) {
      return res.status(404).json({ success: false, message: 'No error rows available for this upload.' });
    }

    const rows = await query(
      `SELECT \`row_number\`, error_message, row_data, created_at
       FROM upload_error_logs
       WHERE upload_id = ? AND upload_type = 'material_purchase'
       ORDER BY \`row_number\``,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No error rows available for this upload.' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Error Report');

    worksheet.columns = [
      { header: 'Row Number', key: 'row_number', width: 12 },
      { header: 'Error Message', key: 'error_message', width: 55 },
      { header: 'Row Data', key: 'row_data', width: 80 },
      { header: 'Created At', key: 'created_at', width: 22 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' },
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });

    rows.forEach((row) => {
      const addedRow = worksheet.addRow({
        row_number: row.row_number,
        error_message: row.error_message,
        row_data: typeof row.row_data === 'string' ? row.row_data : JSON.stringify(row.row_data),
        created_at: row.created_at ? new Date(row.created_at) : null,
      });

      addedRow.getCell('error_message').alignment = { wrapText: true, vertical: 'top' };
      addedRow.getCell('row_data').alignment = { wrapText: true, vertical: 'top' };
      addedRow.height = 45;
    });

    worksheet.getColumn('created_at').numFmt = 'dd-mm-yyyy hh:mm:ss';

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const fileName = `material-purchase-errors-${id}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Download material purchase errors error:', error);
    res.status(500).json({ success: false, message: 'Error downloading error report' });
  }
};

export const downloadMaterialPurchaseTemplate = async (req, res) => {
  try {
    const now = new Date();
    let monthNum = parseInt(req.query.month, 10);
    let yearNum = parseInt(req.query.year, 10);

    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      monthNum = now.getMonth() + 1;
    }
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
      yearNum = now.getFullYear();
    }

    const monthName = MONTH_NAMES[monthNum - 1];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template');

    worksheet.columns = [
      { key: 'date', width: 16 },
      { key: 'supplier', width: 22 },
      { key: 'material', width: 26 },
      { key: 'qty', width: 12 },
      { key: 'unit', width: 14 },
      { key: 'rate', width: 12 },
      { key: 'amount', width: 12 },
      { key: 'bill_no', width: 18 },
      { key: 'paid_by', width: 16 },
      { key: 'payment_mode', width: 16 },
      { key: 'remarks', width: 24 },
    ];

    // Row 1-2: merged title area
    worksheet.mergeCells('A1:K2');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `BIG BEAN CAFE - MATERIAL PURCHASE - ${monthName} ${yearNum}`;
    titleCell.font = { bold: true, size: 18, color: { argb: 'FF000000' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFE699' },
    };
    worksheet.getRow(1).height = 30;
    worksheet.getRow(2).height = 30;
    ['B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1', 'I1', 'J1', 'K1', 'A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'H2', 'I2', 'J2', 'K2'].forEach((ref) => {
      worksheet.getCell(ref).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE699' },
      };
    });

    // Row 3: blank spacing row
    worksheet.getRow(3).height = 10;

    // Row 4: column headers
    const headerRow = worksheet.getRow(4);
    headerRow.values = ['Date', 'Supplier', 'Material', 'Qty', 'Unit', 'Rate', 'Amount', 'Bill No', 'Paid By', 'Payment Mode', 'Remarks'];
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' },
    };

    // Row 5-6: example data - one Outlet-paid (cash/UPI), one Management-paid
    const exampleRow = worksheet.getRow(5);
    exampleRow.values = [
      new Date(yearNum, monthNum - 1, 1),
      'Vivin Store',
      'COCOA DUST',
      2,
      'Dash',
      50,
      100,
      'BILL-001',
      'Outlet',
      'UPI',
      'Vegetables/chicken bought same-day by outlet staff',
    ];
    exampleRow.getCell(1).numFmt = 'dd-mm-yyyy';
    exampleRow.getCell(4).numFmt = '0.000';
    exampleRow.getCell(6).numFmt = '0.00';
    exampleRow.getCell(7).numFmt = '0.00';

    const exampleRow2 = worksheet.getRow(6);
    exampleRow2.values = [
      new Date(yearNum, monthNum - 1, 2),
      'Vivin Store',
      'COCOA DUST',
      10,
      'Dash',
      50,
      500,
      'BILL-002',
      'Management',
      '',
      'Delivered direct to outlet, paid by HQ',
    ];
    exampleRow2.getCell(1).numFmt = 'dd-mm-yyyy';
    exampleRow2.getCell(4).numFmt = '0.000';
    exampleRow2.getCell(6).numFmt = '0.00';
    exampleRow2.getCell(7).numFmt = '0.00';

    worksheet.getCell('A8').value = 'Paid By: "Outlet" (cash/UPI paid by outlet staff) or "Management" (HQ paid the supplier directly). Leave blank to default to Outlet. Payment Mode is free text (e.g. Cash, UPI) and only applies when Paid By is Outlet.';
    worksheet.getCell('A8').font = { italic: true, size: 10, color: { argb: 'FF6F6B7D' } };

    const monthLabel = monthName.charAt(0) + monthName.slice(1).toLowerCase();
    const fileName = `Material_Purchase_Template_${monthLabel}_${yearNum}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Download material purchase template error:', error);
    res.status(500).json({ success: false, message: 'Error generating template' });
  }
};

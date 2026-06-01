import xlsx from 'xlsx';
import { query, getConnection } from '../config/database.js';
import { generateUploadBatchId, parseExcelDate, sanitizeString, parseNumber } from '../utils/helpers.js';
import { logUploadError } from '../utils/logger.js';

const parseExcelFile = (filePath) => {
  try {
    const workbook = xlsx.readFile(filePath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
    return data;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
};

const findMaterialByName = async (materialName) => {
  const materials = await query(
    'SELECT * FROM raw_materials WHERE material_name LIKE ? LIMIT 1',
    [`%${materialName}%`]
  );
  return materials.length > 0 ? materials[0] : null;
};

const findSupplierByName = async (supplierName) => {
  const suppliers = await query(
    'SELECT * FROM suppliers WHERE supplier_name LIKE ? LIMIT 1',
    [`%${supplierName}%`]
  );
  return suppliers.length > 0 ? suppliers[0] : null;
};

const findMenuItemByName = async (itemName) => {
  const items = await query(
    'SELECT * FROM menu_items WHERE item_name LIKE ? LIMIT 1',
    [`%${itemName}%`]
  );
  return items.length > 0 ? items[0] : null;
};

const findCategoryByName = async (categoryName) => {
  const categories = await query(
    'SELECT * FROM categories WHERE category_name LIKE ? LIMIT 1',
    [`%${categoryName}%`]
  );
  return categories.length > 0 ? categories[0] : null;
};

const findUnitByName = async (unitName) => {
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
        const dateStr = parseExcelDate(row['Date']);

        if (!materialName || !qty || !rate) {
          throw new Error('Missing required fields: Material Name, Qty, or Rate');
        }

        const material = await findMaterialByName(materialName);
        const unit = await findUnitByName(unitName);

        await connection.execute(
          `INSERT INTO opening_stock_items (upload_id, date, outlet_id, raw_material_id, raw_material_name, qty, unit_id, rate, original_row, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            uploadId,
            dateStr || `${year}-${String(month).padStart(2, '0')}-01`,
            outlet_id,
            material?.id || null,
            materialName,
            qty,
            unit?.id || null,
            rate,
            JSON.stringify(row)
          ]
        );

        successCount++;
      } catch (error) {
        await logUploadError(uploadId, i + 1, error.message, row);
        failCount++;
      }
    }

    await connection.execute(
      `UPDATE opening_stock_uploads SET total_rows = ?, success_rows = ?, failed_rows = ?, status = 'Completed' WHERE id = ?`,
      [rows.length, successCount, failCount, uploadId]
    );

    await connection.commit();

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
        const dateStr = parseExcelDate(row['Date']);

        if (!materialName || !qty || !rate) {
          throw new Error('Missing required fields: Material Name, Qty, or Rate');
        }

        const material = await findMaterialByName(materialName);
        const unit = await findUnitByName(unitName);

        await connection.execute(
          `INSERT INTO closing_stock_items (upload_id, date, outlet_id, raw_material_id, raw_material_name, qty, unit_id, rate, original_row, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            uploadId,
            dateStr || `${year}-${String(month).padStart(2, '0')}-28`,
            outlet_id,
            material?.id || null,
            materialName,
            qty,
            unit?.id || null,
            rate,
            JSON.stringify(row)
          ]
        );

        successCount++;
      } catch (error) {
        await logUploadError(uploadId, i + 1, error.message, row);
        failCount++;
      }
    }

    await connection.execute(
      `UPDATE closing_stock_uploads SET total_rows = ?, success_rows = ?, failed_rows = ?, status = 'Completed' WHERE id = ?`,
      [rows.length, successCount, failCount, uploadId]
    );

    await connection.commit();

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
        const dateStr = parseExcelDate(row['Date'] || row['Purchase Date'] || row['Bill Date']);
        const supplierName = sanitizeString(row['Supplier'] || row['Vendor'] || row['Party Name']);
        const materialName = sanitizeString(row['Material Name'] || row['Item Name'] || row['Product']);
        const qty = parseNumber(row['Qty'] || row['Quantity']);
        const rate = parseNumber(row['Rate'] || row['Price'] || row['Unit Price']);
        const amount = parseNumber(row['Amount'] || row['Total'] || row['Total Amount']);
        const unitName = sanitizeString(row['Unit'] || row['UOM']);
        const invoiceNo = sanitizeString(row['Invoice No'] || row['Bill No']);

        if (!materialName || !qty || !rate) {
          throw new Error('Missing required fields: Material Name, Qty, or Rate');
        }

        const material = await findMaterialByName(materialName);
        const supplier = supplierName ? await findSupplierByName(supplierName) : null;
        const unit = unitName ? await findUnitByName(unitName) : null;

        await connection.execute(
          `INSERT INTO material_purchase_items (upload_id, date, outlet_id, supplier_id, supplier_name, raw_material_id, raw_material_name, qty, unit_id, rate, total_amount, invoice_no, original_row, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            uploadId,
            dateStr,
            outlet_id,
            supplier?.id || null,
            supplierName || 'Unknown',
            material?.id || null,
            materialName,
            qty,
            unit?.id || null,
            rate,
            amount || (qty * rate),
            invoiceNo,
            JSON.stringify(row)
          ]
        );

        successCount++;
      } catch (error) {
        await logUploadError(uploadId, i + 1, error.message, row);
        failCount++;
      }
    }

    await connection.execute(
      `UPDATE material_purchase_uploads SET total_rows = ?, success_rows = ?, failed_rows = ?, status = 'Completed' WHERE id = ?`,
      [rows.length, successCount, failCount, uploadId]
    );

    await connection.commit();

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

    await connection.beginTransaction();

    const batchId = generateUploadBatchId();

    const uploadResult = await connection.execute(
      `INSERT INTO item_sales_uploads (batch_id, outlet_id, file_name, file_path, status, uploaded_by, created_at) 
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
        const dateStr = parseExcelDate(row['Date'] || row['Sale Date'] || row['Order Date']);
        const categoryName = sanitizeString(row['Category'] || row['Item Category']);
        const itemName = sanitizeString(row['Item Name'] || row['Product'] || row['Item']);
        const qtySold = parseNumber(row['Qty'] || row['Quantity'] || row['Qty Sold']);
        const grossSales = parseNumber(row['Gross Sales'] || row['Gross Amount'] || row['Amount']);
        const discount = parseNumber(row['Discount']);
        const tax = parseNumber(row['Tax'] || row['GST']);
        const netSales = parseNumber(row['Net Sales'] || row['Net Amount']);

        if (!itemName || !qtySold) {
          throw new Error('Missing required fields: Item Name or Qty');
        }

        const menuItem = await findMenuItemByName(itemName);
        const category = categoryName ? await findCategoryByName(categoryName) : null;

        await connection.execute(
          `INSERT INTO item_sales_items (upload_id, date, outlet_id, category_id, category_name, menu_item_id, item_name, qty_sold, gross_sales, discount, tax, net_sales, original_row, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            uploadId,
            dateStr,
            outlet_id,
            category?.id || null,
            categoryName || 'Uncategorized',
            menuItem?.id || null,
            itemName,
            qtySold,
            grossSales || 0,
            discount || 0,
            tax || 0,
            netSales || grossSales || 0,
            JSON.stringify(row)
          ]
        );

        successCount++;
      } catch (error) {
        await logUploadError(uploadId, i + 1, error.message, row);
        failCount++;
      }
    }

    await connection.execute(
      `UPDATE item_sales_uploads SET total_rows = ?, success_rows = ?, failed_rows = ?, status = 'Completed' WHERE id = ?`,
      [rows.length, successCount, failCount, uploadId]
    );

    await connection.commit();

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

export const getUploadHistory = async (req, res) => {
  try {
    const type = req.params.type || req.query.type;
    const { outlet_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

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

    if (outlet_id) {
      whereClause += ' AND outlet_id = ?';
      params.push(outlet_id);
    }

    const uploads = await query(
      `SELECT * FROM ${tableName} WHERE ${whereClause} ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
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

export const getUploadErrors = async (req, res) => {
  try {
    const { upload_id } = req.params;

    const errors = await query(
      'SELECT * FROM upload_error_logs WHERE upload_id = ? ORDER BY row_number',
      [upload_id]
    );

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

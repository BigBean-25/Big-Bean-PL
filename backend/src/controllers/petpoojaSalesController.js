import { query, getConnection } from '../config/database.js';
import { logAudit } from '../utils/logger.js';
import { notifyUser, notifyAdmins } from '../utils/notificationService.js';
import { assertDateRangeEditable } from '../utils/periodLock.js';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

// Generate batch number
const generateBatchNumber = () => {
  const now = new Date();
  return `PP${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
};

// Safely format a DB date value (Date object or 'YYYY-MM-DD' string) as DD-MM-YYYY for display only
const formatDateDDMMYYYY = (value) => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

// Parse date range from PetPooja format
const parseDateRange = (dateRangeString) => {
  // Format: "2026-04-01 to 2026-04-30"
  const parts = dateRangeString.split(' to ');
  return {
    from: parts[0].trim(),
    to: parts[1] ? parts[1].trim() : parts[0].trim()
  };
};

const META_ROW_LABELS = new Set(['total', 'min.', 'max.', 'avg.', 'sub total']);

const levenshtein = (a, b) => {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
};

// Reduce an outlet/restaurant name down to just its distinguishing location
// token (strip the common "Big Bean Cafe" branding + separators) so we can
// fuzzy-compare e.g. "Big Bean cafe_Kormangala" against "Big Bean Cafe - Koramangala".
const locationToken = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/bigbean|caf[eé]|coffeeroasters/g, '');

// Soft, non-blocking check: does the Excel file's "Restaurant Name:" row look
// like it belongs to a different outlet than the one selected in the upload
// form? Returns a warning string if so, or null if it matches (or we can't
// tell either way).
const checkOutletMismatch = async (restaurantName, selectedOutletId) => {
  if (!restaurantName) return null;

  const outlets = await query('SELECT id, outlet_name FROM outlets');
  const fileToken = locationToken(restaurantName);
  if (!fileToken) return null;

  let best = null;
  for (const outlet of outlets) {
    const outletToken = locationToken(outlet.outlet_name);
    if (!outletToken) continue;
    const distance = levenshtein(fileToken, outletToken);
    const score = distance / Math.max(fileToken.length, outletToken.length);
    if (!best || score < best.score) {
      best = { id: outlet.id, name: outlet.outlet_name, score };
    }
  }

  if (best && best.score <= 0.3 && Number(best.id) !== Number(selectedOutletId)) {
    return `The file's Restaurant Name ("${restaurantName}") looks like it belongs to "${best.name}", not the selected outlet. Please double-check the outlet before approving this upload.`;
  }

  return null;
};

const checkExistingUploadOverlap = async (outletId, salesDate) => {
  const rows = await query(
    `SELECT id, batch_number,
            DATE_FORMAT(upload_date_from, '%Y-%m-%d') AS upload_date_from,
            DATE_FORMAT(upload_date_to, '%Y-%m-%d') AS upload_date_to,
            status
     FROM petpooja_sales_uploads
     WHERE outlet_id = ?
       AND status IN ('Pending', 'Reconciling', 'Approved')
       AND ? BETWEEN COALESCE(upload_date_from, upload_date) AND COALESCE(upload_date_to, upload_date)
     LIMIT 1`,
    [outletId, salesDate]
  );
  return rows[0] || null;
};

const checkMonthlyUploadOverlap = async (outletId, newFrom, newTo) => {
  const rows = await query(
    `SELECT id, batch_number, outlet_id,
            DATE_FORMAT(upload_date_from, '%Y-%m-%d') AS upload_date_from,
            DATE_FORMAT(upload_date_to, '%Y-%m-%d') AS upload_date_to
     FROM petpooja_sales_uploads
     WHERE outlet_id = ?
       AND status IN ('Pending', 'Reconciling', 'Approved')
       AND COALESCE(upload_date_from, upload_date) <= ?
       AND COALESCE(upload_date_to, upload_date) >= ?
     LIMIT 1`,
    [outletId, newTo, newFrom]
  );
  return rows[0] || null;
};

// Download PetPooja Excel Template — matches the real "Outlet-Item Wise
// Report (Row)" export format (Taxable/Restaurant/Category/Item/Qty/My
// Amount/Discount/Tax/Gross Sales/Sap Code), which is the only format this
// system accepts uploads in. Unlike the old "Item Wise: Sales Report" format,
// this one carries real per-item Discount and Tax columns instead of always
// reporting tax as 0.
export const downloadPetPoojaTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');

    // Row 1: Date range
    worksheet.getRow(1).values = ['Date:', '2026-04-01 to 2026-04-30'];

    // Row 2: Report name
    worksheet.getRow(2).values = ['Name:', 'Outlet-Item Wise Report (Row)'];

    // Row 5: Headers
    worksheet.getRow(5).values = ['Taxable', 'Restaurant', 'Category', 'Item', 'Qty', 'My Amount', 'Discount', 'Tax', 'Gross Sales', 'Sap Code'];

    // Row 6: Total (example)
    worksheet.getRow(6).values = ['Total', '', '', '', 80, 12000, 100, 600, 12500, ''];

    // Row 10+: Sample data — every data row starts with "Taxable" in Column A
    worksheet.getRow(10).values = ['Taxable', 'Big Bean cafe_Koramangala', 'Beverage', 'Cappuccino', 50, 7500, 0, 375, 7875, '1'];
    worksheet.getRow(11).values = ['Taxable', 'Big Bean cafe_Koramangala', 'Beverage', 'Latte', 30, 4500, 100, 225, 4625, '2'];

    // Style header row
    worksheet.getRow(5).font = { bold: true };
    worksheet.getRow(5).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' }
    };

    worksheet.getRow(6).font = { bold: true };

    // Set column widths
    worksheet.columns = [
      { width: 10 }, { width: 24 }, { width: 16 }, { width: 26 },
      { width: 8 }, { width: 12 }, { width: 10 }, { width: 10 },
      { width: 12 }, { width: 12 }
    ];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=PetPooja_Sales_Template.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Download template error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating template'
    });
  }
};

// Build a query function bound to an open mysql2 connection (used inside transactions)
const makeConnQuery = (connection) => async (sql, params) => {
  const [results] = await connection.execute(sql, params);
  return results;
};

// Reconcile Sales with Cashbook (Updated for Date Range)
const reconcileSales = async (uploadId, outletId, dateFrom, dateTo, q, parseIssues = []) => {
  // Get PetPooja totals
  const petpoojaData = await q(
    `SELECT gross_sales, total_discount, net_sales, total_tax, final_collection
     FROM petpooja_sales_uploads WHERE id = ?`,
    [uploadId]
  );

  if (petpoojaData.length === 0) return null;

  const petpooja = petpoojaData[0];

  // Get Cashbook totals for the date range from finalized/operational cashbooks only
  const cashbookData = await q(
    `SELECT COALESCE(SUM(total_sales), 0) as total_sales
     FROM daily_cashbooks
     WHERE outlet_id = ? AND date BETWEEN ? AND ?
       AND status IN ('Submitted', 'Verified', 'Locked')`,
    [outletId, dateFrom, dateTo]
  );

  const cashbookTotal = parseFloat(cashbookData[0].total_sales) || 0;
  const difference = parseFloat(petpooja.final_collection) - cashbookTotal;

  // Calculate tolerance based on number of days
  const daysDiff = Math.ceil((new Date(dateTo) - new Date(dateFrom)) / (1000 * 60 * 60 * 24)) + 1;
  const tolerance = daysDiff * 10; // ₹10 per day

  const isMatched = Math.abs(difference) <= tolerance;

  // Create reconciliation batch
  const status = isMatched ? 'Matched' : 'Mismatched';
  const reconResult = await q(
    `INSERT INTO sales_reconciliation_batches
     (upload_id, outlet_id, reconciliation_date,
      petpooja_gross_sales, petpooja_discount, petpooja_net_sales, petpooja_tax, petpooja_final_collection,
      cashbook_total, tolerance_amount, is_matched, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uploadId,
      outletId,
      dateFrom,
      petpooja.gross_sales,
      petpooja.total_discount,
      petpooja.net_sales,
      petpooja.total_tax,
      petpooja.final_collection,
      cashbookTotal,
      tolerance,
      isMatched,
      status
    ]
  );

  const reconciliationId = reconResult.insertId;

  // Persist parse issues
  let errorCount = 0;
  let warningCount = 0;

  for (const issue of parseIssues) {
    const sev = issue.severity || 'Error';
    if (sev === 'Error') errorCount++;
    if (sev === 'Warning') warningCount++;

    await q(
      `INSERT INTO sales_reconciliation_errors
       (reconciliation_id, upload_id, error_type, severity, item_name, expected_value, actual_value, difference, error_message, row_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reconciliationId,
        uploadId,
        issue.type,
        sev,
        issue.item_name || null,
        issue.expected_value ?? null,
        issue.actual_value ?? null,
        issue.difference ?? null,
        issue.message,
        issue.row_number || null
      ]
    );
  }

  // Collection mismatch is always an Error and is handled separately
  if (!isMatched) {
    errorCount++;
    await q(
      `INSERT INTO sales_reconciliation_errors
       (reconciliation_id, upload_id, error_type, severity, expected_value, actual_value, difference, error_message)
       VALUES (?, ?, 'Collection Mismatch', 'Error', ?, ?, ?, ?)`,
      [
        reconciliationId,
        uploadId,
        cashbookTotal,
        petpooja.final_collection,
        difference,
        `Collection mismatch for ${dateFrom} to ${dateTo}: PetPooja ₹${Number(petpooja.final_collection).toFixed(2)} vs Cashbook ₹${cashbookTotal.toFixed(2)}. Difference: ₹${difference.toFixed(2)}`
      ]
    );
  }

  await q(
    `UPDATE sales_reconciliation_batches SET error_count = ? WHERE id = ?`,
    [errorCount, reconciliationId]
  );

  // Update upload status
  await q(
    `UPDATE petpooja_sales_uploads SET status = 'Reconciling' WHERE id = ?`,
    [uploadId]
  );

  return { reconciliationId, isMatched, cashbookTotal, errorCount, warningCount };
};

// Upload PetPooja Sales (Updated for Actual Format)
const handlePetPoojaUpload = async (req, res, mode) => {
  let connection = null;

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

    // Enforce .xlsx parsing support
    if (!/\.xlsx$/i.test(file.originalname)) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a .xlsx PetPooja export'
      });
    }

    // Read Excel file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file.path);
    const worksheet = workbook.getWorksheet(1);

    // Extract date range from Row 1
    const dateRangeCell = worksheet.getRow(1).getCell(2).value;
    if (!dateRangeCell) {
      return res.status(400).json({
        success: false,
        message: 'Date range not found in Row 1, Column 2'
      });
    }

    const dateRange = parseDateRange(dateRangeCell.toString());

    if (mode === 'daily' && dateRange.from !== dateRange.to) {
      return res.status(400).json({
        success: false,
        message: `Daily upload must cover a single date — this file covers ${dateRange.from} to ${dateRange.to}. Use Monthly Sales Upload instead.`
      });
    }

    if (mode === 'monthly') {
      const fromMonth = dateRange.from.slice(0, 7);
      const toMonth = dateRange.to.slice(0, 7);
      if (dateRange.from > dateRange.to) {
        return res.status(400).json({
          success: false,
          message: `Invalid date range — from date ${dateRange.from} is after to date ${dateRange.to}.`
        });
      }
      if (fromMonth !== toMonth) {
        return res.status(400).json({
          success: false,
          message: `Monthly upload must stay within one calendar month — this file covers ${dateRange.from} to ${dateRange.to}, which spans more than one month.`
        });
      }
      const [year, month] = fromMonth.split('-').map(Number);
      const firstDay = `${fromMonth}-01`;
      const lastDay = `${fromMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
      if (dateRange.from !== firstDay || dateRange.to !== lastDay) {
        return res.status(400).json({
          success: false,
          message: `Monthly upload must cover the full calendar month (${firstDay} to ${lastDay}). This file covers ${dateRange.from} to ${dateRange.to}.`
        });
      }
      const existing = await checkMonthlyUploadOverlap(outlet_id, dateRange.from, dateRange.to);
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Sales already exist for this outlet from ${formatDateDDMMYYYY(existing.upload_date_from)} to ${formatDateDDMMYYYY(existing.upload_date_to)} in batch ${existing.batch_number}. Daily and Monthly accounting sales cannot overlap.`
        });
      }
    }

    if (mode === 'daily') {
      const existing = await checkExistingUploadOverlap(outlet_id, dateRange.from);
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Sales for this outlet and date have already been uploaded in batch ${existing.batch_number} (status: ${existing.status}, covers ${existing.upload_date_from} to ${existing.upload_date_to}).`
        });
      }
    }

    await assertDateRangeEditable(outlet_id, dateRange.from, dateRange.to, 'A sales upload');

    // Row 6: grand total (Taxable | Restaurant | Category | Item | Qty | My Amount | Discount | Tax | Gross Sales | Sap Code)
    const totalRow = worksheet.getRow(6);
    const totals = {
      quantity: parseFloat(totalRow.getCell(5).value) || 0,
      net_amount: parseFloat(totalRow.getCell(6).value) || 0,
      discount: parseFloat(totalRow.getCell(7).value) || 0,
      tax: parseFloat(totalRow.getCell(8).value) || 0,
      gross_sales: parseFloat(totalRow.getCell(9).value) || 0
    };

    // Parse item rows from Row 10 onward — every real data row starts with
    // "Taxable" in Column A. Restaurant name (used only for a soft,
    // non-blocking mismatch warning against the selected outlet) is read off
    // the first data row, since this format has no separate header row for it.
    const salesItems = [];
    const parseIssues = [];
    let restaurantName = null;

    for (let rowNum = 10; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      const taxableCell = row.getCell(1).value;
      if (!taxableCell || taxableCell.toString().trim().toLowerCase() !== 'taxable') continue;

      const itemName = row.getCell(4).value ? row.getCell(4).value.toString().trim() : '';
      if (!itemName) continue;

      if (!restaurantName && row.getCell(2).value) restaurantName = row.getCell(2).value.toString().trim();

      const category = row.getCell(3).value ? row.getCell(3).value.toString().trim() : '';
      const quantity = parseFloat(row.getCell(5).value) || 0;
      const netAmount = parseFloat(row.getCell(6).value) || 0;
      const discount = parseFloat(row.getCell(7).value) || 0;
      const tax = parseFloat(row.getCell(8).value) || 0;
      const grossSales = parseFloat(row.getCell(9).value) || 0;
      const sapCode = row.getCell(10).value;

      if (quantity <= 0) {
        parseIssues.push({
          type: 'Invalid Quantity',
          severity: 'Error',
          row_number: rowNum,
          item_name: itemName,
          expected_value: null,
          actual_value: quantity,
          message: `Quantity must be greater than 0 for "${itemName}" (row ${rowNum}). This row was not imported.`
        });
        continue;
      }

      if (grossSales < 0 || netAmount < 0 || tax < 0 || discount < 0) {
        parseIssues.push({
          type: 'Negative Sales',
          severity: 'Error',
          row_number: rowNum,
          item_name: itemName,
          expected_value: null,
          actual_value: grossSales,
          message: `Sales/discount/tax values cannot be negative for "${itemName}" (row ${rowNum}). This row was not imported.`
        });
        continue;
      }

      if (grossSales === 0) {
        parseIssues.push({
          type: 'Other',
          severity: 'Error',
          row_number: rowNum,
          item_name: itemName,
          expected_value: null,
          actual_value: grossSales,
          message: `Gross sales cannot be zero for "${itemName}" (row ${rowNum}). This row was not imported.`
        });
        continue;
      }

      const expectedGross = netAmount + tax;
      if (Math.abs(grossSales - expectedGross) > 0.5) {
        parseIssues.push({
          type: 'Gross Sales Formula Error',
          severity: 'Warning',
          row_number: rowNum,
          item_name: itemName,
          expected_value: expectedGross,
          actual_value: grossSales,
          difference: grossSales - expectedGross,
          message: `Gross sales (₹${grossSales.toFixed(2)}) does not equal Net + Tax (₹${expectedGross.toFixed(2)}) for "${itemName}" (row ${rowNum}).`
        });
      }

      salesItems.push({
        outlet_name: restaurantName,
        category,
        item_name: itemName,
        quantity,
        net_amount: netAmount,
        discount,
        tax,
        gross_sales: grossSales,
        sap_code: sapCode ? sapCode.toString().trim() : null
      });
    }

    if (salesItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid sales items found in the Excel file'
      });
    }

    const outletMismatchWarning = await checkOutletMismatch(restaurantName, outlet_id);

    // Verify totals match
    const calculatedTotals = salesItems.reduce((acc, item) => ({
      quantity: acc.quantity + item.quantity,
      net_amount: acc.net_amount + item.net_amount,
      discount: acc.discount + item.discount,
      tax: acc.tax + item.tax,
      gross_sales: acc.gross_sales + item.gross_sales
    }), { quantity: 0, net_amount: 0, discount: 0, tax: 0, gross_sales: 0 });

    // Check if calculated totals match Row 7's grand total
    if (Math.abs(calculatedTotals.gross_sales - totals.gross_sales) > 1) {
      parseIssues.push({
        type: 'Total Mismatch',
        severity: 'Error',
        item_name: null,
        expected_value: totals.gross_sales,
        actual_value: calculatedTotals.gross_sales,
        difference: calculatedTotals.gross_sales - totals.gross_sales,
        message: `Calculated total (₹${calculatedTotals.gross_sales.toFixed(2)}) does not match the grand total in Row 6 (₹${totals.gross_sales.toFixed(2)})`
      });
    }

    if (outletMismatchWarning) {
      if (mode === 'monthly') {
        return res.status(400).json({
          success: false,
          message: outletMismatchWarning
        });
      }
      parseIssues.push({
        type: 'Outlet Mismatch',
        severity: 'Warning',
        item_name: null,
        message: outletMismatchWarning
      });
    }

    const itemCount = salesItems.length;

    // Start transaction
    connection = await getConnection();
    await connection.beginTransaction();
    const q = makeConnQuery(connection);

    try {
      // Create upload batch
      const batchNumber = generateBatchNumber();
      const uploadResult = await q(
        `INSERT INTO petpooja_sales_uploads
         (batch_number, upload_date, upload_date_from, upload_date_to, outlet_id, file_name, file_path, total_items,
          gross_sales, total_discount, net_sales, total_tax, final_collection,
          status, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
        [
          batchNumber,
          dateRange.from,
          dateRange.from,
          dateRange.to,
          outlet_id,
          file.originalname,
          file.path,
          itemCount,
          totals.gross_sales,
          totals.discount,
          totals.net_amount,
          totals.tax,
          totals.gross_sales,
          req.user.id
        ]
      );

      const uploadId = uploadResult.insertId;

      // Insert sales items
      for (const item of salesItems) {
        await q(
          `INSERT INTO petpooja_sales_items
           (upload_id, outlet_id, outlet_name, category, item_name, sap_code,
            quantity, net_sales, discount, total_tax, gross_sales)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uploadId,
            outlet_id,
            item.outlet_name,
            item.category,
            item.item_name,
            item.sap_code,
            item.quantity,
            item.net_amount,
            item.discount,
            item.tax,
            item.gross_sales
          ]
        );
      }

      // Log audit
      await q(
        `INSERT INTO sales_approval_audit (upload_id, action, performed_by, remarks, ip_address)
         VALUES (?, 'Uploaded', ?, ?, ?)`,
        [uploadId, req.user.id, `Uploaded ${itemCount} items for ${dateRange.from} to ${dateRange.to}`, req.ip || null]
      );

      // Trigger reconciliation
      const recon = await reconcileSales(uploadId, outlet_id, dateRange.from, dateRange.to, q, parseIssues);

      await connection.commit();

      const warningCount = parseIssues.filter(e => e.severity === 'Warning').length;
      const errorCount = parseIssues.filter(e => e.severity === 'Error').length;

      res.status(201).json({
        success: true,
        message: 'PetPooja sales uploaded successfully',
        data: {
          upload_id: uploadId,
          batch_number: batchNumber,
          date_from: dateRange.from,
          date_to: dateRange.to,
          total_items: itemCount,
          total_net_sales: totals.net_amount,
          total_tax: totals.tax,
          total_gross_sales: totals.gross_sales,
          errors: errorCount,
          warnings: warningCount,
          is_matched: recon ? recon.isMatched : false,
          cashbook_total: recon ? recon.cashbookTotal : 0,
          reconciliation_status: recon ? (recon.isMatched ? 'Matched' : 'Mismatched') : null,
          outlet_mismatch_warning: outletMismatchWarning
        }
      });
    } catch (txError) {
      if (connection) await connection.rollback();
      throw txError;
    } finally {
      if (connection) connection.release();
      connection = null;
    }
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch {}
      try { connection.release(); } catch {}
    }
    console.error('Upload PetPooja sales error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({
      success: false,
      message: 'Error uploading sales data',
      error: error.message
    });
  }
};

export const uploadPetPoojaSalesDaily = (req, res) => handlePetPoojaUpload(req, res, 'daily');
export const uploadPetPoojaSalesMonthly = (req, res) => handlePetPoojaUpload(req, res, 'monthly');

// Get Reconciliations List
export const getReconciliations = async (req, res) => {
  try {
    const { outlet_id, status, from_date, to_date, mode } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (outlet_id) {
      whereClause += ' AND srb.outlet_id = ?';
      params.push(outlet_id);
    }

    if (status) {
      whereClause += ' AND srb.status = ?';
      params.push(status);
    }

    if (from_date) {
      whereClause += ' AND srb.reconciliation_date >= ?';
      params.push(from_date);
    }

    if (to_date) {
      whereClause += ' AND srb.reconciliation_date <= ?';
      params.push(to_date);
    }

    if (mode === 'monthly') {
      whereClause += ' AND psu.upload_date_from != psu.upload_date_to';
    } else if (mode === 'daily') {
      whereClause += ' AND psu.upload_date_from = psu.upload_date_to';
    }

    const reconciliations = await query(
      `SELECT
         srb.id,
         srb.upload_id,
         srb.outlet_id,
         o.outlet_name,
         srb.reconciled_by,
         u.full_name as reconciled_by_name,
         srb.is_matched,
         srb.error_count,
         (SELECT COUNT(*) FROM sales_reconciliation_errors sre WHERE sre.reconciliation_id = srb.id AND sre.severity = 'Warning') as warning_count,
         srb.remarks,
         DATE_FORMAT(srb.reconciliation_date, '%Y-%m-%d') as sales_date,
         DATE_FORMAT(psu.upload_date_from, '%Y-%m-%d') as date_from,
         DATE_FORMAT(psu.upload_date_to, '%Y-%m-%d') as date_to,
         srb.petpooja_gross_sales,
         srb.petpooja_net_sales,
         srb.petpooja_tax,
         srb.petpooja_final_collection,
         srb.cashbook_total,
         srb.tolerance_amount,
         srb.collection_difference,
         srb.status as reconciliation_status,
         psu.batch_number,
         psu.file_name,
         psu.total_items,
         psu.status as upload_status,
         psu.created_at,
         psu.approved_at
       FROM sales_reconciliation_batches srb
       JOIN petpooja_sales_uploads psu ON srb.upload_id = psu.id
       JOIN outlets o ON srb.outlet_id = o.id
       LEFT JOIN users u ON srb.reconciled_by = u.id
       WHERE ${whereClause}
       ORDER BY srb.created_at DESC`,
      params
    );

    res.json({
      success: true,
      data: reconciliations
    });
  } catch (error) {
    console.error('Get reconciliations error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reconciliations',
      error: error.message
    });
  }
};

// Get Reconciliation Details
export const getReconciliationById = async (req, res) => {
  try {
    const { id } = req.params;

    const reconciliation = await query(
      `SELECT
         srb.*,
         psu.*,
         o.outlet_name,
         u.full_name as reconciled_by_name,
         DATE_FORMAT(srb.reconciliation_date, '%Y-%m-%d') as sales_date,
         DATE_FORMAT(psu.upload_date, '%Y-%m-%d') as upload_date,
         DATE_FORMAT(psu.upload_date_from, '%Y-%m-%d') as upload_date_from,
         DATE_FORMAT(psu.upload_date_to, '%Y-%m-%d') as upload_date_to
       FROM sales_reconciliation_batches srb
       JOIN petpooja_sales_uploads psu ON srb.upload_id = psu.id
       JOIN outlets o ON srb.outlet_id = o.id
       LEFT JOIN users u ON srb.reconciled_by = u.id
       WHERE srb.id = ?`,
      [id]
    );

    if (reconciliation.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reconciliation not found'
      });
    }

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(reconciliation[0].outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    const errors = await query(
      `SELECT id, reconciliation_id, upload_id, error_type, severity, item_name,
              expected_value, actual_value, difference, error_message, \`row_number\`, created_at
       FROM sales_reconciliation_errors
       WHERE reconciliation_id = ?
       ORDER BY \`row_number\`, created_at`,
      [id]
    );

    const items = await query(
      `SELECT id, upload_id, outlet_id, outlet_name, category, item_name, sap_code,
              quantity, net_sales, discount, total_tax, gross_sales, created_at
       FROM petpooja_sales_items
       WHERE upload_id = ?
       ORDER BY id`,
      [reconciliation[0].upload_id]
    );

    res.json({
      success: true,
      data: {
        reconciliation: reconciliation[0],
        errors,
        items
      }
    });
  } catch (error) {
    console.error('Get reconciliation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reconciliation details',
      error: error.message
    });
  }
};

const formatDateDisplay = (dateString) => {
  if (!dateString) return '';
  let d;
  if (dateString instanceof Date) {
    d = dateString;
  } else {
    d = new Date(`${dateString}T00:00:00`);
    if (isNaN(d.getTime())) return String(dateString);
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

// Download Original File
export const downloadOriginalFile = async (req, res) => {
  try {
    const { id } = req.params;

    const upload = await query(
      `SELECT psu.id, psu.outlet_id, psu.file_name, psu.file_path
       FROM petpooja_sales_uploads psu
       WHERE psu.id = ?`,
      [id]
    );

    if (upload.length === 0) {
      return res.status(404).json({ success: false, message: 'Upload not found' });
    }

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(upload[0].outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    const filePath = path.resolve(upload[0].file_path);
    const baseDir = path.resolve('uploads/petpooja-sales');
    if (!filePath.startsWith(baseDir)) {
      return res.status(400).json({ success: false, message: 'Invalid file path' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Original file not found on server' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${upload[0].file_name}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error) {
    console.error('Download original file error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading original file',
      error: error.message
    });
  }
};

// Download Processed File
export const downloadProcessedFile = async (req, res) => {
  try {
    const { id } = req.params;

    const upload = await query(
      `SELECT psu.id, psu.outlet_id, psu.batch_number, psu.upload_date, psu.file_name,
              DATE_FORMAT(psu.upload_date_from, '%Y-%m-%d') as upload_date_from,
              DATE_FORMAT(psu.upload_date_to, '%Y-%m-%d') as upload_date_to,
              o.outlet_name
       FROM petpooja_sales_uploads psu
       JOIN outlets o ON psu.outlet_id = o.id
       WHERE psu.id = ?`,
      [id]
    );

    if (upload.length === 0) {
      return res.status(404).json({ success: false, message: 'Upload not found' });
    }

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(upload[0].outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    const items = await query(
      `SELECT category, item_name, sap_code, quantity, net_sales, discount, total_tax, gross_sales
       FROM petpooja_sales_items
       WHERE upload_id = ?
       ORDER BY id`,
      [id]
    );

    if (items.length === 0) {
      return res.status(404).json({ success: false, message: 'No processed item rows available for this upload' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Processed Sales');

    // Batch context
    const context = [
      ['Batch', upload[0].batch_number],
      ['Outlet', upload[0].outlet_name],
      ['Sales Date', formatDateDisplay(upload[0].upload_date)],
      ['Original File', upload[0].file_name],
      []
    ];
    context.forEach(r => worksheet.addRow(r));

    // Header
    const header = ['Category', 'Item', 'SAP Code', 'Quantity', 'Net Sales', 'Discount', 'Total Tax', 'Gross Sales'];
    const headerRow = worksheet.addRow(header);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

    // Data
    items.forEach(item => {
      worksheet.addRow([
        item.category || '',
        item.item_name || '',
        item.sap_code || '',
        Number(item.quantity),
        Number(item.net_sales),
        Number(item.discount || 0),
        Number(item.total_tax || 0),
        Number(item.gross_sales)
      ]);
    });

    // Formatting
    const moneyCols = [5, 6, 7, 8]; // E, F, G, H
    const qtyCol = 4; // D
    for (let i = 1; i <= items.length + 1; i++) {
      const row = worksheet.getRow(i + 5);
      if (i === 1) continue;
      const cellQty = row.getCell(qtyCol);
      cellQty.numFmt = '0.00';
      moneyCols.forEach(c => {
        row.getCell(c).numFmt = '0.00';
      });
    }

    worksheet.columns = [
      { width: 22 }, { width: 35 }, { width: 18 }, { width: 14 },
      { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }
    ];

    worksheet.views = [{ state: 'frozen', ySplit: 6 }];

    const safeOutlet = String(upload[0].outlet_name || 'Outlet').replace(/[^a-zA-Z0-9\-_]/g, '_');
    const safeDate = formatDateDisplay(upload[0].upload_date).replace(/\//g, '-');
    const safeFrom = formatDateDisplay(upload[0].upload_date_from).replace(/\//g, '-');
    const safeTo = formatDateDisplay(upload[0].upload_date_to).replace(/\//g, '-');
    const isMonthly = upload[0].upload_date_from !== upload[0].upload_date_to;
    const filename = isMonthly
      ? `Monthly_Sales_Processed_${safeOutlet}_${safeFrom}_to_${safeTo}.xlsx`
      : `Daily_Sales_Processed_${safeOutlet}_${safeDate}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Download processed file error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating processed file',
      error: error.message
    });
  }
};

// Download Error Report
export const downloadErrorReport = async (req, res) => {
  try {
    const { id } = req.params;

    const reconciliation = await query(
      `SELECT
         srb.*,
         psu.*,
         o.outlet_name
       FROM sales_reconciliation_batches srb
       JOIN petpooja_sales_uploads psu ON srb.upload_id = psu.id
       JOIN outlets o ON srb.outlet_id = o.id
       WHERE srb.id = ?`,
      [id]
    );

    if (reconciliation.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reconciliation not found'
      });
    }

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(reconciliation[0].outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    const errors = await query(
      `SELECT
         \`row_number\`,
         error_type,
         severity,
         item_name,
         expected_value,
         actual_value,
         difference,
         error_message,
         created_at
       FROM sales_reconciliation_errors
       WHERE reconciliation_id = ?
       ORDER BY \`row_number\`, created_at`,
      [id]
    );

    const workbook = new ExcelJS.Workbook();

    // Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['PetPooja Sales Reconciliation Report']);
    summarySheet.addRow(['Batch Number', reconciliation[0].batch_number]);
    summarySheet.addRow(['Outlet', reconciliation[0].outlet_name]);
    summarySheet.addRow(['Date Range', `${formatDateDDMMYYYY(reconciliation[0].upload_date_from)} to ${formatDateDDMMYYYY(reconciliation[0].upload_date_to)}`]);
    summarySheet.addRow([]);
    summarySheet.addRow(['PetPooja Gross Sales', Number(reconciliation[0].petpooja_gross_sales)]);
    summarySheet.addRow(['PetPooja Net Sales', Number(reconciliation[0].petpooja_net_sales)]);
    summarySheet.addRow(['PetPooja Tax', Number(reconciliation[0].petpooja_tax)]);
    summarySheet.addRow(['Cashbook Total', Number(reconciliation[0].cashbook_total)]);
    summarySheet.addRow(['Difference', Number(reconciliation[0].collection_difference)]);
    summarySheet.addRow(['Tolerance Amount', Number(reconciliation[0].tolerance_amount || 0)]);
    summarySheet.addRow(['Status', reconciliation[0].is_matched ? 'Matched' : 'Mismatched']);
    summarySheet.addRow(['Error Count', Number(reconciliation[0].error_count || 0)]);
    summarySheet.addRow(['Warning Count', Number(reconciliation[0].warning_count || 0)]);

    summarySheet.columns = [{ width: 28 }, { width: 30 }];

    // Errors sheet
    if (errors.length > 0) {
      const errorsSheet = workbook.addWorksheet('Errors');
      const headers = ['Row Number', 'Error Type', 'Severity', 'Item Name', 'Expected Value', 'Actual Value', 'Difference', 'Error Message', 'Created At'];
      const headerRow = errorsSheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

      errors.forEach(error => {
        const row = errorsSheet.addRow([
          error.row_number || '',
          error.error_type,
          error.severity,
          error.item_name || '',
          error.expected_value !== null && error.expected_value !== undefined ? Number(error.expected_value) : '',
          error.actual_value !== null && error.actual_value !== undefined ? Number(error.actual_value) : '',
          error.difference !== null && error.difference !== undefined ? Number(error.difference) : '',
          error.error_message || '',
          error.created_at ? new Date(error.created_at).toLocaleString('en-IN') : ''
        ]);
        row.getCell(8).alignment = { wrapText: true };
      });

      errorsSheet.columns = [
        { width: 14 }, { width: 22 }, { width: 12 }, { width: 28 },
        { width: 16 }, { width: 16 }, { width: 14 }, { width: 60 }, { width: 20 }
      ];
      errorsSheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=reconciliation-${id}-errors.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Download error report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating error report',
      error: error.message
    });
  }
};

// Approve Sales Upload
export const approveSalesUpload = async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    const reconciliation = await query(
      `SELECT * FROM sales_reconciliation_batches WHERE id = ?`,
      [id]
    );

    if (reconciliation.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reconciliation not found'
      });
    }

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(reconciliation[0].outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    if (!reconciliation[0].is_matched || reconciliation[0].status !== 'Matched') {
      return res.status(400).json({
        success: false,
        message: 'Only matched sales reconciliations can be approved.'
      });
    }

    const uploadId = reconciliation[0].upload_id;

    conn = await getConnection();
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE petpooja_sales_uploads
       SET status = 'Approved', approved_by = ?, approved_at = NOW()
       WHERE id = ?`,
      [req.user.id, uploadId]
    );

    await conn.execute(
      `UPDATE sales_reconciliation_batches SET status = 'Approved' WHERE id = ?`,
      [id]
    );

    await conn.execute(
      `INSERT INTO sales_approval_audit (upload_id, action, performed_by, remarks, ip_address)
       VALUES (?, 'Approved', ?, ?, ?)`,
      [uploadId, req.user.id, remarks || 'Sales approved', req.ip]
    );

    await conn.commit();
    conn.release();
    conn = null;

    const upload = await query('SELECT uploaded_by, outlet_id, upload_date_from, upload_date_to FROM petpooja_sales_uploads WHERE id = ?', [uploadId]);
    if (upload.length > 0) {
      await notifyUser({
        userId: upload[0].uploaded_by,
        outletId: upload[0].outlet_id,
        type: 'success',
        title: 'PetPooja Sales Approved',
        message: `Your PetPooja sales upload (${upload[0].upload_date_from} to ${upload[0].upload_date_to}) has been approved.`,
        referenceType: 'petpooja_reconciliation',
        referenceId: id,
        navPath: '/sales/daily-upload'
      });
    }

    res.json({
      success: true,
      message: 'Sales upload approved successfully'
    });
  } catch (error) {
    if (conn) {
      try { await conn.rollback(); } catch (e) { console.error('Approve rollback error:', e); }
      conn.release();
    }
    console.error('Approve sales error:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving sales upload',
      error: error.message
    });
  }
};

// Reject Sales Upload
export const rejectSalesUpload = async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const reconciliation = await query(
      `SELECT * FROM sales_reconciliation_batches WHERE id = ?`,
      [id]
    );

    if (reconciliation.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reconciliation not found'
      });
    }

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(reconciliation[0].outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    const nonRejectableStatuses = ['Approved', 'Rejected'];
    if (nonRejectableStatuses.includes(reconciliation[0].status)) {
      return res.status(400).json({
        success: false,
        message: `Reconciliation cannot be rejected when it is already ${reconciliation[0].status.toLowerCase()}.`
      });
    }

    const uploadId = reconciliation[0].upload_id;

    conn = await getConnection();
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE petpooja_sales_uploads
       SET status = 'Rejected', rejection_reason = ?
       WHERE id = ?`,
      [reason, uploadId]
    );

    await conn.execute(
      `UPDATE sales_reconciliation_batches SET status = 'Rejected', remarks = ? WHERE id = ?`,
      [reason, id]
    );

    await conn.execute(
      `INSERT INTO sales_approval_audit (upload_id, action, performed_by, remarks, ip_address)
       VALUES (?, 'Rejected', ?, ?, ?)`,
      [uploadId, req.user.id, reason, req.ip]
    );

    await conn.commit();
    conn.release();
    conn = null;

    const upload = await query('SELECT uploaded_by, outlet_id, upload_date_from, upload_date_to FROM petpooja_sales_uploads WHERE id = ?', [uploadId]);
    if (upload.length > 0) {
      await notifyUser({
        userId: upload[0].uploaded_by,
        outletId: upload[0].outlet_id,
        type: 'warning',
        title: 'PetPooja Sales Rejected',
        message: `Your PetPooja sales upload (${upload[0].upload_date_from} to ${upload[0].upload_date_to}) was rejected. Reason: ${reason}`,
        referenceType: 'petpooja_reconciliation',
        referenceId: id,
        navPath: '/sales/daily-upload'
      });
    }

    res.json({
      success: true,
      message: 'Sales upload rejected'
    });
  } catch (error) {
    if (conn) {
      try { await conn.rollback(); } catch (e) { console.error('Reject rollback error:', e); }
      conn.release();
    }
    console.error('Reject sales error:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting sales upload',
      error: error.message
    });
  }
};

export const rollbackPetPoojaUpload = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    const uploads = await query(
      `SELECT id, outlet_id, status, batch_number, file_path FROM petpooja_sales_uploads WHERE id = ?`,
      [id]
    );

    if (uploads.length === 0) {
      return res.status(404).json({ success: false, message: 'Upload not found' });
    }

    const upload = uploads[0];

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(upload.outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    if (upload.status === 'Approved') {
      return res.status(400).json({ success: false, message: 'Approved sales uploads cannot be deleted.' });
    }

    if (upload.status === 'Rejected') {
      return res.status(400).json({ success: false, message: 'Rejected sales uploads cannot be deleted.' });
    }

    connection = await getConnection();
    await connection.beginTransaction();
    const q = makeConnQuery(connection);

    const recons = await q(
      `SELECT id FROM sales_reconciliation_batches WHERE upload_id = ?`,
      [id]
    );
    const reconciliationId = recons.length ? recons[0].id : null;

    if (reconciliationId) {
      await q(`DELETE FROM sales_reconciliation_errors WHERE reconciliation_id = ?`, [reconciliationId]);
      await q(`DELETE FROM sales_reconciliation_batches WHERE id = ?`, [reconciliationId]);
    }

    await q(`DELETE FROM sales_approval_audit WHERE upload_id = ?`, [id]);
    await q(`DELETE FROM petpooja_sales_items WHERE upload_id = ?`, [id]);
    await q(`DELETE FROM petpooja_sales_uploads WHERE id = ?`, [id]);

    await connection.commit();
    connection.release();
    connection = null;

    const filePath = upload.file_path ? path.resolve(upload.file_path) : null;
    if (filePath) {
      const baseDir = path.resolve('uploads/petpooja-sales');
      if (filePath.startsWith(baseDir) && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error('Physical file cleanup error:', err);
        }
      }
    }

    res.json({ success: true, message: 'Sales upload rolled back successfully.' });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (e) { console.error('Rollback transaction error:', e); }
      connection.release();
    }
    console.error('Rollback PetPooja sales upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error rolling back sales upload',
      error: error.message
    });
  }
};

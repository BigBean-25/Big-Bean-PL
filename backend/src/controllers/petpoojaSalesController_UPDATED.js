import { query } from '../config/database.js';
import { logAudit } from '../utils/logger.js';
import ExcelJS from 'exceljs';
import path from 'path';

// Generate batch number
const generateBatchNumber = () => {
  const now = new Date();
  return `PP${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
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

// Download PetPooja Excel Template (Updated Format)
export const downloadPetPoojaTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');

    // Row 1: Date range
    worksheet.getRow(1).values = ['Date:', '2026-04-01 to 2026-04-30'];
    
    // Row 2: Report name
    worksheet.getRow(2).values = ['Name:', 'Outlet-Item Wise Report (Row)'];
    
    // Row 3-4: Empty
    
    // Row 5: Headers
    worksheet.getRow(5).values = [
      'Taxable', 'Restaurant', 'Category', 'Item', 'Qty', 
      'My Amount', 'Discount', 'Tax', 'Gross Sales', 'Sap Code'
    ];
    
    // Row 6: Total (example)
    worksheet.getRow(6).values = [
      'Total', '', '', '', 100, 25000, 500, 1225, 25725, ''
    ];
    
    // Row 7-9: Min, Max, Avg (optional)
    
    // Row 10+: Sample data
    worksheet.addRow([
      'Taxable', 'Big Bean cafe', 'Beverage', 'Cappuccino', 
      50, 7500, 0, 375, 7875, 'CAP001'
    ]);
    worksheet.addRow([
      'Taxable', 'Big Bean cafe', 'Food', 'Sandwich', 
      30, 4500, 100, 220, 4620, 'SAN001'
    ]);

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
      { width: 10 }, { width: 20 }, { width: 15 }, { width: 30 },
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

// Upload PetPooja Sales (Updated for Actual Format)
export const uploadPetPoojaSales = async (req, res) => {
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

    // Extract totals from Row 6
    const totalRow = worksheet.getRow(6);
    const totals = {
      quantity: parseFloat(totalRow.getCell(5).value) || 0,
      net_amount: parseFloat(totalRow.getCell(6).value) || 0,
      discount: parseFloat(totalRow.getCell(7).value) || 0,
      tax: parseFloat(totalRow.getCell(8).value) || 0,
      gross_sales: parseFloat(totalRow.getCell(9).value) || 0
    };

    // Parse items starting from Row 10
    const salesItems = [];
    const errors = [];
    let itemCount = 0;

    for (let rowNum = 10; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      const firstCell = row.getCell(1).value;

      // Skip if not a data row (must start with "Taxable")
      if (firstCell !== 'Taxable') continue;

      const rowData = {
        outlet_name: row.getCell(2).value,
        category: row.getCell(3).value,
        item_name: row.getCell(4).value,
        quantity: parseFloat(row.getCell(5).value) || 0,
        net_amount: parseFloat(row.getCell(6).value) || 0,
        discount: parseFloat(row.getCell(7).value) || 0,
        tax: parseFloat(row.getCell(8).value) || 0,
        gross_sales: parseFloat(row.getCell(9).value) || 0,
        sap_code: row.getCell(10).value || null
      };

      // Validation
      if (!rowData.item_name) {
        errors.push({
          row: rowNum,
          type: 'Missing Item Name',
          message: 'Item name is required'
        });
        continue;
      }

      // Validate gross sales formula: Gross = Net + Tax
      const expectedGross = rowData.net_amount + rowData.tax;
      if (Math.abs(rowData.gross_sales - expectedGross) > 0.01) {
        errors.push({
          row: rowNum,
          type: 'Gross Sales Formula Error',
          message: `Gross sales mismatch. Expected: ${expectedGross.toFixed(2)}, Got: ${rowData.gross_sales}`,
          severity: 'Warning'
        });
      }

      // Validate quantity
      if (rowData.quantity <= 0) {
        errors.push({
          row: rowNum,
          type: 'Invalid Quantity',
          message: 'Quantity must be greater than 0',
          severity: 'Warning'
        });
      }

      // Validate tax percentage (should be around 5%)
      if (rowData.net_amount > 0) {
        const taxPercent = (rowData.tax / rowData.net_amount) * 100;
        if (taxPercent < 0 || taxPercent > 30) {
          errors.push({
            row: rowNum,
            type: 'Tax Validation',
            message: `Tax percentage (${taxPercent.toFixed(2)}%) seems unusual`,
            severity: 'Warning'
          });
        }
      }

      salesItems.push(rowData);
      itemCount++;
    }

    if (salesItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid sales items found in the Excel file'
      });
    }

    // Verify totals match
    const calculatedTotals = salesItems.reduce((acc, item) => ({
      quantity: acc.quantity + item.quantity,
      net_amount: acc.net_amount + item.net_amount,
      discount: acc.discount + item.discount,
      tax: acc.tax + item.tax,
      gross_sales: acc.gross_sales + item.gross_sales
    }), { quantity: 0, net_amount: 0, discount: 0, tax: 0, gross_sales: 0 });

    // Check if calculated totals match Row 6 totals
    if (Math.abs(calculatedTotals.gross_sales - totals.gross_sales) > 1) {
      errors.push({
        type: 'Total Mismatch',
        message: `Calculated gross sales (₹${calculatedTotals.gross_sales.toFixed(2)}) does not match total in Row 6 (₹${totals.gross_sales.toFixed(2)})`,
        severity: 'Error'
      });
    }

    // Create upload batch
    const batchNumber = generateBatchNumber();
    const uploadResult = await query(
      `INSERT INTO petpooja_sales_uploads 
       (batch_number, upload_date, outlet_id, file_name, file_path, total_items,
        gross_sales, total_discount, net_sales, total_tax, final_collection,
        status, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
      [
        batchNumber,
        dateRange.from,
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
      await query(
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
    await query(
      `INSERT INTO sales_approval_audit (upload_id, action, performed_by, remarks, ip_address)
       VALUES (?, 'Uploaded', ?, ?, ?)`,
      [uploadId, req.user.id, `Uploaded ${itemCount} items for ${dateRange.from} to ${dateRange.to}`, req.ip]
    );

    // Trigger reconciliation
    await reconcileSales(uploadId, outlet_id, dateRange.from, dateRange.to);

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
        errors: errors.length,
        warnings: errors.filter(e => e.severity === 'Warning').length
      }
    });
  } catch (error) {
    console.error('Upload PetPooja sales error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading sales data',
      error: error.message
    });
  }
};

// Reconcile Sales with Cashbook (Updated for Date Range)
const reconcileSales = async (uploadId, outletId, dateFrom, dateTo) => {
  try {
    // Get PetPooja totals
    const petpoojaData = await query(
      `SELECT gross_sales, total_discount, net_sales, total_tax, final_collection
       FROM petpooja_sales_uploads WHERE id = ?`,
      [uploadId]
    );

    if (petpoojaData.length === 0) return;

    const petpooja = petpoojaData[0];

    // Get Cashbook totals for the date range
    const cashbookData = await query(
      `SELECT SUM(total_sales) as total_sales
       FROM daily_cashbooks
       WHERE outlet_id = ? AND date BETWEEN ? AND ?`,
      [outletId, dateFrom, dateTo]
    );

    const cashbookTotal = cashbookData.length > 0 ? parseFloat(cashbookData[0].total_sales) || 0 : 0;
    const difference = petpooja.final_collection - cashbookTotal;
    
    // Calculate tolerance based on number of days
    const daysDiff = Math.ceil((new Date(dateTo) - new Date(dateFrom)) / (1000 * 60 * 60 * 24)) + 1;
    const tolerance = daysDiff * 10; // ₹10 per day
    
    const isMatched = Math.abs(difference) <= tolerance;

    // Create reconciliation batch
    const reconResult = await query(
      `INSERT INTO sales_reconciliation_batches
       (upload_id, outlet_id, reconciliation_date,
        petpooja_gross_sales, petpooja_discount, petpooja_net_sales, petpooja_tax, petpooja_final_collection,
        cashbook_total, is_matched, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        isMatched,
        isMatched ? 'Matched' : 'Mismatched'
      ]
    );

    const reconciliationId = reconResult.insertId;

    // If mismatched, create error
    if (!isMatched) {
      await query(
        `INSERT INTO sales_reconciliation_errors
         (reconciliation_id, upload_id, error_type, severity, expected_value, actual_value, difference, error_message)
         VALUES (?, ?, 'Collection Mismatch', 'Error', ?, ?, ?, ?)`,
        [
          reconciliationId,
          uploadId,
          cashbookTotal,
          petpooja.final_collection,
          difference,
          `Collection mismatch for ${dateFrom} to ${dateTo}: PetPooja ₹${petpooja.final_collection} vs Cashbook ₹${cashbookTotal}. Difference: ₹${difference.toFixed(2)}`
        ]
      );

      await query(
        `UPDATE sales_reconciliation_batches SET error_count = 1 WHERE id = ?`,
        [reconciliationId]
      );
    }

    // Update upload status
    await query(
      `UPDATE petpooja_sales_uploads SET status = 'Reconciling' WHERE id = ?`,
      [uploadId]
    );

    return reconciliationId;
  } catch (error) {
    console.error('Reconciliation error:', error);
    throw error;
  }
};

// Export other functions (getReconciliations, approve, reject, etc.) from previous implementation
// These remain largely the same, just updated to work with the new data structure

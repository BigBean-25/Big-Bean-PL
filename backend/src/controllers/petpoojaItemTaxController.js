import { query, getConnection } from '../config/database.js';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { assertDateRangeEditable } from '../utils/periodLock.js';
import { isOwnDocument } from '../utils/makerChecker.js';
import { logAudit } from '../utils/logger.js';

const generateBatchNumber = () => {
  const now = new Date();
  // Millisecond + random suffix: the timestamp alone has second resolution,
  // so two uploads in the same second collided on the UNIQUE batch_number
  // and surfaced as a 500.
  return `PPT${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}${Math.floor(Math.random() * 1000)}`;
};

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

const makeConnQuery = (connection) => async (sql, params) => {
  const [results] = await connection.execute(sql, params);
  return results;
};

// Download a template matching PetPooja's real "Restaurant Item Wise Tax
// Report" export shape: Name/Restaurant Name/Restaurant Address header rows,
// then a header row, then data. Unlike the sales upload formats, this export
// carries no embedded date range - the uploader supplies the period.
export const downloadItemTaxTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');

    worksheet.getRow(1).values = ['Name:', 'Restaurant Item Wise Tax Report'];
    worksheet.getRow(2).values = ['Restaurant Name:', 'Big Bean cafe'];
    worksheet.getRow(3).values = ['Restaurant Address:', ''];
    worksheet.getRow(5).values = ['Category', 'Item Name', 'Qty', 'Net Amount (₹)', '100% Disc Qty.', 'Total Discount (₹)', 'CGST@2.5% (₹)', 'SGST@2.5% (₹)', 'Tax (%)', 'Total Tax (₹)', 'Total Amount (₹)'];
    worksheet.getRow(6).values = ['Bakery', 'Chocochip Cookies', 7, 1050.0, 0, 0.0, 26.25, 26.25, 5, 52.5, 1102.5];

    worksheet.getRow(5).font = { bold: true };
    worksheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

    worksheet.columns = [
      { width: 18 }, { width: 28 }, { width: 8 }, { width: 14 },
      { width: 12 }, { width: 14 }, { width: 14 }, { width: 14 },
      { width: 10 }, { width: 12 }, { width: 14 }
    ];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=PetPooja_Item_Tax_Report_Template.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Download item tax template error:', error);
    res.status(500).json({ success: false, message: 'Error generating template' });
  }
};

// Phase 5D2B4: an active candidate (Draft, Submitted or Verified) blocks
// another upload covering the same range; a Rejected upload no longer has
// any report effect, so it must not block its own replacement - it stays
// on file purely for audit.
const checkOverlap = async (outletId, from, to) => {
  const rows = await query(
    `SELECT id, batch_number,
            DATE_FORMAT(upload_date_from, '%Y-%m-%d') AS upload_date_from,
            DATE_FORMAT(upload_date_to, '%Y-%m-%d') AS upload_date_to
     FROM petpooja_item_tax_uploads
     WHERE outlet_id = ?
       AND approval_status <> 'Rejected'
       AND upload_date_from <= ? AND upload_date_to >= ?
     LIMIT 1`,
    [outletId, to, from]
  );
  return rows[0] || null;
};

export const uploadItemTaxReport = async (req, res) => {
  let connection = null;
  try {
    const { outlet_id, from_date, to_date } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    if (!outlet_id) return res.status(400).json({ success: false, message: 'Outlet is required' });
    if (!from_date || !to_date) {
      return res.status(400).json({ success: false, message: 'From date and to date are required - this PetPooja report does not carry an embedded date range' });
    }
    if (from_date > to_date) {
      return res.status(400).json({ success: false, message: `Invalid date range - from date ${from_date} is after to date ${to_date}` });
    }

    if (!/\.xlsx$/i.test(file.originalname)) {
      return res.status(400).json({ success: false, message: 'Please upload a .xlsx PetPooja export' });
    }

    const existing = await checkOverlap(outlet_id, from_date, to_date);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `An item tax report already covers part of this range for this outlet (batch ${existing.batch_number}, ${existing.upload_date_from} to ${existing.upload_date_to}). Delete it first if you need to re-upload.`
      });
    }

    await assertDateRangeEditable(outlet_id, from_date, to_date, 'An item tax upload');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file.path);
    const worksheet = workbook.getWorksheet(1);

    // Data rows start at Row 6 - Row 5 is the header
    // (Category | Item Name | Qty | Net Amount | 100% Disc Qty | Total Discount |
    //  CGST | SGST | Tax % | Total Tax | Total Amount)
    const items = [];
    const skipped = [];
    for (let rowNum = 6; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      const itemName = row.getCell(2).value ? row.getCell(2).value.toString().trim() : '';
      if (!itemName) continue;

      const category = row.getCell(1).value ? row.getCell(1).value.toString().trim() : '';
      const quantity = parseFloat(row.getCell(3).value) || 0;
      const netAmount = parseFloat(row.getCell(4).value) || 0;
      const discQty = parseFloat(row.getCell(5).value) || 0;
      const totalDiscount = parseFloat(row.getCell(6).value) || 0;
      const cgst = parseFloat(row.getCell(7).value) || 0;
      const sgst = parseFloat(row.getCell(8).value) || 0;
      const taxRate = parseFloat(row.getCell(9).value) || 0;
      const totalTax = parseFloat(row.getCell(10).value) || 0;
      const totalAmount = parseFloat(row.getCell(11).value) || 0;

      if (netAmount < 0 || cgst < 0 || sgst < 0 || totalTax < 0 || totalAmount < 0) {
        skipped.push({ row: rowNum, item_name: itemName, reason: 'Negative amount' });
        continue;
      }

      items.push({
        category, item_name: itemName, quantity, net_amount: netAmount,
        disc_qty: discQty, total_discount: totalDiscount, cgst, sgst,
        tax_rate: taxRate, total_tax: totalTax, total_amount: totalAmount
      });
    }

    if (items.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid item rows found in the Excel file (expected data from Row 6 onward)' });
    }

    const totals = items.reduce((acc, it) => ({
      net_amount: acc.net_amount + it.net_amount,
      cgst: acc.cgst + it.cgst,
      sgst: acc.sgst + it.sgst,
      total_tax: acc.total_tax + it.total_tax,
      total_amount: acc.total_amount + it.total_amount
    }), { net_amount: 0, cgst: 0, sgst: 0, total_tax: 0, total_amount: 0 });

    connection = await getConnection();
    await connection.beginTransaction();
    const q = makeConnQuery(connection);

    try {
      const batchNumber = generateBatchNumber();
      const uploadResult = await q(
        `INSERT INTO petpooja_item_tax_uploads
         (batch_number, outlet_id, upload_date_from, upload_date_to, file_name, file_path, total_items,
          total_net_amount, total_cgst, total_sgst, total_tax, total_amount, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchNumber, outlet_id, from_date, to_date, file.originalname, file.path, items.length,
          totals.net_amount, totals.cgst, totals.sgst, totals.total_tax, totals.total_amount, req.user.id
        ]
      );
      const uploadId = uploadResult.insertId;

      for (const it of items) {
        await q(
          `INSERT INTO petpooja_item_tax_items
           (upload_id, outlet_id, category, item_name, quantity, net_amount, disc_qty, total_discount, cgst, sgst, tax_rate, total_tax, total_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uploadId, outlet_id, it.category, it.item_name, it.quantity, it.net_amount, it.disc_qty, it.total_discount, it.cgst, it.sgst, it.tax_rate, it.total_tax, it.total_amount]
        );
      }

      await connection.commit();

      res.status(201).json({
        success: true,
        message: 'Item tax report uploaded successfully',
        data: {
          upload_id: uploadId,
          batch_number: batchNumber,
          from_date, to_date,
          total_items: items.length,
          skipped_rows: skipped.length,
          totals
        }
      });
    } catch (txError) {
      await connection.rollback();
      throw txError;
    } finally {
      connection.release();
      connection = null;
    }
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch {}
      try { connection.release(); } catch {}
    }
    console.error('Upload item tax report error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error uploading item tax report' });
  }
};

export const getItemTaxUploads = async (req, res) => {
  try {
    const { outlet_id, from_date, to_date } = req.query;
    let where = '1=1';
    const params = [];
    if (outlet_id && outlet_id !== 'all') { where += ' AND itu.outlet_id = ?'; params.push(outlet_id); }
    if (from_date) { where += ' AND itu.upload_date_to >= ?'; params.push(from_date); }
    if (to_date) { where += ' AND itu.upload_date_from <= ?'; params.push(to_date); }

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all) {
      if (outletScope.outletIds.length === 0) return res.json({ success: true, data: [] });
      where += ` AND itu.outlet_id IN (${outletScope.outletIds.map(() => '?').join(',')})`;
      params.push(...outletScope.outletIds);
    }

    const rows = await query(
      `SELECT itu.id, itu.batch_number, itu.outlet_id, o.outlet_name,
              DATE_FORMAT(itu.upload_date_from, '%Y-%m-%d') AS upload_date_from,
              DATE_FORMAT(itu.upload_date_to, '%Y-%m-%d') AS upload_date_to,
              itu.file_name, itu.total_items, itu.total_net_amount, itu.total_cgst,
              itu.total_sgst, itu.total_tax, itu.total_amount, itu.created_at,
              itu.approval_status, itu.submitted_by, itu.submitted_at, itu.verified_at, itu.rejected_at,
              itu.rejection_reason, itu.uploaded_by,
              u.full_name AS uploaded_by_name,
              su.full_name AS submitted_by_name,
              vu.full_name AS verified_by_name,
              ru.full_name AS rejected_by_name
       FROM petpooja_item_tax_uploads itu
       JOIN outlets o ON o.id = itu.outlet_id
       LEFT JOIN users u ON u.id = itu.uploaded_by
       LEFT JOIN users su ON su.id = itu.submitted_by
       LEFT JOIN users vu ON vu.id = itu.verified_by
       LEFT JOIN users ru ON ru.id = itu.rejected_by
       WHERE ${where}
       ORDER BY itu.created_at DESC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get item tax uploads error:', error);
    res.status(500).json({ success: false, message: 'Error fetching item tax uploads' });
  }
};

export const getItemTaxUploadById = async (req, res) => {
  try {
    const { id } = req.params;
    const uploads = await query(
      `SELECT itu.*, o.outlet_name,
              DATE_FORMAT(itu.upload_date_from, '%Y-%m-%d') AS upload_date_from,
              DATE_FORMAT(itu.upload_date_to, '%Y-%m-%d') AS upload_date_to
       FROM petpooja_item_tax_uploads itu
       JOIN outlets o ON o.id = itu.outlet_id
       WHERE itu.id = ?`,
      [id]
    );
    if (uploads.length === 0) return res.status(404).json({ success: false, message: 'Upload not found' });

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(uploads[0].outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    const items = await query(
      `SELECT id, category, item_name, quantity, net_amount, disc_qty, total_discount, cgst, sgst, tax_rate, total_tax, total_amount
       FROM petpooja_item_tax_items WHERE upload_id = ? ORDER BY id`,
      [id]
    );

    res.json({ success: true, data: { upload: uploads[0], items } });
  } catch (error) {
    console.error('Get item tax upload error:', error);
    res.status(500).json({ success: false, message: 'Error fetching item tax upload' });
  }
};

export const deleteItemTaxUpload = async (req, res) => {
  let connection = null;
  try {
    const { id } = req.params;
    const uploads = await query(
      `SELECT id, outlet_id, file_path, approval_status,
              DATE_FORMAT(upload_date_from, '%Y-%m-%d') AS upload_date_from,
              DATE_FORMAT(upload_date_to, '%Y-%m-%d') AS upload_date_to
       FROM petpooja_item_tax_uploads WHERE id = ?`,
      [id]
    );
    if (uploads.length === 0) return res.status(404).json({ success: false, message: 'Upload not found' });

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(uploads[0].outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    // Phase 5D2B4: Submitted is under checker review and Verified is the
    // active precise-tax source - neither can be hard-deleted. Draft and
    // Rejected stay deletable subject to the period lock. Corrections to a
    // Verified upload require a future controlled reversal flow.
    if (['Submitted', 'Verified'].includes(uploads[0].approval_status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete an upload with approval status "${uploads[0].approval_status}".`
      });
    }

    await assertDateRangeEditable(uploads[0].outlet_id, uploads[0].upload_date_from, uploads[0].upload_date_to, 'An item tax upload');

    connection = await getConnection();
    await connection.beginTransaction();
    await connection.execute('DELETE FROM petpooja_item_tax_items WHERE upload_id = ?', [id]);
    await connection.execute('DELETE FROM petpooja_item_tax_uploads WHERE id = ?', [id]);
    await connection.commit();
    connection.release();
    connection = null;

    const filePath = uploads[0].file_path ? path.resolve(uploads[0].file_path) : null;
    if (filePath) {
      const baseDir = path.resolve('uploads/petpooja-item-tax');
      if (filePath.startsWith(baseDir) && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (err) { console.error('Item tax file cleanup error:', err); }
      }
    }

    res.json({ success: true, message: 'Item tax report deleted' });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch {}
      try { connection.release(); } catch {}
    }
    console.error('Delete item tax upload error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Error deleting item tax upload' });
  }
};

// ---------------------------------------------------------------------------
// Phase 5D2B4: maker-checker approval workflow for item tax uploads.
//
// Unlike the uploadController upload types, item tax uploads have no
// technical status column - a row only exists after a fully parsed insert,
// so every upload is workflow-eligible and approval_status alone gates the
// precise-tax effect. Verified is terminal; corrections need a future
// controlled reversal flow, not ordinary delete/reject.
// ---------------------------------------------------------------------------

const transitionItemTaxUpload = async (req, res, action) => {
  try {
    const { id } = req.params;
    const uploads = await query(
      `SELECT id, outlet_id, uploaded_by, approval_status,
              DATE_FORMAT(upload_date_from, '%Y-%m-%d') AS upload_date_from,
              DATE_FORMAT(upload_date_to, '%Y-%m-%d') AS upload_date_to
       FROM petpooja_item_tax_uploads WHERE id = ?`,
      [id]
    );
    if (uploads.length === 0) return res.status(404).json({ success: false, message: 'Upload not found' });
    const record = uploads[0];

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(record.outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    // The period can be finalized after upload but before the checker acts,
    // so the range lock is re-checked on every transition.
    await assertDateRangeEditable(record.outlet_id, record.upload_date_from, record.upload_date_to, 'An item tax upload');

    if (action === 'submit') {
      if (!['Draft', 'Rejected'].includes(record.approval_status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot submit an upload with approval status "${record.approval_status}". Only Draft or Rejected uploads can be submitted.`
        });
      }

      const result = await query(
        `UPDATE petpooja_item_tax_uploads
         SET approval_status = 'Submitted', submitted_by = ?, submitted_at = NOW(),
             rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL
         WHERE id = ? AND approval_status IN ('Draft', 'Rejected')`,
        [req.user.id, id]
      );

      if (result.affectedRows === 0) {
        return res.status(400).json({ success: false, message: 'Upload could not be submitted in its current state' });
      }

      await logAudit(req.user.id, 'SUBMIT', 'petpooja_item_tax_uploads', id, record, { approval_status: 'Submitted', submitted_by: req.user.id }, 'Submitted item tax upload for verification');
      return res.status(200).json({ success: true, message: 'Upload submitted for verification' });
    }

    if (record.approval_status !== 'Submitted') {
      return res.status(400).json({
        success: false,
        message: `Cannot ${action} an upload with approval status "${record.approval_status}". Only Submitted uploads can be ${action === 'verify' ? 'verified' : 'rejected'}.`
      });
    }

    if (isOwnDocument(record, req.user.id, 'uploaded_by')) {
      return res.status(403).json({
        success: false,
        message: `You cannot ${action} your own upload (maker-checker rule).`
      });
    }

    if (action === 'verify') {
      const result = await query(
        `UPDATE petpooja_item_tax_uploads
         SET approval_status = 'Verified', verified_by = ?, verified_at = NOW()
         WHERE id = ? AND approval_status = 'Submitted'`,
        [req.user.id, id]
      );

      if (result.affectedRows === 0) {
        return res.status(400).json({ success: false, message: 'Upload could not be verified in its current state' });
      }

      await logAudit(req.user.id, 'VERIFY', 'petpooja_item_tax_uploads', id, record, { approval_status: 'Verified', verified_by: req.user.id }, 'Verified item tax upload');
      return res.status(200).json({ success: true, message: 'Upload verified' });
    }

    // reject
    const { rejection_reason } = req.body || {};
    if (!rejection_reason || !String(rejection_reason).trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    const result = await query(
      `UPDATE petpooja_item_tax_uploads
       SET approval_status = 'Rejected', rejected_by = ?, rejected_at = NOW(), rejection_reason = ?
       WHERE id = ? AND approval_status = 'Submitted'`,
      [req.user.id, String(rejection_reason).trim(), id]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ success: false, message: 'Upload could not be rejected in its current state' });
    }

    await logAudit(req.user.id, 'REJECT', 'petpooja_item_tax_uploads', id, record, { approval_status: 'Rejected', rejected_by: req.user.id, rejection_reason: String(rejection_reason).trim() }, 'Rejected item tax upload');
    return res.status(200).json({ success: true, message: 'Upload rejected' });
  } catch (error) {
    console.error(`${action} item tax upload error:`, error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || `Error during ${action}` });
  }
};

export const submitItemTaxUpload = (req, res) => transitionItemTaxUpload(req, res, 'submit');
export const verifyItemTaxUpload = (req, res) => transitionItemTaxUpload(req, res, 'verify');
export const rejectItemTaxUpload = (req, res) => transitionItemTaxUpload(req, res, 'reject');

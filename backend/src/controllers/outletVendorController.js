import { query, getConnection } from '../config/database.js';
import { logAudit } from '../utils/logger.js';
import { validateContactFields } from '../utils/validators.js';
import { getVendorLedgerSummary, getAllVendorOutstanding, getVendorAgeing, getOpeningBalance } from '../services/outletVendorLedgerService.js';
import { assertDateEditable } from '../utils/periodLock.js';
import { isOwnDocument } from '../utils/makerChecker.js';

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const isAllOutlets = (v) => !v || v === 'all';

// 7D3A1: credit_days must be a non-negative integer (no arbitrary max)
const isValidCreditDays = (v) => Number.isInteger(Number(v)) && Number(v) >= 0;

// due_date snapshot = purchase_date + vendor credit_days at creation time.
// Once stored it never moves when vendor credit_days changes later.
const computeDueDate = (dateStr, creditDays) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + num(creditDays));
  return d.toISOString().slice(0, 10);
};

const generatePurchaseNo = async () => {
  const year = new Date().getFullYear();
  const prefix = `OVP-${year}-`;
  const rows = await query("SELECT purchase_no FROM outlet_vendor_purchases WHERE purchase_no LIKE ? ORDER BY purchase_no DESC LIMIT 1", [`${prefix}%`]);
  let next = 1;
  if (rows.length > 0) {
    const last = String(rows[0].purchase_no).split('-').pop();
    next = Number(last) + 1 || 1;
  }
  return `${prefix}${String(next).padStart(5, '0')}`;
};

// --- Vendor master ---

export const getVendors = async (req, res) => {
  try {
    const { search = '', category = '', is_active } = req.query;
    let where = '1=1';
    const params = [];
    if (search) { where += ' AND vendor_name LIKE ?'; params.push(`%${search}%`); }
    if (category) { where += ' AND category = ?'; params.push(category); }
    if (is_active !== undefined) { where += ' AND is_active = ?'; params.push(is_active); }
    const rows = await query(`SELECT * FROM outlet_vendors WHERE ${where} ORDER BY vendor_name`, params);
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Get outlet vendors error:', error);
    res.status(500).json({ success: false, message: 'Error fetching vendors' });
  }
};

export const getVendorById = async (req, res) => {
  try {
    const rows = await query('SELECT * FROM outlet_vendors WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Vendor not found' });
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get outlet vendor error:', error);
    res.status(500).json({ success: false, message: 'Error fetching vendor' });
  }
};

export const createVendor = async (req, res) => {
  try {
    const { vendor_code, vendor_name, category, credit_days, phone, email, address, city, state, pincode, gstin } = req.body;
    if (!vendor_name || !String(vendor_name).trim()) {
      return res.status(400).json({ success: false, message: 'Vendor name is required' });
    }
    if (credit_days !== undefined && !isValidCreditDays(credit_days)) {
      return res.status(400).json({ success: false, message: 'Credit days must be a non-negative integer' });
    }
    const contactError = validateContactFields({ gstin, email, phone });
    if (contactError) return res.status(400).json({ success: false, message: contactError });

    const result = await query(
      `INSERT INTO outlet_vendors (vendor_code, vendor_name, category, credit_days, phone, email, address, city, state, pincode, gstin, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [vendor_code || null, vendor_name.trim(), category || 'Other', num(credit_days), phone || null, email || null, address || null, city || null, state || null, pincode || null, gstin || null, req.user.id]
    );
    await logAudit(req.user.id, 'CREATE', 'outlet_vendors', result.insertId, null, req.body, 'Created outlet vendor');
    res.status(201).json({ success: true, message: 'Vendor created successfully', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create outlet vendor error:', error);
    res.status(error.code === 'ER_DUP_ENTRY' ? 400 : 500).json({ success: false, message: error.code === 'ER_DUP_ENTRY' ? 'Vendor code already exists' : 'Error creating vendor' });
  }
};

export const updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT * FROM outlet_vendors WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const { vendor_code, vendor_name, category, credit_days, phone, email, address, city, state, pincode, gstin, is_active } = req.body;
    if (vendor_name !== undefined && !String(vendor_name).trim()) {
      return res.status(400).json({ success: false, message: 'Vendor name is required' });
    }
    if (credit_days !== undefined && !isValidCreditDays(credit_days)) {
      return res.status(400).json({ success: false, message: 'Credit days must be a non-negative integer' });
    }
    const contactError = validateContactFields({ gstin, email, phone });
    if (contactError) return res.status(400).json({ success: false, message: contactError });

    await query(
      `UPDATE outlet_vendors SET vendor_code = ?, vendor_name = ?, category = ?, credit_days = ?, phone = ?, email = ?, address = ?, city = ?, state = ?, pincode = ?, gstin = ?, is_active = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        vendor_code !== undefined ? vendor_code : existing[0].vendor_code,
        vendor_name !== undefined ? vendor_name.trim() : existing[0].vendor_name,
        category !== undefined ? category : existing[0].category,
        credit_days !== undefined ? num(credit_days) : existing[0].credit_days,
        phone !== undefined ? phone : existing[0].phone,
        email !== undefined ? email : existing[0].email,
        address !== undefined ? address : existing[0].address,
        city !== undefined ? city : existing[0].city,
        state !== undefined ? state : existing[0].state,
        pincode !== undefined ? pincode : existing[0].pincode,
        gstin !== undefined ? gstin : existing[0].gstin,
        is_active !== undefined ? Number(Boolean(is_active)) : existing[0].is_active,
        id,
      ]
    );
    await logAudit(req.user.id, 'UPDATE', 'outlet_vendors', id, existing[0], req.body, 'Updated outlet vendor');
    res.status(200).json({ success: true, message: 'Vendor updated successfully' });
  } catch (error) {
    console.error('Update outlet vendor error:', error);
    res.status(500).json({ success: false, message: 'Error updating vendor' });
  }
};

export const deleteVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT * FROM outlet_vendors WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Vendor not found' });
    await query('DELETE FROM outlet_vendors WHERE id = ?', [id]);
    await logAudit(req.user.id, 'DELETE', 'outlet_vendors', id, existing[0], null, 'Deleted outlet vendor');
    res.status(200).json({ success: true, message: 'Vendor deleted successfully' });
  } catch (error) {
    console.error('Delete outlet vendor error:', error);
    res.status(error.code === 'ER_ROW_IS_REFERENCED_2' ? 400 : 500).json({ success: false, message: error.code === 'ER_ROW_IS_REFERENCED_2' ? 'Cannot delete vendor - purchases/payments exist against it' : 'Error deleting vendor' });
  }
};

// --- Purchases (quick entry, also used for emergency/cash purchases) ---

export const getVendorPurchases = async (req, res) => {
  try {
    const { outlet_id, vendor_id, from_date, to_date, is_emergency, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let where = '1=1';
    const params = [];
    if (outlet_id && !isAllOutlets(outlet_id)) { where += ' AND ovp.outlet_id = ?'; params.push(outlet_id); }
    if (vendor_id) { where += ' AND ovp.vendor_id = ?'; params.push(vendor_id); }
    if (from_date) { where += ' AND ovp.purchase_date >= ?'; params.push(from_date); }
    if (to_date) { where += ' AND ovp.purchase_date <= ?'; params.push(to_date); }
    if (is_emergency !== undefined) { where += ' AND ovp.is_emergency = ?'; params.push(is_emergency); }

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all) {
      if (outletScope.outletIds.length === 0) return res.status(200).json({ success: true, data: [] });
      where += ` AND ovp.outlet_id IN (${outletScope.outletIds.map(() => '?').join(',')})`;
      params.push(...outletScope.outletIds);
    }

    const rows = await query(
      `SELECT ovp.*, DATE_FORMAT(ovp.purchase_date, '%Y-%m-%d') as purchase_date,
        o.outlet_name, v.vendor_name, v.category as vendor_category, pm.mode_name as payment_mode_name,
        u.full_name as created_by_name
       FROM outlet_vendor_purchases ovp
       LEFT JOIN outlets o ON o.id = ovp.outlet_id
       LEFT JOIN outlet_vendors v ON v.id = ovp.vendor_id
       LEFT JOIN payment_modes pm ON pm.id = ovp.payment_mode_id
       LEFT JOIN users u ON u.id = ovp.created_by
       WHERE ${where}
       ORDER BY ovp.purchase_date DESC, ovp.id DESC
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Get vendor purchases error:', error);
    res.status(500).json({ success: false, message: 'Error fetching vendor purchases' });
  }
};

export const createVendorPurchase = async (req, res) => {
  try {
    const { outlet_id, vendor_id, purchase_date, description, amount, paid_by, payment_mode_id, is_emergency, invoice_no, remarks } = req.body;

    if (!outlet_id || !vendor_id || !purchase_date || !description || !String(description).trim()) {
      return res.status(400).json({ success: false, message: 'Outlet, vendor, date and description are required' });
    }
    if (Number.isNaN(Number(amount)) || num(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a positive number' });
    }

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to the requested outlet' });
    }

    const vendorRows = await query('SELECT id, is_active, credit_days FROM outlet_vendors WHERE id = ?', [vendor_id]);
    if (!vendorRows.length) return res.status(400).json({ success: false, message: 'Vendor not found' });
    if (Number(vendorRows[0].is_active) !== 1) return res.status(400).json({ success: false, message: 'Selected vendor is not active' });

    await assertDateEditable(outlet_id, purchase_date, 'An outlet vendor purchase');

    // 7D3A1: persist the due-date snapshot so later vendor credit_days edits
    // cannot move this purchase's due date.
    const dueDate = computeDueDate(purchase_date, vendorRows[0].credit_days);
    const purchaseNo = await generatePurchaseNo();
    const result = await query(
      `INSERT INTO outlet_vendor_purchases (purchase_no, outlet_id, vendor_id, purchase_date, description, amount, paid_by, payment_mode_id, is_emergency, invoice_no, due_date, remarks, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        purchaseNo, outlet_id, vendor_id, purchase_date, String(description).trim(), num(amount),
        paid_by === 'Management' ? 'Management' : 'Outlet',
        payment_mode_id || null, is_emergency ? 1 : 0, invoice_no || null, dueDate, remarks || null, req.user.id,
      ]
    );
    await logAudit(req.user.id, 'CREATE', 'outlet_vendor_purchases', result.insertId, null, req.body, 'Created outlet vendor purchase');
    res.status(201).json({ success: true, message: 'Purchase recorded successfully', data: { id: result.insertId, purchase_no: purchaseNo } });
  } catch (error) {
    console.error('Create vendor purchase error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Error recording purchase' });
  }
};

export const createVendorPurchasesBatch = async (req, res) => {
  try {
    const { outlet_id, purchase_date, items } = req.body;

    if (!outlet_id || !purchase_date) {
      return res.status(400).json({ success: false, message: 'Outlet and date are required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one purchase item is required' });
    }

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to the requested outlet' });
    }

    await assertDateEditable(outlet_id, purchase_date, 'An outlet vendor purchase');

    // Validate every row up front so a bad row further down the list fails
    // the whole batch before anything is inserted.
    const validatedItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      const rowLabel = `Item ${i + 1}`;
      const { vendor_id, description, amount, paid_by, payment_mode_id, is_emergency, invoice_no, remarks } = item;

      if (!vendor_id || !description || !String(description).trim()) {
        return res.status(400).json({ success: false, message: `${rowLabel}: vendor and description are required` });
      }
      if (Number.isNaN(Number(amount)) || num(amount) <= 0) {
        return res.status(400).json({ success: false, message: `${rowLabel}: amount must be a positive number` });
      }

      const vendorRows = await query('SELECT id, is_active, credit_days FROM outlet_vendors WHERE id = ?', [vendor_id]);
      if (!vendorRows.length) return res.status(400).json({ success: false, message: `${rowLabel}: vendor not found` });
      if (Number(vendorRows[0].is_active) !== 1) return res.status(400).json({ success: false, message: `${rowLabel}: selected vendor is not active` });

      validatedItems.push({
        vendor_id,
        due_date: computeDueDate(purchase_date, vendorRows[0].credit_days),
        description: String(description).trim(),
        amount: num(amount),
        paid_by: paid_by === 'Management' ? 'Management' : 'Outlet',
        payment_mode_id: payment_mode_id || null,
        is_emergency: is_emergency ? 1 : 0,
        invoice_no: invoice_no || null,
        remarks: remarks || null,
      });
    }

    const year = new Date().getFullYear();
    const prefix = `OVP-${year}-`;

    const conn = await getConnection();
    const created = [];
    try {
      await conn.beginTransaction();
      const [lastRows] = await conn.execute(
        "SELECT purchase_no FROM outlet_vendor_purchases WHERE purchase_no LIKE ? ORDER BY purchase_no DESC LIMIT 1",
        [`${prefix}%`]
      );
      let nextSeq = 1;
      if (lastRows.length > 0) {
        const last = String(lastRows[0].purchase_no).split('-').pop();
        nextSeq = Number(last) + 1 || 1;
      }

      for (const item of validatedItems) {
        const purchaseNo = `${prefix}${String(nextSeq).padStart(5, '0')}`;
        nextSeq += 1;
        const [result] = await conn.execute(
          `INSERT INTO outlet_vendor_purchases (purchase_no, outlet_id, vendor_id, purchase_date, description, amount, paid_by, payment_mode_id, is_emergency, invoice_no, due_date, remarks, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            purchaseNo, outlet_id, item.vendor_id, purchase_date, item.description, item.amount,
            item.paid_by, item.payment_mode_id, item.is_emergency, item.invoice_no, item.due_date, item.remarks, req.user.id,
          ]
        );
        created.push({ id: result.insertId, purchase_no: purchaseNo });
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    await logAudit(req.user.id, 'CREATE', 'outlet_vendor_purchases', created.map((c) => c.id).join(','), null, { outlet_id, purchase_date, items: validatedItems }, `Created ${created.length} outlet vendor purchases in one batch entry`);
    res.status(201).json({ success: true, message: `${created.length} purchases recorded successfully`, data: created });
  } catch (error) {
    console.error('Create vendor purchases batch error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Error recording purchases' });
  }
};

export const deleteVendorPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT * FROM outlet_vendor_purchases WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Purchase not found' });

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(existing[0].outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    await assertDateEditable(existing[0].outlet_id, existing[0].purchase_date, 'An outlet vendor purchase');

    await query('DELETE FROM outlet_vendor_purchases WHERE id = ?', [id]);
    await logAudit(req.user.id, 'DELETE', 'outlet_vendor_purchases', id, existing[0], null, 'Deleted outlet vendor purchase');
    res.status(200).json({ success: true, message: 'Purchase deleted successfully' });
  } catch (error) {
    console.error('Delete vendor purchase error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Error deleting purchase' });
  }
};

// --- Payments ---

export const getVendorPayments = async (req, res) => {
  try {
    const { outlet_id, vendor_id, from_date, to_date, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let where = '1=1';
    const params = [];
    if (outlet_id && !isAllOutlets(outlet_id)) { where += ' AND vp.outlet_id = ?'; params.push(outlet_id); }
    if (vendor_id) { where += ' AND vp.vendor_id = ?'; params.push(vendor_id); }
    if (from_date) { where += ' AND vp.date >= ?'; params.push(from_date); }
    if (to_date) { where += ' AND vp.date <= ?'; params.push(to_date); }

    const rows = await query(
      `SELECT vp.*, DATE_FORMAT(vp.date, '%Y-%m-%d') as date, o.outlet_name, v.vendor_name, pm.mode_name, u.full_name as created_by_name
       FROM outlet_vendor_payments vp
       LEFT JOIN outlets o ON o.id = vp.outlet_id
       LEFT JOIN outlet_vendors v ON v.id = vp.vendor_id
       LEFT JOIN payment_modes pm ON pm.id = vp.payment_mode_id
       LEFT JOIN users u ON u.id = vp.created_by
       WHERE ${where}
       ORDER BY vp.date DESC, vp.id DESC
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Get vendor payments error:', error);
    res.status(500).json({ success: false, message: 'Error fetching vendor payments' });
  }
};

export const createVendorPayment = async (req, res) => {
  try {
    const { date, outlet_id, vendor_id, paid_amount, payment_mode_id, reference_no, remarks } = req.body;
    if (!date || !outlet_id || !vendor_id) {
      return res.status(400).json({ success: false, message: 'Date, outlet, and vendor are required' });
    }
    if (Number.isNaN(Number(paid_amount)) || num(paid_amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Paid amount must be a positive number' });
    }

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to the requested outlet' });
    }

    const vendorRows = await query('SELECT id, is_active FROM outlet_vendors WHERE id = ?', [vendor_id]);
    if (!vendorRows.length) return res.status(400).json({ success: false, message: 'Vendor not found' });

    await assertDateEditable(outlet_id, date, 'An outlet vendor payment');

    // UX pre-check only - the authoritative overpayment validation runs
    // inside the verify transaction (a Submitted row is not financially
    // effective, so concurrent creates can both pass here harmlessly).
    const summary = await getVendorLedgerSummary({ outletId: outlet_id, vendorId: vendor_id, date });
    if (num(paid_amount) > summary.current_outstanding + 0.005) {
      return res.status(400).json({ success: false, message: `Payment amount cannot exceed current outstanding of ₹${summary.current_outstanding.toFixed(2)}` });
    }

    // 7D2A2: create lands directly as Submitted (locked decision C) - one
    // click preserves the previous "Record Payment" UX while the payment
    // stays financially inactive until a checker verifies it.
    const result = await query(
      `INSERT INTO outlet_vendor_payments (outlet_id, vendor_id, date, paid_amount, payment_mode_id, reference_no, remarks, status, created_by, submitted_by, submitted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Submitted', ?, ?, NOW(), NOW())`,
      [outlet_id, vendor_id, date, num(paid_amount), payment_mode_id || null, reference_no || null, remarks || null, req.user.id, req.user.id]
    );
    await logAudit(req.user.id, 'CREATE', 'outlet_vendor_payments', result.insertId, null, req.body, 'Created outlet vendor payment');
    res.status(201).json({ success: true, message: 'Payment submitted for verification', data: { id: result.insertId } });
  } catch (error) {
    console.error('Create vendor payment error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Error recording payment' });
  }
};

// --- Ledger ---

export const getVendorLedger = async (req, res) => {
  try {
    const { outlet_id, vendor_id, date } = req.query;
    if (isAllOutlets(outlet_id)) return res.status(400).json({ success: false, message: 'A specific outlet is required' });
    if (!vendor_id) return res.status(400).json({ success: false, message: 'A specific vendor is required' });

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to the requested outlet' });
    }

    const effectiveDate = date || new Date().toISOString().slice(0, 10);
    const [summary, ageing] = await Promise.all([
      getVendorLedgerSummary({ outletId: outlet_id, vendorId: vendor_id, date: effectiveDate }),
      getVendorAgeing({ outletId: outlet_id, vendorId: vendor_id, date: effectiveDate }),
    ]);
    res.status(200).json({ success: true, data: { ...summary, overdue_amount: ageing.overdue_amount, not_due_amount: ageing.not_due_amount, credit_days: ageing.credit_days } });
  } catch (error) {
    console.error('Get vendor ledger error:', error);
    res.status(500).json({ success: false, message: 'Error fetching vendor ledger' });
  }
};

export const getVendorOutstandingReport = async (req, res) => {
  try {
    const { date } = req.query;
    const effectiveDate = date || new Date().toISOString().slice(0, 10);
    const outletScope = req.outletScope;
    const allowedOutletIds = outletScope && !outletScope.all ? outletScope.outletIds : null;
    const rows = await getAllVendorOutstanding(effectiveDate, allowedOutletIds);
    const enriched = await Promise.all(rows.map(async (r) => {
      const [outlet] = await query('SELECT outlet_name FROM outlets WHERE id = ?', [r.outlet_id]);
      const [vendor] = await query('SELECT vendor_name, category FROM outlet_vendors WHERE id = ?', [r.vendor_id]);
      const ageing = await getVendorAgeing({ outletId: r.outlet_id, vendorId: r.vendor_id, date: effectiveDate });
      return { ...r, outlet_name: outlet?.outlet_name, vendor_name: vendor?.vendor_name, category: vendor?.category, overdue_amount: ageing.overdue_amount, not_due_amount: ageing.not_due_amount };
    }));
    res.status(200).json({ success: true, data: enriched });
  } catch (error) {
    console.error('Get vendor outstanding report error:', error);
    res.status(500).json({ success: false, message: 'Error fetching outstanding report' });
  }
};

// --- Payment workflow (Phase 7D2A2) ---
// Mirrors the supplier_payments maker-checker: Draft/Rejected are editable
// and submittable, Submitted is immutable pending a checker, Verified is
// terminal (correction via controlled exceptions is deferred to 7D2B).
// req.record comes from loadScopedRecord('outlet_vendor_payments') which has
// already proven record.outlet_id is inside the caller's outlet scope.

const PAYMENT_EDITABLE_STATUSES = ['Draft', 'Rejected'];

export const updateVendorPayment = async (req, res) => {
  try {
    const existing = req.record;
    if (!PAYMENT_EDITABLE_STATUSES.includes(existing.status)) {
      return res.status(400).json({ success: false, message: `Cannot edit a vendor payment with status "${existing.status}". Only Draft or Rejected payments can be edited.` });
    }

    const { date = existing.date, paid_amount, payment_mode_id = existing.payment_mode_id, reference_no = existing.reference_no, remarks = existing.remarks } = req.body;
    const finalPaidAmount = paid_amount !== undefined ? num(paid_amount) : num(existing.paid_amount);
    if (Number.isNaN(finalPaidAmount) || finalPaidAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Paid amount must be a positive number' });
    }
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required' });
    }

    // Period lock against the stored date always; additionally against the
    // new date when it actually moves (mirrors supplierPaymentController).
    await assertDateEditable(existing.outlet_id, existing.date, 'An outlet vendor payment');
    if (String(date).slice(0, 10) !== String(existing.date).slice(0, 10)) {
      await assertDateEditable(existing.outlet_id, date, 'An outlet vendor payment');
    }

    const summary = await getVendorLedgerSummary({ outletId: existing.outlet_id, vendorId: existing.vendor_id, date, excludeId: Number(existing.id) });
    if (finalPaidAmount > summary.current_outstanding + 0.005) {
      return res.status(400).json({ success: false, message: `Payment amount cannot exceed current outstanding of ₹${summary.current_outstanding.toFixed(2)}` });
    }

    await query(
      `UPDATE outlet_vendor_payments
       SET date = ?, paid_amount = ?, payment_mode_id = ?, reference_no = ?, remarks = ?, updated_at = NOW()
       WHERE id = ?`,
      [date, finalPaidAmount, payment_mode_id || null, reference_no ? String(reference_no).trim() : null, remarks ? String(remarks).trim() : null, existing.id]
    );
    await logAudit(req.user.id, 'UPDATE', 'outlet_vendor_payments', existing.id, existing, { date, paid_amount: finalPaidAmount, payment_mode_id, reference_no, remarks }, 'Updated outlet vendor payment');
    res.status(200).json({ success: true, message: 'Vendor payment updated' });
  } catch (error) {
    console.error('Update vendor payment error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error updating vendor payment' });
  }
};

export const submitVendorPayment = async (req, res) => {
  try {
    const record = req.record;
    if (!PAYMENT_EDITABLE_STATUSES.includes(record.status)) {
      return res.status(400).json({ success: false, message: `Cannot submit a vendor payment with status "${record.status}". Only Draft or Rejected payments can be submitted.` });
    }
    await assertDateEditable(record.outlet_id, record.date, 'An outlet vendor payment');

    const result = await query(
      `UPDATE outlet_vendor_payments
       SET status = 'Submitted', submitted_by = ?, submitted_at = NOW(),
           rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL, updated_at = NOW()
       WHERE id = ? AND status IN ('Draft', 'Rejected')`,
      [req.user.id, record.id]
    );
    if (result.affectedRows === 0) {
      return res.status(400).json({ success: false, message: 'Vendor payment could not be submitted in its current status' });
    }
    await logAudit(req.user.id, 'SUBMIT', 'outlet_vendor_payments', record.id, record, { status: 'Submitted', submitted_by: req.user.id }, 'Submitted outlet vendor payment for verification');
    res.status(200).json({ success: true, message: 'Vendor payment submitted for verification' });
  } catch (error) {
    console.error('Submit vendor payment error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error submitting vendor payment' });
  }
};

export const verifyVendorPayment = async (req, res) => {
  const conn = await getConnection();
  try {
    const record = req.record;
    if (record.status !== 'Submitted') {
      return res.status(400).json({ success: false, message: `Cannot verify a vendor payment with status "${record.status}". Only Submitted payments can be verified.` });
    }
    if (isOwnDocument(record, req.user.id, 'created_by') || isOwnDocument(record, req.user.id, 'submitted_by')) {
      return res.status(403).json({ success: false, message: 'You cannot verify your own vendor payment (maker-checker rule).' });
    }
    await assertDateEditable(record.outlet_id, record.date, 'An outlet vendor payment');

    await conn.beginTransaction();

    // Lock the payment row itself, then the vendor row as the payable
    // serialization anchor: this serializes verification for a vendor so two
    // concurrent checkers cannot both pass the outstanding check. The
    // financial comparison itself stays scoped to THIS payment's
    // outlet_id + vendor_id (the lock is coarse, the math is not).
    const [locked] = await conn.execute('SELECT * FROM outlet_vendor_payments WHERE id = ? FOR UPDATE', [record.id]);
    if (!locked.length || locked[0].status !== 'Submitted') {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Vendor payment could not be verified in its current status' });
    }
    const pay = locked[0];

    const [vendorRows] = await conn.execute('SELECT id FROM outlet_vendors WHERE id = ? FOR UPDATE', [pay.vendor_id]);
    if (!vendorRows.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    // Two authoritative checks, both inside the vendor serialization lock.
    // CHECK A (as-of payment date): a backdated payment may only consume
    // liability that existed on its own date - it cannot be funded by a
    // purchase that arrived later.
    const [purchaseRows] = await conn.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM outlet_vendor_purchases
       WHERE outlet_id = ? AND vendor_id = ? AND purchase_date <= ? AND paid_by != 'Outlet'`,
      [pay.outlet_id, pay.vendor_id, pay.date]
    );
    const [paymentRows] = await conn.execute(
      `SELECT COALESCE(SUM(paid_amount), 0) AS total FROM outlet_vendor_payments
       WHERE outlet_id = ? AND vendor_id = ? AND date <= ? AND status = 'Verified' AND id != ?`,
      [pay.outlet_id, pay.vendor_id, pay.date, pay.id]
    );
    // 7D3A1: opening balance participates by the same effective-date cutoff
    // as purchases/payments - read on the transaction connection so it is
    // covered by the vendor serialization lock.
    const openingAsOfPaymentDate = await getOpeningBalance(pay.outlet_id, pay.vendor_id, pay.date, conn);
    const outstandingAsOfPaymentDate = openingAsOfPaymentDate + num(purchaseRows[0].total) - num(paymentRows[0].total);
    if (num(pay.paid_amount) > outstandingAsOfPaymentDate + 0.005) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: `Payment exceeds the outstanding of ₹${outstandingAsOfPaymentDate.toFixed(2)} as of its payment date` });
    }

    // CHECK B (current outstanding): same pair at today's canonical cutoff,
    // which also sees Verified payments dated AFTER this payment - otherwise
    // a backdated payment could push total Verified payments over payable.
    const currentCutoff = new Date().toISOString().slice(0, 10);
    const [curPurchaseRows] = await conn.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM outlet_vendor_purchases
       WHERE outlet_id = ? AND vendor_id = ? AND purchase_date <= ? AND paid_by != 'Outlet'`,
      [pay.outlet_id, pay.vendor_id, currentCutoff]
    );
    const [curPaymentRows] = await conn.execute(
      `SELECT COALESCE(SUM(paid_amount), 0) AS total FROM outlet_vendor_payments
       WHERE outlet_id = ? AND vendor_id = ? AND date <= ? AND status = 'Verified' AND id != ?`,
      [pay.outlet_id, pay.vendor_id, currentCutoff, pay.id]
    );
    const openingCurrent = await getOpeningBalance(pay.outlet_id, pay.vendor_id, currentCutoff, conn);
    const currentOutstanding = openingCurrent + num(curPurchaseRows[0].total) - num(curPaymentRows[0].total);
    if (num(pay.paid_amount) > currentOutstanding + 0.005) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: `Payment amount cannot exceed current outstanding of ₹${currentOutstanding.toFixed(2)}` });
    }

    await conn.execute(
      `UPDATE outlet_vendor_payments SET status = 'Verified', verified_by = ?, verified_at = NOW(), updated_at = NOW()
       WHERE id = ? AND status = 'Submitted'`,
      [req.user.id, pay.id]
    );
    await conn.commit();

    await logAudit(req.user.id, 'VERIFY', 'outlet_vendor_payments', pay.id, record, { status: 'Verified', verified_by: req.user.id }, 'Verified outlet vendor payment');
    res.status(200).json({ success: true, message: 'Vendor payment verified' });
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error('Verify vendor payment error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error verifying vendor payment' });
  } finally {
    conn.release();
  }
};

export const rejectVendorPayment = async (req, res) => {
  try {
    const record = req.record;
    if (record.status !== 'Submitted') {
      return res.status(400).json({ success: false, message: `Cannot reject a vendor payment with status "${record.status}". Only Submitted payments can be rejected.` });
    }
    if (isOwnDocument(record, req.user.id, 'created_by') || isOwnDocument(record, req.user.id, 'submitted_by')) {
      return res.status(403).json({ success: false, message: 'You cannot reject your own vendor payment (maker-checker rule).' });
    }
    const { rejection_reason } = req.body || {};
    if (!rejection_reason || !String(rejection_reason).trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }
    await assertDateEditable(record.outlet_id, record.date, 'An outlet vendor payment');

    const result = await query(
      `UPDATE outlet_vendor_payments
       SET status = 'Rejected', rejected_by = ?, rejected_at = NOW(), rejection_reason = ?, updated_at = NOW()
       WHERE id = ? AND status = 'Submitted'`,
      [req.user.id, String(rejection_reason).trim(), record.id]
    );
    if (result.affectedRows === 0) {
      return res.status(400).json({ success: false, message: 'Vendor payment could not be rejected in its current status' });
    }
    await logAudit(req.user.id, 'REJECT', 'outlet_vendor_payments', record.id, record, { status: 'Rejected', rejected_by: req.user.id, rejection_reason: String(rejection_reason).trim() }, 'Rejected outlet vendor payment');
    res.status(200).json({ success: true, message: 'Vendor payment rejected' });
  } catch (error) {
    console.error('Reject vendor payment error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error rejecting vendor payment' });
  }
};

// ============================================================================
// Phase 7D3A1 - Outlet Vendor Opening Balance (one row per outlet+vendor).
// Permission module: outlet_vendors (view/create/edit) - same module that owns
// vendor financials; no parallel module invented. Mutations take the vendor
// FOR UPDATE lock so they serialize against payment verification (which holds
// the same outlet_vendors row lock during its authoritative checks).
// ============================================================================

export const getVendorOpeningBalance = async (req, res) => {
  try {
    const { outlet_id, vendor_id } = req.query;
    if (!outlet_id || !vendor_id) {
      return res.status(400).json({ success: false, message: 'outlet_id and vendor_id are required' });
    }
    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to the requested outlet' });
    }
    const rows = await query(
      'SELECT * FROM outlet_vendor_opening_balances WHERE outlet_id = ? AND vendor_id = ? LIMIT 1',
      [outlet_id, vendor_id]
    );
    res.status(200).json({ success: true, data: rows[0] || null });
  } catch (error) {
    console.error('Get vendor opening balance error:', error);
    res.status(500).json({ success: false, message: 'Error loading opening balance' });
  }
};

const validateOpeningInput = (res, { effective_date, due_date, opening_amount }) => {
  if (!effective_date || Number.isNaN(new Date(effective_date).getTime())) {
    res.status(400).json({ success: false, message: 'A valid effective_date is required' });
    return false;
  }
  if (due_date && Number.isNaN(new Date(due_date).getTime())) {
    res.status(400).json({ success: false, message: 'due_date must be a valid date' });
    return false;
  }
  if (Number.isNaN(Number(opening_amount)) || num(opening_amount) < 0) {
    res.status(400).json({ success: false, message: 'Opening amount must be a non-negative number' });
    return false;
  }
  return true;
};

export const createVendorOpeningBalance = async (req, res) => {
  const conn = await getConnection();
  try {
    const { outlet_id, vendor_id, effective_date, due_date, opening_amount, remarks } = req.body;
    if (!outlet_id || !vendor_id) {
      return res.status(400).json({ success: false, message: 'outlet_id and vendor_id are required' });
    }
    if (!validateOpeningInput(res, { effective_date, due_date, opening_amount })) return;

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to the requested outlet' });
    }
    const vendorRows = await query('SELECT id, is_active FROM outlet_vendors WHERE id = ?', [vendor_id]);
    if (!vendorRows.length) return res.status(400).json({ success: false, message: 'Vendor not found' });
    if (Number(vendorRows[0].is_active) !== 1) return res.status(400).json({ success: false, message: 'Selected vendor is not active' });

    await conn.beginTransaction();
    // Serialize against payment verification for this vendor.
    await conn.execute('SELECT id FROM outlet_vendors WHERE id = ? FOR UPDATE', [vendor_id]);
    await assertDateEditable(outlet_id, effective_date, 'An outlet vendor opening balance');
    const [dup] = await conn.execute(
      'SELECT id FROM outlet_vendor_opening_balances WHERE outlet_id = ? AND vendor_id = ? LIMIT 1',
      [outlet_id, vendor_id]
    );
    if (dup.length) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Opening balance already exists for this outlet and vendor - edit it instead' });
    }
    const [result] = await conn.execute(
      `INSERT INTO outlet_vendor_opening_balances (outlet_id, vendor_id, effective_date, due_date, opening_amount, remarks, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [outlet_id, vendor_id, effective_date, due_date || effective_date, num(opening_amount), remarks || null, req.user.id, req.user.id]
    );
    await conn.commit();
    await logAudit(req.user.id, 'CREATE', 'outlet_vendor_opening_balances', result.insertId, null, req.body, 'Created outlet vendor opening balance');
    res.status(201).json({ success: true, message: 'Opening balance recorded', data: { id: result.insertId } });
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error('Create vendor opening balance error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Error recording opening balance' });
  } finally {
    conn.release();
  }
};

export const updateVendorOpeningBalance = async (req, res) => {
  const conn = await getConnection();
  try {
    const scopedRecord = req.record; // scope gate already applied by middleware
    const { effective_date, due_date, opening_amount, remarks } = req.body;
    if (!validateOpeningInput(res, {
      effective_date: effective_date ?? scopedRecord.effective_date,
      due_date: due_date ?? scopedRecord.due_date,
      opening_amount: opening_amount ?? scopedRecord.opening_amount,
    })) return;

    await conn.beginTransaction();
    // Same vendor anchor as payment verification - a verify and an opening edit
    // cannot race to different outstanding figures.
    await conn.execute('SELECT id FROM outlet_vendors WHERE id = ? FOR UPDATE', [scopedRecord.vendor_id]);
    // req.record was read BEFORE this lock and may be stale: a concurrent
    // committed update must not be overwritten by stale fallback values.
    // Re-read the row under the lock - it becomes the sole source for stored
    // values, period-lock checks and the audit "before" image.
    const [lockedRows] = await conn.execute(
      'SELECT * FROM outlet_vendor_opening_balances WHERE id = ? FOR UPDATE',
      [scopedRecord.id]
    );
    const record = lockedRows[0];
    if (!record) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Opening balance no longer exists' });
    }
    await assertDateEditable(record.outlet_id, record.effective_date, 'An outlet vendor opening balance');
    const newEffective = effective_date ?? record.effective_date;
    if (String(newEffective).slice(0, 10) !== String(record.effective_date).slice(0, 10)) {
      await assertDateEditable(record.outlet_id, newEffective, 'An outlet vendor opening balance');
    }
    // outlet_id/vendor_id are immutable identity - never updated from the body.
    await conn.execute(
      `UPDATE outlet_vendor_opening_balances
       SET effective_date = ?, due_date = ?, opening_amount = ?, remarks = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [newEffective, due_date ?? record.due_date, num(opening_amount ?? record.opening_amount), remarks ?? record.remarks, req.user.id, record.id]
    );
    await conn.commit();
    await logAudit(req.user.id, 'UPDATE', 'outlet_vendor_opening_balances', record.id, record, req.body, 'Updated outlet vendor opening balance');
    res.status(200).json({ success: true, message: 'Opening balance updated' });
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error('Update vendor opening balance error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Error updating opening balance' });
  } finally {
    conn.release();
  }
};

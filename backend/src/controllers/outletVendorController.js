import { query } from '../config/database.js';
import { logAudit } from '../utils/logger.js';
import { validateContactFields } from '../utils/validators.js';
import { getVendorLedgerSummary, getAllVendorOutstanding, getVendorAgeing } from '../services/outletVendorLedgerService.js';
import { assertDateEditable } from '../utils/periodLock.js';

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const isAllOutlets = (v) => !v || v === 'all';

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
    if (credit_days !== undefined && (Number.isNaN(Number(credit_days)) || num(credit_days) < 0)) {
      return res.status(400).json({ success: false, message: 'Credit days must be a non-negative number' });
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
    if (credit_days !== undefined && (Number.isNaN(Number(credit_days)) || num(credit_days) < 0)) {
      return res.status(400).json({ success: false, message: 'Credit days must be a non-negative number' });
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

    const vendorRows = await query('SELECT id, is_active FROM outlet_vendors WHERE id = ?', [vendor_id]);
    if (!vendorRows.length) return res.status(400).json({ success: false, message: 'Vendor not found' });
    if (Number(vendorRows[0].is_active) !== 1) return res.status(400).json({ success: false, message: 'Selected vendor is not active' });

    await assertDateEditable(outlet_id, purchase_date, 'An outlet vendor purchase');

    const purchaseNo = await generatePurchaseNo();
    const result = await query(
      `INSERT INTO outlet_vendor_purchases (purchase_no, outlet_id, vendor_id, purchase_date, description, amount, paid_by, payment_mode_id, is_emergency, invoice_no, remarks, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        purchaseNo, outlet_id, vendor_id, purchase_date, String(description).trim(), num(amount),
        paid_by === 'Management' ? 'Management' : 'Outlet',
        payment_mode_id || null, is_emergency ? 1 : 0, invoice_no || null, remarks || null, req.user.id,
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

export const deleteVendorPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT * FROM outlet_vendor_purchases WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Purchase not found' });

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(existing[0].outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to this outlet' });
    }

    await query('DELETE FROM outlet_vendor_purchases WHERE id = ?', [id]);
    await logAudit(req.user.id, 'DELETE', 'outlet_vendor_purchases', id, existing[0], null, 'Deleted outlet vendor purchase');
    res.status(200).json({ success: true, message: 'Purchase deleted successfully' });
  } catch (error) {
    console.error('Delete vendor purchase error:', error);
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

    const summary = await getVendorLedgerSummary({ outletId: outlet_id, vendorId: vendor_id, date });
    if (num(paid_amount) > summary.current_outstanding + 0.005) {
      return res.status(400).json({ success: false, message: `Payment amount cannot exceed current outstanding of ₹${summary.current_outstanding.toFixed(2)}` });
    }

    const result = await query(
      `INSERT INTO outlet_vendor_payments (outlet_id, vendor_id, date, paid_amount, payment_mode_id, reference_no, remarks, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [outlet_id, vendor_id, date, num(paid_amount), payment_mode_id || null, reference_no || null, remarks || null, req.user.id]
    );
    await logAudit(req.user.id, 'CREATE', 'outlet_vendor_payments', result.insertId, null, req.body, 'Created outlet vendor payment');
    res.status(201).json({ success: true, message: 'Payment recorded successfully', data: { id: result.insertId } });
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
    const rows = await getAllVendorOutstanding(effectiveDate);
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

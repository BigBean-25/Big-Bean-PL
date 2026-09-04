import { query } from '../config/database.js';
import { logAudit } from '../utils/logger.js';
import { getSupplierLedgerSummary, computePaymentRowValues } from '../services/supplierLedgerService.js';
import { assertDateEditable } from '../utils/periodLock.js';

const num = (value) => Number(value || 0);

const isAllOutlets = (value) => !value || value === 'all';

const validatePaymentBase = async ({
  date,
  outletId,
  supplierId,
  paidAmount,
  user,
  outletScope,
}) => {
  if (!date || !outletId || !supplierId) {
    throw new Error('Date, outlet, and supplier are required');
  }

  if (isAllOutlets(outletId)) {
    throw new Error('A specific outlet is required');
  }

  if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(outletId))) {
    throw new Error('You do not have access to the requested outlet');
  }

  if (Number.isNaN(Number(paidAmount)) || num(paidAmount) <= 0) {
    throw new Error('Paid amount must be a positive number');
  }

  const supplierRows = await query('SELECT id, is_active FROM suppliers WHERE id = ?', [supplierId]);
  if (supplierRows.length === 0) {
    throw new Error('Supplier not found');
  }

  const supplier = supplierRows[0];
  if (supplier.is_active !== undefined && Number(supplier.is_active) !== 1) {
    throw new Error('Selected supplier is not active');
  }
};

export const getSupplierPayments = async (req, res) => {
  try {
    const { outlet_id, supplier_id, start_date, end_date, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (outlet_id && !isAllOutlets(outlet_id)) {
      whereClause += ' AND sp.outlet_id = ?';
      params.push(outlet_id);
    }

    if (supplier_id && !isAllOutlets(supplier_id)) {
      whereClause += ' AND sp.supplier_id = ?';
      params.push(supplier_id);
    }

    if (start_date) {
      whereClause += ' AND sp.date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ' AND sp.date <= ?';
      params.push(end_date);
    }

    const payments = await query(
      `SELECT sp.*, DATE_FORMAT(sp.date, '%Y-%m-%d') as date,
              o.outlet_name, s.supplier_name, pm.mode_name,
              u1.full_name as created_by_name
       FROM supplier_payments sp
       LEFT JOIN outlets o ON sp.outlet_id = o.id
       LEFT JOIN suppliers s ON sp.supplier_id = s.id
       LEFT JOIN payment_modes pm ON sp.payment_mode_id = pm.id
       LEFT JOIN users u1 ON sp.created_by = u1.id
       WHERE ${whereClause}
       ORDER BY sp.date DESC, sp.id DESC
       LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    res.status(200).json({
      success: true,
      data: payments
    });
  } catch (error) {
    console.error('Get supplier payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching supplier payments'
    });
  }
};

export const getSupplierLedger = async (req, res) => {
  try {
    const { outlet_id, supplier_id, date, exclude_id } = req.query;

    if (isAllOutlets(outlet_id)) {
      return res.status(400).json({ success: false, message: 'A specific outlet is required' });
    }
    if (!supplier_id || isAllOutlets(supplier_id)) {
      return res.status(400).json({ success: false, message: 'A specific supplier is required' });
    }
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required' });
    }

    const outletScope = req.outletScope;
    if (outletScope && !outletScope.all && !outletScope.outletIds.includes(Number(outlet_id))) {
      return res.status(403).json({ success: false, message: 'You do not have access to the requested outlet' });
    }

    const summary = await getSupplierLedgerSummary({
      outletId: outlet_id,
      supplierId: supplier_id,
      date,
      excludeId: exclude_id ? Number(exclude_id) : null,
    });

    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get supplier ledger error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching supplier ledger'
    });
  }
};

export const createSupplierPayment = async (req, res) => {
  try {
    const {
      date,
      outlet_id,
      supplier_id,
      paid_amount,
      payment_mode_id,
      reference_no,
      remarks
    } = req.body;

    await validatePaymentBase({
      date,
      outletId: outlet_id,
      supplierId: supplier_id,
      paidAmount: paid_amount,
      user: req.user,
      outletScope: req.outletScope,
    });

    await assertDateEditable(outlet_id, date, 'A supplier payment');

    const { opening_pending, purchase_value, current_outstanding } = await computePaymentRowValues({
      outletId: outlet_id,
      supplierId: supplier_id,
      date,
    });

    if (num(paid_amount) > current_outstanding) {
      return res.status(400).json({
        success: false,
        message: `Payment amount cannot exceed current outstanding of ₹${current_outstanding.toFixed(2)}`
      });
    }

    const paymentData = {
      date,
      outlet_id,
      supplier_id,
      opening_pending,
      purchase_value,
      paid_amount: num(paid_amount),
      payment_mode_id: payment_mode_id || null,
      reference_no: reference_no ? String(reference_no).trim() : null,
      remarks: remarks ? String(remarks).trim() : null,
      created_by: req.user.id,
      proof_attachment: req.file?.path || null
    };

    const fields = Object.keys(paymentData);
    const values = Object.values(paymentData);
    const placeholders = fields.map(() => '?').join(', ');

    const result = await query(
      `INSERT INTO supplier_payments (${fields.join(', ')}, created_at) VALUES (${placeholders}, NOW())`,
      values
    );

    await logAudit(req.user.id, 'CREATE', 'supplier_payments', result.insertId, null, paymentData, 'Created supplier payment');

    res.status(201).json({
      success: true,
      message: 'Supplier payment created successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Create supplier payment error:', error);
    const status = error.statusCode || ((error.message && error.message.includes('required') || error.message.includes('not found') || error.message.includes('active') || error.message.includes('exceeds')) ? 400 : 500);
    res.status(status).json({
      success: false,
      message: error.message || 'Error creating supplier payment'
    });
  }
};

export const updateSupplierPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = req.record;

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Supplier payment not found'
      });
    }

    const {
      date = existing.date,
      outlet_id = existing.outlet_id,
      supplier_id = existing.supplier_id,
      paid_amount,
      payment_mode_id = existing.payment_mode_id,
      reference_no = existing.reference_no,
      remarks = existing.remarks
    } = req.body;

    const finalPaidAmount = req.body.paid_amount !== undefined ? num(paid_amount) : num(existing.paid_amount);

    await validatePaymentBase({
      date,
      outletId: outlet_id,
      supplierId: supplier_id,
      paidAmount: finalPaidAmount,
      user: req.user,
      outletScope: req.outletScope,
    });

    await assertDateEditable(existing.outlet_id, existing.date, 'A supplier payment');
    if (date !== existing.date || Number(outlet_id) !== Number(existing.outlet_id)) {
      await assertDateEditable(outlet_id, date, 'A supplier payment');
    }

    const { opening_pending, purchase_value, current_outstanding } = await computePaymentRowValues({
      outletId: outlet_id,
      supplierId: supplier_id,
      date,
      excludeId: Number(id),
    });

    if (finalPaidAmount > current_outstanding) {
      return res.status(400).json({
        success: false,
        message: `Payment amount cannot exceed current outstanding of ₹${current_outstanding.toFixed(2)}`
      });
    }

    const paymentData = {
      date,
      outlet_id,
      supplier_id,
      opening_pending,
      purchase_value,
      paid_amount: finalPaidAmount,
      payment_mode_id: payment_mode_id || null,
      reference_no: reference_no ? String(reference_no).trim() : null,
      remarks: remarks ? String(remarks).trim() : null,
    };

    const fields = Object.keys(paymentData);
    const values = Object.values(paymentData);
    const setClause = fields.map(f => `${f} = ?`).join(', ');

    await query(
      `UPDATE supplier_payments SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      [...values, id]
    );

    await logAudit(req.user.id, 'UPDATE', 'supplier_payments', id, existing, paymentData, 'Updated supplier payment');

    res.status(200).json({
      success: true,
      message: 'Supplier payment updated successfully'
    });
  } catch (error) {
    console.error('Update supplier payment error:', error);
    const status = error.statusCode || ((error.message && (error.message.includes('required') || error.message.includes('not found') || error.message.includes('active') || error.message.includes('exceeds'))) ? 400 : 500);
    res.status(status).json({
      success: false,
      message: error.message || 'Error updating supplier payment'
    });
  }
};

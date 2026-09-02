import { query } from '../config/database.js';
import { getOutletPL, getOutletComparison, getFinalizedSnapshot, finalizeMonth } from '../services/plCalculator.js';
import { getSupplierLedgerSummary } from '../services/supplierLedgerService.js';
import { getActualConsumption, getTheoreticalConsumption } from '../services/consumptionService.js';
import { canAccessAllOutlets } from '../utils/roleAccess.js';

export const getMonthlyOutletPL = async (req, res) => {
  try {
    const { outlet_id, month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const snapshot = await getFinalizedSnapshot({ outletId: outlet_id || null, month, year });
    const plReport = snapshot || await getOutletPL({ outletId: outlet_id || null, month, year });

    res.status(200).json({
      success: true,
      data: plReport
    });
  } catch (error) {
    console.error('Get monthly outlet P&L error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating P&L report'
    });
  }
};

export const finalizeMonthlyOutletPL = async (req, res) => {
  try {
    const { outlet_id, month, year } = req.body;

    if (!outlet_id || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Outlet, month and year are required'
      });
    }

    const snapshot = await finalizeMonth({ outletId: outlet_id, month, year, userId: req.user.id });

    res.status(200).json({
      success: true,
      data: snapshot
    });
  } catch (error) {
    console.error('Finalize monthly outlet P&L error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Error finalizing month'
    });
  }
};

export const getOutletComparisonReport = async (req, res) => {
  try {
    const { month, year } = req.query;

    // This spans every outlet by design, so it can't go through applyOutletScope's
    // usual "force outlet_id to the caller's own outlet" restriction the same way
    // single-outlet reports do - it needs its own explicit all-outlet-access check.
    if (!canAccessAllOutlets(req.user.role_name)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view the company-wide outlet comparison'
      });
    }

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const comparison = await getOutletComparison({ month, year });

    res.status(200).json({
      success: true,
      data: comparison
    });
  } catch (error) {
    console.error('Get outlet comparison report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating outlet comparison report'
    });
  }
};

export const getActualConsumptionReport = async (req, res) => {
  try {
    const { outlet_id, month, year } = req.query;

    if (!outlet_id || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Outlet, month, and year are required'
      });
    }

    const consumptionReport = await getActualConsumption({ outletId: outlet_id, month, year });

    res.status(200).json({
      success: true,
      data: consumptionReport
    });
  } catch (error) {
    console.error('Get actual consumption report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating actual consumption report'
    });
  }
};

export const getTheoreticalConsumptionReport = async (req, res) => {
  try {
    const { outlet_id, month, year } = req.query;

    if (!outlet_id || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Outlet, month, and year are required'
      });
    }

    const theoreticalConsumption = await getTheoreticalConsumption({ outletId: outlet_id, month, year });

    res.status(200).json({
      success: true,
      data: theoreticalConsumption
    });
  } catch (error) {
    console.error('Get theoretical consumption report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating theoretical consumption report'
    });
  }
};

export const getDailyCashbookReport = async (req, res) => {
  try {
    const { outlet_id, from_date, to_date } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (outlet_id) {
      whereClause += ' AND dc.outlet_id = ?';
      params.push(outlet_id);
    }

    if (from_date) {
      whereClause += ' AND dc.date >= ?';
      params.push(from_date);
    }

    if (to_date) {
      whereClause += ' AND dc.date <= ?';
      params.push(to_date);
    }

    const cashbooks = await query(
      `SELECT 
        dc.*,
        o.outlet_name
       FROM daily_cashbooks dc
       LEFT JOIN outlets o ON dc.outlet_id = o.id
       WHERE ${whereClause}
       ORDER BY dc.date, o.outlet_name`,
      params
    );

    res.status(200).json({
      success: true,
      data: cashbooks
    });
  } catch (error) {
    console.error('Get daily cashbook report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating cashbook report'
    });
  }
};

export const getExpenseReport = async (req, res) => {
  try {
    const { outlet_id, from_date, to_date, expense_head_id } = req.query;

    let whereClause = 'dce.status = "Approved"';
    const params = [];

    if (outlet_id) {
      whereClause += ' AND dce.outlet_id = ?';
      params.push(outlet_id);
    }

    if (from_date) {
      whereClause += ' AND dce.date >= ?';
      params.push(from_date);
    }

    if (to_date) {
      whereClause += ' AND dce.date <= ?';
      params.push(to_date);
    }

    if (expense_head_id) {
      whereClause += ' AND dce.expense_head_id = ?';
      params.push(expense_head_id);
    }

    const expenses = await query(
      `SELECT 
        dce.*,
        o.outlet_name,
        eh.expense_name,
        pm.mode_name
       FROM daily_cash_expenses dce
       LEFT JOIN outlets o ON dce.outlet_id = o.id
       LEFT JOIN expense_heads eh ON dce.expense_head_id = eh.id
       LEFT JOIN payment_modes pm ON dce.payment_mode_id = pm.id
       WHERE ${whereClause}
       ORDER BY dce.date DESC, o.outlet_name`,
      params
    );

    const summary = await query(
      `SELECT 
        eh.expense_name,
        COALESCE(SUM(dce.amount), 0) as total_amount,
        COUNT(*) as count
       FROM daily_cash_expenses dce
       LEFT JOIN expense_heads eh ON dce.expense_head_id = eh.id
       WHERE ${whereClause}
       GROUP BY eh.expense_name
       ORDER BY total_amount DESC`,
      params
    );

    res.status(200).json({
      success: true,
      data: {
        expenses,
        summary
      }
    });
  } catch (error) {
    console.error('Get expense report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating expense report'
    });
  }
};

export const getSupplierPendingReport = async (req, res) => {
  try {
    const { outlet_id, supplier_id, as_of_date } = req.query;
    const asOfDate = as_of_date || new Date().toISOString().slice(0, 10);

    let scopeWhere = '1=1';
    const scopeParams = [];

    if (outlet_id && outlet_id !== 'all') {
      scopeWhere += ' AND outlet_id = ?';
      scopeParams.push(outlet_id);
    }

    if (supplier_id && supplier_id !== 'all') {
      scopeWhere += ' AND supplier_id = ?';
      scopeParams.push(supplier_id);
    }

    // Distinct (outlet, supplier) pairs that have either a payment history or
    // qualifying purchase history in scope. Outstanding for each pair is then
    // computed via the SAME canonical getSupplierLedgerSummary() used by the
    // Supplier Payments ledger-summary endpoint, so both surfaces always agree.
    const pairs = await query(
      `SELECT outlet_id, supplier_id FROM supplier_payments WHERE ${scopeWhere}
       UNION
       SELECT mpi.outlet_id, mpi.supplier_id
       FROM material_purchase_items mpi
       INNER JOIN material_purchase_uploads mpu ON mpi.upload_id = mpu.id
       WHERE mpu.status = 'Completed' AND mpi.supplier_id IS NOT NULL
         ${outlet_id && outlet_id !== 'all' ? 'AND mpi.outlet_id = ?' : ''}
         ${supplier_id && supplier_id !== 'all' ? 'AND mpi.supplier_id = ?' : ''}`,
      [...scopeParams, ...scopeParams]
    );

    if (pairs.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const outletIds = [...new Set(pairs.map((p) => p.outlet_id))];
    const supplierIds = [...new Set(pairs.map((p) => p.supplier_id))];

    const outletRows = await query(
      `SELECT id, outlet_name FROM outlets WHERE id IN (${outletIds.map(() => '?').join(',')})`,
      outletIds
    );
    const supplierRows = await query(
      `SELECT id, supplier_name FROM suppliers WHERE id IN (${supplierIds.map(() => '?').join(',')})`,
      supplierIds
    );
    const outletNameMap = Object.fromEntries(outletRows.map((o) => [o.id, o.outlet_name]));
    const supplierNameMap = Object.fromEntries(supplierRows.map((s) => [s.id, s.supplier_name]));

    const report = await Promise.all(
      pairs.map(async (pair) => {
        const summary = await getSupplierLedgerSummary({
          outletId: pair.outlet_id,
          supplierId: pair.supplier_id,
          date: asOfDate,
        });

        return {
          outlet_id: pair.outlet_id,
          outlet_name: outletNameMap[pair.outlet_id] || '-',
          supplier_id: pair.supplier_id,
          supplier_name: supplierNameMap[pair.supplier_id] || '-',
          purchase_value: summary.purchase_value,
          paid_amount: summary.previous_paid_amount,
          balance_pending: summary.current_outstanding,
          as_of_date: asOfDate
        };
      })
    );

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Get supplier pending report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating supplier pending report'
    });
  }
};

// GST summary reports. These aggregate the tax already captured at entry
// (grn_items.tax_amount on the purchase side, petpooja_sales_uploads.total_tax
// on the sales side) - a taxable/tax/gross breakdown per supplier or outlet,
// not a CGST/SGST/IGST or HSN-wise breakup ready for direct GSTR filing.
export const getPurchaseGSTReport = async (req, res) => {
  try {
    const { from_date, to_date, supplier_id } = req.query;
    if (!from_date || !to_date) {
      return res.status(400).json({ success: false, message: 'from_date and to_date are required' });
    }

    let where = "g.status = 'Posted' AND g.grn_date BETWEEN ? AND ?";
    const params = [from_date, to_date];
    if (supplier_id && supplier_id !== 'all') {
      where += ' AND g.supplier_id = ?';
      params.push(supplier_id);
    }

    const rows = await query(
      `SELECT s.id AS supplier_id, s.supplier_name, s.gstin,
        COUNT(DISTINCT g.id) AS grn_count,
        SUM(gi.total_amount - gi.tax_amount) AS taxable_value,
        SUM(gi.tax_amount) AS tax_amount,
        SUM(gi.total_amount) AS gross_value
       FROM grn g
       INNER JOIN grn_items gi ON gi.grn_id = g.id
       LEFT JOIN suppliers s ON s.id = g.supplier_id
       WHERE ${where}
       GROUP BY s.id, s.supplier_name, s.gstin
       ORDER BY s.supplier_name`,
      params
    );

    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Get purchase GST report error:', error);
    res.status(500).json({ success: false, message: 'Error generating purchase GST report' });
  }
};

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

// GSTR-1 reports OUTWARD taxable supplies. For this business that's outlet
// sales (from approved PetPooja uploads), not warehouse purchases or internal
// stock transfers (which aren't taxable supplies).
//
// Item-level CGST/SGST/rate comes from one of two sources, per outlet:
//   - PRECISE: if a PetPooja "Item Wise Tax Report" upload exists for that
//     outlet covering exactly [from_date, to_date], its real per-item
//     CGST/SGST/rate is used directly - no guessing.
//   - ESTIMATED (fallback): petpooja_sales_items.item_name is matched to
//     menu_items by name (the PetPooja import has no menu_item_id link) and
//     the combined Tax column is split 50/50 into CGST/SGST. Items that don't
//     match any Menu Item are reported separately under "unmapped" rather
//     than silently dropped, since they'd otherwise understate real GST
//     liability.
export const getGSTR1Report = async (req, res) => {
  try {
    const { from_date, to_date, outlet_id } = req.query;
    if (!from_date || !to_date) {
      return res.status(400).json({ success: false, message: 'from_date and to_date are required' });
    }

    let where = "u.status = 'Approved' AND COALESCE(u.upload_date_from, u.upload_date) BETWEEN ? AND ?";
    const params = [from_date, to_date];
    if (outlet_id && outlet_id !== 'all') {
      where += ' AND u.outlet_id = ?';
      params.push(outlet_id);
    }

    const items = await query(
      `SELECT psi.item_name, psi.quantity, psi.net_sales, psi.total_tax, psi.gross_sales, psi.outlet_id,
        mi.id as menu_item_id, mi.hsn_code, mi.gst_rate
       FROM petpooja_sales_items psi
       INNER JOIN petpooja_sales_uploads u ON u.id = psi.upload_id
       LEFT JOIN menu_items mi ON LOWER(TRIM(mi.item_name)) = LOWER(TRIM(psi.item_name))
       WHERE ${where}`,
      params
    );

    // Outlets whose exact [from_date, to_date] period has a real Item Tax
    // Report on file - their rows use that data instead of the estimate.
    const preciseUploads = await query(
      `SELECT itu.id, itu.outlet_id
       FROM petpooja_item_tax_uploads itu
       WHERE itu.upload_date_from = ? AND itu.upload_date_to = ?
         ${outlet_id && outlet_id !== 'all' ? 'AND itu.outlet_id = ?' : ''}
       ORDER BY itu.created_at DESC`,
      outlet_id && outlet_id !== 'all' ? [from_date, to_date, outlet_id] : [from_date, to_date]
    );
    const preciseUploadByOutlet = {};
    for (const u of preciseUploads) {
      if (!(u.outlet_id in preciseUploadByOutlet)) preciseUploadByOutlet[u.outlet_id] = u.id; // most recent wins
    }
    const preciseOutletIds = Object.keys(preciseUploadByOutlet).map(Number);

    const byRate = {};
    const byHsn = {};
    let unmappedValue = 0, unmappedTax = 0, unmappedCount = 0;

    // Estimated path - skip any row belonging to an outlet with precise data.
    for (const it of items) {
      if (preciseOutletIds.includes(Number(it.outlet_id))) continue;

      const taxable = num(it.net_sales);
      const tax = num(it.total_tax);
      if (!it.menu_item_id || it.gst_rate === null || it.gst_rate === undefined) {
        unmappedValue += taxable;
        unmappedTax += tax;
        unmappedCount += 1;
        continue;
      }
      const rate = Number(it.gst_rate);
      const rKey = rate.toFixed(2);
      if (!byRate[rKey]) byRate[rKey] = { rate, taxable_value: 0, cgst: 0, sgst: 0, total_tax: 0 };
      byRate[rKey].taxable_value += taxable;
      byRate[rKey].cgst += tax / 2;
      byRate[rKey].sgst += tax / 2;
      byRate[rKey].total_tax += tax;

      const hKey = it.hsn_code || 'Not Mapped';
      if (!byHsn[hKey]) byHsn[hKey] = { hsn_code: hKey, description: it.item_name, uqc: 'NOS', quantity: 0, taxable_value: 0, rate, tax_amount: 0 };
      byHsn[hKey].quantity += num(it.quantity);
      byHsn[hKey].taxable_value += taxable;
      byHsn[hKey].tax_amount += tax;
    }

    // Precise path - real CGST/SGST/rate per item, straight from PetPooja.
    if (preciseOutletIds.length > 0) {
      const uploadIds = Object.values(preciseUploadByOutlet);
      const preciseItems = await query(
        `SELECT iti.item_name, iti.quantity, iti.net_amount, iti.cgst, iti.sgst, iti.total_tax, iti.tax_rate,
                mi.hsn_code
         FROM petpooja_item_tax_items iti
         LEFT JOIN menu_items mi ON LOWER(TRIM(mi.item_name)) = LOWER(TRIM(iti.item_name))
         WHERE iti.upload_id IN (${uploadIds.map(() => '?').join(',')})`,
        uploadIds
      );

      for (const it of preciseItems) {
        const taxable = num(it.net_amount);
        const cgst = num(it.cgst);
        const sgst = num(it.sgst);
        const tax = num(it.total_tax);
        const rate = Number(it.tax_rate) || 0;
        const rKey = rate.toFixed(2);
        if (!byRate[rKey]) byRate[rKey] = { rate, taxable_value: 0, cgst: 0, sgst: 0, total_tax: 0 };
        byRate[rKey].taxable_value += taxable;
        byRate[rKey].cgst += cgst;
        byRate[rKey].sgst += sgst;
        byRate[rKey].total_tax += tax;

        const hKey = it.hsn_code || 'Not Mapped';
        if (!byHsn[hKey]) byHsn[hKey] = { hsn_code: hKey, description: it.item_name, uqc: 'NOS', quantity: 0, taxable_value: 0, rate, tax_amount: 0 };
        byHsn[hKey].quantity += num(it.quantity);
        byHsn[hKey].taxable_value += taxable;
        byHsn[hKey].tax_amount += tax;
      }
    }

    const b2cOthers = Object.values(byRate).sort((a, b) => a.rate - b.rate);
    const hsnSummary = Object.values(byHsn).sort((a, b) => (a.hsn_code > b.hsn_code ? 1 : -1));
    const totalTaxable = b2cOthers.reduce((s, r) => s + r.taxable_value, 0);
    const totalTax = b2cOthers.reduce((s, r) => s + r.total_tax, 0);

    const allOutletIds = [...new Set(items.map((it) => Number(it.outlet_id)))];
    const estimatedOutletIds = allOutletIds.filter((id) => !preciseOutletIds.includes(id));

    res.status(200).json({
      success: true,
      data: {
        from_date, to_date,
        total_taxable_value: totalTaxable,
        total_tax: totalTax,
        total_invoice_value: totalTaxable + totalTax,
        b2c_others: b2cOthers,
        hsn_summary: hsnSummary,
        unmapped: { taxable_value: unmappedValue, tax: unmappedTax, row_count: unmappedCount },
        tax_data_quality: {
          precise_outlet_ids: preciseOutletIds,
          estimated_outlet_ids: estimatedOutletIds,
        },
      }
    });
  } catch (error) {
    console.error('Get GSTR-1 report error:', error);
    res.status(500).json({ success: false, message: 'Error generating GSTR-1 report' });
  }
};

export const getSalesGSTReport = async (req, res) => {
  try {
    const { from_date, to_date, outlet_id } = req.query;
    if (!from_date || !to_date) {
      return res.status(400).json({ success: false, message: 'from_date and to_date are required' });
    }

    let where = "u.status = 'Approved' AND COALESCE(u.upload_date_from, u.upload_date) BETWEEN ? AND ?";
    const params = [from_date, to_date];
    if (outlet_id && outlet_id !== 'all') {
      where += ' AND u.outlet_id = ?';
      params.push(outlet_id);
    }

    const rows = await query(
      `SELECT o.id AS outlet_id, o.outlet_name,
        COUNT(DISTINCT u.id) AS upload_count,
        SUM(u.net_sales) AS taxable_value,
        SUM(u.total_tax) AS tax_amount,
        SUM(u.gross_sales) AS gross_value
       FROM petpooja_sales_uploads u
       LEFT JOIN outlets o ON o.id = u.outlet_id
       WHERE ${where}
       GROUP BY o.id, o.outlet_name
       ORDER BY o.outlet_name`,
      params
    );

    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Get sales GST report error:', error);
    res.status(500).json({ success: false, message: 'Error generating sales GST report' });
  }
};

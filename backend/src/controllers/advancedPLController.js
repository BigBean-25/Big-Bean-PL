import { query } from '../config/database.js';

export const getAdvancedMonthlyPL = async (req, res) => {
  try {
    const { month, year, outlet_id } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    let whereClause = 'month = ? AND year = ?';
    const params = [parseInt(month), parseInt(year)];

    if (outlet_id) {
      whereClause += ' AND outlet_id = ?';
      params.push(outlet_id);
    }

    // Get P&L snapshot
    const plData = await query(
      `SELECT pl.*, o.outlet_name
       FROM monthly_pnl_snapshots pl
       LEFT JOIN outlets o ON pl.outlet_id = o.id
       WHERE ${whereClause}`,
      params
    );

    if (plData.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No P&L data found for the specified period'
      });
    }

    // Calculate percentages
    const result = plData.map(pl => {
      const netSales = parseFloat(pl.net_sales) || 0;
      
      return {
        ...pl,
        gross_profit_percentage: netSales > 0 ? ((pl.gross_profit / netSales) * 100).toFixed(2) : 0,
        net_profit_percentage: netSales > 0 ? ((pl.net_profit / netSales) * 100).toFixed(2) : 0,
        cogs_percentage: netSales > 0 ? ((pl.cogs / netSales) * 100).toFixed(2) : 0,
        payroll_percentage: netSales > 0 ? ((pl.total_payroll_cost / netSales) * 100).toFixed(2) : 0,
        expenses_percentage: netSales > 0 ? ((pl.total_fixed_expenses / netSales) * 100).toFixed(2) : 0,
        platform_percentage: netSales > 0 ? ((pl.total_platform_charges / netSales) * 100).toFixed(2) : 0
      };
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get advanced P&L error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching P&L report'
    });
  }
};

export const updatePLComponents = async (req, res) => {
  try {
    const { month, year, outlet_id } = req.body;
    const components = req.body.components || {};

    if (!month || !year || !outlet_id) {
      return res.status(400).json({
        success: false,
        message: 'Month, year, and outlet are required'
      });
    }

    // Check if snapshot exists
    const existing = await query(
      `SELECT id FROM monthly_pnl_snapshots WHERE month = ? AND year = ? AND outlet_id = ?`,
      [month, year, outlet_id]
    );

    if (existing.length === 0) {
      // Create new snapshot
      await query(
        `INSERT INTO monthly_pnl_snapshots (month, year, outlet_id) VALUES (?, ?, ?)`,
        [month, year, outlet_id]
      );
    }

    // Update components
    const updateFields = [];
    const updateValues = [];

    // COGS components
    if (components.opening_stock !== undefined) {
      updateFields.push('opening_stock = ?');
      updateValues.push(components.opening_stock);
    }
    if (components.purchases !== undefined) {
      updateFields.push('purchases = ?');
      updateValues.push(components.purchases);
    }
    if (components.closing_stock !== undefined) {
      updateFields.push('closing_stock = ?');
      updateValues.push(components.closing_stock);
    }

    // Payroll components
    if (components.employee_salary !== undefined) {
      updateFields.push('employee_salary = ?');
      updateValues.push(components.employee_salary);
    }
    if (components.incentives !== undefined) {
      updateFields.push('incentives = ?');
      updateValues.push(components.incentives);
    }
    if (components.overtime !== undefined) {
      updateFields.push('overtime = ?');
      updateValues.push(components.overtime);
    }
    if (components.staff_benefits !== undefined) {
      updateFields.push('staff_benefits = ?');
      updateValues.push(components.staff_benefits);
    }

    // Fixed expenses
    if (components.rent !== undefined) {
      updateFields.push('rent = ?');
      updateValues.push(components.rent);
    }
    if (components.electricity !== undefined) {
      updateFields.push('electricity = ?');
      updateValues.push(components.electricity);
    }
    if (components.water !== undefined) {
      updateFields.push('water = ?');
      updateValues.push(components.water);
    }
    if (components.maintenance !== undefined) {
      updateFields.push('maintenance = ?');
      updateValues.push(components.maintenance);
    }
    if (components.accommodation !== undefined) {
      updateFields.push('accommodation = ?');
      updateValues.push(components.accommodation);
    }
    if (components.other_expenses !== undefined) {
      updateFields.push('other_expenses = ?');
      updateValues.push(components.other_expenses);
    }

    // Platform charges
    if (components.zomato_commission !== undefined) {
      updateFields.push('zomato_commission = ?');
      updateValues.push(components.zomato_commission);
    }
    if (components.swiggy_commission !== undefined) {
      updateFields.push('swiggy_commission = ?');
      updateValues.push(components.swiggy_commission);
    }
    if (components.dine_in_commission !== undefined) {
      updateFields.push('dine_in_commission = ?');
      updateValues.push(components.dine_in_commission);
    }
    if (components.gateway_charges !== undefined) {
      updateFields.push('gateway_charges = ?');
      updateValues.push(components.gateway_charges);
    }
    if (components.tds !== undefined) {
      updateFields.push('tds = ?');
      updateValues.push(components.tds);
    }
    if (components.tcs !== undefined) {
      updateFields.push('tcs = ?');
      updateValues.push(components.tcs);
    }
    if (components.other_deductions !== undefined) {
      updateFields.push('other_deductions = ?');
      updateValues.push(components.other_deductions);
    }

    if (updateFields.length > 0) {
      updateValues.push(month, year, outlet_id);
      await query(
        `UPDATE monthly_pnl_snapshots SET ${updateFields.join(', ')} WHERE month = ? AND year = ? AND outlet_id = ?`,
        updateValues
      );
    }

    res.status(200).json({
      success: true,
      message: 'P&L components updated successfully'
    });
  } catch (error) {
    console.error('Update P&L components error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating P&L components'
    });
  }
};

export const finalizePL = async (req, res) => {
  try {
    const { month, year, outlet_id } = req.body;

    if (!month || !year || !outlet_id) {
      return res.status(400).json({
        success: false,
        message: 'Month, year, and outlet are required'
      });
    }

    await query(
      `UPDATE monthly_pnl_snapshots 
       SET is_finalized = 1, finalized_by = ?, finalized_at = NOW()
       WHERE month = ? AND year = ? AND outlet_id = ?`,
      [req.user.id, month, year, outlet_id]
    );

    res.status(200).json({
      success: true,
      message: 'P&L finalized successfully'
    });
  } catch (error) {
    console.error('Finalize P&L error:', error);
    res.status(500).json({
      success: false,
      message: 'Error finalizing P&L'
    });
  }
};

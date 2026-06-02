import { query } from '../config/database.js';

const outletWhere = (alias, outletId) => ({
  sql: outletId ? `${alias}.outlet_id = ?` : '1=1',
  params: outletId ? [outletId] : []
});

export const getMonthlyOutletPL = async (req, res) => {
  try {
    const { outlet_id, month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0);
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${endDate.getDate()}`;
    const isiOutlet = outletWhere('isi', outlet_id);
    const onlineOutlet = outletWhere('online_payouts', outlet_id);
    const dineOutlet = outletWhere('dine_in_payouts', outlet_id);
    const osiOutlet = outletWhere('osi', outlet_id);
    const csiOutlet = outletWhere('csi', outlet_id);
    const mpiOutlet = outletWhere('mpi', outlet_id);
    const expenseOutlet = outletWhere('daily_cash_expenses', outlet_id);
    const utilityOutlet = outletWhere('utility_bills', outlet_id);
    const salaryOutlet = outletWhere('employee_salary_monthly', outlet_id);

    const salesData = await query(
      `SELECT 
        COALESCE(SUM(gross_sales), 0) as gross_sales,
        COALESCE(SUM(discount), 0) as total_discount,
        COALESCE(SUM(tax), 0) as total_tax,
        COALESCE(SUM(net_sales), 0) as net_sales
       FROM item_sales_items isi
       INNER JOIN item_sales_uploads isu ON isi.upload_id = isu.id
       WHERE ${isiOutlet.sql} AND isi.date >= ? AND isi.date <= ?
       AND isu.status = 'Completed'`,
      [...isiOutlet.params, startDate, endDateStr]
    );

    const onlinePayouts = await query(
      `SELECT 
        COALESCE(SUM(customer_paid_amount), 0) as customer_paid,
        COALESCE(SUM(platform_commission), 0) as commission,
        COALESCE(SUM(payment_gateway_charges), 0) as pg_charges,
        COALESCE(SUM(tcs), 0) as tcs,
        COALESCE(SUM(tds), 0) as tds,
        COALESCE(SUM(other_deductions), 0) as other_deductions,
        COALESCE(SUM(net_payout_expected), 0) as net_payout
       FROM online_payouts
       WHERE ${onlineOutlet.sql} AND month = ? AND year = ?`,
      [...onlineOutlet.params, month, year]
    );

    const dineInPayouts = await query(
      `SELECT 
        COALESCE(SUM(customer_paid_value), 0) as customer_paid,
        COALESCE(SUM(portal_commission), 0) as commission,
        COALESCE(SUM(tcs), 0) as tcs,
        COALESCE(SUM(tds), 0) as tds,
        COALESCE(SUM(expected_payout), 0) as expected_payout
       FROM dine_in_payouts
       WHERE ${dineOutlet.sql} AND month = ? AND year = ?`,
      [...dineOutlet.params, month, year]
    );

    const openingStock = await query(
      `SELECT COALESCE(SUM(value), 0) as opening_stock_value
       FROM opening_stock_items osi
       INNER JOIN opening_stock_uploads osu ON osi.upload_id = osu.id
       WHERE ${osiOutlet.sql} AND osu.month = ? AND osu.year = ?
       AND osu.status = 'Completed'`,
      [...osiOutlet.params, month, year]
    );

    const closingStock = await query(
      `SELECT COALESCE(SUM(value), 0) as closing_stock_value
       FROM closing_stock_items csi
       INNER JOIN closing_stock_uploads csu ON csi.upload_id = csu.id
       WHERE ${csiOutlet.sql} AND csu.month = ? AND csu.year = ?
       AND csu.status = 'Completed'`,
      [...csiOutlet.params, month, year]
    );

    const purchases = await query(
      `SELECT COALESCE(SUM(total_amount), 0) as purchase_value
       FROM material_purchase_items mpi
       INNER JOIN material_purchase_uploads mpu ON mpi.upload_id = mpu.id
       WHERE ${mpiOutlet.sql} AND mpi.date >= ? AND mpi.date <= ?
       AND mpu.status = 'Completed'`,
      [...mpiOutlet.params, startDate, endDateStr]
    );

    const actualConsumption = 
      (openingStock[0].opening_stock_value || 0) + 
      (purchases[0].purchase_value || 0) - 
      (closingStock[0].closing_stock_value || 0);

    const dailyExpenses = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_expenses
       FROM daily_cash_expenses
       WHERE ${expenseOutlet.sql} AND date >= ? AND date <= ?
       AND status = 'Approved'`,
      [...expenseOutlet.params, startDate, endDateStr]
    );

    const utilities = await query(
      `SELECT 
        COALESCE(electricity_bill, 0) as electricity,
        COALESCE(maintenance_cost, 0) as maintenance,
        COALESCE(water_bill, 0) as water,
        COALESCE(garbage, 0) as garbage,
        COALESCE(internet, 0) as internet,
        COALESCE(gas_monthly, 0) as gas,
        COALESCE(other_utility, 0) as other_utility,
        COALESCE(total_utility_cost, 0) as total_utility
       FROM utility_bills
       WHERE ${utilityOutlet.sql} AND month = ? AND year = ?`,
      [...utilityOutlet.params, month, year]
    );

    const salary = await query(
      `SELECT 
        COALESCE(total_employee_salary, 0) as salary,
        COALESCE(incentive_bonus, 0) as incentive,
        COALESCE(staff_accommodation, 0) as accommodation,
        COALESCE(other_staff_cost, 0) as other_staff,
        COALESCE(total_salary_cost, 0) as total_salary
       FROM employee_salary_monthly
       WHERE ${salaryOutlet.sql} AND month = ? AND year = ?`,
      [...salaryOutlet.params, month, year]
    );

    const sales = salesData[0];
    const online = onlinePayouts[0];
    const dineIn = dineInPayouts[0];
    const util = utilities[0] || {};
    const sal = salary[0] || {};

    const adjustedSales = (sales.net_sales || 0);
    
    const totalOnlineDeductions = 
      (online.commission || 0) + 
      (online.pg_charges || 0) + 
      (online.tcs || 0) + 
      (online.tds || 0) + 
      (online.other_deductions || 0);

    const totalDineInDeductions = 
      (dineIn.commission || 0) + 
      (dineIn.tcs || 0) + 
      (dineIn.tds || 0);

    const totalExpenses = 
      actualConsumption +
      (dailyExpenses[0].total_expenses || 0) +
      (util.total_utility || 0) +
      (sal.total_salary || 0);

    const profitLoss = adjustedSales - totalExpenses;

    const foodCostPercentage = adjustedSales > 0 ? (actualConsumption / adjustedSales * 100) : 0;
    const salaryCostPercentage = adjustedSales > 0 ? ((sal.total_salary || 0) / adjustedSales * 100) : 0;
    const utilityCostPercentage = adjustedSales > 0 ? ((util.total_utility || 0) / adjustedSales * 100) : 0;
    const netProfitPercentage = adjustedSales > 0 ? (profitLoss / adjustedSales * 100) : 0;

    const plReport = {
      outlet_id: outlet_id || 'all',
      month,
      year,
      revenue: {
        gross_sales: sales.gross_sales || 0,
        discounts: sales.total_discount || 0,
        taxes: sales.total_tax || 0,
        net_sales: sales.net_sales || 0,
        online_commission: online.commission || 0,
        payment_gateway_charges: online.pg_charges || 0,
        tcs_tds: (online.tcs || 0) + (online.tds || 0) + (dineIn.tcs || 0) + (dineIn.tds || 0),
        total_online_deductions: totalOnlineDeductions,
        total_dinein_deductions: totalDineInDeductions,
        adjusted_sales: adjustedSales
      },
      cost_of_goods: {
        opening_stock: openingStock[0].opening_stock_value || 0,
        purchases: purchases[0].purchase_value || 0,
        closing_stock: closingStock[0].closing_stock_value || 0,
        actual_consumption: actualConsumption
      },
      operating_expenses: {
        daily_cash_expenses: dailyExpenses[0].total_expenses || 0,
        electricity_bill: util.electricity || 0,
        maintenance_cost: util.maintenance || 0,
        water_bill: util.water || 0,
        garbage: util.garbage || 0,
        internet: util.internet || 0,
        gas: util.gas || 0,
        other_utility: util.other_utility || 0,
        total_utilities: util.total_utility || 0,
        employee_salary: sal.salary || 0,
        incentive_bonus: sal.incentive || 0,
        staff_accommodation: sal.accommodation || 0,
        other_staff_cost: sal.other_staff || 0,
        total_salary: sal.total_salary || 0,
        total_operating_expenses: (dailyExpenses[0].total_expenses || 0) + (util.total_utility || 0) + (sal.total_salary || 0)
      },
      summary: {
        total_revenue: adjustedSales,
        total_expenses: totalExpenses,
        profit_loss: profitLoss,
        food_cost_percentage: foodCostPercentage.toFixed(2),
        salary_cost_percentage: salaryCostPercentage.toFixed(2),
        utility_cost_percentage: utilityCostPercentage.toFixed(2),
        net_profit_percentage: netProfitPercentage.toFixed(2)
      }
    };

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

export const getActualConsumptionReport = async (req, res) => {
  try {
    const { outlet_id, month, year } = req.query;

    if (!outlet_id || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Outlet, month, and year are required'
      });
    }

    const openingStock = await query(
      `SELECT 
        osi.raw_material_id,
        rm.material_name,
        rm.material_code,
        c.category_name,
        u.unit_name,
        COALESCE(SUM(osi.qty), 0) as opening_qty,
        COALESCE(SUM(osi.value), 0) as opening_value
       FROM opening_stock_items osi
       INNER JOIN opening_stock_uploads osu ON osi.upload_id = osu.id
       LEFT JOIN raw_materials rm ON osi.raw_material_id = rm.id
       LEFT JOIN categories c ON rm.category_id = c.id
       LEFT JOIN units u ON rm.unit_id = u.id
       WHERE osi.outlet_id = ? AND osu.month = ? AND osu.year = ?
       AND osu.status = 'Completed'
       GROUP BY osi.raw_material_id, rm.material_name, rm.material_code, c.category_name, u.unit_name`,
      [outlet_id, month, year]
    );

    const closingStock = await query(
      `SELECT 
        csi.raw_material_id,
        COALESCE(SUM(csi.qty), 0) as closing_qty,
        COALESCE(SUM(csi.value), 0) as closing_value
       FROM closing_stock_items csi
       INNER JOIN closing_stock_uploads csu ON csi.upload_id = csu.id
       WHERE csi.outlet_id = ? AND csu.month = ? AND csu.year = ?
       AND csu.status = 'Completed'
       GROUP BY csi.raw_material_id`,
      [outlet_id, month, year]
    );

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0);
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${endDate.getDate()}`;

    const purchases = await query(
      `SELECT 
        mpi.raw_material_id,
        COALESCE(SUM(mpi.qty), 0) as purchase_qty,
        COALESCE(SUM(mpi.total_amount), 0) as purchase_value
       FROM material_purchase_items mpi
       INNER JOIN material_purchase_uploads mpu ON mpi.upload_id = mpu.id
       WHERE mpi.outlet_id = ? AND mpi.date >= ? AND mpi.date <= ?
       AND mpu.status = 'Completed'
       GROUP BY mpi.raw_material_id`,
      [outlet_id, startDate, endDateStr]
    );

    const closingMap = {};
    closingStock.forEach(item => {
      closingMap[item.raw_material_id] = item;
    });

    const purchaseMap = {};
    purchases.forEach(item => {
      purchaseMap[item.raw_material_id] = item;
    });

    const consumptionReport = openingStock.map(item => {
      const closing = closingMap[item.raw_material_id] || { closing_qty: 0, closing_value: 0 };
      const purchase = purchaseMap[item.raw_material_id] || { purchase_qty: 0, purchase_value: 0 };

      const actualQty = item.opening_qty + purchase.purchase_qty - closing.closing_qty;
      const actualValue = item.opening_value + purchase.purchase_value - closing.closing_value;

      return {
        raw_material_id: item.raw_material_id,
        material_name: item.material_name,
        material_code: item.material_code,
        category: item.category_name,
        unit: item.unit_name,
        opening_qty: item.opening_qty,
        opening_value: item.opening_value,
        purchase_qty: purchase.purchase_qty,
        purchase_value: purchase.purchase_value,
        closing_qty: closing.closing_qty,
        closing_value: closing.closing_value,
        actual_consumption_qty: actualQty,
        actual_consumption_value: actualValue
      };
    });

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

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0);
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${endDate.getDate()}`;

    const sales = await query(
      `SELECT 
        isi.menu_item_id,
        mi.item_name,
        mi.item_code,
        c.category_name,
        COALESCE(SUM(isi.qty_sold), 0) as total_qty_sold
       FROM item_sales_items isi
       INNER JOIN item_sales_uploads isu ON isi.upload_id = isu.id
       LEFT JOIN menu_items mi ON isi.menu_item_id = mi.id
       LEFT JOIN categories c ON mi.category_id = c.id
       WHERE isi.outlet_id = ? AND isi.date >= ? AND isi.date <= ?
       AND isu.status = 'Completed' AND isi.menu_item_id IS NOT NULL
       GROUP BY isi.menu_item_id, mi.item_name, mi.item_code, c.category_name`,
      [outlet_id, startDate, endDateStr]
    );

    const theoreticalConsumption = [];

    for (const sale of sales) {
      const recipeItems = await query(
        `SELECT 
          ri.raw_material_id,
          rm.material_name,
          rm.material_code,
          ri.qty_per_item,
          u.unit_name,
          ri.waste_percentage
         FROM recipe_items ri
         INNER JOIN recipes r ON ri.recipe_id = r.id
         LEFT JOIN raw_materials rm ON ri.raw_material_id = rm.id
         LEFT JOIN units u ON ri.unit_id = u.id
         WHERE r.menu_item_id = ? AND r.status = 'Active'
         AND (r.for_outlet_id IS NULL OR r.for_outlet_id = ?)`,
        [sale.menu_item_id, outlet_id]
      );

      for (const recipeItem of recipeItems) {
        const totalUsedQty = sale.total_qty_sold * recipeItem.qty_per_item;
        
        theoreticalConsumption.push({
          menu_item_id: sale.menu_item_id,
          item_name: sale.item_name,
          item_code: sale.item_code,
          category: sale.category_name,
          qty_sold: sale.total_qty_sold,
          raw_material_id: recipeItem.raw_material_id,
          material_name: recipeItem.material_name,
          material_code: recipeItem.material_code,
          recipe_qty_per_item: recipeItem.qty_per_item,
          unit: recipeItem.unit_name,
          waste_percentage: recipeItem.waste_percentage,
          total_used_qty: totalUsedQty
        });
      }
    }

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
    const { outlet_id, start_date, end_date } = req.query;

    let whereClause = '1=1';
    const params = [];

    if (outlet_id) {
      whereClause += ' AND dc.outlet_id = ?';
      params.push(outlet_id);
    }

    if (start_date) {
      whereClause += ' AND dc.date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ' AND dc.date <= ?';
      params.push(end_date);
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
    const { outlet_id, start_date, end_date, expense_head_id } = req.query;

    let whereClause = 'dce.status = "Approved"';
    const params = [];

    if (outlet_id) {
      whereClause += ' AND dce.outlet_id = ?';
      params.push(outlet_id);
    }

    if (start_date) {
      whereClause += ' AND dce.date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ' AND dce.date <= ?';
      params.push(end_date);
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

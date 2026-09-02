import dotenv from 'dotenv';
dotenv.config();
import { getConnection } from './src/config/database.js';

// The original monthly_pnl_snapshots schema (COMPLETE_SCHEMA_WITH_PETPOOJA.sql) predates
// plCalculator.js's getOutletPL() and models revenue/costs completely differently
// (per-platform zomato/swiggy commission columns, a separate "Outlet Fixed Expenses" rent/
// electricity/water block, no daily_cash_expenses column at all) - its generated net_profit
// column can never agree with the P&L report or dashboard, which both already treat
// getOutletPL() as the single source of truth. The table has zero rows and nothing in the
// codebase references its columns, so it's safe to redesign rather than patch: this
// recreates it as a flat mirror of getOutletPL()'s output shape, so a finalized snapshot is
// just that function's return value frozen into columns, not a second parallel formula.
// Safety check: the redesign above (and the DROP TABLE it requires) is only
// safe because the table comment above assumed it has zero rows. That
// assumption was never actually verified in code - re-running this script
// against a database where the table has since been used for real would
// silently destroy finalized month-end P&L history. Count the rows first
// and refuse to proceed unless it's actually empty, or the operator
// explicitly passes --force to override.
const FORCE = process.argv.includes('--force');

const conn = await getConnection();
let success = false;
try {
  await conn.beginTransaction();

  const [[{ rowCount }]] = await conn.query(
    "SELECT COUNT(*) AS rowCount FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'monthly_pnl_snapshots'"
  );
  if (rowCount > 0) {
    const [[{ existingRows }]] = await conn.query('SELECT COUNT(*) AS existingRows FROM monthly_pnl_snapshots');
    if (existingRows > 0 && !FORCE) {
      throw new Error(
        `Refusing to drop monthly_pnl_snapshots: it has ${existingRows} row(s). This would destroy finalized month history. ` +
        `Back up the table first, or re-run with --force if you are certain you want to discard this data.`
      );
    }
    if (existingRows > 0 && FORCE) {
      console.warn(`--force passed: dropping monthly_pnl_snapshots despite ${existingRows} existing row(s).`);
    }
  }

  await conn.execute('DROP TABLE IF EXISTS monthly_pnl_snapshots');

  await conn.execute(`
    CREATE TABLE monthly_pnl_snapshots (
      id INT PRIMARY KEY AUTO_INCREMENT,
      month INT NOT NULL,
      year INT NOT NULL,
      outlet_id INT NOT NULL,

      gross_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
      discounts DECIMAL(12,2) NOT NULL DEFAULT 0,
      taxes DECIMAL(12,2) NOT NULL DEFAULT 0,
      net_sales DECIMAL(12,2) NOT NULL DEFAULT 0,
      online_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
      payment_gateway_charges DECIMAL(12,2) NOT NULL DEFAULT 0,
      tcs_tds DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_online_deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_dinein_deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
      adjusted_sales DECIMAL(12,2) NOT NULL DEFAULT 0,

      opening_stock DECIMAL(12,2) NOT NULL DEFAULT 0,
      purchases DECIMAL(12,2) NOT NULL DEFAULT 0,
      closing_stock DECIMAL(12,2) NOT NULL DEFAULT 0,
      actual_consumption DECIMAL(12,2) NOT NULL DEFAULT 0,

      daily_cash_expenses DECIMAL(12,2) NOT NULL DEFAULT 0,
      electricity_bill DECIMAL(12,2) NOT NULL DEFAULT 0,
      maintenance_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
      water_bill DECIMAL(12,2) NOT NULL DEFAULT 0,
      garbage DECIMAL(12,2) NOT NULL DEFAULT 0,
      internet DECIMAL(12,2) NOT NULL DEFAULT 0,
      gas DECIMAL(12,2) NOT NULL DEFAULT 0,
      other_utility DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_utilities DECIMAL(12,2) NOT NULL DEFAULT 0,
      employee_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
      incentive_bonus DECIMAL(12,2) NOT NULL DEFAULT 0,
      staff_accommodation DECIMAL(12,2) NOT NULL DEFAULT 0,
      other_staff_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_operating_expenses DECIMAL(12,2) NOT NULL DEFAULT 0,

      total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_expenses DECIMAL(12,2) NOT NULL DEFAULT 0,
      profit_loss DECIMAL(12,2) NOT NULL DEFAULT 0,
      food_cost_percentage DECIMAL(6,2) NOT NULL DEFAULT 0,
      salary_cost_percentage DECIMAL(6,2) NOT NULL DEFAULT 0,
      utility_cost_percentage DECIMAL(6,2) NOT NULL DEFAULT 0,
      net_profit_percentage DECIMAL(6,2) NOT NULL DEFAULT 0,

      is_finalized BOOLEAN NOT NULL DEFAULT 1,
      finalized_by INT,
      finalized_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      FOREIGN KEY (outlet_id) REFERENCES outlets(id),
      FOREIGN KEY (finalized_by) REFERENCES users(id),
      UNIQUE KEY unique_month_outlet (month, year, outlet_id),
      INDEX idx_period (year, month)
    ) ENGINE=InnoDB COMMENT='Frozen getOutletPL() snapshots, written only by the finalize-month action'
  `);

  await conn.commit();
  success = true;
  console.log('monthly_pnl_snapshots redesigned to mirror getOutletPL() output');
} catch (e) {
  await conn.rollback();
  // Print + a non-zero exit code below are load-bearing here: without them,
  // the safety-check error above (or any other failure) would be silently
  // swallowed by the unconditional process.exit(0) that used to sit in this
  // finally block, making the script look like it succeeded even when it
  // refused to run.
  console.error(e.message || e);
} finally {
  conn.release();
  process.exit(success ? 0 : 1);
}

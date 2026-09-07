import dotenv from 'dotenv';
dotenv.config();
import { getConnection } from './src/config/database.js';

// outlet_fixed_costs has fed plCalculator.js's Net Profit unconditionally since
// creation, with no Draft/Submitted/Verified review gate - unlike every other
// P&L input in the same function (daily_cash_expenses filtered to Approved,
// utility_bills/employee_salary_monthly filtered to Verified). This adds the
// same review gate here: a status column plus verified_by/verified_at,
// reviewed through a single combined submit/verify/reject endpoint (see
// verifyFixedCost in fixedCostsController.js), modeled on utility_bills'
// verifyUtilityBill.
//
// Existing rows are backfilled to 'Verified' (not left at the new 'Draft'
// default) so plCalculator.js's now-status-filtered query returns the exact
// same total it did before this migration for every already-recorded
// outlet/month - only newly entered fixed costs go through the review gate.
const conn = await getConnection();
try {
  await conn.beginTransaction();

  const [existing] = await conn.execute("SHOW COLUMNS FROM outlet_fixed_costs LIKE 'status'");
  if (existing.length === 0) {
    await conn.execute(
      `ALTER TABLE outlet_fixed_costs
       ADD COLUMN status ENUM('Draft','Submitted','Verified','Rejected') NOT NULL DEFAULT 'Draft' AFTER remarks,
       ADD COLUMN verified_by INT NULL AFTER updated_by,
       ADD COLUMN verified_at DATETIME NULL AFTER verified_by,
       ADD CONSTRAINT fk_ofc_verified_by FOREIGN KEY (verified_by) REFERENCES users(id)`
    );
    console.log('Added status / verified_by / verified_at to outlet_fixed_costs');

    const [result] = await conn.execute(`UPDATE outlet_fixed_costs SET status = 'Verified'`);
    console.log(`Backfilled ${result.affectedRows} existing row(s) to status = 'Verified'`);
  } else {
    console.log('status column already exists on outlet_fixed_costs, skipping');
  }

  await conn.commit();
  console.log('Migration completed');
} catch (e) {
  await conn.rollback();
  throw e;
} finally {
  conn.release();
  process.exit(0);
}

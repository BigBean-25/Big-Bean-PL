import dotenv from 'dotenv';
dotenv.config();
import { getConnection } from './src/config/database.js';

// monthly_pnl_snapshots was designed to mirror getOutletPL()'s operating_expenses shape
// before fixed costs existed as an input. Now that plCalculator.js folds outlet_fixed_costs
// into total_operating_expenses, the snapshot needs its own column so a finalized month's
// fixed-cost breakdown is preserved too, not just absorbed into the total.
const conn = await getConnection();
try {
  await conn.beginTransaction();

  const [existing] = await conn.execute("SHOW COLUMNS FROM monthly_pnl_snapshots LIKE 'fixed_costs'");
  if (existing.length === 0) {
    await conn.execute(
      `ALTER TABLE monthly_pnl_snapshots
       ADD COLUMN fixed_costs DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER total_salary`
    );
    console.log('Added fixed_costs column to monthly_pnl_snapshots');
  } else {
    console.log('fixed_costs column already exists, skipping ALTER');
  }

  await conn.commit();
} catch (e) {
  await conn.rollback();
  throw e;
} finally {
  conn.release();
  process.exit(0);
}

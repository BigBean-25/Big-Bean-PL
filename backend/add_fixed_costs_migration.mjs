import dotenv from 'dotenv';
dotenv.config();
import { query, getConnection } from './src/config/database.js';
import { ROLE_PERMISSION_MODULES, buildDefaultPermissionMatrix } from './src/utils/rolePermissionModules.js';

// Phase 7 fixed-costs entry infrastructure (rent, marketing, and other outlet-level
// recurring costs). This is deliberately a standalone editable table, not a direct edit
// surface on monthly_pnl_snapshots - it feeds into a snapshot at finalize time the same way
// every other P&L input does. NOTE: this migration only creates the table and its
// permissions; it does NOT wire fixed costs into plCalculator.js's Net Profit formula -
// that fold-in changes historical Net Profit the first time it happens and needs separate
// explicit confirmation before it ships.
const conn = await getConnection();
try {
  await conn.beginTransaction();

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS outlet_fixed_costs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      outlet_id INT NOT NULL,
      month INT NOT NULL,
      year INT NOT NULL,
      category VARCHAR(100) NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      remarks TEXT,
      created_by INT,
      updated_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (outlet_id) REFERENCES outlets(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (updated_by) REFERENCES users(id),
      UNIQUE KEY unique_outlet_month_category (outlet_id, month, year, category),
      INDEX idx_period (year, month)
    ) ENGINE=InnoDB COMMENT='Editable rent/marketing/other recurring outlet costs, entered pre-finalization'
  `);
  console.log('outlet_fixed_costs table ready');

  await conn.commit();
} catch (e) {
  await conn.rollback();
  throw e;
} finally {
  conn.release();
}

const moduleNameByKey = Object.fromEntries(
  ROLE_PERMISSION_MODULES.map((m) => [m.module_key, m.module_name])
);

const roles = await query('SELECT id, role_name FROM roles');

let inserted = 0;
for (const { id, role_name } of roles) {
  const defaults = buildDefaultPermissionMatrix(role_name);
  const a = defaults.fixed_costs || {};
  try {
    const result = await query(
      `INSERT IGNORE INTO role_permissions
         (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete,
          can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, 'fixed_costs', moduleNameByKey.fixed_costs || 'Fixed Costs',
        a.can_view || 0, a.can_create || 0, a.can_edit || 0, a.can_delete || 0,
        a.can_upload || 0, a.can_submit || 0, a.can_verify || 0, a.can_approve || 0,
        a.can_reject || 0, a.can_lock || 0, a.can_export || 0, a.is_read_only || 0,
      ]
    );
    if (result.affectedRows) inserted += result.affectedRows;
  } catch (error) {
    console.error(`Role ${role_name} (${id}) module fixed_costs error:`, error.message);
  }
}

console.log(`Done. Seeded fixed_costs role_permissions for ${inserted} role(s) (of ${roles.length} total).`);
process.exit(0);

import dotenv from 'dotenv';
dotenv.config();
import { query, getConnection } from './src/config/database.js';
import { ROLE_PERMISSION_MODULES, buildDefaultPermissionMatrix } from './src/utils/rolePermissionModules.js';

// Outlet Dashboard infrastructure: one settable monthly sales target per
// outlet, used by the new Outlet Dashboard overview page to show
// actual-vs-target alongside the existing gross/net sales figures.
const conn = await getConnection();
try {
  await conn.beginTransaction();

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS sales_targets (
      id INT PRIMARY KEY AUTO_INCREMENT,
      outlet_id INT NOT NULL,
      month INT NOT NULL,
      year INT NOT NULL,
      target_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (outlet_id) REFERENCES outlets(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      UNIQUE KEY unique_outlet_month (outlet_id, month, year)
    ) ENGINE=InnoDB COMMENT='Monthly sales target per outlet for the Outlet Dashboard overview'
  `);
  console.log('sales_targets table ready');

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
  const a = defaults.sales_target || {};
  try {
    const result = await query(
      `INSERT IGNORE INTO role_permissions
         (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete,
          can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, 'sales_target', moduleNameByKey.sales_target || 'Sales Target',
        a.can_view || 0, a.can_create || 0, a.can_edit || 0, a.can_delete || 0,
        a.can_upload || 0, a.can_submit || 0, a.can_verify || 0, a.can_approve || 0,
        a.can_reject || 0, a.can_lock || 0, a.can_export || 0, a.is_read_only || 0,
      ]
    );
    if (result.affectedRows) inserted += result.affectedRows;
  } catch (error) {
    console.error(`Role ${role_name} (${id}) module sales_target error:`, error.message);
  }
}

console.log(`Done. Seeded sales_target role_permissions for ${inserted} role(s) (of ${roles.length} total).`);
process.exit(0);

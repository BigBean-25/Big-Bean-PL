// Lightweight migration tracker for Big Bean Café ERP.
//
// Why this exists: nothing in this repo previously tracked which of the ~30
// loose .sql/.mjs files under database/ and backend/ had actually been run
// against a given database. That made every deploy a guessing game. This
// script fixes that going forward for the migrations below - it does NOT
// retroactively know what already ran, so the first real run against an
// existing database should use --mark-only (see below) to record the
// current state without re-executing anything, then future runs behave
// normally.
//
// Usage:
//   node database/migrate.mjs                 run every pending migration, in order
//   node database/migrate.mjs --dry-run        list what's pending without running anything
//   node database/migrate.mjs --mark-only      record every migration below as already
//                                               applied, without running any of them -
//                                               use this ONCE against a database that
//                                               already has some/all of these applied
//                                               manually, to establish a baseline
//
// Scope: only migrations that a live audit traced as required by currently
// deployed backend controllers are listed here (see the "why" comment on
// each entry). Every other loose .mjs script in backend/ and database/
// (one-off debug/backfill/cleanup scripts like show_schema.mjs,
// clean_test_user.mjs, fix_perms.mjs, the warehouse_*_runtime.mjs files,
// etc.) is deliberately NOT included - they were ad-hoc, not written as
// repeatable migrations, and need individual review before being trusted
// to run unattended. Add them here explicitly, one at a time, once each has
// been read and confirmed safe to re-run.

// No dotenv here deliberately: database/ has no node_modules of its own
// (only backend/ does), and this script is meant to be invoked with
// DB_HOST/DB_USER/etc. already set on the command line, same as the
// individual backend/*.mjs migrations it runs as child processes.
import { getConnection } from '../backend/src/config/database.js';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFile } from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Ordered - each entry must be safe to run after everything above it.
const MIGRATIONS = [
  { name: 'role_permissions_migration.sql', file: 'database/role_permissions_migration.sql', why: 'base role_permissions table + default grants' },
  { name: 'role_outlet_security_migration.sql', file: 'database/role_outlet_security_migration.sql', why: 'user_outlets, audit_logs, outlet scoping columns' },
  { name: 'notifications_migration.sql', file: 'database/notifications_migration.sql', why: 'notificationController.js / notificationService.js' },
  { name: 'add_item_hsn_gst_fields.sql', file: 'database/add_item_hsn_gst_fields.sql', why: 'hsn_code/gst_rate/description on raw_materials + menu_items' },
  { name: 'fix_masters_description_column.sql', file: 'database/fix_masters_description_column.sql', why: 'guarded duplicate of the description column add above - must run after it' },
  { name: 'add_location_invoice_details.sql', file: 'database/add_location_invoice_details.sql', why: 'gstin/address/city/state/pincode on locations, read by warehouse purchase-order + dispatch reports' },
  { name: 'add_material_purchase_paid_by.sql', file: 'database/add_material_purchase_paid_by.sql', why: 'material_purchase_items.paid_by' },
  { name: 'add_outlet_vendor_credit_days.sql', file: 'database/add_outlet_vendor_credit_days.sql', why: 'outlet_vendors.credit_days, used by ageing/credit views' },
  { name: 'add_outlet_vendors_module.sql', file: 'database/add_outlet_vendors_module.sql', why: 'outletVendorController.js' },
  { name: 'add_petpooja_item_tax_report.sql', file: 'database/add_petpooja_item_tax_report.sql', why: 'petpoojaItemTaxController.js' },
  { name: 'add_warehouse_transfer_pricing.sql', file: 'database/add_warehouse_transfer_pricing.sql', why: 'transfer_price/sale_value on warehouse transfer tables' },
  { name: 'daily_checklist_migration.sql', file: 'database/daily_checklist_migration.sql', why: 'daily_checklists / daily_checklist_items / daily_checklist_responses' },
  { name: 'month_end_verify_migration.sql', file: 'database/month_end_verify_migration.sql', why: 'verified_by/verified_at on employee_salary_monthly + utility_bills' },
  { name: 'payout_workflow_migration.sql', file: 'database/payout_workflow_migration.sql', why: 'payout maker/checker audit columns' },
  { name: 'payout_duplicate_protection_migration.sql', file: 'database/payout_duplicate_protection_migration.sql', why: 'unique-index dedup guard on payouts - run after the workflow migration above' },
  { name: 'warehouse_phase2a_migration.mjs (locations, GRN, stock ledger)', file: 'database/warehouse_phase2a_migration.mjs', why: 'warehouseMiddleware.js + all warehouse*Service.js' },
  { name: 'warehouse_phase2b_migration.mjs (requisitions/transfers)', file: 'backend/warehouse_phase2b_migration.mjs', why: 'stock_requisitions, stock_transfers' },
  { name: 'warehouse_phase2c_migration.mjs (counts/adjustments/wastage)', file: 'backend/warehouse_phase2c_migration.mjs', why: 'physical_stock_counts, stock_adjustments, warehouse_wastage' },
  { name: 'warehouse_phase2d_migration.mjs (batch/expiry)', file: 'backend/warehouse_phase2d_migration.mjs', why: 'raw_materials batch/expiry tracking flags' },
  { name: 'warehouse_phase2e_migration.mjs (returns/credits)', file: 'backend/warehouse_phase2e_migration.mjs', why: 'purchase_returns, supplier_credits' },
  { name: 'warehouse_phase2f_migration.mjs (purchase orders)', file: 'backend/warehouse_phase2f_migration.mjs', why: 'purchase_orders, purchase_order_items' },
  { name: 'warehouse_phase2h_migration.mjs (reorder)', file: 'database/warehouse_phase2h_migration.mjs', why: 'lead_time_days/safety_stock_qty + indexes' },
  { name: 'add_fixed_costs_migration.mjs', file: 'backend/add_fixed_costs_migration.mjs', why: 'outlet_fixed_costs table, fixedCostsController.js' },
  { name: 'redesign_monthly_pnl_snapshots_migration.mjs', file: 'backend/redesign_monthly_pnl_snapshots_migration.mjs', why: 'rebuilds monthly_pnl_snapshots to match plCalculator.js - has its own row-count safety check, DESTRUCTIVE if forced on a non-empty table' },
  { name: 'add_fixed_costs_to_snapshot_migration.mjs', file: 'backend/add_fixed_costs_to_snapshot_migration.mjs', why: 'adds fixed_costs column to the redesigned snapshot table above - must run after it' },
];

async function ensureTrackingTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
}

async function getApplied(conn) {
  const [rows] = await conn.query('SELECT name FROM schema_migrations');
  return new Set(rows.map(r => r.name));
}

async function runSqlFile(conn, absPath) {
  const raw = await readFile(absPath, 'utf8');
  // Split on ; at end of line - good enough for these files (no stored
  // procedures with internal semicolons among the ones listed above).
  const statements = raw
    .split(/;\s*(?:\r?\n|$)/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  for (const stmt of statements) {
    await conn.query(stmt);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const markOnly = process.argv.includes('--mark-only');

  const conn = await getConnection();
  try {
    await ensureTrackingTable(conn);
    const applied = await getApplied(conn);

    for (const m of MIGRATIONS) {
      if (applied.has(m.name)) {
        console.log(`skip (already applied): ${m.name}`);
        continue;
      }

      if (dryRun) {
        console.log(`pending: ${m.name}  -  ${m.why}`);
        continue;
      }

      if (markOnly) {
        await conn.execute('INSERT INTO schema_migrations (name) VALUES (?)', [m.name]);
        console.log(`marked as applied (not run): ${m.name}`);
        continue;
      }

      const absPath = path.join(repoRoot, m.file);
      console.log(`running: ${m.name} (${m.file})`);
      if (m.file.endsWith('.sql')) {
        await runSqlFile(conn, absPath);
      } else {
        // .mjs migrations manage their own connection/transaction and call
        // process.exit() themselves, so they must run as a child process,
        // not be imported into this one.
        const { execFileSync } = await import('child_process');
        execFileSync(process.execPath, [absPath], { stdio: 'inherit', cwd: repoRoot });
      }
      await conn.execute('INSERT INTO schema_migrations (name) VALUES (?)', [m.name]);
      console.log(`done: ${m.name}`);
    }

    console.log(dryRun ? '\nDry run complete - nothing was executed.' : '\nAll listed migrations are applied.');
  } finally {
    conn.release();
    process.exit(0);
  }
}

main().catch(e => {
  console.error('Migration run failed:', e.message || e);
  process.exit(1);
});

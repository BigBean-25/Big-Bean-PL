export const PERMISSION_ACTIONS = [
  'can_view',
  'can_create',
  'can_edit',
  'can_delete',
  'can_upload',
  'can_submit',
  'can_verify',
  'can_approve',
  'can_reject',
  'can_lock',
  'can_export',
  'is_read_only'
];

export const ROLE_PERMISSION_MODULES = [
  { module_key: 'dashboard', module_name: 'Dashboard' },
  { module_key: 'users', module_name: 'Users' },
  { module_key: 'roles', module_name: 'Roles' },
  { module_key: 'role_access', module_name: 'Role Access' },
  { module_key: 'outlets', module_name: 'Outlets' },
  { module_key: 'masters', module_name: 'Masters' },
  { module_key: 'categories', module_name: 'Categories' },
  { module_key: 'suppliers', module_name: 'Suppliers' },
  { module_key: 'raw_materials', module_name: 'Raw Materials' },
  { module_key: 'menu_items', module_name: 'Menu Items' },
  { module_key: 'daily_cashbook', module_name: 'Daily Cashbook' },
  { module_key: 'daily_expenses', module_name: 'Daily Expenses' },
  { module_key: 'day_closing', module_name: 'Day Closing' },
  { module_key: 'daily_checklist', module_name: 'Daily Checklist' },
  { module_key: 'bank_deposits', module_name: 'Bank Deposits' },
  { module_key: 'opening_stock', module_name: 'Opening Stock' },
  { module_key: 'closing_stock', module_name: 'Closing Stock' },
  { module_key: 'material_purchase', module_name: 'Material Purchase' },
  { module_key: 'supplier_payments', module_name: 'Supplier Payments' },
  { module_key: 'outlet_vendors', module_name: 'Outlet Vendors' },
  { module_key: 'outlet_vendor_master', module_name: 'Outlet Vendor Master' },
  { module_key: 'vendor_purchases', module_name: 'Vendor Purchases' },
  { module_key: 'vendor_ledger_payments', module_name: 'Vendor Ledger & Payments' },
  { module_key: 'item_sales', module_name: 'Item-wise Sales' },
  { module_key: 'item_sales_daily', module_name: 'Daily Sales Upload' },
  { module_key: 'item_sales_monthly', module_name: 'Monthly Sales Upload' },
  { module_key: 'item_sales_tax', module_name: 'Item Tax Report' },
  { module_key: 'payroll', module_name: 'Payroll' },
  { module_key: 'utility_bills', module_name: 'Utility Bills' },
  { module_key: 'online_payouts', module_name: 'Online Payouts' },
  { module_key: 'dine_in_payouts', module_name: 'Dine-in Payouts' },
  { module_key: 'recipe_list', module_name: 'Recipe List' },
  { module_key: 'add_recipe', module_name: 'Add Recipe' },
  { module_key: 'reports', module_name: 'Reports' },
  { module_key: 'controlled_exceptions', module_name: 'Exceptions & Reversals' },
  { module_key: 'monthly_pl', module_name: 'Monthly P&L' },
  { module_key: 'fixed_costs', module_name: 'Fixed Costs' },
  { module_key: 'sales_target', module_name: 'Sales Target' },
  { module_key: 'warehouse_dashboard', module_name: 'Warehouse Dashboard' },
  { module_key: 'warehouse_stock', module_name: 'Warehouse Current Stock' },
  { module_key: 'warehouse_ledger', module_name: 'Warehouse Stock Ledger' },
  { module_key: 'grn', module_name: 'GRN' },
  { module_key: 'locations', module_name: 'Inventory Locations' },
  { module_key: 'warehouse_requisitions', module_name: 'Stock Requisitions' },
  { module_key: 'warehouse_transfers', module_name: 'Stock Transfers' },
  { module_key: 'physical_stock_counts', module_name: 'Physical Stock Count' },
  { module_key: 'stock_adjustments', module_name: 'Stock Adjustments' },
  { module_key: 'warehouse_wastage', module_name: 'Warehouse Wastage & Damage' },
  { module_key: 'outlet_consumption', module_name: 'Outlet Consumption' },
  { module_key: 'warehouse_batch_expiry', module_name: 'Batch & Expiry' },
  { module_key: 'warehouse_purchase_returns', module_name: 'Purchase Returns' },
  { module_key: 'warehouse_purchase_orders', module_name: 'Purchase Orders' },
  { module_key: 'warehouse_supplier_history', module_name: 'Supplier Purchase History' },
  { module_key: 'warehouse_reorder', module_name: 'Low Stock / Reorder' },
  { module_key: 'warehouse_reports', module_name: 'Warehouse Reports' },
  { module_key: 'warehouse_settings', module_name: 'Warehouse Settings' },
  { module_key: 'production_dashboard', module_name: 'Bakehouse Dashboard' },
  { module_key: 'production_requests', module_name: 'Production Requests' },
  { module_key: 'production_planning', module_name: 'Production Planning' },
  { module_key: 'production_batches', module_name: 'Production Batches' },
  { module_key: 'production_wastage', module_name: 'Production Wastage' },
  { module_key: 'production_variance', module_name: 'Production Variance' },
  { module_key: 'production_dispatch', module_name: 'Production Dispatch' }
];

// is_read_only is in PERMISSION_ACTIONS as a modifier flag, not a grantable action -
// checkPermission() treats is_read_only=1 as "block every write action regardless of
// the individual can_* flags", so a naive map-everything-to-1 here would make "full
// access" silently write-blocked. Force it back to 0 after the blanket map.
const full = () => ({ ...Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, 1])), is_read_only: 0 });
const viewOnly = () => ({ ...Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, 0])), can_view: 1 });
const viewExport = () => ({ ...Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, 0])), can_view: 1, can_export: 1 });
const clear = () => Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, 0]));

const setModules = (matrix, moduleKeys, values) => {
  moduleKeys.forEach((key) => {
    matrix[key] = { ...matrix[key], ...values };
  });
};

// Reusable module groupings, so each role's design below reads as "what this
// person's job touches" rather than a wall of individual module keys.
const MASTERS_MODULES = ['masters', 'categories', 'suppliers', 'raw_materials', 'menu_items'];
const DAILY_OPS_MODULES = ['daily_cashbook', 'daily_expenses', 'day_closing', 'daily_checklist', 'bank_deposits'];
const STOCK_PURCHASE_MODULES = ['opening_stock', 'closing_stock', 'material_purchase'];
const SALES_MODULES = ['item_sales', 'item_sales_daily', 'item_sales_monthly'];
const MONTH_END_MODULES = ['payroll', 'utility_bills', 'fixed_costs'];
const PAYOUT_MODULES = ['online_payouts', 'dine_in_payouts'];
const REPORT_MODULES = ['reports', 'monthly_pl'];
const WAREHOUSE_WORKFLOW_MODULES = [
  'warehouse_requisitions', 'warehouse_transfers', 'physical_stock_counts', 'stock_adjustments',
  'warehouse_wastage', 'warehouse_batch_expiry', 'warehouse_purchase_returns',
  'warehouse_purchase_orders', 'warehouse_supplier_history', 'warehouse_reorder',
  'warehouse_reports', 'warehouse_settings', 'outlet_consumption'
];
const PRODUCTION_WORKFLOW_MODULES = [
  'production_requests', 'production_planning', 'production_batches',
  'production_wastage', 'production_dispatch'
];

export const buildDefaultPermissionMatrix = (roleName = '') => {
  const role = String(roleName || '').trim();
  const matrix = Object.fromEntries(
    ROLE_PERMISSION_MODULES.map((module) => [module.module_key, { ...clear(), can_view: 0 }])
  );
  const allKeys = ROLE_PERMISSION_MODULES.map((module) => module.module_key);

  // Super Admin - unrestricted. The platform owner needs to be able to touch
  // anything without being blocked by a missing permission row.
  if (role === 'Super Admin') {
    setModules(matrix, allKeys, full());
    return matrix;
  }

  // Developer - technical/development support: view + export diagnostics
  // across every module, nothing else. Developer is not a business
  // transaction maker/checker/approver, stock mover, or operator, so every
  // write/workflow action stays 0. The matching role-name bypasses (role
  // reassignment, Role Access write, platform receive, legacy admin flags)
  // were removed alongside this preset; ALL_OUTLET_ROLES membership stays
  // because it only widens read/diagnostic scope - every write route still
  // requires a module action permission.
  if (role === 'Developer') {
    setModules(matrix, allKeys, viewExport());
    return matrix;
  }

  // Admin ("Head Office Admin") - same broad business/operations authority as
  // the full matrix, minus a small approved hardening delta: permanent user
  // deletion stays a platform-level control (create/edit/deactivate via
  // can_edit/toggle-status remains), and the roles/role_access write flags
  // that have no live routes today are cleared. role_access.can_edit is
  // deliberately kept - whether HO Admin manages role permissions is a
  // pending management decision, as are controlled_exceptions.can_lock,
  // financial can_delete breadth, warehouse_settings.can_edit, and
  // users/roles can_create.
  if (role === 'Admin') {
    setModules(matrix, allKeys, full());
    setModules(matrix, ['users'], { can_delete: 0 });
    setModules(matrix, ['roles'], { can_edit: 0, can_delete: 0 });
    setModules(matrix, ['role_access'], {
      can_create: 0,
      can_upload: 0,
      can_submit: 0,
      can_verify: 0,
      can_approve: 0,
      can_reject: 0,
      can_lock: 0
    });
    return matrix;
  }

  // Accountant - owns month-end and financial correctness across all outlets:
  // verifying cashbooks, approving/rejecting expenses, running payroll and
  // utility bills, locking a month's P&L once it's finalized. Views Masters
  // and outlets for context but doesn't create/edit them, and stays out of
  // Warehouse/Central Kitchen operational workflows entirely - those are a
  // different job.
  if (role === 'Accountant') {
    setModules(matrix, ['dashboard', 'outlets'], { can_view: 1 });
    setModules(matrix, MASTERS_MODULES, viewExport());
    setModules(matrix, ['daily_cashbook'], { can_view: 1, can_verify: 1, can_export: 1 });
    setModules(matrix, ['daily_expenses'], { can_view: 1, can_approve: 1, can_reject: 1, can_export: 1 });
    setModules(matrix, ['day_closing', 'daily_checklist', 'bank_deposits'], viewExport());
    setModules(matrix, STOCK_PURCHASE_MODULES, { can_view: 1, can_verify: 1, can_export: 1 });
    setModules(matrix, ['supplier_payments', 'outlet_vendors'], { can_view: 1, can_create: 1, can_edit: 1, can_submit: 1, can_verify: 1, can_reject: 1, can_export: 1 });
    // Split keys mirror the legacy outlet_vendors grant: vendor master stays
    // view/create/edit (no delete), purchases and the ledger/payment workflow
    // carry the full financial maker+checker set.
    setModules(matrix, ['outlet_vendor_master'], { can_view: 1, can_create: 1, can_edit: 1, can_export: 1 });
    setModules(matrix, ['vendor_purchases', 'vendor_ledger_payments'], { can_view: 1, can_create: 1, can_edit: 1, can_submit: 1, can_verify: 1, can_reject: 1, can_export: 1 });
    setModules(matrix, SALES_MODULES, { can_view: 1, can_verify: 1, can_export: 1 });
    setModules(matrix, ['item_sales_tax'], { can_view: 1, can_create: 1, can_upload: 1, can_export: 1, can_delete: 1 });
    setModules(matrix, MONTH_END_MODULES, { can_view: 1, can_create: 1, can_edit: 1, can_verify: 1, can_export: 1 });
    setModules(matrix, ['sales_target'], { can_view: 1, can_export: 1 });
    setModules(matrix, ['outlet_consumption'], { can_view: 1, can_export: 1 });
    setModules(matrix, PAYOUT_MODULES, { can_view: 1, can_edit: 1, can_export: 1 });
    setModules(matrix, ['recipe_list'], viewExport());
    setModules(matrix, REPORT_MODULES, { can_view: 1, can_lock: 1, can_export: 1 });
    return matrix;
  }

  // Technical Admin - IT/support role: diagnostic read + export across every
  // module for troubleshooting, nothing else. Final least-privilege profile:
  // the audit showed users.can_create + roles.can_create + role_access.can_edit
  // formed a self-service privilege-escalation chain (mint a role, arm it,
  // create a user holding it), and users.can_edit could reset any privileged
  // account's password - so all create/edit rights were removed, including on
  // masters/locations/warehouse_settings which control business reference data
  // and maker-checker/approval gates. No delete and no workflow actions at all.
  if (role === 'Technical Admin') {
    setModules(matrix, allKeys, viewExport());
    return matrix;
  }

  // Warehouse Admin - full ownership of the central warehouse module end to
  // end (GRN, requisitions, transfers, counts, adjustments, wastage, batch/
  // expiry, purchase orders/returns, supplier history, reorder, settings),
  // plus enough Masters/location visibility to do that job. Stays out of
  // daily outlet accounts, payroll, and Central Kitchen production.
  if (role === 'Warehouse Admin') {
    setModules(matrix, ['dashboard'], { can_view: 1 });
    setModules(matrix, ['warehouse_dashboard', 'warehouse_stock', 'warehouse_ledger', 'grn'], {
      can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_upload: 1,
      can_approve: 1, can_reject: 1, can_verify: 1, can_submit: 1, can_export: 1
    });
    setModules(matrix, WAREHOUSE_WORKFLOW_MODULES, {
      can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_submit: 1,
      can_verify: 1, can_approve: 1, can_lock: 1, can_export: 1
    });
    setModules(matrix, ['locations', 'suppliers', 'raw_materials', 'masters'], { can_view: 1, can_create: 1, can_edit: 1, can_export: 1 });
    return matrix;
  }

  // Central Kitchen Admin - mirrors Warehouse Admin's shape but for
  // production: requests coming in from outlets, planning, batching,
  // wastage, dispatch out to outlets. Variance is a derived/computed report,
  // not something they hand-edit, so it's view+export only. They need to see
  // (not manage) warehouse stock/ledger and raw materials, since batches
  // consume materials the warehouse owns, and recipes, since a batch's
  // required quantities come straight from the BOM.
  // 'Bakehouse Admin' is accepted as an alias so a role created under the new
  // user-facing name gets the same preset instead of falling through to the
  // dashboard-only default.
  if (role === 'Central Kitchen Admin' || role === 'Bakehouse Admin') {
    setModules(matrix, ['dashboard', 'production_dashboard'], { can_view: 1 });
    setModules(matrix, PRODUCTION_WORKFLOW_MODULES, {
      can_view: 1, can_create: 1, can_edit: 1, can_submit: 1,
      can_verify: 1, can_approve: 1, can_lock: 1, can_export: 1
    });
    setModules(matrix, ['production_variance'], viewExport());
    setModules(matrix, ['warehouse_stock', 'warehouse_ledger', 'raw_materials', 'locations'], viewExport());
    setModules(matrix, ['recipe_list', 'add_recipe'], viewExport());
    setModules(matrix, REPORT_MODULES, viewExport());
    return matrix;
  }

  // Outlet Admin - runs one outlet's daily operations: full cashbook/
  // expenses/day-closing/checklist/deposits, uploads its own stock/purchase/
  // sales data, and can see (not edit) payroll/utility bills/fixed costs/
  // reports for that outlet. Also raises its own requisitions to the central
  // warehouse and production requests to Central Kitchen - both scoped
  // server-side to this outlet only (see canTransitionProductionRequest and
  // the requisition-create outlet check in the routes), with view access to
  // warehouse current stock so the request reflects what's actually available.
  if (role === 'Outlet Manager' || role === 'Outlet Admin') {
    setModules(matrix, ['dashboard', 'daily_cashbook', 'daily_expenses', 'day_closing', 'daily_checklist', 'bank_deposits'], { can_view: 1, can_create: 1, can_edit: 1, can_submit: 1 });
    setModules(matrix, ['sales_target'], { can_view: 1, can_create: 1, can_edit: 1 });
    setModules(matrix, MONTH_END_MODULES, { can_view: 1, can_export: 1 });
    setModules(matrix, ['reports'], { can_view: 1, can_export: 1 });
    setModules(matrix, STOCK_PURCHASE_MODULES, { can_view: 1, can_upload: 1, can_export: 1 });
    setModules(matrix, SALES_MODULES.filter((key) => key !== 'item_sales_monthly'), { can_view: 1, can_upload: 1 });
    // item_sales_monthly is deliberately not granted here - month-wise uploads
    // are the accounts/warehouse team's job, not the store manager's.
    // item_sales_tax (the PetPooja Item Wise Tax Report) is deliberately not
    // granted to outlet-side roles at all - it is a month-wise GST precision
    // upload whose only consumer is the accounts-side GSTR-1 calc, so there
    // is no outlet operational reason even to view it. An admin may still
    // re-grant it explicitly through Role Access.
    setModules(matrix, ['warehouse_stock'], viewExport());
    setModules(matrix, ['warehouse_requisitions'], { can_view: 1, can_create: 1, can_submit: 1, can_export: 1 });
    // Outlet consumption: the outlet raises and submits the document, but the
    // verify/approve/post checker steps stay with all-outlet roles - same
    // maker-only shape as warehouse_requisitions above.
    setModules(matrix, ['outlet_consumption'], { can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_submit: 1, can_export: 1 });
    // Outlet wastage (expired/damaged/counter items at the outlet's own
    // location) reuses the warehouse_wastage document + WASTAGE ledger.
    // Maker shape only - the outlet raises and submits the record while
    // verify/approve/post/lock stay with all-outlet checker roles, the same
    // maker/checker split as outlet_consumption above.
    setModules(matrix, ['warehouse_wastage'], { can_view: 1, can_create: 1, can_submit: 1, can_export: 1 });
    setModules(matrix, ['outlet_vendors'], { can_view: 1, can_create: 1, can_submit: 1, can_export: 1 });
    // Split keys: master is read-only for a manager (vendor CRUD stays with
    // head office), purchases and ledger/payments keep the same maker shape
    // the legacy outlet_vendors grant carried.
    setModules(matrix, ['outlet_vendor_master'], { can_view: 1 });
    setModules(matrix, ['vendor_purchases', 'vendor_ledger_payments'], { can_view: 1, can_create: 1, can_submit: 1, can_export: 1 });
    setModules(matrix, ['production_dashboard'], { can_view: 1 });
    setModules(matrix, ['production_requests'], { can_view: 1, can_create: 1, can_submit: 1, can_export: 1 });
    // production_dispatch: receive-only, identical to the Outlet Staff grant.
    // can_view opens /central-kitchen-receive and the dispatch list/detail GETs;
    // can_edit is the receive authorization key read by
    // canReceiveProductionDispatch (which still requires a user_outlets row
    // for the destination outlet). can_create (dispatch creation) and
    // can_submit (posting) stay 0 - no Bakehouse dispatch control.
    setModules(matrix, ['production_dispatch'], { can_view: 1, can_edit: 1 });
    return matrix;
  }

  // Outlet Staff - front-line maker for their own outlet's day: raise the
  // cashbook/expenses/deposits/checklist, upload sales and stock files, record
  // consumption and wastage, request stock from the warehouse and the
  // bakehouse, and confirm bakehouse deliveries on arrival.
  //
  // Strictly maker-only: can_verify / can_approve / can_reject / can_lock are
  // granted for NO module. That is what keeps Outlet Staff away from every
  // stock-posting step too, because the post routes are deliberately gated on
  // can_approve (outletConsumptionRoutes' workflowRoute('post', 'can_approve')
  // and warehouse-wastage/:id/post) rather than on a separate action.
  //
  // Deletes are only granted where the service already refuses to delete
  // anything past Draft (cashbook/expenses/deposits/checklist "Draft or
  // Rejected" checks, outlet_consumption + wastage "Only Draft ... can be
  // deleted") or where assertMonthEditable guards the month (stock uploads).
  if (role === 'Outlet Staff') {
    setModules(matrix, ['dashboard'], { can_view: 1 });
    setModules(matrix, DAILY_OPS_MODULES.filter((key) => key !== 'day_closing'), { can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_submit: 1 });
    // day_closing stays out: closing the day is the manager's sign-off, not a
    // front-line entry task.
    setModules(matrix, ['daily_expenses'], { can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_upload: 1, can_submit: 1 });
    setModules(matrix, ['item_sales', 'item_sales_daily'], { can_view: 1, can_upload: 1 });
    // item_sales_monthly and item_sales_tax remain accounts-side uploads.
    setModules(matrix, ['opening_stock', 'closing_stock'], { can_view: 1, can_upload: 1, can_delete: 1 });
    setModules(matrix, ['outlet_consumption'], { can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_submit: 1 });
    setModules(matrix, ['warehouse_wastage'], { can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_submit: 1 });
    // warehouse_requisitions: no can_edit on purpose - in warehouseRoutes.js
    // requisitions/:id/dispatch is gated on can_edit, and there is no
    // Draft-edit route, so can_edit would only hand out dispatch rights.
    setModules(matrix, ['warehouse_requisitions'], { can_view: 1, can_create: 1, can_submit: 1 });
    setModules(matrix, ['production_requests'], { can_view: 1, can_create: 1, can_submit: 1 });
    // production_dispatch: can_edit is this module's receive-only key -
    // canReceiveProductionDispatch reads production_dispatch.can_edit and also
    // requires a user_outlets row for the destination outlet, while dispatch
    // creation uses can_create and posting uses can_submit. Granting view+edit
    // therefore gives receiving alone.
    setModules(matrix, ['production_dispatch'], { can_view: 1, can_edit: 1 });
    // warehouse_transfers: receive-only. The receive route accepts can_submit
    // (dispatch stays on can_edit), so view+submit confirms receipts without
    // handing out transfer creation or dispatch. Destination-location scope
    // is still enforced by the route itself.
    setModules(matrix, ['warehouse_transfers'], { can_view: 1, can_submit: 1 });
    // vendor_purchases only: staff raise third-party purchase entries against
    // their outlet. No vendor master, no ledger, no payments, no opening
    // balances, and no delete (purchase delete has no payment linkage guard).
    // The vendor dropdown is served by the read-only /lookup endpoint.
    setModules(matrix, ['vendor_purchases'], { can_view: 1, can_create: 1 });
    // Deliberately NOT granted:
    //   outlet_vendor_master     - vendor CRUD is head-office admin work.
    //   vendor_ledger_payments   - money movement, opening balances and the
    //                              payment workflow stay with checker roles.
    return matrix;
  }

  // Franchise - runs their own franchise outlet(s). LOCKED_OUTLET_ROLES in
  // roleAccess.js already pins every request to the assigned outlet, so this
  // preset only decides *what* they may do there. Maker shape deliberately
  // mirrors the outlet-side split: they raise and submit documents while the
  // verify/approve/post/lock checker steps stay with all-outlet roles. Before
  // this preset existed the role fell through to the dashboard-only default.
  if (role === 'Franchise') {
    setModules(matrix, ['dashboard', 'sales_target'], { can_view: 1 });
    setModules(matrix, DAILY_OPS_MODULES, { can_view: 1, can_create: 1, can_edit: 1, can_submit: 1 });
    setModules(matrix, STOCK_PURCHASE_MODULES, { can_view: 1, can_upload: 1, can_export: 1 });
    setModules(matrix, SALES_MODULES.filter((key) => key !== 'item_sales_monthly'), { can_view: 1, can_upload: 1 });
    setModules(matrix, ['outlet_consumption'], { can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_submit: 1, can_export: 1 });
    setModules(matrix, ['warehouse_wastage'], { can_view: 1, can_create: 1, can_submit: 1, can_export: 1 });
    setModules(matrix, ['warehouse_requisitions'], { can_view: 1, can_create: 1, can_submit: 1, can_export: 1 });
    setModules(matrix, ['warehouse_transfers'], { can_view: 1, can_create: 1, can_submit: 1, can_export: 1 });
    setModules(matrix, ['warehouse_stock'], viewExport());
    setModules(matrix, ['outlet_vendors'], { can_view: 1, can_create: 1, can_submit: 1, can_export: 1 });
    // Split keys: franchisees raise purchases but money movement (payments,
    // opening balances) is head-office only - ledger stays view/export.
    setModules(matrix, ['vendor_purchases'], { can_view: 1, can_create: 1, can_submit: 1, can_export: 1 });
    setModules(matrix, ['vendor_ledger_payments'], { can_view: 1, can_export: 1 });
    setModules(matrix, ['production_dashboard'], { can_view: 1 });
    setModules(matrix, ['production_requests'], { can_view: 1, can_create: 1, can_submit: 1, can_export: 1 });
    setModules(matrix, ['production_dispatch'], viewExport());
    setModules(matrix, ['reports'], viewExport());
    return matrix;
  }

  // Franchise Owner - oversight of their own franchise group, not a data-entry
  // role: performance, sales, expenses, P&L and inventory visibility only. No
  // approve/verify/post/lock by default - management asked for approvals "only
  // where explicitly permitted", which means granted deliberately through Role
  // Access rather than handed out by this preset.
  if (role === 'Franchise Owner') {
    setModules(matrix, ['dashboard', 'sales_target'], viewExport());
    setModules(matrix, DAILY_OPS_MODULES, viewExport());
    setModules(matrix, SALES_MODULES, viewExport());
    setModules(matrix, STOCK_PURCHASE_MODULES, viewExport());
    setModules(matrix, ['outlet_consumption', 'warehouse_wastage', 'warehouse_stock'], viewExport());
    setModules(matrix, ['warehouse_requisitions', 'warehouse_transfers'], viewExport());
    setModules(matrix, ['production_requests', 'production_dispatch'], viewExport());
    setModules(matrix, MONTH_END_MODULES, viewExport());
    setModules(matrix, PAYOUT_MODULES, viewExport());
    setModules(matrix, ['outlet_vendors'], viewExport());
    setModules(matrix, ['outlet_vendor_master', 'vendor_purchases', 'vendor_ledger_payments'], viewExport());
    setModules(matrix, REPORT_MODULES, viewExport());
    return matrix;
  }

  // Viewer / Auditor - read-only across the entire platform, for audits and
  // spot checks. No user/role/role_access visibility (who-has-access-to-what
  // isn't an audit concern here) and no recipe creation.
  if (role === 'Viewer / Auditor' || role === 'Viewer Auditor' || role === 'Viewer') {
    setModules(matrix, allKeys, { ...viewOnly(), can_export: 1, is_read_only: 1 });
    setModules(matrix, ['users', 'roles', 'role_access', 'add_recipe'], clear());
    return matrix;
  }

  // Unrecognized/custom role name: safe default is dashboard-only, not a
  // silent full-access grant.
  setModules(matrix, ['dashboard'], { can_view: 1 });
  return matrix;
};

export const matrixToRows = (roleId, roleName, savedRows = []) => {
  const defaults = buildDefaultPermissionMatrix(roleName);
  const savedByKey = Object.fromEntries(savedRows.map((row) => [row.module_key, row]));

  return ROLE_PERMISSION_MODULES.map((module) => {
    const saved = savedByKey[module.module_key] || {};
    const base = defaults[module.module_key] || clear();
    return {
      role_id: Number(roleId),
      module_key: module.module_key,
      module_name: module.module_name,
      ...Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, Boolean(saved[action] ?? base[action] ?? 0)]))
    };
  });
};

export const rowsToPermissionObject = (rows = []) => Object.fromEntries(
  rows.map((row) => [
    row.module_key,
    Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, Boolean(row[action])]))
  ])
);

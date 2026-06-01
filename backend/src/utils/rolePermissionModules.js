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
  { module_key: 'opening_stock', module_name: 'Opening Stock' },
  { module_key: 'closing_stock', module_name: 'Closing Stock' },
  { module_key: 'material_purchase', module_name: 'Material Purchase' },
  { module_key: 'item_sales', module_name: 'Item-wise Sales' },
  { module_key: 'payroll', module_name: 'Payroll' },
  { module_key: 'online_payouts', module_name: 'Online Payouts' },
  { module_key: 'dine_in_payouts', module_name: 'Dine-in Payouts' },
  { module_key: 'recipe_list', module_name: 'Recipe List' },
  { module_key: 'add_recipe', module_name: 'Add Recipe' },
  { module_key: 'reports', module_name: 'Reports' },
  { module_key: 'monthly_pl', module_name: 'Monthly P&L' }
];

const full = () => Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, 1]));
const viewOnly = () => ({ ...Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, 0])), can_view: 1 });
const clear = () => Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, 0]));

const setModules = (matrix, moduleKeys, values) => {
  moduleKeys.forEach((key) => {
    matrix[key] = { ...matrix[key], ...values };
  });
};

export const buildDefaultPermissionMatrix = (roleName = '') => {
  const role = String(roleName || '').trim();
  const matrix = Object.fromEntries(
    ROLE_PERMISSION_MODULES.map((module) => [module.module_key, { ...clear(), can_view: 0 }])
  );
  const allKeys = ROLE_PERMISSION_MODULES.map((module) => module.module_key);

  if (role === 'Super Admin' || role === 'Admin' || role === 'Developer') {
    setModules(matrix, allKeys, full());
    return matrix;
  }

  if (role === 'Technical Admin') {
    setModules(matrix, allKeys, { ...viewOnly(), can_edit: 1, can_export: 1 });
    setModules(matrix, ['role_access', 'users', 'roles'], { can_view: 1, can_edit: 1 });
    return matrix;
  }

  if (role === 'HO Accounts Admin') {
    setModules(matrix, ['dashboard', 'reports', 'monthly_pl'], { can_view: 1, can_export: 1 });
    setModules(matrix, ['daily_cashbook'], { can_view: 1, can_verify: 1, can_export: 1 });
    setModules(matrix, ['daily_expenses'], { can_view: 1, can_approve: 1, can_reject: 1, can_export: 1 });
    setModules(matrix, ['opening_stock', 'closing_stock', 'material_purchase', 'item_sales'], { can_view: 1, can_upload: 1, can_verify: 1, can_export: 1 });
    setModules(matrix, ['payroll'], { can_view: 1, can_create: 1, can_edit: 1, can_verify: 1, can_export: 1 });
    setModules(matrix, ['online_payouts', 'dine_in_payouts'], { can_view: 1, can_create: 1, can_edit: 1, can_export: 1 });
    setModules(matrix, ['masters', 'categories', 'suppliers', 'raw_materials', 'menu_items', 'outlets'], { can_view: 1, can_export: 1 });
    return matrix;
  }

  if (role === 'Outlet Manager' || role === 'Outlet Admin') {
    setModules(matrix, ['dashboard', 'daily_cashbook', 'daily_expenses', 'day_closing', 'daily_checklist'], { can_view: 1, can_create: 1, can_edit: 1, can_submit: 1 });
    setModules(matrix, ['opening_stock', 'closing_stock', 'material_purchase', 'item_sales', 'payroll', 'reports'], { can_view: 1, can_export: 1 });
    return matrix;
  }

  if (role === 'Outlet Staff') {
    setModules(matrix, ['dashboard'], { can_view: 1 });
    setModules(matrix, ['daily_expenses'], { can_view: 1, can_create: 1, can_upload: 1 });
    return matrix;
  }

  if (role === 'Viewer / Auditor' || role === 'Viewer Auditor' || role === 'Viewer') {
    setModules(matrix, allKeys, { ...viewOnly(), can_export: 1, is_read_only: 1 });
    setModules(matrix, ['users', 'roles', 'role_access', 'add_recipe'], clear());
    return matrix;
  }

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

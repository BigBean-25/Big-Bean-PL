// Company-wide roles: not tied to a single outlet, so applyOutletScope lets
// them see/filter by any outlet (their actual module access is still gated
// separately by the granular role_permissions matrix - a Warehouse Admin
// being "all-outlet" here doesn't grant them daily_cashbook access, it just
// means they aren't locked to one outlet's data the way Outlet Admin/Staff
// are).
export const ALL_OUTLET_ROLES = [
  'Super Admin',
  'Admin',
  'Developer',
  'Accountant',
  'Warehouse Admin',
  'Central Kitchen Admin',
  'Technical Admin',
  'Viewer',
  'Viewer / Auditor'
];

// Franchise/Franchise Owner: configured in Role Access with real permissions
// (Franchise Owner has users.can_view=true) but absent from both role lists
// until now - isKnownRole() would have 403'd any user assigned either role
// off of nearly every outlet-scoped route in the app. A franchise owner
// manages their own franchise outlet(s), not the whole company, so this is
// the same locked-to-assigned-outlet category as Outlet Admin/Staff/Manager,
// not the all-outlet category.
export const LOCKED_OUTLET_ROLES = ['Outlet Staff', 'Outlet Admin', 'Outlet Manager', 'Franchise', 'Franchise Owner'];

export const normalizeRoleName = (roleName = '') => String(roleName || '').trim();

export const getRolePermissions = (roleName = '') => {
  const role = normalizeRoleName(roleName);
  const isSuper = role === 'Super Admin';
  const isLegacyAdmin = role === 'Admin' || role === 'Developer';
  const isAccountant = role === 'Accountant';
  const isManager = role === 'Outlet Admin';
  const isStaff = role === 'Outlet Staff';
  const isViewer = role === 'Viewer';

  return {
    can_access_all_outlets: ALL_OUTLET_ROLES.includes(role),
    is_outlet_locked: LOCKED_OUTLET_ROLES.includes(role),
    is_read_only: isViewer,
    can_manage_users: isSuper || isLegacyAdmin,
    can_manage_roles: isSuper || isLegacyAdmin,
    can_manage_outlets: isSuper || isLegacyAdmin,
    can_manage_masters: isSuper || isLegacyAdmin,
    can_delete_master: isSuper,
    can_create_cashbook: isSuper || isLegacyAdmin || isManager,
    can_submit_cashbook: isSuper || isLegacyAdmin || isManager,
    can_verify_cashbook: isSuper || isLegacyAdmin || isAccountant,
    can_create_expense: isSuper || isLegacyAdmin || isManager || isStaff,
    can_submit_expense: isSuper || isLegacyAdmin || isManager,
    can_approve_expense: isSuper || isLegacyAdmin || isAccountant,
    can_reject_expense: isSuper || isLegacyAdmin || isAccountant,
    can_upload_stock: isSuper || isLegacyAdmin,
    can_upload_purchase: isSuper || isLegacyAdmin,
    can_upload_sales: isSuper || isLegacyAdmin,
    can_view_payroll: isSuper || isLegacyAdmin || isAccountant || isManager || isViewer,
    can_create_payroll: isSuper || isLegacyAdmin || isAccountant,
    can_submit_payroll: isSuper || isLegacyAdmin || isManager,
    can_verify_payroll: isSuper || isLegacyAdmin || isAccountant,
    can_approve_payroll: isSuper || isLegacyAdmin,
    can_view_payouts: isSuper || isLegacyAdmin || isAccountant || isManager || isViewer,
    can_manage_payouts: isSuper || isLegacyAdmin || isAccountant,
    can_view_reports: !isStaff,
    can_view_pl: !isStaff && (isSuper || isLegacyAdmin || isAccountant || isManager || isViewer),
    can_view_company_pl: isSuper || isLegacyAdmin || isAccountant || isViewer,
    can_lock_day: isSuper || isLegacyAdmin,
    can_lock_month: isSuper || isLegacyAdmin || isAccountant,
    can_emergency_correct: isSuper
  };
};

export const canAccessAllOutlets = (roleName = '') => ALL_OUTLET_ROLES.includes(normalizeRoleName(roleName));

export const isKnownRole = (roleName = '') => [
  ...ALL_OUTLET_ROLES,
  ...LOCKED_OUTLET_ROLES
].includes(normalizeRoleName(roleName));

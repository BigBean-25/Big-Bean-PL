export const ALL_OUTLET_ROLES = [
  'Technical Admin',
  'Super Admin',
  'Admin',
  'Developer',
  'HO Accounts Admin',
  'Viewer / Auditor',
  'Viewer Auditor',
  'Viewer'
];

export const LOCKED_OUTLET_ROLES = ['Outlet Manager', 'Outlet Staff', 'Outlet Admin'];

export const normalizeRoleName = (roleName = '') => String(roleName || '').trim();

export const getRolePermissions = (roleName = '') => {
  const role = normalizeRoleName(roleName);
  const isTechnical = role === 'Technical Admin';
  const isSuper = role === 'Super Admin';
  const isLegacyAdmin = role === 'Admin' || role === 'Developer';
  const isHO = role === 'HO Accounts Admin';
  const isManager = role === 'Outlet Manager' || role === 'Outlet Admin';
  const isStaff = role === 'Outlet Staff';
  const isViewer = role === 'Viewer / Auditor' || role === 'Viewer Auditor' || role === 'Viewer';

  return {
    can_access_all_outlets: ALL_OUTLET_ROLES.includes(role),
    is_outlet_locked: LOCKED_OUTLET_ROLES.includes(role),
    is_read_only: isViewer,
    can_manage_users: isSuper || isLegacyAdmin || isTechnical,
    can_manage_roles: isSuper || isLegacyAdmin || isTechnical,
    can_manage_outlets: isSuper || isLegacyAdmin || isTechnical,
    can_manage_masters: isSuper || isLegacyAdmin || isTechnical || isHO,
    can_delete_master: isSuper,
    can_create_cashbook: isSuper || isLegacyAdmin || isHO || isManager,
    can_submit_cashbook: isSuper || isLegacyAdmin || isHO || isManager,
    can_verify_cashbook: isSuper || isLegacyAdmin || isHO,
    can_create_expense: isSuper || isLegacyAdmin || isHO || isManager || isStaff,
    can_submit_expense: isSuper || isLegacyAdmin || isHO || isManager,
    can_approve_expense: isSuper || isLegacyAdmin || isHO,
    can_reject_expense: isSuper || isLegacyAdmin || isHO,
    can_upload_stock: isSuper || isLegacyAdmin || isTechnical || isHO,
    can_upload_purchase: isSuper || isLegacyAdmin || isTechnical || isHO,
    can_upload_sales: isSuper || isLegacyAdmin || isTechnical || isHO,
    can_view_payroll: isSuper || isLegacyAdmin || isTechnical || isHO || isManager || isViewer,
    can_create_payroll: isSuper || isLegacyAdmin || isHO,
    can_submit_payroll: isSuper || isLegacyAdmin || isHO || isManager,
    can_verify_payroll: isSuper || isLegacyAdmin || isHO,
    can_approve_payroll: isSuper || isLegacyAdmin,
    can_view_payouts: isSuper || isLegacyAdmin || isTechnical || isHO || isManager || isViewer,
    can_manage_payouts: isSuper || isLegacyAdmin || isHO,
    can_view_reports: !isStaff,
    can_view_pl: !isStaff && (isSuper || isLegacyAdmin || isTechnical || isHO || isManager || isViewer),
    can_view_company_pl: isSuper || isLegacyAdmin || isTechnical || isHO || isViewer,
    can_lock_day: isSuper || isLegacyAdmin,
    can_lock_month: isSuper || isLegacyAdmin,
    can_emergency_correct: isTechnical
  };
};

export const canAccessAllOutlets = (roleName = '') => ALL_OUTLET_ROLES.includes(normalizeRoleName(roleName));

export const isKnownRole = (roleName = '') => [
  ...ALL_OUTLET_ROLES,
  ...LOCKED_OUTLET_ROLES
].includes(normalizeRoleName(roleName));

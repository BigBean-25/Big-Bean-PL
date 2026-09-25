import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Plus, RotateCcw, Save, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import toast from "react-hot-toast";
import { roleAPI, roleAccessAPI } from "../../services/api";
import useAuthStore from "../../store/authStore";
import { displayLabel } from "../../utils/displayLabels";

const actions = [
  { key: "can_view", label: "View" },
  { key: "can_create", label: "Create" },
  { key: "can_edit", label: "Edit" },
  { key: "can_delete", label: "Delete" },
  { key: "can_upload", label: "Upload" },
  { key: "can_submit", label: "Submit" },
  { key: "can_verify", label: "Verify" },
  { key: "can_approve", label: "Approve" },
  { key: "can_reject", label: "Reject" },
  { key: "can_lock", label: "Lock" },
  { key: "can_export", label: "Export" },
  { key: "is_read_only", label: "Read Only" }
];

const setAllActions = (rows, value) =>
  rows.map((row) => ({
    ...row,
    ...Object.fromEntries(actions.map((action) => [action.key, value]))
  }));

const applyReadOnly = (rows) =>
  rows.map((row) => ({
    ...row,
    ...Object.fromEntries(actions.map((action) => [action.key, false])),
    can_view: true,
    can_export: true,
    is_read_only: true
  }));

const applyByKeys = (rows, moduleKeys, values) =>
  rows.map((row) => (moduleKeys.includes(row.module_key) ? { ...row, ...values } : row));

const presets = {
  full: (rows) =>
    rows.map((row) => ({
      ...row,
      ...Object.fromEntries(actions.map((action) => [action.key, action.key !== "is_read_only"])),
    })),
  readonly: applyReadOnly,
  clear: (rows) => setAllActions(rows, false),
  outletManager: (rows) => {
    let next = setAllActions(rows, false);
    next = applyByKeys(next, ["dashboard", "daily_cashbook", "daily_expenses", "day_closing", "daily_checklist", "bank_deposits"], {
      can_view: true,
      can_create: true,
      can_edit: true,
      can_submit: true,
    });
    next = applyByKeys(next, ["sales_target"], { can_view: true, can_create: true, can_edit: true });
    next = applyByKeys(next, ["payroll", "utility_bills", "fixed_costs"], {
      can_view: true,
      can_export: true,
    });
    next = applyByKeys(next, ["reports"], { can_view: true, can_export: true });
    next = applyByKeys(next, ["opening_stock", "closing_stock", "material_purchase"], {
      can_view: true,
      can_upload: true,
      can_export: true,
    });
    next = applyByKeys(next, ["item_sales", "item_sales_daily"], { can_view: true, can_upload: true });
    next = applyByKeys(next, ["warehouse_stock"], { can_view: true, can_export: true });
    next = applyByKeys(next, ["warehouse_requisitions"], { can_view: true, can_create: true, can_submit: true, can_export: true });
    next = applyByKeys(next, ["outlet_consumption"], { can_view: true, can_create: true, can_edit: true, can_delete: true, can_submit: true, can_export: true });
    next = applyByKeys(next, ["warehouse_wastage"], { can_view: true, can_create: true, can_submit: true, can_export: true });
    next = applyByKeys(next, ["outlet_vendors"], { can_view: true, can_create: true, can_submit: true, can_export: true });
    next = applyByKeys(next, ["production_dashboard"], { can_view: true });
    next = applyByKeys(next, ["production_requests"], { can_view: true, can_create: true, can_submit: true, can_export: true });
    return next;
  },
  outletStaff: (rows) => {
    let next = setAllActions(rows, false);
    next = applyByKeys(next, ["dashboard"], { can_view: true });
    next = applyByKeys(next, ["daily_expenses"], { can_view: true, can_create: true, can_upload: true });
    return next;
  },
  hoAccounts: (rows) => {
    let next = setAllActions(rows, false);
    next = applyByKeys(next, ["dashboard", "outlets"], { can_view: true });
    next = applyByKeys(next, ["masters", "categories", "suppliers", "raw_materials", "menu_items"], { can_view: true, can_export: true });
    next = applyByKeys(next, ["daily_cashbook"], { can_view: true, can_verify: true, can_export: true });
    next = applyByKeys(next, ["daily_expenses"], { can_view: true, can_approve: true, can_reject: true, can_export: true });
    next = applyByKeys(next, ["day_closing", "daily_checklist", "bank_deposits"], { can_view: true, can_export: true });
    next = applyByKeys(next, ["opening_stock", "closing_stock", "material_purchase"], { can_view: true, can_verify: true, can_export: true });
    next = applyByKeys(next, ["supplier_payments", "outlet_vendors"], { can_view: true, can_create: true, can_edit: true, can_submit: true, can_verify: true, can_reject: true, can_export: true });
    next = applyByKeys(next, ["item_sales", "item_sales_daily", "item_sales_monthly"], { can_view: true, can_verify: true, can_export: true });
    next = applyByKeys(next, ["item_sales_tax"], { can_view: true, can_create: true, can_upload: true, can_export: true, can_delete: true });
    next = applyByKeys(next, ["payroll", "utility_bills", "fixed_costs"], { can_view: true, can_create: true, can_edit: true, can_verify: true, can_export: true });
    next = applyByKeys(next, ["sales_target"], { can_view: true, can_export: true });
    next = applyByKeys(next, ["outlet_consumption"], { can_view: true, can_export: true });
    next = applyByKeys(next, ["online_payouts", "dine_in_payouts"], { can_view: true, can_edit: true, can_export: true });
    next = applyByKeys(next, ["recipe_list"], { can_view: true, can_export: true });
    next = applyByKeys(next, ["reports", "monthly_pl"], { can_view: true, can_lock: true, can_export: true });
    return next;
  }
};

const ROLE_ACCESS_SECTION_LAYOUT = [
  {
    title: "Dashboard / Outlet Performance",
    groups: [
      { label: null, keys: ["dashboard", "sales_target"] },
    ],
  },
  {
    title: "Users & Access",
    groups: [
      { label: null, keys: ["users", "role_access"] },
    ],
  },
  {
    title: "Master Data",
    groups: [
      { label: null, keys: ["outlets", "categories", "suppliers", "outlet_vendors", "raw_materials", "menu_items", "locations"] },
    ],
  },
  {
    title: "Daily Accounts",
    groups: [
      { label: null, keys: ["daily_cashbook", "daily_expenses", "bank_deposits", "day_closing", "daily_checklist"] },
    ],
  },
  {
    title: "Monthly Accounts",
    groups: [
      { label: "Payroll & Fixed Costs", keys: ["payroll", "utility_bills", "fixed_costs"] },
      { label: "Payouts", keys: ["online_payouts", "dine_in_payouts"] },
    ],
  },
  {
    title: "Outlet Stock",
    groups: [
      { label: null, keys: ["opening_stock", "closing_stock", "outlet_consumption"] },
    ],
  },
  {
    title: "Purchases & Payments",
    groups: [
      { label: null, keys: ["material_purchase", "supplier_payments"] },
    ],
  },
  {
    title: "Sales Uploads",
    groups: [
      { label: null, keys: ["item_sales", "item_sales_daily", "item_sales_monthly", "item_sales_tax"] },
    ],
  },
  {
    title: "Recipes",
    groups: [
      { label: null, keys: ["recipe_list", "add_recipe"] },
    ],
  },
  {
    title: "Reports & Analytics",
    groups: [
      { label: null, keys: ["reports", "controlled_exceptions", "monthly_pl"] },
    ],
  },
  {
    title: "Central Kitchen & Bakehouse",
    groups: [
      { label: null, keys: ["production_dashboard", "production_requests", "production_planning", "production_batches", "production_wastage", "production_variance", "production_dispatch"] },
    ],
  },
  {
    title: "Warehouse",
    groups: [
      { label: "Overview", keys: ["warehouse_dashboard"] },
      { label: "Procurement", keys: ["warehouse_purchase_orders", "grn", "warehouse_purchase_returns", "warehouse_supplier_history", "warehouse_reorder"] },
      { label: "Inventory", keys: ["warehouse_stock", "warehouse_ledger", "warehouse_batch_expiry", "warehouse_requisitions"] },
      { label: "Stock Control", keys: ["warehouse_transfers", "physical_stock_counts", "stock_adjustments", "warehouse_wastage"] },
      { label: "Reports & Settings", keys: ["warehouse_reports", "warehouse_settings"] },
    ],
  },
];

const MODULE_LABEL_OVERRIDES = {
  role_access: "Roles & Permissions",
  locations: "Location Management",
  sales_target: "Outlet Dashboard / Sales Analysis",
  item_sales: "Item Sales",
  production_planning: "Production Plans",
  production_dispatch: "Production Dispatch",
};

const MODULE_NOTES = {
  sales_target: "Also controls outlet dashboard / sales analysis",
  outlet_vendors: "Also controls vendor purchase / ledger screens",
  material_purchase: "Also controls GRN Accounting Review",
  production_dispatch: "Also controls Receive Dispatch",
};

const getModuleLabel = (row) => MODULE_LABEL_OVERRIDES[row.module_key] || row.module_name;
const getModuleNote = (row) => MODULE_NOTES[row.module_key] || "";

const RoleAccess = () => {
  const user = useAuthStore((state) => state.user);
  const canCreateRole = user?.permissions?.roles?.can_create === true;

  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [originalPermissions, setOriginalPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRoleActive, setNewRoleActive] = useState(true);
  const [creating, setCreating] = useState(false);

  const selectedRole = useMemo(
    () => roles.find((role) => String(role.id) === String(selectedRoleId)),
    [roles, selectedRoleId]
  );

  const loadRoles = async () => {
    setLoadError("");
    try {
      const response = await roleAccessAPI.getRoles();
      const rows = response.data?.data || response.data?.roles || [];
      setRoles(rows);
      if (rows.length && !selectedRoleId) {
        setSelectedRoleId(String(rows[0].id));
      }
    } catch (error) {
      setRoles([]);
      setSelectedRoleId("");
      setPermissions([]);
      setOriginalPermissions([]);
      setLoadError(error.response?.data?.message || "Failed to load roles");
      toast.error(error.response?.data?.message || "Failed to load roles");
    }
  };

  const loadPermissions = async (roleId) => {
    if (!roleId) return;
    setLoading(true);
    setLoadError("");
    try {
      const response = await roleAccessAPI.getPermissions(roleId);
      const rows = response.data?.data?.permissions || [];
      setPermissions(rows);
      setOriginalPermissions(rows);
    } catch (error) {
      setPermissions([]);
      setOriginalPermissions([]);
      setLoadError(error.response?.data?.message || "Failed to load permissions");
      toast.error(error.response?.data?.message || "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  useEffect(() => {
    loadPermissions(selectedRoleId);
  }, [selectedRoleId]);

  const togglePermission = (moduleKey, actionKey) => {
    setPermissions((prev) =>
      prev.map((row) =>
        row.module_key === moduleKey ? { ...row, [actionKey]: !row[actionKey] } : row
      )
    );
  };

  const applyPreset = (presetKey) => {
    setPermissions((prev) => presets[presetKey](prev));
  };

  const handleReset = () => {
    setPermissions(originalPermissions);
  };

  const handleSave = async () => {
    if (!selectedRoleId) return;
    setSaving(true);
    try {
      const response = await roleAccessAPI.updatePermissions(selectedRoleId, permissions);
      const rows = response.data?.data?.permissions || permissions;
      setPermissions(rows);
      setOriginalPermissions(rows);
      toast.success("Permissions saved successfully");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async (event) => {
    event.preventDefault();
    if (!newRoleName.trim()) {
      toast.error("Role name is required");
      return;
    }
    setCreating(true);
    try {
      const response = await roleAPI.createRole({
        role_name: newRoleName.trim(),
        description: newRoleDesc.trim(),
        is_active: newRoleActive,
      });
      const newRole = response.data?.data;
      toast.success("Role created successfully");
      setShowAddRole(false);
      setNewRoleName("");
      setNewRoleDesc("");
      setNewRoleActive(true);
      await loadRoles();
      if (newRole?.id) {
        setSelectedRoleId(String(newRole.id));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create role");
    } finally {
      setCreating(false);
    }
  };

  const groupedSections = useMemo(() => {
    const byKey = new Map(permissions.map((row) => [row.module_key, row]));
    const usedKeys = new Set();

    const sections = ROLE_ACCESS_SECTION_LAYOUT.map((section) => {
      const groups = section.groups
        .map((group) => {
          const rows = group.keys.map((key) => byKey.get(key)).filter(Boolean);
          rows.forEach((row) => usedKeys.add(row.module_key));
          return { ...group, rows };
        })
        .filter((group) => group.rows.length > 0);

      const rows = groups.flatMap((group) => group.rows);
      return rows.length ? { ...section, groups, rows } : null;
    }).filter(Boolean);

    const remainingRows = permissions.filter((row) => !usedKeys.has(row.module_key));
    if (remainingRows.length) {
      sections.push({
        title: "Additional / System Permissions",
        groups: [{ label: null, keys: [], rows: remainingRows }],
        rows: remainingRows,
      });
    }

    return sections;
  }, [permissions]);

  return (
    <div className="max-w-full space-y-4 md:space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-start gap-3 sm:items-center">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 md:h-12 md:w-12">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white md:text-2xl">Role Access & Permissions</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Manage module-wise access for each role</p>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center xl:w-auto">
            <select
              value={selectedRoleId}
              onChange={(event) => setSelectedRoleId(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:min-w-[240px]"
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{displayLabel(role.role_name)}</option>
              ))}
            </select>
            {canCreateRole && (
              <button
                type="button"
                onClick={() => setShowAddRole(true)}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 text-sm font-bold text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300 dark:hover:bg-violet-900 sm:w-auto"
              >
                <Plus size={16} /> Add Role
              </button>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 sm:w-auto"
            >
              <RotateCcw size={16} /> Reset
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-bold text-white shadow-lg shadow-violet-200 hover:bg-violet-700 disabled:opacity-60 dark:shadow-none sm:w-auto"
            >
              <Save size={16} /> {saving ? "Saving..." : "Save Permissions"}
            </button>
          </div>
        </div>
      </div>

      {showAddRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={handleCreateRole}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Add Role</h2>
              <button
                type="button"
                onClick={() => setShowAddRole(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Role Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newRoleName}
                  onChange={(event) => setNewRoleName(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="e.g. Test Manager"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Description
                </label>
                <input
                  type="text"
                  value={newRoleDesc}
                  onChange={(event) => setNewRoleDesc(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="Optional role description"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Status
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="radio"
                      checked={newRoleActive}
                      onChange={() => setNewRoleActive(true)}
                      className="h-4 w-4 accent-violet-600"
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="radio"
                      checked={!newRoleActive}
                      onChange={() => setNewRoleActive(false)}
                      className="h-4 w-4 accent-violet-600"
                    />
                    Inactive
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowAddRole(false)}
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !newRoleName.trim()}
                className="h-11 flex-1 rounded-xl bg-violet-600 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="mr-2 inline-flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
            <SlidersHorizontal size={17} /> Quick Presets
          </div>
          {[
            ["full", "Full Access"],
            ["readonly", "Read Only"],
            ["outletManager", "Outlet Manager Access"],
            ["outletStaff", "Outlet Staff Access"],
            ["hoAccounts", "HO Accounts Access"],
            ["clear", "Clear All"]
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-violet-600 dark:hover:bg-slate-800 dark:hover:text-violet-300"
            >
              {label}
            </button>
          ))}
        </div>

        {loadError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <AlertCircle size={32} className="mx-auto" />
            <p className="mt-3 text-base font-bold">Failed to load roles and permissions</p>
            <p className="mt-1 text-sm">{loadError}</p>
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="sticky top-0 z-30 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  <th className="sticky left-0 z-30 bg-slate-50 px-4 py-4 dark:bg-slate-800">Module</th>
                  {actions.map((action) => (
                    <th key={action.key} className="px-3 py-4 text-center">{action.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan={actions.length + 1} className="px-4 py-10 text-center text-slate-500 dark:text-slate-300">Loading permissions...</td></tr>
                ) : groupedSections.length === 0 ? (
                  <tr><td colSpan={actions.length + 1} className="px-4 py-10 text-center text-slate-500 dark:text-slate-300">No permissions available.</td></tr>
                ) : groupedSections.map((section) => {
                  const enabledCount = section.rows.filter((row) => Boolean(row.can_view)).length;
                  return (
                    <Fragment key={section.title}>
                      <tr className="border-t border-slate-200 bg-violet-50/70 dark:border-slate-700 dark:bg-violet-950/20">
                        <td colSpan={actions.length + 1} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-700 dark:text-violet-300">{section.title}</p>
                            </div>
                            <div className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-200">
                              {enabledCount} / {section.rows.length} View enabled
                            </div>
                          </div>
                        </td>
                      </tr>

                      {section.groups.map((group) => (
                        <Fragment key={`${section.title}-${group.label || "default"}`}>
                          {group.label && (
                            <tr className="bg-slate-50/80 dark:bg-slate-800/60">
                              <td colSpan={actions.length + 1} className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-300">
                                {group.label}
                              </td>
                            </tr>
                          )}

                          {group.rows.map((row) => (
                            <tr key={row.module_key} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/70">
                              <td className="sticky left-0 z-10 bg-white px-4 py-3 font-bold text-slate-800 dark:bg-slate-900 dark:text-slate-100">
                                <div>{getModuleLabel(row)}</div>
                                <div className="text-xs font-medium text-slate-400 dark:text-slate-500">{row.module_key}</div>
                                {getModuleNote(row) && (
                                  <div className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">{getModuleNote(row)}</div>
                                )}
                              </td>
                              {actions.map((action) => (
                                <td key={action.key} className="px-3 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => togglePermission(row.module_key, action.key)}
                                    className={`mx-auto flex h-7 w-7 items-center justify-center rounded-lg border transition ${
                                      row[action.key]
                                        ? "border-violet-500 bg-violet-600 text-white shadow-sm shadow-violet-200"
                                        : "border-slate-200 bg-white text-transparent hover:border-violet-300 dark:border-slate-700 dark:bg-slate-800"
                                    }`}
                                    title={`${getModuleLabel(row)} - ${action.label}`}
                                  >
                                    <Check size={15} />
                                  </button>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedRole && (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-300">
            Editing permissions for <span className="font-bold text-slate-700 dark:text-slate-100">{displayLabel(selectedRole.role_name)}</span>.
          </p>
        )}
      </div>
    </div>
  );
};

export default RoleAccess;

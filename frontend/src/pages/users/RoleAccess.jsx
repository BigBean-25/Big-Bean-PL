import { useEffect, useMemo, useState } from "react";
import { Check, Plus, RotateCcw, Save, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
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
    next = applyByKeys(next, ["dashboard"], { can_view: true });
    next = applyByKeys(next, ["daily_cashbook", "daily_expenses", "bank_deposits", "day_closing", "daily_checklist"], {
      can_view: true,
      can_create: true,
      can_edit: true,
      can_submit: true,
      can_export: true,
    });
    next = applyByKeys(next, ["opening_stock", "closing_stock", "material_purchase", "item_sales", "payroll", "utility_bills", "reports"], {
      can_view: true,
      can_export: true,
    });
    next = applyByKeys(next, ["item_sales_daily"], { can_view: true, can_upload: true });
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
    next = applyByKeys(next, ["dashboard", "reports", "monthly_pl"], { can_view: true, can_export: true });
    next = applyByKeys(next, ["daily_cashbook"], { can_view: true, can_verify: true, can_export: true });
    next = applyByKeys(next, ["daily_expenses"], { can_view: true, can_approve: true, can_reject: true, can_export: true });
    next = applyByKeys(next, ["opening_stock", "closing_stock", "material_purchase", "item_sales"], { can_view: true, can_upload: true, can_verify: true, can_export: true });
    next = applyByKeys(next, ["payroll"], { can_view: true, can_create: true, can_edit: true, can_verify: true, can_export: true });
    next = applyByKeys(next, ["online_payouts", "dine_in_payouts"], { can_view: true, can_create: true, can_edit: true, can_export: true });
    return next;
  }
};

const RoleAccess = () => {
  const user = useAuthStore((state) => state.user);
  const canCreateRole = user?.permissions?.roles?.can_create === true;

  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [originalPermissions, setOriginalPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
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
    try {
      const response = await roleAccessAPI.getRoles();
      const rows = response.data?.data || response.data?.roles || [];
      setRoles(rows);
      if (rows.length && !selectedRoleId) {
        setSelectedRoleId(String(rows[0].id));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load roles");
    }
  };

  const loadPermissions = async (roleId) => {
    if (!roleId) return;
    setLoading(true);
    try {
      const response = await roleAccessAPI.getPermissions(roleId);
      const rows = response.data?.data?.permissions || [];
      setPermissions(rows);
      setOriginalPermissions(rows);
    } catch (error) {
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

        <div className="max-w-full overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-4 py-4 dark:bg-slate-800">Module</th>
                {actions.map((action) => (
                  <th key={action.key} className="px-3 py-4 text-center">{action.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={13} className="px-4 py-10 text-center text-slate-500 dark:text-slate-300">Loading permissions...</td></tr>
              ) : permissions.map((row) => (
                <tr key={row.module_key} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/70">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3 font-bold text-slate-800 dark:bg-slate-900 dark:text-slate-100">
                    <div>{row.module_name}</div>
                    <div className="text-xs font-medium text-slate-400 dark:text-slate-500">{row.module_key}</div>
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
                        title={`${row.module_name} - ${action.label}`}
                      >
                        <Check size={15} />
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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

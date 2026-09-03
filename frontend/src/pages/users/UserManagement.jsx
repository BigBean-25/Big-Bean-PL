import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  UserCheck,
  Eye,
  Search,
  Download,
  Loader2,
  Mail,
  Phone,
  Shield,
  Store,
  CheckCircle,
  AlertCircle,
  User,
  Lock,
  Clock,
} from "lucide-react";
import { userAPI, roleAPI, masterAPI } from "../../services/api";
import { displayLabel } from "../../utils/displayLabels";
import useAuthStore from "../../store/authStore";
import toast from "react-hot-toast";

const DEFAULT_OUTLETS = [
  { id: 1, outlet_name: "RR Nagar", outlet_code: "RR" },
  { id: 2, outlet_name: "Koramangala", outlet_code: "KOR" },
  { id: 3, outlet_name: "M5 E-City", outlet_code: "M5" },
  { id: 4, outlet_name: "HSR Layout", outlet_code: "HSR" },
  { id: 5, outlet_name: "Jayanagar", outlet_code: "JYN" },
  { id: 6, outlet_name: "Indiranagar", outlet_code: "IND" },
  { id: 7, outlet_name: "Kammanahalli", outlet_code: "KAM" },
];

const getPrimaryColor = () => {
  try {
    return localStorage.getItem("bbc_primary_color") || "#7367F0";
  } catch {
    return "#7367F0";
  }
};

const getThemeMode = () => {
  try {
    const mode = localStorage.getItem("bbc_theme_mode") || "light";

    if (mode === "system") {
      return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
        ? "dark"
        : "light";
    }

    return mode;
  } catch {
    return "light";
  }
};

const getRows = (response, key = "") => {
  const root = response?.data || response || {};

  const candidates = [
    key ? root?.[key] : null,
    key ? root?.data?.[key] : null,
    root?.data,
    root?.users,
    root?.roles,
    root?.outlets,
    root?.items,
    root?.rows,
    root?.results,
    root,
  ];

  const found = candidates.find((item) => Array.isArray(item));
  return found || [];
};

const normalizeOutlet = (outlet = {}, index = 0) => {
  const rawId =
    outlet.id ||
    outlet.outlet_id ||
    outlet.value ||
    outlet.store_id ||
    outlet.branch_id ||
    index + 1;

  const id = Number(rawId);

  return {
    ...outlet,
    id,
    outlet_name:
      outlet.outlet_name ||
      outlet.name ||
      outlet.label ||
      outlet.outlet ||
      outlet.branch_name ||
      outlet.store_name ||
      outlet.title ||
      outlet.outlet_code ||
      `Outlet ${id}`,
    outlet_code:
      outlet.outlet_code ||
      outlet.code ||
      outlet.short_code ||
      outlet.store_code ||
      `OUT-${id}`,
  };
};

const normalizeOutlets = (rows = []) => {
  const normalized = rows
    .map((item, index) => normalizeOutlet(item, index))
    .filter((item) => item.id && item.outlet_name);

  return normalized.length > 0 ? normalized : DEFAULT_OUTLETS;
};

const formatDate = (value) => {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
};

const getInitials = (name = "") => {
  const parts = String(name || "User")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return String(parts[0]?.[0] || "U").toUpperCase();
};

const parseIds = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        Number(
          typeof item === "object"
            ? item.id || item.outlet_id || item.value || item.store_id || item.branch_id
            : item
        )
      )
      .filter(Boolean);
  }

  if (typeof value === "number") {
    return [Number(value)].filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();

    if (["all", "all outlets"].includes(trimmed.toLowerCase())) {
      return [];
    }

    try {
      if (trimmed.startsWith("[")) {
        return JSON.parse(trimmed).map(Number).filter(Boolean);
      }
    } catch {
      // ignore invalid JSON
    }

    return trimmed
      .split(",")
      .map((id) => Number(id.trim()))
      .filter(Boolean);
  }

  return [];
};

const getOutletIds = (user) => {
  const possibleValues = [
    user?.outlet_ids,
    user?.assigned_outlet_ids,
    user?.mapped_outlet_ids,
    user?.outlet_id,
    user?.assigned_outlets,
    user?.outlets,
  ];

  for (const value of possibleValues) {
    const ids = parseIds(value);
    if (ids.length > 0) return ids;
  }

  return [];
};

const getAllOutletNames = (allOutlets = []) => {
  return allOutlets
    .map((outlet) => outlet.outlet_name || outlet.name || outlet.outlet_code)
    .filter(Boolean)
    .join(", ");
};

const getDirectOutletNames = (user) => {
  const directValue =
    user?.assigned_outlets ||
    user?.outlet_names ||
    user?.mapped_outlets ||
    user?.outlets ||
    user?.outlet_name ||
    "";

  if (Array.isArray(directValue)) {
    const names = directValue
      .map((item) => {
        if (typeof item === "object") {
          return item.outlet_name || item.name || item.label || item.outlet_code;
        }

        return item;
      })
      .filter(Boolean)
      .join(", ");

    if (names && !["all", "all outlets"].includes(names.toLowerCase())) {
      return names;
    }
  }

  if (typeof directValue === "string" && directValue.trim()) {
    const value = directValue.trim();

    if (!["all", "all outlets"].includes(value.toLowerCase())) {
      return value;
    }
  }

  return "";
};

const getOutletNames = (user, allOutlets = []) => {
  const outletIds = getOutletIds(user);

  if (outletIds.length > 0) {
    const mappedNames = allOutlets
      .filter((outlet) => outletIds.includes(Number(outlet.id)))
      .map((outlet) => outlet.outlet_name || outlet.name || outlet.outlet_code)
      .filter(Boolean)
      .join(", ");

    if (mappedNames) return mappedNames;
  }

  const directNames = getDirectOutletNames(user);
  if (directNames) return directNames;

  return getAllOutletNames(allOutlets) || getAllOutletNames(DEFAULT_OUTLETS);
};

const emptyForm = () => ({
  full_name: "",
  email: "",
  password: "",
  phone: "",
  role_id: "",
  is_active: 1,
  outlet_ids: [],
});

const UserManagement = () => {
  const currentUser = useAuthStore((state) => state.user);

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [outlets, setOutlets] = useState(DEFAULT_OUTLETS);

  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [historyUser, setHistoryUser] = useState(null);

  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [outletFilter, setOutletFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTopbarOutletId, setSelectedTopbarOutletId] = useState(
    localStorage.getItem("bbc_selected_outlet_id") || "all"
  );

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";

  const cardClass = isDark
    ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
    : "border-[#EBE9F1] bg-white text-[#2F2B3D]";

  const inputClass = isDark
    ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6] focus:border-[#7367F0]"
    : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE] focus:border-[#7367F0]";

  const mutedClass = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainTextClass = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    const getLatestSelectedOutlet = () =>
      localStorage.getItem("bbc_selected_outlet_id") || "all";

    const handleOutletChange = (event) => {
      const nextOutletId = event?.detail || getLatestSelectedOutlet();
      setSelectedTopbarOutletId(String(nextOutletId || "all"));
    };

    window.addEventListener("bbc:selected-outlet-change", handleOutletChange);
    window.addEventListener("selected-outlet-change", handleOutletChange);

    const intervalId = window.setInterval(() => {
      const latestOutletId = String(getLatestSelectedOutlet());

      setSelectedTopbarOutletId((current) =>
        current === latestOutletId ? current : latestOutletId
      );
    }, 500);

    return () => {
      window.removeEventListener("bbc:selected-outlet-change", handleOutletChange);
      window.removeEventListener("selected-outlet-change", handleOutletChange);
      window.clearInterval(intervalId);
    };
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);

    try {
      await Promise.all([fetchUsers(), fetchRoles(), fetchOutlets()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await userAPI.getUsers();
      setUsers(getRows(response, "users"));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch users");
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await roleAPI.getRoles();
      setRoles(getRows(response, "roles"));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch roles");
    }
  };

  const fetchOutlets = async () => {
    try {
      const response = await masterAPI.getOutlets();
      setOutlets(normalizeOutlets(getRows(response, "outlets")));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch outlets");
      setOutlets(DEFAULT_OUTLETS);
    }
  };

  const resetForm = () => {
    setFormData(emptyForm());
    setEditingUser(null);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const handleOutletToggle = (outletId) => {
    const id = Number(outletId);
    const currentIds = formData.outlet_ids || [];

    if (currentIds.includes(id)) {
      setFormData({
        ...formData,
        outlet_ids: currentIds.filter((item) => item !== id),
      });
    } else {
      setFormData({
        ...formData,
        outlet_ids: [...currentIds, id],
      });
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      full_name: user.full_name || "",
      email: user.email || "",
      password: "",
      phone: user.phone || "",
      role_id: user.role_id || "",
      is_active: Number(user.is_active) === 1 ? 1 : 0,
      outlet_ids: getOutletIds(user),
    });
    setShowForm(true);
    setSelectedUser(null);
  };

  const handleView = (user) => {
    setSelectedUser(user);
    setActiveTab("overview");
    setShowForm(false);
  };

  const handleDelete = async (id, user) => {
    if (Number(id) === Number(currentUser?.id)) return;
    if (!window.confirm("Permanently delete this user?\nThis action cannot be undone.")) return;

    setDeletingId(id);

    try {
      await userAPI.deleteUser(id);
      toast.success("User deleted permanently");

      setUsers((prev) => prev.filter((u) => Number(u.id) !== Number(id)));

      if (selectedUser && Number(selectedUser.id) === Number(id)) {
        setSelectedUser(null);
      }

      if (editingUser && Number(editingUser.id) === Number(id)) {
        setEditingUser(null);
        setShowForm(false);
      }

      await fetchUsers();
    } catch (error) {
      if (error.response?.status === 409 && error.response?.data?.code === "USER_HAS_HISTORY") {
        setHistoryUser(user || users.find((u) => Number(u.id) === Number(id)));
      } else {
        toast.error(error.response?.data?.message || "Delete failed");
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleStatus = async (user, next) => {
    if (Number(user.id) === Number(currentUser?.id)) return;
    const nextActive = next === 1 || next === true;
    const action = nextActive ? "Activate" : "Deactivate";
    const message = nextActive
      ? "Activate this user?\nThey will be able to log in again."
      : "Deactivate this user?\nThey will no longer be able to log in, but their historical data will remain.";
    if (!window.confirm(message)) return;

    setTogglingId(user.id);
    try {
      await userAPI.toggleUserStatus(user.id, { is_active: nextActive ? 1 : 0 });
      toast.success(`User ${nextActive ? "activated" : "deactivated"} successfully`);
      const patch = { is_active: nextActive ? 1 : 0 };
      setUsers((prev) =>
        prev.map((u) => (Number(u.id) === Number(user.id) ? { ...u, ...patch } : u))
      );
      if (selectedUser && Number(selectedUser.id) === Number(user.id)) {
        setSelectedUser((prev) => (prev ? { ...prev, ...patch } : null));
      }
      await fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || "Update failed");
    } finally {
      setTogglingId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.full_name.trim()) {
      toast.error("Please enter full name");
      return;
    }

    if (!formData.email.trim()) {
      toast.error("Please enter email");
      return;
    }

    if (!editingUser && !formData.password.trim()) {
      toast.error("Please enter password");
      return;
    }

    if (!formData.role_id) {
      toast.error("Please select role");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone || "",
        role_id: formData.role_id,
        is_active: Number(formData.is_active),
        outlet_ids: formData.outlet_ids || [],
      };

      if (formData.password.trim()) {
        payload.password = formData.password.trim();
      }

      if (editingUser) {
        await userAPI.updateUser(editingUser.id, payload);
        toast.success("User updated successfully");
      } else {
        await userAPI.createUser(payload);
        toast.success("User created successfully");
      }

      closeForm();
      await fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const selectedTopbarOutlet = useMemo(() => {
    if (String(selectedTopbarOutletId) === "all") return null;

    const selectedValue = String(selectedTopbarOutletId || "").toLowerCase();

    const toSlug = (value = "") =>
      String(value)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return (
      outlets.find((outlet) => {
        const label =
          outlet?.outlet_name || outlet?.name || outlet?.outlet_code || "";

        return (
          String(outlet.id) === String(selectedTopbarOutletId) ||
          String(outlet.outlet_id || "") === String(selectedTopbarOutletId) ||
          String(outlet.outlet_code || "").toLowerCase() === selectedValue ||
          toSlug(label) === selectedValue
        );
      }) || null
    );
  }, [outlets, selectedTopbarOutletId]);

  const outletFilterOptions = useMemo(() => {
    if (String(selectedTopbarOutletId) === "all") {
      return outlets;
    }

    return selectedTopbarOutlet ? [selectedTopbarOutlet] : [];
  }, [outlets, selectedTopbarOutlet, selectedTopbarOutletId]);

  useEffect(() => {
    if (String(selectedTopbarOutletId) === "all") {
      setOutletFilter("all");
      return;
    }

    setOutletFilter(String(selectedTopbarOutletId));
  }, [selectedTopbarOutletId]);

  const filteredUsers = useMemo(() => {
    const toSlug = (value = "") =>
      String(value)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    const getOutletLabel = (outlet) =>
      outlet?.outlet_name || outlet?.name || outlet?.outlet_code || "";

    const getOutletById = (outletId) => {
      const selectedValue = String(outletId || "").toLowerCase();

      return (
        outlets.find((outlet) => {
          const label = getOutletLabel(outlet);

          return (
            String(outlet.id) === String(outletId) ||
            String(outlet.outlet_id || "") === String(outletId) ||
            String(outlet.outlet_code || "").toLowerCase() === selectedValue ||
            toSlug(label) === selectedValue
          );
        }) || null
      );
    };

    const getTargetOutletName = (outletId, outlet) => {
      const label = getOutletLabel(outlet);
      if (label) return label;

      if (!outletId || String(outletId) === "all") return "";

      return String(outletId).replace(/-/g, " ");
    };

    const matchesOutlet = (user, targetOutletId, targetOutletName = "") => {
      if (!targetOutletId || String(targetOutletId) === "all") return true;

      const userOutletIds = getOutletIds(user);
      const targetId = Number(targetOutletId);
      const targetName = String(targetOutletName || "").toLowerCase().trim();
      const directOutletNames = getDirectOutletNames(user).toLowerCase();

      const rawOutletText = [
        user?.outlet_name,
        user?.outlet_names,
        user?.assigned_outlets,
        user?.mapped_outlets,
        user?.outlets,
      ]
        .map((value) => {
          if (!value) return "";

          if (Array.isArray(value)) {
            return value
              .map((item) => {
                if (typeof item === "object") {
                  return (
                    item?.outlet_name ||
                    item?.name ||
                    item?.label ||
                    item?.outlet_code ||
                    ""
                  );
                }

                return String(item);
              })
              .join(" ");
          }

          if (typeof value === "object") {
            return (
              value?.outlet_name ||
              value?.name ||
              value?.label ||
              value?.outlet_code ||
              ""
            );
          }

          return String(value);
        })
        .join(" ")
        .toLowerCase();

      return (
        userOutletIds.includes(targetId) ||
        String(user?.outlet_id || "") === String(targetOutletId) ||
        (!!targetName && directOutletNames.includes(targetName)) ||
        (!!targetName && rawOutletText.includes(targetName))
      );
    };

    return users.filter((user) => {
      const outletNames = getOutletNames(user, outlets);

      const text = `${user.full_name || ""} ${user.email || ""} ${
        user.phone || ""
      } ${user.role_name || ""} ${outletNames || ""}`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const roleMatch =
        roleFilter === "all" ||
        String(user.role_id) === String(roleFilter) ||
        String(user.role_name) === String(roleFilter);

      const statusMatch =
        statusFilter === "all" ||
        String(Number(user.is_active) === 1 ? "active" : "inactive") ===
          String(statusFilter);

      const selectedOutletFromTopbar = getOutletById(selectedTopbarOutletId);
      const selectedOutletFromFilter = getOutletById(outletFilter);

      const topbarOutletMatch = matchesOutlet(
        user,
        selectedTopbarOutletId,
        getTargetOutletName(selectedTopbarOutletId, selectedOutletFromTopbar)
      );

      const pageOutletMatch = matchesOutlet(
        user,
        outletFilter,
        getTargetOutletName(outletFilter, selectedOutletFromFilter)
      );

      return searchMatch && roleMatch && statusMatch && topbarOutletMatch && pageOutletMatch;
    });
  }, [
    users,
    searchTerm,
    roleFilter,
    statusFilter,
    outletFilter,
    outlets,
    selectedTopbarOutletId,
  ]);

  const summary = useMemo(() => {
    const activeUsers = filteredUsers.filter(
      (user) => Number(user.is_active) === 1
    ).length;
    const inactiveUsers = filteredUsers.filter(
      (user) => Number(user.is_active) !== 1
    ).length;
    const assignedUsers = filteredUsers.filter((user) =>
      getOutletNames(user, outlets)
    ).length;

    return {
      totalUsers: filteredUsers.length,
      activeUsers,
      inactiveUsers,
      assignedUsers,
    };
  }, [filteredUsers, outlets]);

  const selectedOutletIds = selectedUser ? getOutletIds(selectedUser) : [];

  const selectedOutletList = useMemo(() => {
    if (!selectedUser) return [];

    if (selectedOutletIds.length > 0) {
      return outlets.filter((outlet) => selectedOutletIds.includes(Number(outlet.id)));
    }

    return outlets;
  }, [selectedUser, selectedOutletIds, outlets]);

  const handleExport = () => {
    const headers = [
      "Name",
      "Email",
      "Phone",
      "Role",
      "Assigned Outlets",
      "Status",
      "Last Login",
      "Created At",
    ];

    const rows = filteredUsers.map((user) => [
      user.full_name || "",
      user.email || "",
      user.phone || "",
      user.role_name || "",
      getOutletNames(user, outlets),
      Number(user.is_active) === 1 ? "Active" : "Inactive",
      formatDate(user.last_login),
      formatDate(user.created_at),
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "bigbean-users.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Users exported");
  };

  const StatusBadge = ({ active }) => {
    const isActive = Number(active) === 1;

    return (
      <span
        className={`inline-flex rounded px-3 py-1 text-[12px] font-semibold ${
          isActive ? "bg-[#E9F9EF] text-[#28C76F]" : "bg-[#F3F2F7] text-[#6F6B7D]"
        }`}
      >
        {isActive ? "Active" : "Inactive"}
      </span>
    );
  };

  const RoleBadge = ({ role }) => (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium"
      style={{
        color: primaryColor,
        backgroundColor: `${primaryColor}18`,
      }}
    >
      <Shield size={14} />
      {displayLabel(role) || "User"}
    </span>
  );

  const UserAvatar = ({ user, size = "md" }) => {
    const sizes = {
      sm: "h-10 w-10 text-[14px]",
      md: "h-12 w-12 text-[15px]",
      lg: "h-[150px] w-[150px] text-[44px]",
    };

    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-md font-semibold text-white ${sizes[size]}`}
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, #9E95F5)`,
        }}
      >
        {getInitials(user?.full_name)}
      </div>
    );
  };

  const StatCard = ({ title, value, subtitle, icon: Icon, color, bg }) => (
    <div
      className={`rounded-md border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-[14px] font-medium ${mutedClass}`}>{title}</p>
          <h3 className={`mt-2 text-[24px] font-semibold ${mainTextClass}`}>
            {value}
          </h3>
          <p className={`mt-1 text-[13px] ${mutedClass}`}>{subtitle}</p>
        </div>

        <div
          className="flex h-12 w-12 items-center justify-center rounded-md"
          style={{ backgroundColor: bg }}
        >
          <Icon size={24} style={{ color }} />
        </div>
      </div>
    </div>
  );

  const DetailItem = ({ label, value }) => (
    <div className="flex items-start gap-2 py-1.5">
      <span className={`min-w-[130px] text-[14px] font-semibold ${mainTextClass}`}>
        {label}
      </span>
      <span className={`text-[14px] ${mutedClass}`}>{value || "-"}</span>
    </div>
  );

  return (
    <div
      className="space-y-6"
      style={{
        fontFamily:
          '"Public Sans", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <h1 className={`text-[24px] font-semibold ${mainTextClass}`}>
            User Management
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Manage Big Bean Café users, roles and outlet assignments.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExport}
            className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
          >
            <Download size={18} />
            Export
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
              setSelectedUser(null);
            }}
            className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)]"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus size={18} />
            Add New User
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Users"
          value={summary.totalUsers}
          subtitle="All system users"
          icon={User}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />

        <StatCard
          title="Active Users"
          value={summary.activeUsers}
          subtitle="Login enabled"
          icon={CheckCircle}
          color="#28C76F"
          bg="#E9F9EF"
        />

        <StatCard
          title="Inactive Users"
          value={summary.inactiveUsers}
          subtitle="Access disabled"
          icon={AlertCircle}
          color="#EA5455"
          bg="#FCEAEA"
        />

        <StatCard
          title="Outlet Assigned"
          value={summary.assignedUsers}
          subtitle="Outlet mapped users"
          icon={Store}
          color="#00CFE8"
          bg="#E6FAFD"
        />
      </div>

      {showForm && (
        <div
          className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
        >
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                {editingUser ? "Edit User" : "New User"}
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Create user, assign role and map outlets.
              </p>
            </div>

            <button
              type="button"
              onClick={closeForm}
              className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
              aria-label="Close form"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(event) =>
                    setFormData({ ...formData, full_name: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(event) =>
                    setFormData({ ...formData, email: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Password {editingUser ? "(leave blank to keep current)" : "*"}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(event) =>
                    setFormData({ ...formData, password: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required={!editingUser}
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(event) =>
                    setFormData({ ...formData, phone: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Role *
                </label>
                <select
                  value={formData.role_id}
                  onChange={(event) =>
                    setFormData({ ...formData, role_id: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                >
                  <option value="">Select Role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {displayLabel(role.role_name)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Status
                </label>
                <select
                  value={formData.is_active}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      is_active: Number(event.target.value),
                    })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                >
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <label className={`block text-[15px] font-semibold ${mainTextClass}`}>
                    Assign Outlets
                  </label>
                  <p className={`mt-1 text-[13px] ${mutedClass}`}>
                    Leave empty to map every outlet.
                  </p>
                </div>

                <span
                  className="rounded px-3 py-1 text-[13px] font-semibold"
                  style={{
                    color: primaryColor,
                    backgroundColor: `${primaryColor}18`,
                  }}
                >
                  {formData.outlet_ids.length || outlets.length} Mapped
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-md border border-[#DBDADE] bg-[#F8F7FA] p-4 sm:grid-cols-2 xl:grid-cols-4">
                {outlets.map((outlet) => {
                  const checked = formData.outlet_ids?.includes(Number(outlet.id));

                  return (
                    <label
                      key={outlet.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-3 text-[14px] transition ${
                        checked
                          ? "border-[#7367F0] bg-white text-[#7367F0]"
                          : "border-[#EBE9F1] bg-white text-[#5D596C]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleOutletToggle(outlet.id)}
                        className="h-4 w-4 accent-[#7367F0]"
                      />
                      <span className="truncate">{outlet.outlet_name || outlet.name || outlet.outlet_code}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center justify-center gap-2 rounded-md px-5 py-3 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)] disabled:cursor-not-allowed disabled:opacity-70"
                style={{ backgroundColor: primaryColor }}
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <UserCheck size={18} />
                    {editingUser ? "Update User" : "Create User"}
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={closeForm}
                className={`rounded-md border px-5 py-3 text-[15px] font-medium ${cardClass}`}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedUser && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
          <div
            className={`rounded-md border p-8 text-center shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
          >
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
                aria-label="Close user details"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-2 flex justify-center">
              <UserAvatar user={selectedUser} size="lg" />
            </div>

            <h2 className={`mt-6 text-[24px] font-semibold ${mainTextClass}`}>
              {selectedUser.full_name || "-"}
            </h2>

            <div className="mt-3 flex justify-center">
              <RoleBadge role={selectedUser.role_name} />
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="rounded-md bg-[#F8F7FA] p-4 text-left">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-md"
                    style={{
                      color: primaryColor,
                      backgroundColor: `${primaryColor}18`,
                    }}
                  >
                    <Store size={22} />
                  </div>
                  <div>
                    <p className="text-[20px] font-semibold text-[#2F2B3D]">
                      {selectedOutletIds.length || outlets.length || 0}
                    </p>
                    <p className="text-[13px] text-[#6F6B7D]">Outlets</p>
                  </div>
                </div>
              </div>

              <div className="rounded-md bg-[#F8F7FA] p-4 text-left">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E9F9EF] text-[#28C76F]">
                    <CheckCircle size={22} />
                  </div>
                  <div>
                    <p className="text-[20px] font-semibold text-[#2F2B3D]">
                      {Number(selectedUser.is_active) === 1 ? "On" : "Off"}
                    </p>
                    <p className="text-[13px] text-[#6F6B7D]">Login</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 text-left">
              <h3 className={`mb-4 text-[20px] font-semibold ${mainTextClass}`}>
                Details
              </h3>

              <div className="border-t border-[#DBDADE] pt-4">
                <DetailItem label="Username:" value={selectedUser.full_name} />
                <DetailItem label="Email:" value={selectedUser.email} />
                <DetailItem label="Status:" value={Number(selectedUser.is_active) === 1 ? "Active" : "Inactive"} />
                <DetailItem label="Role:" value={displayLabel(selectedUser.role_name)} />
                <DetailItem label="User ID:" value={selectedUser.id ? `USR-${selectedUser.id}` : "-"} />
                <DetailItem label="Contact:" value={selectedUser.phone || "-"} />
                <DetailItem label="Language:" value="English" />
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => handleEdit(selectedUser)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Edit2 size={17} />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() =>
                    selectedUser.is_active === 1 || selectedUser.is_active === true
                      ? handleToggleStatus(selectedUser, 0)
                      : handleToggleStatus(selectedUser, 1)
                  }
                  disabled={Number(selectedUser.id) === Number(currentUser?.id) || togglingId === selectedUser.id}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-[#EEF9FC] px-4 py-2.5 text-[15px] font-semibold text-[#00A6B7] disabled:opacity-50"
                  title={Number(selectedUser.id) === Number(currentUser?.id) ? "Cannot change your own status" : (selectedUser.is_active === 1 || selectedUser.is_active === true ? "Deactivate" : "Activate")}
                >
                  {togglingId === selectedUser.id ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <>
                      {selectedUser.is_active === 1 || selectedUser.is_active === true ? (
                        <>
                          <X size={17} /> Deactivate
                        </>
                      ) : (
                        <>
                          <CheckCircle size={17} /> Activate
                        </>
                      )}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(selectedUser.id, selectedUser)}
                  disabled={Number(selectedUser.id) === Number(currentUser?.id) || deletingId === selectedUser.id}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-[#FCEAEA] px-4 py-2.5 text-[15px] font-semibold text-[#EA5455] disabled:opacity-50"
                  title={Number(selectedUser.id) === Number(currentUser?.id) ? "Cannot delete your own account" : "Delete permanently"}
                >
                  {deletingId === selectedUser.id ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <>
                      <Trash2 size={17} />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex flex-wrap gap-3">
              {[
                { key: "overview", label: "Overview", icon: UserCheck },
                { key: "security", label: "Security", icon: Lock },
                { key: "outlets", label: "Assigned Outlets", icon: Store },
                { key: "activity", label: "Activity", icon: Clock },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className="flex items-center gap-2 rounded-md px-5 py-3 text-[15px] font-semibold shadow-[0_2px_10px_rgba(47,43,61,0.08)]"
                    style={
                      active
                        ? { backgroundColor: primaryColor, color: "#fff" }
                        : {
                            backgroundColor: isDark ? "#2F3349" : "#fff",
                            color: isDark ? "#D0D2D6" : "#5D596C",
                          }
                    }
                  >
                    <Icon size={18} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div
              className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
            >
              {activeTab === "overview" && (
                <div className="p-6">
                  <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                    User Overview
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Basic account and access information.
                  </p>

                  <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E6FAFD] text-[#00A6B7]">
                          <Mail size={22} />
                        </div>
                        <div>
                          <p className="text-[13px] text-[#6F6B7D]">Email</p>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            {selectedUser.email || "-"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E9F9EF] text-[#28C76F]">
                          <Phone size={22} />
                        </div>
                        <div>
                          <p className="text-[13px] text-[#6F6B7D]">Phone</p>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            {selectedUser.phone || "-"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-11 w-11 items-center justify-center rounded-md"
                          style={{
                            color: primaryColor,
                            backgroundColor: `${primaryColor}18`,
                          }}
                        >
                          <Shield size={22} />
                        </div>
                        <div>
                          <p className="text-[13px] text-[#6F6B7D]">Role</p>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            {displayLabel(selectedUser.role_name) || "-"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#FFF4E5] text-[#FF9F43]">
                          <Store size={22} />
                        </div>
                        <div>
                          <p className="text-[13px] text-[#6F6B7D]">Outlet Access</p>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            {getOutletNames(selectedUser, outlets)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "security" && (
                <div className="p-6">
                  <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                    Security
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Login status, role and access control details.
                  </p>

                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between rounded-md border border-[#EBE9F1] p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E9F9EF] text-[#28C76F]">
                          <CheckCircle size={22} />
                        </div>
                        <div>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            Login Status
                          </p>
                          <p className="text-[13px] text-[#6F6B7D]">
                            User account login permission.
                          </p>
                        </div>
                      </div>

                      <StatusBadge active={selectedUser.is_active} />
                    </div>

                    <div className="flex items-center justify-between rounded-md border border-[#EBE9F1] p-5">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-11 w-11 items-center justify-center rounded-md"
                          style={{
                            color: primaryColor,
                            backgroundColor: `${primaryColor}18`,
                          }}
                        >
                          <Shield size={22} />
                        </div>
                        <div>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            Role Permission
                          </p>
                          <p className="text-[13px] text-[#6F6B7D]">
                            Access depends on assigned role.
                          </p>
                        </div>
                      </div>

                      <RoleBadge role={selectedUser.role_name} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "outlets" && (
                <div className="p-6">
                  <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                    Assigned Outlets
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Outlets mapped to this user account.
                  </p>

                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full min-w-[700px] border-collapse">
                      <thead>
                        <tr className="border-b border-[#EBE9F1]">
                          <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                            Outlet
                          </th>
                          <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                            City
                          </th>
                          <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                            Manager
                          </th>
                          <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                            Status
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {selectedOutletList.length === 0 ? (
                          <tr>
                            <td colSpan="4" className="px-4 py-8 text-center text-[14px] text-[#6F6B7D]">
                              No outlets found.
                            </td>
                          </tr>
                        ) : (
                          selectedOutletList.map((outlet) => (
                            <tr key={outlet.id} className="border-b border-[#EBE9F1]">
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="flex h-9 w-9 items-center justify-center rounded-md text-white"
                                    style={{ backgroundColor: primaryColor }}
                                  >
                                    <Store size={17} />
                                  </div>
                                  <div>
                                    <p className="text-[14px] font-semibold text-[#2F2B3D]">
                                      {outlet.outlet_name || outlet.name || "-"}
                                    </p>
                                    <p className="text-[12px] text-[#A8AAAE]">
                                      {outlet.outlet_code || `OUT-${outlet.id}`}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-[14px] text-[#6F6B7D]">
                                {outlet.city || "-"}
                              </td>
                              <td className="px-4 py-4 text-[14px] text-[#6F6B7D]">
                                {outlet.manager_name || "-"}
                              </td>
                              <td className="px-4 py-4">
                                <span className="rounded-full bg-[#E9F9EF] px-3 py-1 text-[12px] font-semibold text-[#28C76F]">
                                  Assigned
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === "activity" && (
                <div className="p-6">
                  <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                    Activity
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Account timeline and audit information.
                  </p>

                  <div className="mt-6 space-y-4">
                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <DetailItem label="Last Login:" value={formatDate(selectedUser.last_login)} />
                      <DetailItem label="Created At:" value={formatDate(selectedUser.created_at)} />
                      <DetailItem label="Updated At:" value={formatDate(selectedUser.updated_at)} />
                      <DetailItem label="Created By:" value={selectedUser.created_by || "-"} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
      >
        <div className="border-b border-[#EBE9F1] p-6">
          <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>Filters</h3>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Role</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {displayLabel(role.role_name)}
                </option>
              ))}
            </select>

            <select
              value={
                String(selectedTopbarOutletId) === "all"
                  ? outletFilter
                  : String(selectedTopbarOutletId)
              }
              onChange={(event) => setOutletFilter(event.target.value)}
              disabled={String(selectedTopbarOutletId) !== "all"}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass} ${
                String(selectedTopbarOutletId) !== "all"
                  ? "cursor-not-allowed opacity-75"
                  : ""
              }`}
            >
              {String(selectedTopbarOutletId) === "all" && (
                <option value="all">All Outlets</option>
              )}

              {outletFilterOptions.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.outlet_name || outlet.name || outlet.outlet_code}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 border-b border-[#EBE9F1] p-6 md:flex-row md:items-center">
          <select
            className={`h-12 w-[95px] rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            defaultValue="10"
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
          </select>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search User"
                className={`h-12 w-full rounded-md border pl-11 pr-4 text-[15px] outline-none sm:w-[290px] ${inputClass}`}
              />
            </div>

            <button
              type="button"
              onClick={handleExport}
              className="flex h-12 items-center justify-center gap-2 rounded-md bg-[#F3F2F7] px-5 text-[15px] font-semibold text-[#6F6B7D]"
            >
              <Download size={17} />
              Export
            </button>

            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(true);
                setSelectedUser(null);
              }}
              className="flex h-12 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)]"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus size={18} />
              Add New User
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Loader2
                size={36}
                className="mx-auto animate-spin"
                style={{ color: primaryColor }}
              />
              <p className={`mt-3 text-[14px] ${mutedClass}`}>Loading users...</p>
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <User size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No users found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add a new user or change filters.
              </p>
            </div>
          </div>
        ) : (
          <div>
            <div className={`block md:hidden divide-y ${isDark ? "divide-[#3B405A]" : "divide-[#EBE9F1]"}`}>
              {filteredUsers.map((user) => (
                <div key={user.id} className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar user={user} size="sm" />
                      <div className="min-w-0">
                        <p className={`truncate text-[15px] font-semibold ${mainTextClass}`}>{user.full_name || "-"}</p>
                        <p className={`truncate text-[13px] ${mutedClass}`}>{user.email || "-"}</p>
                      </div>
                    </div>
                    <StatusBadge active={user.is_active} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <RoleBadge role={user.role_name} />
                  </div>
                  <div className={`space-y-1 text-[13px] ${mutedClass}`}>
                    <p><span className={`font-medium ${mainTextClass}`}>Outlets:</span> {getOutletNames(user, outlets)}</p>
                    {user.phone && <p><span className={`font-medium ${mainTextClass}`}>Phone:</span> {user.phone}</p>}
                    <p className="text-[12px]">Last login: {formatDate(user.last_login)}</p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(user, user.is_active === 1 || user.is_active === true ? 0 : 1)}
                      disabled={togglingId === user.id || Number(user.id) === Number(currentUser?.id)}
                      className={`flex h-9 w-9 items-center justify-center rounded-md border transition hover:border-[#00A6B7] hover:text-[#00A6B7] disabled:opacity-50 ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}
                      title={Number(user.id) === Number(currentUser?.id) ? "Cannot change your own status" : (user.is_active === 1 || user.is_active === true ? "Deactivate" : "Activate")}
                    >
                      {togglingId === user.id ? <Loader2 size={16} className="animate-spin" /> : user.is_active === 1 || user.is_active === true ? <X size={16} /> : <CheckCircle size={16} />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(user.id, user)}
                      disabled={deletingId === user.id || Number(user.id) === Number(currentUser?.id)}
                      className={`flex h-9 w-9 items-center justify-center rounded-md border transition hover:border-[#EA5455] hover:text-[#EA5455] disabled:opacity-50 ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}
                      title={Number(user.id) === Number(currentUser?.id) ? "Cannot delete your own account" : "Delete permanently"}
                    >
                      {deletingId === user.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleView(user)}
                      className={`flex h-9 w-9 items-center justify-center rounded-md border transition hover:border-[#7367F0] hover:text-[#7367F0] ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}
                      title="View Details"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(user)}
                      className={`flex h-9 w-9 items-center justify-center rounded-md border transition hover:border-[#00A6B7] hover:text-[#00A6B7] ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr className="border-b border-[#EBE9F1]">
                  <th className="px-6 py-4 text-left">
                    <input type="checkbox" className="h-5 w-5 rounded accent-[#7367F0]" />
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    User
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Role
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Assigned Outlets
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Contact
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-[#EBE9F1] transition hover:bg-[#F8F7FA]"
                  >
                    <td className="px-6 py-4">
                      <input type="checkbox" className="h-5 w-5 rounded accent-[#7367F0]" />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <UserAvatar user={user} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-[#2F2B3D]">
                            {user.full_name || "-"}
                          </p>
                          <p className="truncate text-[13px] text-[#6F6B7D]">
                            {user.email || "-"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <RoleBadge role={user.role_name} />
                    </td>

                    <td className="px-6 py-4">
                      <span className="text-[14px] text-[#6F6B7D]">
                        {getOutletNames(user, outlets)}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-[14px] text-[#6F6B7D]">
                        <p>{user.phone || "-"}</p>
                        <p className="text-[12px] text-[#A8AAAE]">
                          Last login: {formatDate(user.last_login)}
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <StatusBadge active={user.is_active} />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 text-[#6F6B7D]">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(user, user.is_active === 1 || user.is_active === true ? 0 : 1)}
                          disabled={togglingId === user.id || Number(user.id) === Number(currentUser?.id)}
                          className="transition hover:text-[#00A6B7] disabled:opacity-50"
                          title={Number(user.id) === Number(currentUser?.id) ? "Cannot change your own status" : (user.is_active === 1 || user.is_active === true ? "Deactivate" : "Activate")}
                        >
                          {togglingId === user.id ? (
                            <Loader2 size={20} className="animate-spin" />
                          ) : user.is_active === 1 || user.is_active === true ? (
                            <X size={20} />
                          ) : (
                            <CheckCircle size={20} />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(user.id, user)}
                          disabled={deletingId === user.id || Number(user.id) === Number(currentUser?.id)}
                          className="transition hover:text-[#EA5455] disabled:opacity-50"
                          title={Number(user.id) === Number(currentUser?.id) ? "Cannot delete your own account" : "Delete permanently"}
                        >
                          {deletingId === user.id ? (
                            <Loader2 size={20} className="animate-spin" />
                          ) : (
                            <Trash2 size={20} />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleView(user)}
                          className="transition hover:text-[#7367F0]"
                          title="View Details"
                        >
                          <Eye size={20} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEdit(user)}
                          className="transition hover:text-[#00A6B7]"
                          title="Edit"
                        >
                          <Edit2 size={20} />
                        </button>

                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {historyUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Cannot Delete User</h2>
              <button
                type="button"
                onClick={() => setHistoryUser(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This user has historical records and cannot be permanently deleted. You can deactivate this account instead.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setHistoryUser(null)}
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const user = historyUser;
                  setHistoryUser(null);
                  handleToggleStatus(user, 0);
                }}
                className="h-11 flex-1 rounded-xl bg-[#00A6B7] text-sm font-bold text-white hover:bg-[#008c9a]"
              >
                Deactivate User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
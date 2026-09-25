import { useEffect, useMemo, useRef, useState } from "react";
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
import { Modal } from "../../components/ui";
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

const getOutletNameList = (user, allOutlets = []) => {
  const outletIds = getOutletIds(user);

  if (outletIds.length > 0) {
    const mappedNames = allOutlets
      .filter((outlet) => outletIds.includes(Number(outlet.id)))
      .map((outlet) => outlet.outlet_name || outlet.name || outlet.outlet_code)
      .filter(Boolean);

    if (mappedNames.length > 0) return mappedNames;
  }

  const directNames = getDirectOutletNames(user);
  if (directNames) {
    return directNames
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }

  const allNames = allOutlets
    .map((outlet) => outlet.outlet_name || outlet.name || outlet.outlet_code)
    .filter(Boolean);

  if (allNames.length > 0) return allNames;

  return DEFAULT_OUTLETS.map((outlet) => outlet.outlet_name);
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
  const [pendingConfirmation, setPendingConfirmation] = useState(null);

  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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
  const lastFetchedTopbarOutletIdRef = useRef(
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

  const borderClass = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";
  const softBgClass = isDark ? "bg-[#25293C]" : "bg-[#F8F7FA]";
  const hoverBgClass = isDark ? "hover:bg-[#3B405A]/60" : "hover:bg-[#F8F7FA]";
  const iconBtnClass = isDark
    ? "bg-[#3B405A] text-[#A5A8B6] hover:bg-[#474B66]"
    : "bg-[#F3F2F7] text-[#6F6B7D] hover:bg-[#EBE9F1]";
  const subtleTextClass = isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]";

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
    setLoadError("");
    try {
      const response = await userAPI.getUsers();
      setUsers(getRows(response, "users"));
    } catch (error) {
      setUsers([]);
      setLoadError(error.response?.data?.message || "Failed to fetch users");
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

  useEffect(() => {
    if (lastFetchedTopbarOutletIdRef.current === String(selectedTopbarOutletId || "all")) return;
    lastFetchedTopbarOutletIdRef.current = String(selectedTopbarOutletId || "all");
    fetchUsers();
  }, [selectedTopbarOutletId]);

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

  const handleDelete = (id, user) => {
    if (Number(id) === Number(currentUser?.id)) return;

    const target = user || users.find((u) => Number(u.id) === Number(id));
    if (!target) return;

    setPendingConfirmation({ type: "delete", user: target });
  };

  const performDelete = async (user) => {
    const id = user.id;

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
        setHistoryUser(user);
      } else {
        toast.error(error.response?.data?.message || "Delete failed");
      }
    } finally {
      setDeletingId(null);
      setPendingConfirmation(null);
    }
  };

  const handleToggleStatus = (user, next) => {
    if (Number(user.id) === Number(currentUser?.id)) return;
    const nextActive = next === 1 || next === true;
    setPendingConfirmation({ type: "status", user, nextActive });
  };

  const performToggleStatus = async (user, nextActive) => {
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
      setPendingConfirmation(null);
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

  const clearFilters = () => {
    setSearchTerm("");
    setRoleFilter("all");
    setStatusFilter("all");
    setOutletFilter("all");
  };

  const hasActiveFilters =
    searchTerm !== "" ||
    roleFilter !== "all" ||
    statusFilter !== "all" ||
    (String(selectedTopbarOutletId) === "all" && outletFilter !== "all");

  const StatusBadge = ({ active }) => {
    const isActive = Number(active) === 1;

    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold ${
          isActive
            ? isDark
              ? "border-[#28C76F]/30 bg-[#28C76F]/15 text-[#4ADE80]"
              : "border-[#28C76F]/30 bg-[#E9F9EF] text-[#28C76F]"
            : isDark
              ? "border-[#3B405A] bg-[#3B405A]/40 text-[#A5A8B6]"
              : "border-[#EBE9F1] bg-[#F3F2F7] text-[#6F6B7D]"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isActive ? "bg-[#28C76F]" : isDark ? "bg-[#A5A8B6]" : "bg-[#B9B7C0]"
          }`}
        />
        {isActive ? "Active" : "Inactive"}
      </span>
    );
  };

  const RoleBadge = ({ role }) => (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold"
      style={{
        color: isDark ? "#A9A2F8" : primaryColor,
        backgroundColor: `${primaryColor}${isDark ? "26" : "18"}`,
        borderColor: `${primaryColor}40`,
      }}
    >
      <Shield size={13} />
      {displayLabel(role) || "User"}
    </span>
  );

  const OutletBadges = ({ user, max = 2 }) => {
    const names = getOutletNameList(user, outlets);

    if (names.length === 0) {
      return <span className={`text-[13px] ${mutedClass}`}>-</span>;
    }

    const shown = names.slice(0, max);
    const extra = names.length - shown.length;

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map((name, index) => (
          <span
            key={`${name}-${index}`}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] font-medium ${
              isDark
                ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]"
                : "border-[#EBE9F1] bg-[#F8F7FA] text-[#5D596C]"
            }`}
          >
            <Store size={11} className="opacity-70" />
            {name}
          </span>
        ))}
        {extra > 0 && (
          <span
            className="inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-semibold"
            style={{
              color: isDark ? "#A9A2F8" : primaryColor,
              backgroundColor: `${primaryColor}18`,
            }}
            title={names.join(", ")}
          >
            +{extra} more
          </span>
        )}
      </div>
    );
  };

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
      className={`rounded-lg border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className={`truncate text-[13px] font-medium uppercase tracking-wide ${mutedClass}`}>
            {title}
          </p>
          <h3 className={`mt-1.5 text-[26px] font-semibold leading-tight ${mainTextClass}`}>
            {value}
          </h3>
          <p className={`mt-1 text-[13px] ${mutedClass}`}>{subtitle}</p>
        </div>

        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: bg }}
        >
          <Icon size={22} style={{ color }} />
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
            Manage users, roles, outlet access and account status.
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

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingUser ? "Edit User" : "Create New User"}
        subtitle={
          editingUser
            ? "Update account details, role and outlet access."
            : "Set account details, role and outlet access."
        }
        maxWidth="4xl"
        closeOnEsc={!saving}
        closeOnOverlay={!saving}
      >
        <form onSubmit={handleSubmit} className="space-y-7">
            <div>
              <h4 className={`text-[15px] font-semibold ${mainTextClass}`}>
                Account Information
              </h4>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
              </div>
            </div>

            <div>
              <h4 className={`text-[15px] font-semibold ${mainTextClass}`}>
                Access
              </h4>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
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
            </div>

            <div>
              <h4 className={`text-[15px] font-semibold ${mainTextClass}`}>
                Security
              </h4>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
              </div>
            </div>

            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className={`block text-[15px] font-semibold ${mainTextClass}`}>
                    Outlet Assignment
                  </h4>
                  <p className={`mt-1 text-[13px] ${mutedClass}`}>
                    Leave empty to map every outlet.
                  </p>
                </div>

                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold"
                  style={{
                    color: isDark ? "#A9A2F8" : primaryColor,
                    backgroundColor: `${primaryColor}18`,
                  }}
                >
                  <Store size={13} />
                  {formData.outlet_ids.length > 0
                    ? `${formData.outlet_ids.length} outlet${formData.outlet_ids.length === 1 ? "" : "s"} selected`
                    : `All ${outlets.length} outlets`}
                </span>
              </div>

              <div className={`grid grid-cols-1 gap-3 rounded-md border p-4 sm:grid-cols-2 xl:grid-cols-4 ${isDark ? "border-[#3B405A] bg-[#25293C]" : "border-[#DBDADE] bg-[#F8F7FA]"}`}>
                {outlets.map((outlet) => {
                  const checked = formData.outlet_ids?.includes(Number(outlet.id));

                  return (
                    <label
                      key={outlet.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-3 text-[14px] transition ${
                        checked
                          ? isDark
                            ? "border-[#7367F0] bg-[#7367F0]/15 text-[#A9A2F8]"
                            : "border-[#7367F0] bg-white text-[#7367F0]"
                          : isDark
                            ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6] hover:bg-[#3B405A]/60"
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
                disabled={saving}
                className={`rounded-md border px-5 py-3 text-[15px] font-medium disabled:opacity-60 ${cardClass}`}
              >
                Cancel
              </button>
            </div>
          </form>
      </Modal>

      {selectedUser && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
          <div
            className={`rounded-md border p-8 text-center shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
          >
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className={`flex h-9 w-9 items-center justify-center rounded-md transition ${iconBtnClass}`}
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
              <div className={`rounded-md p-4 text-left ${softBgClass}`}>
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-md"
                    style={{
                      color: isDark ? "#A9A2F8" : primaryColor,
                      backgroundColor: `${primaryColor}18`,
                    }}
                  >
                    <Store size={22} />
                  </div>
                  <div>
                    <p className={`text-[20px] font-semibold ${mainTextClass}`}>
                      {selectedOutletIds.length || outlets.length || 0}
                    </p>
                    <p className={`text-[13px] ${subtleTextClass}`}>Outlets</p>
                  </div>
                </div>
              </div>

              <div className={`rounded-md p-4 text-left ${softBgClass}`}>
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-md ${
                      isDark ? "bg-[#28C76F]/15 text-[#4ADE80]" : "bg-[#E9F9EF] text-[#28C76F]"
                    }`}
                  >
                    <CheckCircle size={22} />
                  </div>
                  <div>
                    <p className={`text-[20px] font-semibold ${mainTextClass}`}>
                      {Number(selectedUser.is_active) === 1 ? "On" : "Off"}
                    </p>
                    <p className={`text-[13px] ${subtleTextClass}`}>Login</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 text-left">
              <h3 className={`mb-4 text-[20px] font-semibold ${mainTextClass}`}>
                Details
              </h3>

              <div className={`border-t pt-4 ${borderClass}`}>
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
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold disabled:opacity-50 ${
                    isDark ? "bg-[#00A6B7]/15 text-[#22D3EE]" : "bg-[#EEF9FC] text-[#00A6B7]"
                  }`}
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
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold disabled:opacity-50 ${
                    isDark ? "bg-[#EA5455]/15 text-[#FF6B6B]" : "bg-[#FCEAEA] text-[#EA5455]"
                  }`}
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
                    <div className={`rounded-md border p-5 ${borderClass}`}>
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-md ${
                            isDark ? "bg-[#00CFE8]/15 text-[#22D3EE]" : "bg-[#E6FAFD] text-[#00A6B7]"
                          }`}
                        >
                          <Mail size={22} />
                        </div>
                        <div>
                          <p className={`text-[13px] ${subtleTextClass}`}>Email</p>
                          <p className={`text-[15px] font-semibold ${mainTextClass}`}>
                            {selectedUser.email || "-"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className={`rounded-md border p-5 ${borderClass}`}>
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-md ${
                            isDark ? "bg-[#28C76F]/15 text-[#4ADE80]" : "bg-[#E9F9EF] text-[#28C76F]"
                          }`}
                        >
                          <Phone size={22} />
                        </div>
                        <div>
                          <p className={`text-[13px] ${subtleTextClass}`}>Phone</p>
                          <p className={`text-[15px] font-semibold ${mainTextClass}`}>
                            {selectedUser.phone || "-"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className={`rounded-md border p-5 ${borderClass}`}>
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-11 w-11 items-center justify-center rounded-md"
                          style={{
                            color: isDark ? "#A9A2F8" : primaryColor,
                            backgroundColor: `${primaryColor}18`,
                          }}
                        >
                          <Shield size={22} />
                        </div>
                        <div>
                          <p className={`text-[13px] ${subtleTextClass}`}>Role</p>
                          <p className={`text-[15px] font-semibold ${mainTextClass}`}>
                            {displayLabel(selectedUser.role_name) || "-"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className={`rounded-md border p-5 ${borderClass}`}>
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-md ${
                            isDark ? "bg-[#FF9F43]/15 text-[#FFB976]" : "bg-[#FFF4E5] text-[#FF9F43]"
                          }`}
                        >
                          <Store size={22} />
                        </div>
                        <div>
                          <p className={`text-[13px] ${subtleTextClass}`}>Outlet Access</p>
                          <p className={`text-[15px] font-semibold ${mainTextClass}`}>
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
                    <div className={`flex items-center justify-between rounded-md border p-5 ${borderClass}`}>
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-md ${
                            isDark ? "bg-[#28C76F]/15 text-[#4ADE80]" : "bg-[#E9F9EF] text-[#28C76F]"
                          }`}
                        >
                          <CheckCircle size={22} />
                        </div>
                        <div>
                          <p className={`text-[15px] font-semibold ${mainTextClass}`}>
                            Login Status
                          </p>
                          <p className={`text-[13px] ${subtleTextClass}`}>
                            User account login permission.
                          </p>
                        </div>
                      </div>

                      <StatusBadge active={selectedUser.is_active} />
                    </div>

                    <div className={`flex items-center justify-between rounded-md border p-5 ${borderClass}`}>
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-11 w-11 items-center justify-center rounded-md"
                          style={{
                            color: isDark ? "#A9A2F8" : primaryColor,
                            backgroundColor: `${primaryColor}18`,
                          }}
                        >
                          <Shield size={22} />
                        </div>
                        <div>
                          <p className={`text-[15px] font-semibold ${mainTextClass}`}>
                            Role Permission
                          </p>
                          <p className={`text-[13px] ${subtleTextClass}`}>
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
                        <tr className={`border-b ${borderClass}`}>
                          <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                            Outlet
                          </th>
                          <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                            City
                          </th>
                          <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                            Manager
                          </th>
                          <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                            Status
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {selectedOutletList.length === 0 ? (
                          <tr>
                            <td colSpan="4" className={`px-4 py-8 text-center text-[14px] ${subtleTextClass}`}>
                              No outlets found.
                            </td>
                          </tr>
                        ) : (
                          selectedOutletList.map((outlet) => (
                            <tr key={outlet.id} className={`border-b transition ${borderClass} ${hoverBgClass}`}>
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="flex h-9 w-9 items-center justify-center rounded-md text-white"
                                    style={{ backgroundColor: primaryColor }}
                                  >
                                    <Store size={17} />
                                  </div>
                                  <div>
                                    <p className={`text-[14px] font-semibold ${mainTextClass}`}>
                                      {outlet.outlet_name || outlet.name || "-"}
                                    </p>
                                    <p className={`text-[12px] ${mutedClass}`}>
                                      {outlet.outlet_code || `OUT-${outlet.id}`}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className={`px-4 py-4 text-[14px] ${subtleTextClass}`}>
                                {outlet.city || "-"}
                              </td>
                              <td className={`px-4 py-4 text-[14px] ${subtleTextClass}`}>
                                {outlet.manager_name || "-"}
                              </td>
                              <td className="px-4 py-4">
                                <span
                                  className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
                                    isDark ? "bg-[#28C76F]/15 text-[#4ADE80]" : "bg-[#E9F9EF] text-[#28C76F]"
                                  }`}
                                >
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
                    <div className={`rounded-md border p-5 ${borderClass}`}>
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
        className={`rounded-lg border shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
      >
        <div className={`border-b p-4 sm:p-5 ${borderClass}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative w-full lg:w-[300px] lg:shrink-0">
              <Search
                size={17}
                className={`absolute left-4 top-1/2 -translate-y-1/2 ${mutedClass}`}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search name or email"
                className={`h-11 w-full rounded-md border pl-11 pr-4 text-[14px] outline-none ${inputClass}`}
              />
            </div>

            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3 lg:ml-auto lg:max-w-[560px]">
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className={`h-11 rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
              >
                <option value="all">All Roles</option>
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
                className={`h-11 rounded-md border px-4 text-[14px] outline-none ${inputClass} ${
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
                className={`h-11 rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className={`flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border px-4 text-[14px] font-medium transition ${cardClass} ${hoverBgClass}`}
              >
                <X size={15} />
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="text-center">
              <Loader2
                size={36}
                className="mx-auto animate-spin"
                style={{ color: primaryColor }}
              />
              <p className={`mt-3 text-[14px] ${mutedClass}`}>Loading users...</p>
            </div>
          </div>
        ) : loadError ? (
          <div className="flex min-h-[320px] items-center justify-center px-6 text-center">
            <div
              className={`rounded-lg border px-8 py-6 ${
                isDark ? "border-[#EA5455]/30 bg-[#EA5455]/10" : "border-[#F5C6C6] bg-[#FFF5F5]"
              }`}
            >
              <AlertCircle size={40} className="mx-auto text-[#EA5455]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>Failed to load users</p>
              <p className={`mt-1 max-w-sm text-[14px] ${mutedClass}`}>{loadError}</p>
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex min-h-[320px] items-center justify-center px-6">
            <div className="text-center">
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${softBgClass}`}
              >
                <User size={26} className={mutedClass} />
              </div>
              <p className={`mt-4 text-[16px] font-semibold ${mainTextClass}`}>
                No users found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                {hasActiveFilters
                  ? "Try adjusting or clearing your filters."
                  : "Add a new user to get started."}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold"
                  style={{
                    color: isDark ? "#A9A2F8" : primaryColor,
                    backgroundColor: `${primaryColor}18`,
                  }}
                >
                  <X size={14} />
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className={`block md:hidden divide-y ${isDark ? "divide-[#3B405A]" : "divide-[#EBE9F1]"}`}>
              {filteredUsers.map((user) => (
                <div key={user.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar user={user} size="sm" />
                      <div className="min-w-0">
                        <p className={`truncate text-[15px] font-semibold ${mainTextClass}`}>{user.full_name || "-"}</p>
                        <p className={`truncate text-[13px] ${mutedClass}`}>{user.email || "-"}</p>
                      </div>
                    </div>
                    <StatusBadge active={user.is_active} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RoleBadge role={user.role_name} />
                    <OutletBadges user={user} max={3} />
                  </div>
                  <div className={`flex flex-wrap gap-x-4 gap-y-1 text-[13px] ${mutedClass}`}>
                    {user.phone && <p><span className={`font-medium ${mainTextClass}`}>Phone:</span> {user.phone}</p>}
                    <p className="text-[12px] leading-5">Last login: {formatDate(user.last_login)}</p>
                  </div>
                  <div className={`flex flex-wrap items-center gap-2 border-t pt-3 ${borderClass}`}>
                    <button
                      type="button"
                      onClick={() => handleView(user)}
                      className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border text-[13px] font-medium transition hover:border-[#7367F0] hover:text-[#7367F0] ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}
                      title="View Details"
                    >
                      <Eye size={15} /> View
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(user)}
                      className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border text-[13px] font-medium transition hover:border-[#00A6B7] hover:text-[#00A6B7] ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}
                      title="Edit"
                    >
                      <Edit2 size={15} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(user, user.is_active === 1 || user.is_active === true ? 0 : 1)}
                      disabled={togglingId === user.id || Number(user.id) === Number(currentUser?.id)}
                      className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border text-[13px] font-medium transition hover:border-[#00A6B7] hover:text-[#00A6B7] disabled:opacity-50 ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}
                      title={Number(user.id) === Number(currentUser?.id) ? "Cannot change your own status" : (user.is_active === 1 || user.is_active === true ? "Deactivate" : "Activate")}
                    >
                      {togglingId === user.id ? <Loader2 size={15} className="animate-spin" /> : user.is_active === 1 || user.is_active === true ? <><X size={15} /> Deactivate</> : <><CheckCircle size={15} /> Activate</>}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(user.id, user)}
                      disabled={deletingId === user.id || Number(user.id) === Number(currentUser?.id)}
                      className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border text-[13px] font-medium transition hover:border-[#EA5455] hover:text-[#EA5455] disabled:opacity-50 ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}
                      title={Number(user.id) === Number(currentUser?.id) ? "Cannot delete your own account" : "Delete permanently"}
                    >
                      {deletingId === user.id ? <Loader2 size={15} className="animate-spin" /> : <><Trash2 size={15} /> Delete</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr className={`border-b ${borderClass} ${softBgClass}`}>
                  <th className={`px-6 py-3.5 text-left text-[12px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                    User
                  </th>
                  <th className={`px-6 py-3.5 text-left text-[12px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                    Role
                  </th>
                  <th className={`px-6 py-3.5 text-left text-[12px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                    Assigned Outlets
                  </th>
                  <th className={`px-6 py-3.5 text-left text-[12px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                    Contact
                  </th>
                  <th className={`px-6 py-3.5 text-left text-[12px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                    Status
                  </th>
                  <th className={`px-6 py-3.5 text-right text-[12px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className={`border-b transition ${borderClass} ${hoverBgClass}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <UserAvatar user={user} size="sm" />
                        <div className="min-w-0">
                          <p className={`truncate text-[15px] font-semibold ${mainTextClass}`}>
                            {user.full_name || "-"}
                          </p>
                          <p className={`truncate text-[13px] ${mutedClass}`}>
                            {user.email || "-"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <RoleBadge role={user.role_name} />
                    </td>

                    <td className="px-6 py-4">
                      <OutletBadges user={user} max={2} />
                    </td>

                    <td className="px-6 py-4">
                      <div className={`text-[14px] ${subtleTextClass}`}>
                        <p>{user.phone || "-"}</p>
                        <p className={`text-[12px] ${mutedClass}`}>
                          Last login: {formatDate(user.last_login)}
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <StatusBadge active={user.is_active} />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleView(user)}
                          className={`flex h-9 w-9 items-center justify-center rounded-md border transition hover:border-[#7367F0] hover:text-[#7367F0] ${
                            isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"
                          }`}
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEdit(user)}
                          className={`flex h-9 w-9 items-center justify-center rounded-md border transition hover:border-[#00A6B7] hover:text-[#00A6B7] ${
                            isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"
                          }`}
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleStatus(user, user.is_active === 1 || user.is_active === true ? 0 : 1)}
                          disabled={togglingId === user.id || Number(user.id) === Number(currentUser?.id)}
                          className={`flex h-9 w-9 items-center justify-center rounded-md border transition hover:border-[#00A6B7] hover:text-[#00A6B7] disabled:opacity-50 ${
                            isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"
                          }`}
                          title={Number(user.id) === Number(currentUser?.id) ? "Cannot change your own status" : (user.is_active === 1 || user.is_active === true ? "Deactivate" : "Activate")}
                        >
                          {togglingId === user.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : user.is_active === 1 || user.is_active === true ? (
                            <X size={16} />
                          ) : (
                            <CheckCircle size={16} />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(user.id, user)}
                          disabled={deletingId === user.id || Number(user.id) === Number(currentUser?.id)}
                          className={`flex h-9 w-9 items-center justify-center rounded-md border transition hover:border-[#EA5455] hover:text-[#EA5455] disabled:opacity-50 ${
                            isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"
                          }`}
                          title={Number(user.id) === Number(currentUser?.id) ? "Cannot delete your own account" : "Delete permanently"}
                        >
                          {deletingId === user.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
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

      <Modal
        open={!!historyUser}
        onClose={() => setHistoryUser(null)}
        title="Cannot Delete User"
        subtitle={
          historyUser?.full_name
            ? `Linked records found for ${historyUser.full_name}.`
            : "Linked records found for this account."
        }
        maxWidth="md"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setHistoryUser(null)}
              className={`h-11 flex-1 rounded-lg border text-sm font-semibold transition ${cardClass} ${hoverBgClass}`}
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
              className={`h-11 flex-1 rounded-lg text-sm font-semibold text-white transition ${
                isDark ? "bg-[#00A6B7] hover:bg-[#00b9cc]" : "bg-[#00A6B7] hover:bg-[#008c9a]"
              }`}
            >
              Deactivate User
            </button>
          </div>
        }
      >
        <p className={`text-[14px] leading-relaxed ${subtleTextClass}`}>
          This user has historical records and cannot be permanently deleted.
          You can deactivate this account instead — they will no longer be able
          to log in, but their historical data will remain.
        </p>
      </Modal>

      <Modal
        open={!!pendingConfirmation}
        onClose={() => {
          if (!deletingId && !togglingId) setPendingConfirmation(null);
        }}
        title={
          pendingConfirmation?.type === "delete"
            ? "Delete User?"
            : pendingConfirmation?.nextActive
              ? "Activate User?"
              : "Deactivate User?"
        }
        maxWidth="sm"
        closeOnEsc={!deletingId && !togglingId}
        closeOnOverlay={!deletingId && !togglingId}
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPendingConfirmation(null)}
              disabled={!!deletingId || !!togglingId}
              className={`h-11 flex-1 rounded-lg border text-sm font-semibold transition disabled:opacity-60 ${cardClass} ${hoverBgClass}`}
            >
              Cancel
            </button>
            {pendingConfirmation?.type === "delete" ? (
              <button
                type="button"
                onClick={() => performDelete(pendingConfirmation.user)}
                disabled={!!deletingId}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#EA5455] text-sm font-semibold text-white transition hover:bg-[#d63f40] disabled:opacity-70"
              >
                {deletingId === pendingConfirmation?.user?.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                Delete User
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  performToggleStatus(
                    pendingConfirmation?.user,
                    pendingConfirmation?.nextActive
                  )
                }
                disabled={!!togglingId}
                className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-70 ${
                  pendingConfirmation?.nextActive
                    ? "bg-[#28C76F] hover:bg-[#20a85e]"
                    : "bg-[#EA5455] hover:bg-[#d63f40]"
                }`}
              >
                {togglingId === pendingConfirmation?.user?.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : pendingConfirmation?.nextActive ? (
                  <CheckCircle size={16} />
                ) : (
                  <X size={16} />
                )}
                {pendingConfirmation?.nextActive ? "Activate" : "Deactivate"}
              </button>
            )}
          </div>
        }
      >
        <p className={`text-[14px] leading-relaxed ${subtleTextClass}`}>
          {pendingConfirmation?.type === "delete"
            ? `Permanently delete ${pendingConfirmation?.user?.full_name || "this user"}? This action cannot be undone.`
            : pendingConfirmation?.nextActive
              ? `Activate ${pendingConfirmation?.user?.full_name || "this user"}? They will be able to log in again.`
              : `Deactivate ${pendingConfirmation?.user?.full_name || "this user"}? They will no longer be able to log in, but their historical data will remain.`}
        </p>
      </Modal>
    </div>
  );
};

export default UserManagement;
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Eye,
  Search,
  Download,
  Loader2,
  Store,
  MapPin,
  Phone,
  Mail,
  User,
  Calendar,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { masterAPI } from "../../services/api";
import toast from "react-hot-toast";

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

const emptyForm = () => ({
  outlet_code: "",
  outlet_name: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  phone: "",
  email: "",
  manager_name: "",
  opening_date: "",
  is_active: 1,
});

const getRows = (response) => {
  const data = response?.data?.data || response?.data || [];
  return Array.isArray(data) ? data : [];
};

const formatDate = (value) => {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "-";
  }
};

const safeDateInput = (value) => {
  if (!value) return "";

  try {
    return String(value).slice(0, 10);
  } catch {
    return "";
  }
};

const Outlets = () => {
  const [outlets, setOutlets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedOutlet, setSelectedOutlet] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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
    fetchOutlets();
  }, []);

  const fetchOutlets = async () => {
    setLoading(true);

    try {
      const response = await masterAPI.getOutlets();
      setOutlets(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch outlets");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(emptyForm());
    setEditingId(null);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const handleEdit = (outlet) => {
    setEditingId(outlet.id);
    setFormData({
      outlet_code: outlet.outlet_code || "",
      outlet_name: outlet.outlet_name || "",
      address: outlet.address || "",
      city: outlet.city || "",
      state: outlet.state || "",
      pincode: outlet.pincode || "",
      phone: outlet.phone || "",
      email: outlet.email || "",
      manager_name: outlet.manager_name || "",
      opening_date: safeDateInput(outlet.opening_date),
      is_active: Number(outlet.is_active) === 1 ? 1 : 0,
    });
    setShowForm(true);
    setSelectedOutlet(null);
  };

  const handleView = (outlet) => {
    setSelectedOutlet(outlet);
    setActiveTab("overview");
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this outlet?")) return;

    setDeletingId(id);

    try {
      await masterAPI.deleteOutlet(id);
      toast.success("Outlet deleted successfully");

      if (selectedOutlet?.id === id) {
        setSelectedOutlet(null);
      }

      await fetchOutlets();
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.outlet_code.trim()) {
      toast.error("Please enter outlet code");
      return;
    }

    if (!formData.outlet_name.trim()) {
      toast.error("Please enter outlet name");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        outlet_code: formData.outlet_code.trim(),
        outlet_name: formData.outlet_name.trim(),
        address: formData.address || "",
        city: formData.city || "",
        state: formData.state || "",
        pincode: formData.pincode || "",
        phone: formData.phone || "",
        email: formData.email || "",
        manager_name: formData.manager_name || "",
        opening_date: formData.opening_date || null,
        is_active: Number(formData.is_active),
      };

      if (editingId) {
        await masterAPI.updateOutlet(editingId, payload);
        toast.success("Outlet updated successfully");
      } else {
        await masterAPI.createOutlet(payload);
        toast.success("Outlet created successfully");
      }

      closeForm();
      await fetchOutlets();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const cityOptions = useMemo(() => {
    return Array.from(
      new Set(outlets.map((outlet) => outlet.city).filter(Boolean))
    );
  }, [outlets]);

  const filteredOutlets = useMemo(() => {
    return outlets.filter((outlet) => {
      const text = `${outlet.outlet_code || ""} ${outlet.outlet_name || ""} ${
        outlet.city || ""
      } ${outlet.state || ""} ${outlet.manager_name || ""} ${
        outlet.phone || ""
      } ${outlet.email || ""}`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const cityMatch =
        cityFilter === "all" ||
        String(outlet.city || "").toLowerCase() ===
          String(cityFilter).toLowerCase();

      const statusMatch =
        statusFilter === "all" ||
        String(Number(outlet.is_active) === 1 ? "active" : "inactive") ===
          String(statusFilter);

      return searchMatch && cityMatch && statusMatch;
    });
  }, [outlets, searchTerm, cityFilter, statusFilter]);

  const summary = useMemo(() => {
    const active = outlets.filter((outlet) => Number(outlet.is_active) === 1).length;
    const inactive = outlets.filter((outlet) => Number(outlet.is_active) !== 1).length;
    const cities = new Set(outlets.map((outlet) => outlet.city).filter(Boolean));

    return {
      total: outlets.length,
      active,
      inactive,
      cities: cities.size,
    };
  }, [outlets]);

  const handleExport = () => {
    const headers = [
      "Outlet Code",
      "Outlet Name",
      "Address",
      "City",
      "State",
      "Pincode",
      "Phone",
      "Email",
      "Manager",
      "Opening Date",
      "Status",
    ];

    const rows = filteredOutlets.map((outlet) => [
      outlet.outlet_code || "",
      outlet.outlet_name || "",
      outlet.address || "",
      outlet.city || "",
      outlet.state || "",
      outlet.pincode || "",
      outlet.phone || "",
      outlet.email || "",
      outlet.manager_name || "",
      formatDate(outlet.opening_date),
      Number(outlet.is_active) === 1 ? "Active" : "Inactive",
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
    link.download = "bigbean-outlets.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Outlets exported");
  };

  const StatusBadge = ({ active }) => {
    const isActive = Number(active) === 1;

    return (
      <span
        className={`inline-flex rounded px-3 py-1 text-[12px] font-semibold ${
          isActive ? "bg-[#E9F9EF] text-[#28C76F]" : "bg-[#FCEAEA] text-[#EA5455]"
        }`}
      >
        {isActive ? "Active" : "Inactive"}
      </span>
    );
  };

  const OutletAvatar = ({ outlet, size = "md" }) => {
    const sizes = {
      sm: "h-10 w-10 text-[14px]",
      md: "h-12 w-12 text-[16px]",
      lg: "h-[150px] w-[150px] text-[42px]",
    };

    const initials =
      String(outlet?.outlet_name || "Outlet")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((item) => item[0])
        .join("")
        .toUpperCase() || "O";

    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-md font-semibold text-white ${sizes[size]}`}
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, #9E95F5)`,
        }}
      >
        {initials}
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
            Outlets Management
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Manage all Big Bean Café outlet locations and operational details.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={fetchOutlets}
            className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
          >
            <RefreshCw size={18} />
            Refresh
          </button>

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
              setSelectedOutlet(null);
            }}
            className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)]"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus size={18} />
            Add Outlet
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Outlets"
          value={summary.total}
          subtitle="All café locations"
          icon={Store}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />

        <StatCard
          title="Active Outlets"
          value={summary.active}
          subtitle="Currently operational"
          icon={CheckCircle}
          color="#28C76F"
          bg="#E9F9EF"
        />

        <StatCard
          title="Inactive Outlets"
          value={summary.inactive}
          subtitle="Temporarily disabled"
          icon={AlertCircle}
          color="#EA5455"
          bg="#FCEAEA"
        />

        <StatCard
          title="Cities"
          value={summary.cities}
          subtitle="Outlet city coverage"
          icon={MapPin}
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
                {editingId ? "Edit Outlet" : "New Outlet"}
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add outlet identity, address, manager and contact details.
              </p>
            </div>

            <button
              type="button"
              onClick={closeForm}
              className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Outlet Code *
                </label>
                <input
                  type="text"
                  value={formData.outlet_code}
                  onChange={(event) =>
                    setFormData({ ...formData, outlet_code: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Outlet Name *
                </label>
                <input
                  type="text"
                  value={formData.outlet_name}
                  onChange={(event) =>
                    setFormData({ ...formData, outlet_name: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  City
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(event) =>
                    setFormData({ ...formData, city: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  State
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(event) =>
                    setFormData({ ...formData, state: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Pincode
                </label>
                <input
                  type="text"
                  value={formData.pincode}
                  onChange={(event) =>
                    setFormData({ ...formData, pincode: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
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
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(event) =>
                    setFormData({ ...formData, email: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Manager Name
                </label>
                <input
                  type="text"
                  value={formData.manager_name}
                  onChange={(event) =>
                    setFormData({ ...formData, manager_name: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Opening Date
                </label>
                <input
                  type="date"
                  value={formData.opening_date}
                  onChange={(event) =>
                    setFormData({ ...formData, opening_date: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                />
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

              <div className="md:col-span-2 xl:col-span-3">
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Address
                </label>
                <textarea
                  value={formData.address}
                  onChange={(event) =>
                    setFormData({ ...formData, address: event.target.value })
                  }
                  className={`min-h-[90px] w-full rounded-md border px-4 py-3 text-[14px] outline-none ${inputClass}`}
                />
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
                    <Store size={18} />
                    {editingId ? "Update Outlet" : "Create Outlet"}
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

      {selectedOutlet && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
          <div
            className={`rounded-md border p-8 text-center shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
          >
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedOutlet(null)}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-2 flex justify-center">
              <OutletAvatar outlet={selectedOutlet} size="lg" />
            </div>

            <h2 className={`mt-6 text-[24px] font-semibold ${mainTextClass}`}>
              {selectedOutlet.outlet_name || "-"}
            </h2>

            <div className="mt-3 flex justify-center">
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium"
                style={{
                  color: primaryColor,
                  backgroundColor: `${primaryColor}18`,
                }}
              >
                <Store size={14} />
                {selectedOutlet.outlet_code || "Outlet"}
              </span>
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
                    <MapPin size={22} />
                  </div>
                  <div>
                    <p className="text-[20px] font-semibold text-[#2F2B3D]">
                      {selectedOutlet.city || "-"}
                    </p>
                    <p className="text-[13px] text-[#6F6B7D]">City</p>
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
                      {Number(selectedOutlet.is_active) === 1 ? "On" : "Off"}
                    </p>
                    <p className="text-[13px] text-[#6F6B7D]">Active</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 text-left">
              <h3 className={`mb-4 text-[20px] font-semibold ${mainTextClass}`}>
                Details
              </h3>

              <div className="border-t border-[#DBDADE] pt-4">
                <DetailItem label="Code:" value={selectedOutlet.outlet_code} />
                <DetailItem label="Name:" value={selectedOutlet.outlet_name} />
                <DetailItem label="Manager:" value={selectedOutlet.manager_name} />
                <DetailItem label="Phone:" value={selectedOutlet.phone} />
                <DetailItem label="Email:" value={selectedOutlet.email} />
                <DetailItem label="Status:" value={Number(selectedOutlet.is_active) === 1 ? "Active" : "Inactive"} />
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => handleEdit(selectedOutlet)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Edit2 size={17} />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(selectedOutlet.id)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-[#FCEAEA] px-4 py-2.5 text-[15px] font-semibold text-[#EA5455]"
                >
                  <Trash2 size={17} />
                  Delete
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex flex-wrap gap-3">
              {[
                { key: "overview", label: "Overview", icon: Store },
                { key: "contact", label: "Contact", icon: Phone },
                { key: "location", label: "Location", icon: MapPin },
                { key: "activity", label: "Activity", icon: Calendar },
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
              className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
            >
              {activeTab === "overview" && (
                <>
                  <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                    Outlet Overview
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Basic outlet identity and operations information.
                  </p>

                  <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="rounded-md border border-[#EBE9F1] p-5">
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
                          <p className="text-[13px] text-[#6F6B7D]">Outlet Code</p>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            {selectedOutlet.outlet_code || "-"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E9F9EF] text-[#28C76F]">
                          <CheckCircle size={22} />
                        </div>
                        <div>
                          <p className="text-[13px] text-[#6F6B7D]">Status</p>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            {Number(selectedOutlet.is_active) === 1
                              ? "Active"
                              : "Inactive"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#FFF4E5] text-[#FF9F43]">
                          <User size={22} />
                        </div>
                        <div>
                          <p className="text-[13px] text-[#6F6B7D]">Manager</p>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            {selectedOutlet.manager_name || "-"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E6FAFD] text-[#00A6B7]">
                          <Calendar size={22} />
                        </div>
                        <div>
                          <p className="text-[13px] text-[#6F6B7D]">Opening Date</p>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            {formatDate(selectedOutlet.opening_date)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === "contact" && (
                <>
                  <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                    Contact Details
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Outlet phone, email and manager contact details.
                  </p>

                  <div className="mt-6 space-y-4">
                    <DetailItem label="Phone:" value={selectedOutlet.phone} />
                    <DetailItem label="Email:" value={selectedOutlet.email} />
                    <DetailItem label="Manager:" value={selectedOutlet.manager_name} />
                  </div>
                </>
              )}

              {activeTab === "location" && (
                <>
                  <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                    Location
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Address and city details.
                  </p>

                  <div className="mt-6 space-y-4">
                    <DetailItem label="Address:" value={selectedOutlet.address} />
                    <DetailItem label="City:" value={selectedOutlet.city} />
                    <DetailItem label="State:" value={selectedOutlet.state} />
                    <DetailItem label="Pincode:" value={selectedOutlet.pincode} />
                  </div>
                </>
              )}

              {activeTab === "activity" && (
                <>
                  <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                    Activity
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Outlet creation and update timestamps.
                  </p>

                  <div className="mt-6 space-y-4">
                    <DetailItem label="Created At:" value={formatDate(selectedOutlet.created_at)} />
                    <DetailItem label="Updated At:" value={formatDate(selectedOutlet.updated_at)} />
                    <DetailItem label="Opening Date:" value={formatDate(selectedOutlet.opening_date)} />
                  </div>
                </>
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
              value={cityFilter}
              onChange={(event) => setCityFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select City</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
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

            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search Outlet"
                className={`h-12 w-full rounded-md border pl-11 pr-4 text-[15px] outline-none ${inputClass}`}
              />
            </div>
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
                setSelectedOutlet(null);
              }}
              className="flex h-12 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)]"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus size={18} />
              Add Outlet
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
              <p className={`mt-3 text-[14px] ${mutedClass}`}>
                Loading outlets...
              </p>
            </div>
          </div>
        ) : filteredOutlets.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Store size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No outlets found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add a new outlet or change filters.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr className="border-b border-[#EBE9F1]">
                  <th className="px-6 py-4 text-left">
                    <input type="checkbox" className="h-5 w-5 rounded accent-[#7367F0]" />
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Outlet
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Location
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Manager
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
                {filteredOutlets.map((outlet) => (
                  <tr
                    key={outlet.id}
                    className="border-b border-[#EBE9F1] transition hover:bg-[#F8F7FA]"
                  >
                    <td className="px-6 py-4">
                      <input type="checkbox" className="h-5 w-5 rounded accent-[#7367F0]" />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <OutletAvatar outlet={outlet} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-[#2F2B3D]">
                            {outlet.outlet_name || "-"}
                          </p>
                          <p className="truncate text-[13px] text-[#6F6B7D]">
                            {outlet.outlet_code || "-"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-[14px] text-[#6F6B7D]">
                        <p>{outlet.city || "-"}</p>
                        <p className="text-[12px] text-[#A8AAAE]">
                          {outlet.state || ""} {outlet.pincode || ""}
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-[14px] text-[#6F6B7D]">
                        <p>{outlet.manager_name || "-"}</p>
                        <p className="text-[12px] text-[#A8AAAE]">
                          Opened: {formatDate(outlet.opening_date)}
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-[14px] text-[#6F6B7D]">
                        <p>{outlet.phone || "-"}</p>
                        <p className="text-[12px] text-[#A8AAAE]">
                          {outlet.email || "-"}
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <StatusBadge active={outlet.is_active} />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 text-[#6F6B7D]">
                        <button
                          type="button"
                          onClick={() => handleDelete(outlet.id)}
                          disabled={deletingId === outlet.id}
                          className="transition hover:text-[#EA5455] disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === outlet.id ? (
                            <Loader2 size={20} className="animate-spin" />
                          ) : (
                            <Trash2 size={20} />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleView(outlet)}
                          className="transition hover:text-[#7367F0]"
                          title="View Details"
                        >
                          <Eye size={20} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEdit(outlet)}
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
        )}
      </div>
    </div>
  );
};

export default Outlets;
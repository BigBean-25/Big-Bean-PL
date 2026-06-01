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
  Package,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  CreditCard,
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
  supplier_code: "",
  supplier_name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  gstin: "",
  pan: "",
  payment_terms: "",
  is_active: 1,
});

const getRows = (response) => {
  const data = response?.data?.data || response?.data || [];
  return Array.isArray(data) ? data : [];
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
  const parts = String(name || "Supplier")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]).join("").toUpperCase() || "S";
};

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gstFilter, setGstFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);

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
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);

    try {
      const response = await masterAPI.getSuppliers();
      setSuppliers(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch suppliers");
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

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
    setSelectedSupplier(null);
  };

  const handleEdit = (supplier) => {
    setEditingId(supplier.id);
    setFormData({
      supplier_code: supplier.supplier_code || "",
      supplier_name: supplier.supplier_name || "",
      contact_person: supplier.contact_person || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      city: supplier.city || "",
      state: supplier.state || "",
      gstin: supplier.gstin || "",
      pan: supplier.pan || "",
      payment_terms: supplier.payment_terms || "",
      is_active: Number(supplier.is_active) === 1 ? 1 : 0,
    });
    setShowForm(true);
    setSelectedSupplier(null);
  };

  const handleView = (supplier) => {
    setSelectedSupplier(supplier);
    setActiveTab("overview");
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this supplier?")) return;

    setDeletingId(id);

    try {
      await masterAPI.deleteSupplier(id);
      toast.success("Supplier deleted successfully");

      if (selectedSupplier?.id === id) {
        setSelectedSupplier(null);
      }

      await fetchSuppliers();
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.supplier_code.trim()) {
      toast.error("Please enter supplier code");
      return;
    }

    if (!formData.supplier_name.trim()) {
      toast.error("Please enter supplier name");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        supplier_code: formData.supplier_code.trim(),
        supplier_name: formData.supplier_name.trim(),
        contact_person: formData.contact_person || "",
        phone: formData.phone || "",
        email: formData.email || "",
        address: formData.address || "",
        city: formData.city || "",
        state: formData.state || "",
        gstin: formData.gstin || "",
        pan: formData.pan || "",
        payment_terms: formData.payment_terms || "",
        is_active: Number(formData.is_active),
      };

      if (editingId) {
        await masterAPI.updateSupplier(editingId, payload);
        toast.success("Supplier updated successfully");
      } else {
        await masterAPI.createSupplier(payload);
        toast.success("Supplier created successfully");
      }

      closeForm();
      await fetchSuppliers();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const cityOptions = useMemo(() => {
    return Array.from(
      new Set(suppliers.map((supplier) => supplier.city).filter(Boolean))
    );
  }, [suppliers]);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => {
      const text = `${supplier.supplier_code || ""} ${
        supplier.supplier_name || ""
      } ${supplier.contact_person || ""} ${supplier.phone || ""} ${
        supplier.email || ""
      } ${supplier.city || ""} ${supplier.state || ""} ${supplier.gstin || ""} ${
        supplier.pan || ""
      }`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const cityMatch =
        cityFilter === "all" ||
        String(supplier.city || "").toLowerCase() ===
          String(cityFilter).toLowerCase();

      const activeStatus =
        Number(supplier.is_active) === 1 ? "active" : "inactive";
      const statusMatch = statusFilter === "all" || activeStatus === statusFilter;

      const hasGstin = Boolean(String(supplier.gstin || "").trim());
      const gstMatch =
        gstFilter === "all" ||
        (gstFilter === "with-gst" && hasGstin) ||
        (gstFilter === "without-gst" && !hasGstin);

      return searchMatch && cityMatch && statusMatch && gstMatch;
    });
  }, [suppliers, searchTerm, cityFilter, statusFilter, gstFilter]);

  const visibleSuppliers = useMemo(() => {
    return filteredSuppliers.slice(0, Number(pageSize));
  }, [filteredSuppliers, pageSize]);

  const summary = useMemo(() => {
    const active = suppliers.filter(
      (supplier) => Number(supplier.is_active) === 1
    ).length;

    const inactive = suppliers.filter(
      (supplier) => Number(supplier.is_active) !== 1
    ).length;

    const withGstin = suppliers.filter((supplier) =>
      Boolean(String(supplier.gstin || "").trim())
    ).length;

    const cities = new Set(
      suppliers.map((supplier) => supplier.city).filter(Boolean)
    ).size;

    return {
      total: suppliers.length,
      active,
      inactive,
      withGstin,
      cities,
    };
  }, [suppliers]);

  const handleExport = () => {
    const headers = [
      "Supplier Code",
      "Supplier Name",
      "Contact Person",
      "Phone",
      "Email",
      "Address",
      "City",
      "State",
      "GSTIN",
      "PAN",
      "Payment Terms",
      "Status",
      "Created At",
      "Updated At",
    ];

    const rows = filteredSuppliers.map((supplier) => [
      supplier.supplier_code || "",
      supplier.supplier_name || "",
      supplier.contact_person || "",
      supplier.phone || "",
      supplier.email || "",
      supplier.address || "",
      supplier.city || "",
      supplier.state || "",
      supplier.gstin || "",
      supplier.pan || "",
      supplier.payment_terms || "",
      Number(supplier.is_active) === 1 ? "Active" : "Inactive",
      formatDate(supplier.created_at),
      formatDate(supplier.updated_at),
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
    link.download = "bigbean-suppliers.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Suppliers exported");
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

  const SupplierAvatar = ({ supplier, size = "md" }) => {
    const sizes = {
      sm: "h-10 w-10 text-[14px]",
      md: "h-12 w-12 text-[16px]",
      lg: "h-[150px] w-[150px] text-[42px]",
    };

    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-md font-semibold text-white ${sizes[size]}`}
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, #9E95F5)`,
        }}
      >
        {getInitials(supplier?.supplier_name)}
      </div>
    );
  };

  const GstBadge = ({ gstin }) => {
    const hasGstin = Boolean(String(gstin || "").trim());

    return (
      <span
        className={`inline-flex rounded px-3 py-1 text-[12px] font-semibold ${
          hasGstin ? "bg-[#E9F9EF] text-[#28C76F]" : "bg-[#FFF4E5] text-[#FF9F43]"
        }`}
      >
        {hasGstin ? "GST Available" : "No GST"}
      </span>
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
      <span className={`min-w-[135px] text-[14px] font-semibold ${mainTextClass}`}>
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
            Suppliers Management
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Manage supplier information, tax details, contact person and payment terms.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={fetchSuppliers}
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
            onClick={openCreateForm}
            className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)]"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus size={18} />
            Add Supplier
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total Suppliers"
          value={summary.total}
          subtitle="All supplier masters"
          icon={Package}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />

        <StatCard
          title="Active"
          value={summary.active}
          subtitle="Currently usable"
          icon={CheckCircle2}
          color="#28C76F"
          bg="#E9F9EF"
        />

        <StatCard
          title="Inactive"
          value={summary.inactive}
          subtitle="Disabled suppliers"
          icon={AlertCircle}
          color="#EA5455"
          bg="#FCEAEA"
        />

        <StatCard
          title="GST Suppliers"
          value={summary.withGstin}
          subtitle="GSTIN available"
          icon={CreditCard}
          color="#FF9F43"
          bg="#FFF4E5"
        />

        <StatCard
          title="Cities"
          value={summary.cities}
          subtitle="Supplier locations"
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
                {editingId ? "Edit Supplier" : "New Supplier"}
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add supplier identity, contact, tax and payment term details.
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Supplier Code *
                </label>
                <input
                  type="text"
                  value={formData.supplier_code}
                  onChange={(event) =>
                    setFormData({ ...formData, supplier_code: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder="Example: SUP-001"
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Supplier Name *
                </label>
                <input
                  type="text"
                  value={formData.supplier_name}
                  onChange={(event) =>
                    setFormData({ ...formData, supplier_name: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder="Example: ABC Foods"
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Contact Person
                </label>
                <input
                  type="text"
                  value={formData.contact_person}
                  onChange={(event) =>
                    setFormData({ ...formData, contact_person: event.target.value })
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
                  GSTIN
                </label>
                <input
                  type="text"
                  value={formData.gstin}
                  onChange={(event) =>
                    setFormData({ ...formData, gstin: event.target.value.toUpperCase() })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] uppercase outline-none ${inputClass}`}
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  PAN
                </label>
                <input
                  type="text"
                  value={formData.pan}
                  onChange={(event) =>
                    setFormData({ ...formData, pan: event.target.value.toUpperCase() })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] uppercase outline-none ${inputClass}`}
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Payment Terms
                </label>
                <input
                  type="text"
                  value={formData.payment_terms}
                  onChange={(event) =>
                    setFormData({ ...formData, payment_terms: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder="Example: 15 Days"
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

              <div className="md:col-span-2 xl:col-span-4">
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Address
                </label>
                <textarea
                  value={formData.address}
                  onChange={(event) =>
                    setFormData({ ...formData, address: event.target.value })
                  }
                  className={`min-h-[90px] w-full rounded-md border px-4 py-3 text-[14px] outline-none ${inputClass}`}
                  placeholder="Full supplier address..."
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
                    <Package size={18} />
                    {editingId ? "Update Supplier" : "Create Supplier"}
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

      {selectedSupplier && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
          <div
            className={`rounded-md border p-8 text-center shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
          >
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedSupplier(null)}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-2 flex justify-center">
              <SupplierAvatar supplier={selectedSupplier} size="lg" />
            </div>

            <h2 className={`mt-6 text-[24px] font-semibold ${mainTextClass}`}>
              {selectedSupplier.supplier_name || "-"}
            </h2>

            <div className="mt-3 flex justify-center">
              <GstBadge gstin={selectedSupplier.gstin} />
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
                    <User size={22} />
                  </div>
                  <div>
                    <p className="text-[20px] font-semibold text-[#2F2B3D]">
                      {selectedSupplier.contact_person || "-"}
                    </p>
                    <p className="text-[13px] text-[#6F6B7D]">Contact</p>
                  </div>
                </div>
              </div>

              <div className="rounded-md bg-[#F8F7FA] p-4 text-left">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E9F9EF] text-[#28C76F]">
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <p className="text-[20px] font-semibold text-[#2F2B3D]">
                      {Number(selectedSupplier.is_active) === 1 ? "On" : "Off"}
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
                <DetailItem label="Supplier ID:" value={selectedSupplier.id} />
                <DetailItem label="Code:" value={selectedSupplier.supplier_code} />
                <DetailItem label="Name:" value={selectedSupplier.supplier_name} />
                <DetailItem label="Contact:" value={selectedSupplier.contact_person} />
                <DetailItem label="Phone:" value={selectedSupplier.phone} />
                <DetailItem label="City:" value={selectedSupplier.city} />
                <DetailItem
                  label="Status:"
                  value={Number(selectedSupplier.is_active) === 1 ? "Active" : "Inactive"}
                />
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => handleEdit(selectedSupplier)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Edit2 size={17} />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(selectedSupplier.id)}
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
                { key: "overview", label: "Overview", icon: Package },
                { key: "contact", label: "Contact", icon: Phone },
                { key: "tax", label: "Tax Details", icon: CreditCard },
                { key: "activity", label: "Activity", icon: FileText },
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
                    Supplier Overview
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Supplier identity and procurement reference details.
                  </p>

                  <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <DetailItem label="Supplier Code:" value={selectedSupplier.supplier_code} />
                      <DetailItem label="Supplier Name:" value={selectedSupplier.supplier_name} />
                      <DetailItem label="Payment Terms:" value={selectedSupplier.payment_terms} />
                    </div>

                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <DetailItem
                        label="Status:"
                        value={Number(selectedSupplier.is_active) === 1 ? "Active" : "Inactive"}
                      />
                      <DetailItem label="City:" value={selectedSupplier.city} />
                      <DetailItem label="State:" value={selectedSupplier.state} />
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
                    Supplier contact person, phone, email and address.
                  </p>

                  <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <DetailItem label="Contact Person:" value={selectedSupplier.contact_person} />
                      <DetailItem label="Phone:" value={selectedSupplier.phone} />
                      <DetailItem label="Email:" value={selectedSupplier.email} />
                    </div>

                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <DetailItem label="Address:" value={selectedSupplier.address} />
                      <DetailItem label="City:" value={selectedSupplier.city} />
                      <DetailItem label="State:" value={selectedSupplier.state} />
                    </div>
                  </div>
                </>
              )}

              {activeTab === "tax" && (
                <>
                  <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                    Tax Details
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    GST, PAN and purchase billing reference.
                  </p>

                  <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <DetailItem label="GSTIN:" value={selectedSupplier.gstin} />
                      <DetailItem label="PAN:" value={selectedSupplier.pan} />
                      <DetailItem
                        label="GST Status:"
                        value={selectedSupplier.gstin ? "GST Registered" : "Not Added"}
                      />
                    </div>

                    <div className="rounded-md bg-[#F8F7FA] p-5">
                      <p className="text-[13px] text-[#6F6B7D]">Quick Note</p>
                      <p className="mt-2 text-[15px] font-medium text-[#2F2B3D]">
                        Supplier GSTIN and PAN will help in purchase upload,
                        GST reporting, vendor ledger and payment reconciliation.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {activeTab === "activity" && (
                <>
                  <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                    Activity
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Supplier creation and update details.
                  </p>

                  <div className="mt-6 rounded-md border border-[#EBE9F1] p-5">
                    <DetailItem label="Created At:" value={formatDate(selectedSupplier.created_at)} />
                    <DetailItem label="Updated At:" value={formatDate(selectedSupplier.updated_at)} />
                    <DetailItem label="Created By:" value={selectedSupplier.created_by || "-"} />
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

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
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
              value={gstFilter}
              onChange={(event) => setGstFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">GST Filter</option>
              <option value="with-gst">With GSTIN</option>
              <option value="without-gst">Without GSTIN</option>
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
                placeholder="Search Supplier"
                className={`h-12 w-full rounded-md border pl-11 pr-4 text-[15px] outline-none ${inputClass}`}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 border-b border-[#EBE9F1] p-6 md:flex-row md:items-center">
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className={`h-12 w-[95px] rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
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
              onClick={openCreateForm}
              className="flex h-12 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)]"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus size={18} />
              Add Supplier
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
                Loading suppliers...
              </p>
            </div>
          </div>
        ) : visibleSuppliers.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Package size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No suppliers found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add a new supplier or change filters.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] border-collapse">
              <thead>
                <tr className="border-b border-[#EBE9F1]">
                  <th className="px-6 py-4 text-left">
                    <input type="checkbox" className="h-5 w-5 rounded accent-[#7367F0]" />
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Supplier
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Contact Person
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Contact
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Location
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    GST
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
                {visibleSuppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="border-b border-[#EBE9F1] transition hover:bg-[#F8F7FA]"
                  >
                    <td className="px-6 py-4">
                      <input type="checkbox" className="h-5 w-5 rounded accent-[#7367F0]" />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <SupplierAvatar supplier={supplier} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-[#2F2B3D]">
                            {supplier.supplier_name || "-"}
                          </p>
                          <p className="truncate text-[13px] text-[#6F6B7D]">
                            {supplier.supplier_code || "-"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                      {supplier.contact_person || "-"}
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-[14px] text-[#6F6B7D]">
                        <p>{supplier.phone || "-"}</p>
                        <p className="text-[12px] text-[#A8AAAE]">
                          {supplier.email || "-"}
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-[14px] text-[#6F6B7D]">
                        <p>{supplier.city || "-"}</p>
                        <p className="text-[12px] text-[#A8AAAE]">
                          {supplier.state || "-"}
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <GstBadge gstin={supplier.gstin} />
                    </td>

                    <td className="px-6 py-4">
                      <StatusBadge active={supplier.is_active} />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 text-[#6F6B7D]">
                        <button
                          type="button"
                          onClick={() => handleDelete(supplier.id)}
                          disabled={deletingId === supplier.id}
                          className="transition hover:text-[#EA5455] disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === supplier.id ? (
                            <Loader2 size={20} className="animate-spin" />
                          ) : (
                            <Trash2 size={20} />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleView(supplier)}
                          className="transition hover:text-[#7367F0]"
                          title="View Details"
                        >
                          <Eye size={20} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEdit(supplier)}
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

            {filteredSuppliers.length > pageSize && (
              <div className="border-t border-[#EBE9F1] px-6 py-4 text-[14px] text-[#6F6B7D]">
                Showing first {pageSize} of {filteredSuppliers.length} suppliers.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Suppliers;
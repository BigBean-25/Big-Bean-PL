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
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
  Coffee,
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
  material_code: "",
  material_name: "",
  category_id: "",
  default_unit_id: "",
  reorder_level: "",
  description: "",
  is_active: 1,
});

const getRows = (response) => {
  const data = response?.data?.data || response?.data || [];
  return Array.isArray(data) ? data : [];
};

const formatNumber = (value = 0) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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
  const parts = String(name || "Raw Material")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]).join("").toUpperCase() || "R";
};

const RawMaterials = () => {
  const [materials, setMaterials] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
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
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);

    try {
      await Promise.all([fetchMaterials(), fetchCategories(), fetchUnits()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMaterials = async () => {
    try {
      const response = await masterAPI.getRawMaterials();
      setMaterials(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch raw materials");
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await masterAPI.getCategories();
      const rows = getRows(response);

      setCategories(
        rows.filter(
          (category) =>
            category.category_type === "Raw Material" ||
            category.category_type === "Both"
        )
      );
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch categories");
    }
  };

  const fetchUnits = async () => {
    try {
      if (!masterAPI.getUnits) {
        setUnits([]);
        return;
      }

      const response = await masterAPI.getUnits();
      setUnits(getRows(response));
    } catch (error) {
      setUnits([]);
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
    setSelectedMaterial(null);
  };

  const getCategoryById = (id) => {
    return categories.find((category) => Number(category.id) === Number(id));
  };

  const getUnitById = (id) => {
    return units.find((unit) => Number(unit.id) === Number(id));
  };

  const getMaterialCategory = (material) => {
    if (material?.category_name) return material.category_name;

    const category = getCategoryById(material?.category_id);
    return category?.category_name || "-";
  };

  const getMaterialUnit = (material) => {
    if (material?.unit_name) return material.unit_name;

    const unit = getUnitById(material?.default_unit_id);
    return unit?.unit_name || "-";
  };

  const relatedMaterials = useMemo(() => {
    if (!selectedMaterial?.category_id) return [];

    return materials
      .filter(
        (material) =>
          Number(material.category_id) === Number(selectedMaterial.category_id) &&
          Number(material.id) !== Number(selectedMaterial.id)
      )
      .slice(0, 8);
  }, [materials, selectedMaterial]);

  const filteredMaterials = useMemo(() => {
    return materials.filter((material) => {
      const categoryName = getMaterialCategory(material);
      const unitName = getMaterialUnit(material);

      const text = `${material.material_code || ""} ${
        material.material_name || ""
      } ${categoryName || ""} ${unitName || ""} ${
        material.description || ""
      }`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const categoryMatch =
        categoryFilter === "all" ||
        String(material.category_id) === String(categoryFilter);

      const unitMatch =
        unitFilter === "all" ||
        String(material.default_unit_id) === String(unitFilter);

      const activeStatus = Number(material.is_active) === 1 ? "active" : "inactive";
      const statusMatch = statusFilter === "all" || activeStatus === statusFilter;

      const reorderLevel = Number(material.reorder_level || 0);
      const stockMatch =
        stockFilter === "all" ||
        (stockFilter === "with-reorder" && reorderLevel > 0) ||
        (stockFilter === "without-reorder" && reorderLevel <= 0);

      return searchMatch && categoryMatch && unitMatch && statusMatch && stockMatch;
    });
  }, [
    materials,
    categories,
    units,
    searchTerm,
    categoryFilter,
    unitFilter,
    statusFilter,
    stockFilter,
  ]);

  const visibleMaterials = useMemo(() => {
    return filteredMaterials.slice(0, Number(pageSize));
  }, [filteredMaterials, pageSize]);

  const summary = useMemo(() => {
    const active = materials.filter(
      (material) => Number(material.is_active) === 1
    ).length;

    const inactive = materials.filter(
      (material) => Number(material.is_active) !== 1
    ).length;

    const withReorder = materials.filter(
      (material) => Number(material.reorder_level || 0) > 0
    ).length;

    const mappedCategories = new Set(
      materials.map((material) => material.category_id).filter(Boolean)
    ).size;

    return {
      total: materials.length,
      active,
      inactive,
      withReorder,
      mappedCategories,
    };
  }, [materials]);

  const handleEdit = (material) => {
    setEditingId(material.id);
    setFormData({
      material_code: material.material_code || "",
      material_name: material.material_name || "",
      category_id: material.category_id || "",
      default_unit_id: material.default_unit_id || "",
      reorder_level: material.reorder_level || "",
      description: material.description || "",
      is_active: Number(material.is_active) === 1 ? 1 : 0,
    });
    setShowForm(true);
    setSelectedMaterial(null);
  };

  const handleView = (material) => {
    setSelectedMaterial(material);
    setActiveTab("overview");
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this raw material?")) return;

    setDeletingId(id);

    try {
      await masterAPI.deleteRawMaterial(id);
      toast.success("Raw material deleted successfully");

      if (selectedMaterial?.id === id) {
        setSelectedMaterial(null);
      }

      await fetchMaterials();
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.material_code.trim()) {
      toast.error("Please enter material code");
      return;
    }

    if (!formData.material_name.trim()) {
      toast.error("Please enter material name");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        material_code: formData.material_code.trim(),
        material_name: formData.material_name.trim(),
        category_id: formData.category_id || null,
        default_unit_id: formData.default_unit_id || null,
        reorder_level: formData.reorder_level ? Number(formData.reorder_level) : 0,
        description: formData.description || "",
        is_active: Number(formData.is_active),
      };

      if (editingId) {
        await masterAPI.updateRawMaterial(editingId, payload);
        toast.success("Raw material updated successfully");
      } else {
        await masterAPI.createRawMaterial(payload);
        toast.success("Raw material created successfully");
      }

      closeForm();
      await fetchMaterials();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const headers = [
      "Material Code",
      "Material Name",
      "Category",
      "Default Unit",
      "Reorder Level",
      "Status",
      "Description",
      "Created At",
      "Updated At",
    ];

    const rows = filteredMaterials.map((material) => [
      material.material_code || "",
      material.material_name || "",
      getMaterialCategory(material),
      getMaterialUnit(material),
      material.reorder_level || 0,
      Number(material.is_active) === 1 ? "Active" : "Inactive",
      material.description || "",
      formatDate(material.created_at),
      formatDate(material.updated_at),
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
    link.download = "bigbean-raw-materials.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Raw materials exported");
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

  const MaterialAvatar = ({ material, size = "md" }) => {
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
        {getInitials(material?.material_name)}
      </div>
    );
  };

  const CategoryBadge = ({ material }) => (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold"
      style={{
        color: primaryColor,
        backgroundColor: `${primaryColor}18`,
      }}
    >
      <Package size={14} />
      {getMaterialCategory(material)}
    </span>
  );

  const UnitBadge = ({ material }) => (
    <span className="inline-flex items-center gap-2 rounded-full bg-[#F8F7FA] px-3 py-1 text-[12px] font-semibold text-[#6F6B7D]">
      <Coffee size={14} />
      {getMaterialUnit(material)}
    </span>
  );

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
            Raw Materials Management
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Manage café raw materials, category mapping, units and reorder levels.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={fetchInitialData}
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
            Add Raw Material
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total Materials"
          value={summary.total}
          subtitle="All raw material masters"
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
          subtitle="Disabled materials"
          icon={AlertCircle}
          color="#EA5455"
          bg="#FCEAEA"
        />

        <StatCard
          title="With Reorder"
          value={summary.withReorder}
          subtitle="Reorder level configured"
          icon={FileText}
          color="#FF9F43"
          bg="#FFF4E5"
        />

        <StatCard
          title="Categories"
          value={summary.mappedCategories}
          subtitle="Mapped raw groups"
          icon={Coffee}
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
                {editingId ? "Edit Raw Material" : "New Raw Material"}
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add material code, unit, category and reorder control.
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
                  Material Code *
                </label>
                <input
                  type="text"
                  value={formData.material_code}
                  onChange={(event) =>
                    setFormData({ ...formData, material_code: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder="Example: RM-MILK-001"
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Material Name *
                </label>
                <input
                  type="text"
                  value={formData.material_name}
                  onChange={(event) =>
                    setFormData({ ...formData, material_name: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder="Example: Milk"
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Category
                </label>
                <select
                  value={formData.category_id}
                  onChange={(event) =>
                    setFormData({ ...formData, category_id: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                >
                  <option value="">Select Category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.category_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Default Unit
                </label>
                <select
                  value={formData.default_unit_id}
                  onChange={(event) =>
                    setFormData({ ...formData, default_unit_id: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                >
                  <option value="">Select Unit</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.unit_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Reorder Level
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.reorder_level}
                  onChange={(event) =>
                    setFormData({ ...formData, reorder_level: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder="0.00"
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
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(event) =>
                    setFormData({ ...formData, description: event.target.value })
                  }
                  className={`min-h-[90px] w-full rounded-md border px-4 py-3 text-[14px] outline-none ${inputClass}`}
                  placeholder="Material usage, storage instruction, purchase note..."
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
                    {editingId ? "Update Material" : "Create Material"}
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

      {selectedMaterial && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
          <div
            className={`rounded-md border p-8 text-center shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
          >
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMaterial(null)}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-2 flex justify-center">
              <MaterialAvatar material={selectedMaterial} size="lg" />
            </div>

            <h2 className={`mt-6 text-[24px] font-semibold ${mainTextClass}`}>
              {selectedMaterial.material_name || "-"}
            </h2>

            <div className="mt-3 flex justify-center">
              <CategoryBadge material={selectedMaterial} />
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
                    <Coffee size={22} />
                  </div>
                  <div>
                    <p className="text-[20px] font-semibold text-[#2F2B3D]">
                      {getMaterialUnit(selectedMaterial)}
                    </p>
                    <p className="text-[13px] text-[#6F6B7D]">Default Unit</p>
                  </div>
                </div>
              </div>

              <div className="rounded-md bg-[#F8F7FA] p-4 text-left">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#FFF4E5] text-[#FF9F43]">
                    <FileText size={22} />
                  </div>
                  <div>
                    <p className="text-[20px] font-semibold text-[#2F2B3D]">
                      {formatNumber(selectedMaterial.reorder_level)}
                    </p>
                    <p className="text-[13px] text-[#6F6B7D]">Reorder Level</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 text-left">
              <h3 className={`mb-4 text-[20px] font-semibold ${mainTextClass}`}>
                Details
              </h3>

              <div className="border-t border-[#DBDADE] pt-4">
                <DetailItem label="Material ID:" value={selectedMaterial.id} />
                <DetailItem label="Code:" value={selectedMaterial.material_code} />
                <DetailItem label="Name:" value={selectedMaterial.material_name} />
                <DetailItem label="Category:" value={getMaterialCategory(selectedMaterial)} />
                <DetailItem label="Default Unit:" value={getMaterialUnit(selectedMaterial)} />
                <DetailItem
                  label="Reorder Level:"
                  value={formatNumber(selectedMaterial.reorder_level)}
                />
                <DetailItem
                  label="Status:"
                  value={Number(selectedMaterial.is_active) === 1 ? "Active" : "Inactive"}
                />
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => handleEdit(selectedMaterial)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Edit2 size={17} />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(selectedMaterial.id)}
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
                { key: "stock", label: "Stock Control", icon: FileText },
                { key: "category", label: "Category", icon: Coffee },
                { key: "activity", label: "Activity", icon: CheckCircle2 },
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
                    Raw Material Overview
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Material identity, category and default unit information.
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
                          <Package size={22} />
                        </div>
                        <div>
                          <p className="text-[13px] text-[#6F6B7D]">Material Code</p>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            {selectedMaterial.material_code || "-"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E9F9EF] text-[#28C76F]">
                          <CheckCircle2 size={22} />
                        </div>
                        <div>
                          <p className="text-[13px] text-[#6F6B7D]">Status</p>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            {Number(selectedMaterial.is_active) === 1
                              ? "Active"
                              : "Inactive"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-[#EBE9F1] p-5 md:col-span-2">
                      <p className="text-[13px] text-[#6F6B7D]">Description</p>
                      <p className="mt-2 text-[15px] font-medium text-[#2F2B3D]">
                        {selectedMaterial.description || "No description added."}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {activeTab === "stock" && (
                <>
                  <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                    Stock Control
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Default unit and reorder level control for stock alerts.
                  </p>

                  <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <DetailItem label="Default Unit:" value={getMaterialUnit(selectedMaterial)} />
                      <DetailItem
                        label="Reorder Level:"
                        value={formatNumber(selectedMaterial.reorder_level)}
                      />
                      <DetailItem
                        label="Stock Alert:"
                        value={
                          Number(selectedMaterial.reorder_level || 0) > 0
                            ? "Enabled"
                            : "Not Configured"
                        }
                      />
                    </div>

                    <div className="rounded-md bg-[#F8F7FA] p-5">
                      <p className="text-[13px] text-[#6F6B7D]">Quick Note</p>
                      <p className="mt-2 text-[15px] font-medium text-[#2F2B3D]">
                        Reorder level is used to trigger low-stock alerts during stock
                        upload, closing stock and consumption reports.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {activeTab === "category" && (
                <>
                  <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                    Category Mapping
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Raw material category and related materials.
                  </p>

                  <div className="mt-6 rounded-md border border-[#EBE9F1] p-5">
                    <DetailItem label="Category:" value={getMaterialCategory(selectedMaterial)} />
                    <DetailItem
                      label="Category ID:"
                      value={selectedMaterial.category_id || "-"}
                    />
                    <DetailItem
                      label="Category Type:"
                      value={getCategoryById(selectedMaterial.category_id)?.category_type || "-"}
                    />
                  </div>

                  <div className="mt-6">
                    <h4 className={`text-[18px] font-semibold ${mainTextClass}`}>
                      Related Materials
                    </h4>

                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[650px] border-collapse">
                        <thead>
                          <tr className="border-b border-[#EBE9F1]">
                            <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                              Material
                            </th>
                            <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                              Unit
                            </th>
                            <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                              Status
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {relatedMaterials.length === 0 ? (
                            <tr>
                              <td
                                colSpan="3"
                                className="px-4 py-8 text-center text-[14px] text-[#6F6B7D]"
                              >
                                No related raw materials found in this category.
                              </td>
                            </tr>
                          ) : (
                            relatedMaterials.map((material) => (
                              <tr
                                key={material.id}
                                className="border-b border-[#EBE9F1]"
                              >
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-3">
                                    <MaterialAvatar material={material} size="sm" />
                                    <div>
                                      <p className="text-[14px] font-semibold text-[#2F2B3D]">
                                        {material.material_name}
                                      </p>
                                      <p className="text-[12px] text-[#A8AAAE]">
                                        {material.material_code}
                                      </p>
                                    </div>
                                  </div>
                                </td>

                                <td className="px-4 py-4 text-[14px] text-[#6F6B7D]">
                                  {getMaterialUnit(material)}
                                </td>

                                <td className="px-4 py-4">
                                  <StatusBadge active={material.is_active} />
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
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
                    Material creation and update details.
                  </p>

                  <div className="mt-6 rounded-md border border-[#EBE9F1] p-5">
                    <DetailItem
                      label="Created At:"
                      value={formatDate(selectedMaterial.created_at)}
                    />
                    <DetailItem
                      label="Updated At:"
                      value={formatDate(selectedMaterial.updated_at)}
                    />
                    <DetailItem
                      label="Created By:"
                      value={selectedMaterial.created_by || "-"}
                    />
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

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-5">
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.category_name}
                </option>
              ))}
            </select>

            <select
              value={unitFilter}
              onChange={(event) => setUnitFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Unit</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.unit_name}
                </option>
              ))}
            </select>

            <select
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Stock Alert Filter</option>
              <option value="with-reorder">With Reorder Level</option>
              <option value="without-reorder">Without Reorder Level</option>
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
                placeholder="Search Raw Material"
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
              Add Raw Material
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
                Loading raw materials...
              </p>
            </div>
          </div>
        ) : visibleMaterials.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Package size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No raw materials found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add a new raw material or change filters.
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
                    Raw Material
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Category
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Default Unit
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Reorder Level
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
                {visibleMaterials.map((material) => (
                  <tr
                    key={material.id}
                    className="border-b border-[#EBE9F1] transition hover:bg-[#F8F7FA]"
                  >
                    <td className="px-6 py-4">
                      <input type="checkbox" className="h-5 w-5 rounded accent-[#7367F0]" />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <MaterialAvatar material={material} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-[#2F2B3D]">
                            {material.material_name || "-"}
                          </p>
                          <p className="truncate text-[13px] text-[#6F6B7D]">
                            {material.material_code || "-"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <CategoryBadge material={material} />
                    </td>

                    <td className="px-6 py-4">
                      <UnitBadge material={material} />
                    </td>

                    <td className="px-6 py-4 text-[14px] font-semibold text-[#2F2B3D]">
                      {formatNumber(material.reorder_level)}
                    </td>

                    <td className="px-6 py-4">
                      <StatusBadge active={material.is_active} />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 text-[#6F6B7D]">
                        <button
                          type="button"
                          onClick={() => handleDelete(material.id)}
                          disabled={deletingId === material.id}
                          className="transition hover:text-[#EA5455] disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === material.id ? (
                            <Loader2 size={20} className="animate-spin" />
                          ) : (
                            <Trash2 size={20} />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleView(material)}
                          className="transition hover:text-[#7367F0]"
                          title="View Details"
                        >
                          <Eye size={20} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEdit(material)}
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

            {filteredMaterials.length > pageSize && (
              <div className="border-t border-[#EBE9F1] px-6 py-4 text-[14px] text-[#6F6B7D]">
                Showing first {pageSize} of {filteredMaterials.length} raw materials.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RawMaterials;
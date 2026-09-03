import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useOutletContext } from "react-router-dom";
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
  Save,
  Upload,
} from "lucide-react";
import { masterAPI } from "../../services/api";
import { Pagination } from "../../components/ui";
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

const ITEM_TYPES = ["Raw Material", "Packaging", "Consumable", "Asset", "Other"];
const GST_RATES = ["0", "5", "12", "18", "28"];

const emptyForm = () => ({
  material_code: "",
  material_name: "",
  category_id: "",
  unit_id: "",
  reorder_level: "",
  description: "",
  item_type: "Raw Material",
  hsn_code: "",
  gst_rate: "",
  transfer_price: "",
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
  const [outlets, setOutlets] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const [formData, setFormData] = useState(emptyForm);
  const [originalUnitId, setOriginalUnitId] = useState("");
  const [uomChanged, setUomChanged] = useState(false);
  const [uomConfirmed, setUomConfirmed] = useState(false);

  const [rates, setRates] = useState([]);
  const [rateForm, setRateForm] = useState({ id: null, outlet_id: "", rate: "", effective_from: new Date().toISOString().split("T")[0], is_approved: 1 });
  const [showRateForm, setShowRateForm] = useState(false);
  const [rateLoading, setRateLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, pages: 1 });

  const outletContext = useOutletContext() || {};
  const { selectedOutletId = "all", isOutletLocked = false } = outletContext;

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
      await Promise.all([fetchMaterials(1, pageSize), fetchCategories(), fetchUnits(), fetchOutlets()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMaterials = async (pageArg = page, limitArg = pageSize) => {
    try {
      const response = await masterAPI.getRawMaterials({ page: pageArg, limit: limitArg });
      setMaterials(getRows(response));
      const responsePagination = response?.data?.pagination;
      if (responsePagination) setPagination(responsePagination);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch raw materials");
    }
  };

  // fetchInitialData already fetches page 1 on mount - this effect only
  // needs to react to later page/page-size changes, so its first run (which
  // fires immediately on mount alongside fetchInitialData) is skipped.
  const isFirstPageEffect = useRef(true);
  useEffect(() => {
    if (isFirstPageEffect.current) {
      isFirstPageEffect.current = false;
      return;
    }
    (async () => {
      setLoading(true);
      try {
        await fetchMaterials(page, pageSize);
      } finally {
        setLoading(false);
      }
    })();
  }, [page, pageSize]);

  const handleDownloadTemplate = async () => {
    try {
      const response = await masterAPI.downloadRawMaterialsTemplate();
      const url = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = "raw-materials-upload-template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download template");
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) {
      toast.error("Choose a file first");
      return;
    }
    setBulkUploading(true);
    setBulkResult(null);
    try {
      const formData = new FormData();
      formData.append("file", bulkFile);
      const response = await masterAPI.bulkUploadRawMaterials(formData);
      const result = response.data?.data;
      setBulkResult(result);
      if (result?.failed > 0) {
        toast.error(`${result.failed} row(s) failed`);
      } else {
        toast.success(`${result.created} created, ${result.updated} updated`);
      }
      await fetchMaterials();
    } catch (error) {
      toast.error(error.response?.data?.message || "Bulk upload failed");
    } finally {
      setBulkUploading(false);
    }
  };

  const closeBulkUpload = () => {
    setShowBulkUpload(false);
    setBulkFile(null);
    setBulkResult(null);
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

  const fetchOutlets = async () => {
    try {
      if (!masterAPI.getOutlets) {
        setOutlets([]);
        return;
      }
      const response = await masterAPI.getOutlets();
      setOutlets(getRows(response));
    } catch (error) {
      setOutlets([]);
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

    const unit = getUnitById(material?.unit_id);
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
      } ${material.hsn_code || ""} ${material.item_type || ""}`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const categoryMatch =
        categoryFilter === "all" ||
        String(material.category_id) === String(categoryFilter);

      const unitMatch =
        unitFilter === "all" ||
        String(material.unit_id) === String(unitFilter);

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

  // Materials are now fetched one page at a time (see fetchMaterials), so
  // these are necessarily scoped to the currently-loaded page rather than
  // the whole raw materials master - "Total Materials" uses the server's
  // pagination.total instead, since that count is accurate company-wide.
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
      total: pagination.total || materials.length,
      active,
      inactive,
      withReorder,
      mappedCategories,
    };
  }, [materials, pagination.total]);

  const handleEdit = (material) => {
    setEditingId(material.id);
    setOriginalUnitId(material.unit_id || "");
    setUomChanged(false);
    setUomConfirmed(false);
    setFormData({
      material_code: material.material_code || "",
      material_name: material.material_name || "",
      category_id: material.category_id || "",
      unit_id: material.unit_id || "",
      reorder_level: material.reorder_level || "",
      description: material.description || "",
      item_type: material.item_type || "Raw Material",
      hsn_code: material.hsn_code || "",
      gst_rate: material.gst_rate ?? "",
      transfer_price: material.transfer_price ?? "",
      is_active: Number(material.is_active) === 1 ? 1 : 0,
    });
    setShowForm(true);
    setSelectedMaterial(null);
  };

  const fetchRates = useCallback(async (materialId) => {
    if (!materialId) return;
    try {
      const params = { raw_material_id: materialId };
      if (selectedOutletId && selectedOutletId !== "all") {
        params.outlet_id = selectedOutletId;
      }
      const response = await masterAPI.getRawMaterialRates(params);
      setRates(getRows(response));
    } catch {
      setRates([]);
    }
  }, [selectedOutletId]);

  const openRateForm = (rate = null) => {
    const defaultOutlet = (selectedOutletId && selectedOutletId !== "all") ? String(selectedOutletId) : "";
    if (rate) {
      setRateForm({
        id: rate.id,
        outlet_id: isOutletLocked ? defaultOutlet : String(rate.outlet_id || ""),
        rate: rate.rate || "",
        effective_from: rate.effective_from ? new Date(rate.effective_from).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        is_approved: Number(rate.is_approved) === 1 ? 1 : 0,
      });
    } else {
      setRateForm({ id: null, outlet_id: defaultOutlet, rate: "", effective_from: new Date().toISOString().split("T")[0], is_approved: 1 });
    }
    setShowRateForm(true);
  };

  useEffect(() => {
    if (activeTab === "rates" && selectedMaterial?.id) {
      fetchRates(selectedMaterial.id);
    }
  }, [activeTab, selectedMaterial?.id, selectedOutletId]);

  const closeRateForm = () => setShowRateForm(false);

  const handleRateSubmit = async (event) => {
    event.preventDefault();
    if (!selectedMaterial) return;
    if (!rateForm.rate) { toast.error("Enter rate"); return; }
    if (!rateForm.effective_from) { toast.error("Enter effective from"); return; }
    setRateLoading(true);
    try {
      const payload = {
        raw_material_id: selectedMaterial.id,
        outlet_id: rateForm.outlet_id || null,
        rate: Number(rateForm.rate),
        effective_from: rateForm.effective_from,
        is_approved: Number(rateForm.is_approved),
      };
      if (rateForm.id) {
        await masterAPI.updateRawMaterialRate(rateForm.id, payload);
        toast.success("Rate updated");
      } else {
        await masterAPI.createRawMaterialRate(payload);
        toast.success("Rate created");
      }
      closeRateForm();
      await fetchRates(selectedMaterial.id);
    } catch (error) {
      toast.error(error.response?.data?.message || "Rate save failed");
    } finally {
      setRateLoading(false);
    }
  };

  const handleRateDelete = async (id) => {
    if (!window.confirm("Delete this rate?")) return;
    try {
      await masterAPI.deleteRawMaterialRate(id);
      toast.success("Rate deleted");
      await fetchRates(selectedMaterial.id);
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    }
  };

  const handleView = (material) => {
    setSelectedMaterial(material);
    setActiveTab("overview");
    setShowForm(false);
    setShowRateForm(false);
    fetchRates(material.id);
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

    if (!formData.material_name.trim()) {
      toast.error("Please enter material name");
      return;
    }

    if (!formData.category_id) {
      toast.error("Please select a category");
      return;
    }

    if (!formData.unit_id) {
      toast.error("Please select a unit");
      return;
    }

    if (formData.reorder_level !== "" && Number(formData.reorder_level) < 0) {
      toast.error("Reorder level cannot be negative");
      return;
    }

    if (formData.transfer_price !== "" && Number(formData.transfer_price) < 0) {
      toast.error("Warehouse transfer price cannot be negative");
      return;
    }

    if (editingId && uomChanged) {
      const originalUnit = getUnitById(originalUnitId);
      const newUnit = getUnitById(formData.unit_id);
      if (!formData.unit_id) {
        toast.error("Select a new base unit");
        return;
      }
      if (originalUnit && newUnit && originalUnit.unit_type !== newUnit.unit_type) {
        toast.error(`Incompatible unit type: ${originalUnit.unit_type} → ${newUnit.unit_type}`);
        return;
      }
      if (!uomConfirmed) {
        toast.error("Please confirm the Base UOM change");
        return;
      }
    }

    setSaving(true);

    try {
      const payload = {
        material_code: formData.material_code.trim(),
        material_name: formData.material_name.trim(),
        category_id: formData.category_id || null,
        unit_id: formData.unit_id || null,
        reorder_level: formData.reorder_level ? Number(formData.reorder_level) : 0,
        description: formData.description || "",
        item_type: formData.item_type || "Raw Material",
        hsn_code: formData.hsn_code.trim() || null,
        gst_rate: formData.gst_rate !== "" ? Number(formData.gst_rate) : null,
        transfer_price: formData.transfer_price !== "" ? Number(formData.transfer_price) : null,
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
      "Item Type",
      "HSN Code",
      "GST Rate",
      "Warehouse Transfer Price",
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
      material.item_type || "",
      material.hsn_code || "",
      material.gst_rate !== null && material.gst_rate !== undefined ? material.gst_rate : "",
      material.transfer_price !== null && material.transfer_price !== undefined ? material.transfer_price : "",
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
            onClick={() => setShowBulkUpload(true)}
            className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
          >
            <Upload size={18} />
            Bulk Upload
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
              aria-label="Close form"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Material Code
                </label>
                <input
                  type="text"
                  value={formData.material_code}
                  onChange={(event) =>
                    setFormData({ ...formData, material_code: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder={editingId ? "Example: RM-MILK-001" : "Leave blank to auto-generate (RM0001, RM0002, ...)"}
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
                  Category *
                </label>
                <select
                  value={formData.category_id}
                  onChange={(event) =>
                    setFormData({ ...formData, category_id: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
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
                  Base / Inventory UOM *
                </label>
                <select
                  value={formData.unit_id}
                  onChange={(event) => {
                    const newUnitId = event.target.value;
                    setFormData({ ...formData, unit_id: newUnitId });
                    if (editingId) {
                      setUomChanged(String(newUnitId) !== String(originalUnitId));
                      setUomConfirmed(false);
                    }
                  }}
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                >
                  <option value="">Select Unit</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.unit_name} ({unit.unit_type})
                    </option>
                  ))}
                </select>
                {editingId && uomChanged && (
                  <div className="mt-2 rounded-md border border-[#FF9F43] bg-[#FFF4E5] p-3 text-[13px] text-[#2F2B3D]">
                    <p className="font-medium text-[#FF9F43]">
                      Base UOM change will affect recipe conversions and costing.
                    </p>
                    <p className="mt-1">
                      Changing from {getUnitById(originalUnitId)?.unit_name || "-"} to {getUnitById(formData.unit_id)?.unit_name || "-"}.
                    </p>
                    <label className="mt-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={uomConfirmed}
                        onChange={(e) => setUomConfirmed(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <span>I understand and want to continue</span>
                    </label>
                  </div>
                )}
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Reorder Level
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
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
                  Item Type
                </label>
                <select
                  value={formData.item_type}
                  onChange={(event) =>
                    setFormData({ ...formData, item_type: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                >
                  {ITEM_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  HSN Code
                </label>
                <input
                  type="text"
                  value={formData.hsn_code}
                  onChange={(event) =>
                    setFormData({ ...formData, hsn_code: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder="Example: 0401"
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  GST Rate
                </label>
                <select
                  value={formData.gst_rate}
                  onChange={(event) =>
                    setFormData({ ...formData, gst_rate: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                >
                  <option value="">Not set</option>
                  {GST_RATES.map((rate) => (
                    <option key={rate} value={rate}>{rate}%</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Warehouse Transfer Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.transfer_price}
                  onChange={(event) =>
                    setFormData({ ...formData, transfer_price: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder="Price charged to outlets (per base unit)"
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
                aria-label="Close material details"
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
                { key: "rates", label: "Rates", icon: Coffee },
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
                      label="Applies To:"
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

              {activeTab === "rates" && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                        Material Rates
                      </h3>
                      <p className={`mt-1 text-[14px] ${mutedClass}`}>
                        Approved rates are in {getMaterialUnit(selectedMaterial)} / unit.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openRateForm()}
                      className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Plus size={17} />
                      Add Rate
                    </button>
                  </div>

                  {showRateForm && (
                    <form onSubmit={handleRateSubmit} className={`mt-6 rounded-md border p-5 ${cardClass}`}>
                      <h4 className={`mb-4 text-[16px] font-semibold ${mainTextClass}`}>
                        {rateForm.id ? "Edit Rate" : "New Rate"}
                      </h4>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
                        <div>
                          <label className={`mb-2 block text-[13px] font-medium ${mainTextClass}`}>Scope</label>
                          <select
                            value={rateForm.outlet_id === null || rateForm.outlet_id === "" ? "" : rateForm.outlet_id}
                            onChange={(e) => setRateForm({ ...rateForm, outlet_id: e.target.value })}
                            disabled={isOutletLocked}
                            className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            <option value="">Global</option>
                            {outlets.map((o) => (
                              <option key={o.id} value={o.id}>{o.outlet_name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={`mb-2 block text-[13px] font-medium ${mainTextClass}`}>Rate (₹ / {getMaterialUnit(selectedMaterial)})</label>
                          <input
                            type="number"
                            step="0.01"
                            value={rateForm.rate}
                            onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })}
                            className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`}
                            placeholder="0.00"
                            required
                          />
                        </div>
                        <div>
                          <label className={`mb-2 block text-[13px] font-medium ${mainTextClass}`}>Effective From</label>
                          <input
                            type="date"
                            value={rateForm.effective_from}
                            onChange={(e) => setRateForm({ ...rateForm, effective_from: e.target.value })}
                            className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`}
                            required
                          />
                        </div>
                        <div>
                          <label className={`mb-2 block text-[13px] font-medium ${mainTextClass}`}>Status</label>
                          <select
                            value={rateForm.is_approved}
                            onChange={(e) => setRateForm({ ...rateForm, is_approved: Number(e.target.value) })}
                            className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`}
                          >
                            <option value={1}>Approved</option>
                            <option value={0}>Pending</option>
                          </select>
                        </div>
                        <div className="flex items-end gap-2">
                          <button
                            type="submit"
                            disabled={rateLoading}
                            className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-70"
                            style={{ backgroundColor: primaryColor }}
                          >
                            {rateLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {rateForm.id ? "Update" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={closeRateForm}
                            className={`rounded-md border px-4 py-2.5 text-[14px] font-medium ${cardClass}`}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full min-w-[600px] border-collapse">
                      <thead>
                        <tr className="border-b border-[#EBE9F1]">
                          <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">Scope</th>
                          <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">Rate</th>
                          <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">Effective From</th>
                          <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">Status</th>
                          <th className="px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rates.length === 0 ? (
                          <tr>
                            <td colSpan="5" className="px-4 py-8 text-center text-[14px] text-[#6F6B7D]">
                              No rates configured. Add an approved rate to enable recipe costing.
                            </td>
                          </tr>
                        ) : (
                          rates.map((rate) => (
                            <tr key={rate.id} className="border-b border-[#EBE9F1]">
                              <td className="px-4 py-3 text-[14px] text-[#6F6B7D]">{rate.outlet_name || "Global"}</td>
                              <td className="px-4 py-3 text-[14px] font-semibold text-[#2F2B3D]">₹ {Number(rate.rate).toFixed(4)} / {getMaterialUnit(selectedMaterial)}</td>
                              <td className="px-4 py-3 text-[14px] text-[#6F6B7D]">{formatDate(rate.effective_from)}</td>
                              <td className="px-4 py-3">
                                <StatusBadge active={rate.is_approved} />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button onClick={() => openRateForm(rate)} className="mr-2 text-[#7367F0] hover:underline"><Edit2 size={16} /></button>
                                <button onClick={() => handleRateDelete(rate.id)} className="text-[#EA5455] hover:underline"><Trash2 size={16} /></button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
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
                placeholder="Search by name, code or HSN code"
                className={`h-12 w-full rounded-md border pl-11 pr-4 text-[15px] outline-none ${inputClass}`}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 border-b border-[#EBE9F1] p-6 md:flex-row md:items-center">
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
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
        ) : filteredMaterials.length === 0 ? (
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
                    HSN / GST
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
                {filteredMaterials.map((material) => (
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

                    <td className="px-6 py-4 text-[13px] text-[#6F6B7D]">
                      <div>{material.hsn_code || "-"}</div>
                      {material.gst_rate !== null && material.gst_rate !== undefined && material.gst_rate !== "" && (
                        <div className="text-[12px] text-[#A8AAAE]">{Number(material.gst_rate)}% GST</div>
                      )}
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

            <Pagination
              page={pagination.page || page}
              pages={pagination.pages || 1}
              total={pagination.total || 0}
              limit={pagination.limit || pageSize}
              onPageChange={setPage}
              isDark={isDark}
            />
          </div>
        )}
      </div>

      {showBulkUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`w-full max-w-lg rounded-md border shadow-xl ${cardClass}`}>
            <div className="flex items-center justify-between gap-4 border-b border-[#EBE9F1] p-5">
              <h3 className={`text-[18px] font-semibold ${mainTextClass}`}>
                Bulk Upload Raw Materials
              </h3>
              <button
                type="button"
                onClick={closeBulkUpload}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
                aria-label="Close bulk upload"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <p className={`text-[14px] ${mutedClass}`}>
                Existing material codes are updated; new codes are created. Category and Unit must already exist in Masters.
              </p>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className={`flex items-center gap-2 rounded-md border px-4 py-2 text-[14px] font-medium ${cardClass}`}
              >
                <Download size={16} />
                Download Template
              </button>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Choose File
                </label>
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={(event) => setBulkFile(event.target.files?.[0] || null)}
                  className={`w-full rounded-md border px-3 py-2 text-[14px] outline-none ${inputClass}`}
                />
              </div>

              {bulkResult && (
                <div className={`rounded-md border p-4 text-[14px] ${cardClass}`}>
                  <p className={mainTextClass}>
                    <strong>{bulkResult.created}</strong> created, <strong>{bulkResult.updated}</strong> updated
                    {bulkResult.failed > 0 && <>, <strong className="text-[#EA5455]">{bulkResult.failed}</strong> failed</>}
                    {" "}of {bulkResult.total} rows.
                  </p>
                  {bulkResult.errors?.length > 0 && (
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[13px] text-[#EA5455]">
                      {bulkResult.errors.map((err, idx) => (
                        <li key={idx}>Row {err.row}: {err.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-[#EBE9F1] p-5">
              <button
                type="button"
                onClick={closeBulkUpload}
                className={`rounded-md border px-4 py-2.5 text-[14px] font-medium ${cardClass}`}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleBulkUpload}
                disabled={bulkUploading || !bulkFile}
                className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)] disabled:cursor-not-allowed disabled:opacity-70"
                style={{ backgroundColor: primaryColor }}
              >
                {bulkUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {bulkUploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RawMaterials;
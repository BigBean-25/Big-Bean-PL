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
  Coffee,
  Package,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  DollarSign,
  FileText,
  Upload,
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

const GST_RATES = ["0", "5", "12", "18", "28"];

const emptyForm = () => ({
  item_code: "",
  item_name: "",
  category_id: "",
  selling_price: "",
  description: "",
  hsn_code: "",
  gst_rate: "",
  is_active: 1,
});

const getRows = (response) => {
  const data = response?.data?.data || response?.data || [];
  return Array.isArray(data) ? data : [];
};

const formatINR = (value = 0) =>
  "₹" +
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
  const parts = String(name || "Menu Item")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]).join("").toUpperCase() || "M";
};

const MenuItems = () => {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");
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
      await Promise.all([fetchItems(), fetchCategories()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await masterAPI.getMenuItems();
      setItems(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch menu items");
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await masterAPI.downloadMenuItemsTemplate();
      const url = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = "menu-items-upload-template.xlsx";
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
      const response = await masterAPI.bulkUploadMenuItems(formData);
      const result = response.data?.data;
      setBulkResult(result);
      if (result?.failed > 0) {
        toast.error(`${result.failed} row(s) failed`);
      } else {
        toast.success(`${result.created} created, ${result.updated} updated`);
      }
      await fetchItems();
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
            category.category_type === "Menu Item" ||
            category.category_type === "Both"
        )
      );
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch categories");
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
    setSelectedItem(null);
  };

  const getCategoryById = (id) => {
    return categories.find((category) => Number(category.id) === Number(id));
  };

  const getItemCategory = (item) => {
    if (item?.category_name) return item.category_name;

    const category = getCategoryById(item?.category_id);
    return category?.category_name || "-";
  };

  const relatedItems = useMemo(() => {
    if (!selectedItem?.category_id) return [];

    return items
      .filter(
        (item) =>
          Number(item.category_id) === Number(selectedItem.category_id) &&
          Number(item.id) !== Number(selectedItem.id)
      )
      .slice(0, 8);
  }, [items, selectedItem]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const categoryName = getItemCategory(item);

      const text = `${item.item_code || ""} ${item.item_name || ""} ${
        categoryName || ""
      } ${item.description || ""} ${item.hsn_code || ""}`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const categoryMatch =
        categoryFilter === "all" ||
        String(item.category_id) === String(categoryFilter);

      const activeStatus = Number(item.is_active) === 1 ? "active" : "inactive";
      const statusMatch = statusFilter === "all" || activeStatus === statusFilter;

      const price = Number(item.selling_price || 0);
      const priceMatch =
        priceFilter === "all" ||
        (priceFilter === "0-100" && price <= 100) ||
        (priceFilter === "101-250" && price > 100 && price <= 250) ||
        (priceFilter === "251-500" && price > 250 && price <= 500) ||
        (priceFilter === "500+" && price > 500);

      return searchMatch && categoryMatch && statusMatch && priceMatch;
    });
  }, [items, categories, searchTerm, categoryFilter, statusFilter, priceFilter]);

  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, Number(pageSize));
  }, [filteredItems, pageSize]);

  const summary = useMemo(() => {
    const active = items.filter((item) => Number(item.is_active) === 1).length;
    const inactive = items.filter((item) => Number(item.is_active) !== 1).length;

    const totalValue = items.reduce(
      (sum, item) => sum + Number(item.selling_price || 0),
      0
    );

    const averagePrice = items.length ? totalValue / items.length : 0;

    return {
      total: items.length,
      active,
      inactive,
      categories: new Set(items.map((item) => item.category_id).filter(Boolean))
        .size,
      averagePrice,
    };
  }, [items]);

  const handleEdit = (item) => {
    setEditingId(item.id);
    setFormData({
      item_code: item.item_code || "",
      item_name: item.item_name || "",
      category_id: item.category_id || "",
      selling_price: item.selling_price || "",
      description: item.description || "",
      hsn_code: item.hsn_code || "",
      gst_rate: item.gst_rate ?? "",
      is_active: Number(item.is_active) === 1 ? 1 : 0,
    });
    setShowForm(true);
    setSelectedItem(null);
  };

  const handleView = (item) => {
    setSelectedItem(item);
    setActiveTab("overview");
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this menu item?")) return;

    setDeletingId(id);

    try {
      await masterAPI.deleteMenuItem(id);
      toast.success("Menu item deleted successfully");

      if (selectedItem?.id === id) {
        setSelectedItem(null);
      }

      await fetchItems();
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.item_code.trim()) {
      toast.error("Please enter item code");
      return;
    }

    if (!formData.item_name.trim()) {
      toast.error("Please enter item name");
      return;
    }

    if (formData.selling_price !== "" && Number(formData.selling_price) < 0) {
      toast.error("Selling price cannot be negative");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        item_code: formData.item_code.trim(),
        item_name: formData.item_name.trim(),
        category_id: formData.category_id || null,
        selling_price: formData.selling_price
          ? Number(formData.selling_price)
          : 0,
        description: formData.description || "",
        hsn_code: formData.hsn_code.trim() || null,
        gst_rate: formData.gst_rate !== "" ? Number(formData.gst_rate) : null,
        is_active: Number(formData.is_active),
      };

      if (editingId) {
        await masterAPI.updateMenuItem(editingId, payload);
        toast.success("Menu item updated successfully");
      } else {
        await masterAPI.createMenuItem(payload);
        toast.success("Menu item created successfully");
      }

      closeForm();
      await fetchItems();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const headers = [
      "Item Code",
      "Item Name",
      "Category",
      "Selling Price",
      "HSN Code",
      "GST Rate",
      "Status",
      "Description",
      "Created At",
      "Updated At",
    ];

    const rows = filteredItems.map((item) => [
      item.item_code || "",
      item.item_name || "",
      getItemCategory(item),
      item.selling_price || 0,
      item.hsn_code || "",
      item.gst_rate !== null && item.gst_rate !== undefined ? item.gst_rate : "",
      Number(item.is_active) === 1 ? "Active" : "Inactive",
      item.description || "",
      formatDate(item.created_at),
      formatDate(item.updated_at),
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
    link.download = "bigbean-menu-items.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Menu items exported");
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

  const MenuAvatar = ({ item, size = "md" }) => {
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
        {getInitials(item?.item_name)}
      </div>
    );
  };

  const CategoryBadge = ({ item }) => (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold"
      style={{
        color: primaryColor,
        backgroundColor: `${primaryColor}18`,
      }}
    >
      <Coffee size={14} />
      {getItemCategory(item)}
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
            Menu Items Management
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Manage café menu items, selling prices, categories and product status.
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
            Add Menu Item
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total Items"
          value={summary.total}
          subtitle="All menu products"
          icon={Coffee}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />

        <StatCard
          title="Active Items"
          value={summary.active}
          subtitle="Available for sale"
          icon={CheckCircle2}
          color="#28C76F"
          bg="#E9F9EF"
        />

        <StatCard
          title="Inactive Items"
          value={summary.inactive}
          subtitle="Disabled items"
          icon={AlertCircle}
          color="#EA5455"
          bg="#FCEAEA"
        />

        <StatCard
          title="Categories"
          value={summary.categories}
          subtitle="Mapped menu groups"
          icon={Package}
          color="#00CFE8"
          bg="#E6FAFD"
        />

        <StatCard
          title="Avg Price"
          value={formatINR(summary.averagePrice)}
          subtitle="Average selling price"
          icon={DollarSign}
          color="#FF9F43"
          bg="#FFF4E5"
        />
      </div>

      {showForm && (
        <div
          className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
        >
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                {editingId ? "Edit Menu Item" : "New Menu Item"}
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add item code, category and selling price for café sales.
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
                  Item Code *
                </label>
                <input
                  type="text"
                  value={formData.item_code}
                  onChange={(event) =>
                    setFormData({ ...formData, item_code: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder="Example: BBC-CAP-001"
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Item Name *
                </label>
                <input
                  type="text"
                  value={formData.item_name}
                  onChange={(event) =>
                    setFormData({ ...formData, item_name: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder="Example: Cappuccino"
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
                  Selling Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.selling_price}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      selling_price: event.target.value,
                    })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  HSN/SAC Code
                </label>
                <input
                  type="text"
                  value={formData.hsn_code}
                  onChange={(event) =>
                    setFormData({ ...formData, hsn_code: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder="Example: 996331"
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
                  placeholder="Short description, portion size, menu note..."
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
                    <Coffee size={18} />
                    {editingId ? "Update Item" : "Create Item"}
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

      {selectedItem && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
          <div
            className={`rounded-md border p-8 text-center shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
          >
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-2 flex justify-center">
              <MenuAvatar item={selectedItem} size="lg" />
            </div>

            <h2 className={`mt-6 text-[24px] font-semibold ${mainTextClass}`}>
              {selectedItem.item_name || "-"}
            </h2>

            <div className="mt-3 flex justify-center">
              <CategoryBadge item={selectedItem} />
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
                    <DollarSign size={22} />
                  </div>
                  <div>
                    <p className="text-[20px] font-semibold text-[#2F2B3D]">
                      {formatINR(selectedItem.selling_price)}
                    </p>
                    <p className="text-[13px] text-[#6F6B7D]">Selling Price</p>
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
                      {Number(selectedItem.is_active) === 1 ? "On" : "Off"}
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
                <DetailItem label="Item ID:" value={selectedItem.id} />
                <DetailItem label="Code:" value={selectedItem.item_code} />
                <DetailItem label="Name:" value={selectedItem.item_name} />
                <DetailItem label="Category:" value={getItemCategory(selectedItem)} />
                <DetailItem label="Price:" value={formatINR(selectedItem.selling_price)} />
                <DetailItem
                  label="Status:"
                  value={Number(selectedItem.is_active) === 1 ? "Active" : "Inactive"}
                />
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => handleEdit(selectedItem)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Edit2 size={17} />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(selectedItem.id)}
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
                { key: "overview", label: "Overview", icon: Coffee },
                { key: "pricing", label: "Pricing", icon: DollarSign },
                { key: "category", label: "Category", icon: Package },
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
                    Menu Item Overview
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Item identity, category and selling information.
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
                          <Coffee size={22} />
                        </div>
                        <div>
                          <p className="text-[13px] text-[#6F6B7D]">Item Code</p>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            {selectedItem.item_code || "-"}
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
                            {Number(selectedItem.is_active) === 1
                              ? "Active"
                              : "Inactive"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-[#EBE9F1] p-5 md:col-span-2">
                      <p className="text-[13px] text-[#6F6B7D]">Description</p>
                      <p className="mt-2 text-[15px] font-medium text-[#2F2B3D]">
                        {selectedItem.description || "No description added."}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {activeTab === "pricing" && (
                <>
                  <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                    Pricing Details
                  </h3>
                  <p className={`mt-1 text-[14px] ${mutedClass}`}>
                    Selling price and price reference.
                  </p>

                  <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="rounded-md border border-[#EBE9F1] p-5">
                      <DetailItem
                        label="Selling Price:"
                        value={formatINR(selectedItem.selling_price)}
                      />
                      <DetailItem label="Tax:" value="As per POS item tax" />
                      <DetailItem label="Price Type:" value="Menu Selling Price" />
                    </div>

                    <div className="rounded-md bg-[#F8F7FA] p-5">
                      <p className="text-[13px] text-[#6F6B7D]">Quick Note</p>
                      <p className="mt-2 text-[15px] font-medium text-[#2F2B3D]">
                        Recipe costing and item profitability can be connected later
                        using this menu item as the base master.
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
                    Menu category and related items.
                  </p>

                  <div className="mt-6 rounded-md border border-[#EBE9F1] p-5">
                    <DetailItem label="Category:" value={getItemCategory(selectedItem)} />
                    <DetailItem
                      label="Category ID:"
                      value={selectedItem.category_id || "-"}
                    />
                    <DetailItem
                      label="Category Type:"
                      value={getCategoryById(selectedItem.category_id)?.category_type || "-"}
                    />
                  </div>

                  <div className="mt-6">
                    <h4 className={`text-[18px] font-semibold ${mainTextClass}`}>
                      Related Items
                    </h4>

                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[650px] border-collapse">
                        <thead>
                          <tr className="border-b border-[#EBE9F1]">
                            <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                              Item
                            </th>
                            <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                              Price
                            </th>
                            <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                              Status
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {relatedItems.length === 0 ? (
                            <tr>
                              <td
                                colSpan="3"
                                className="px-4 py-8 text-center text-[14px] text-[#6F6B7D]"
                              >
                                No related menu items found in this category.
                              </td>
                            </tr>
                          ) : (
                            relatedItems.map((item) => (
                              <tr key={item.id} className="border-b border-[#EBE9F1]">
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-3">
                                    <MenuAvatar item={item} size="sm" />
                                    <div>
                                      <p className="text-[14px] font-semibold text-[#2F2B3D]">
                                        {item.item_name}
                                      </p>
                                      <p className="text-[12px] text-[#A8AAAE]">
                                        {item.item_code}
                                      </p>
                                    </div>
                                  </div>
                                </td>

                                <td className="px-4 py-4 text-[14px] font-semibold text-[#2F2B3D]">
                                  {formatINR(item.selling_price)}
                                </td>

                                <td className="px-4 py-4">
                                  <StatusBadge active={item.is_active} />
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
                    Menu item creation and update details.
                  </p>

                  <div className="mt-6 rounded-md border border-[#EBE9F1] p-5">
                    <DetailItem label="Created At:" value={formatDate(selectedItem.created_at)} />
                    <DetailItem label="Updated At:" value={formatDate(selectedItem.updated_at)} />
                    <DetailItem label="Created By:" value={selectedItem.created_by || "-"} />
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
              value={priceFilter}
              onChange={(event) => setPriceFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Price Range</option>
              <option value="0-100">₹0 - ₹100</option>
              <option value="101-250">₹101 - ₹250</option>
              <option value="251-500">₹251 - ₹500</option>
              <option value="500+">Above ₹500</option>
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
              Add Menu Item
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
                Loading menu items...
              </p>
            </div>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Coffee size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No menu items found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add a new menu item or change filters.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse">
              <thead>
                <tr className="border-b border-[#EBE9F1]">
                  <th className="px-6 py-4 text-left">
                    <input type="checkbox" className="h-5 w-5 rounded accent-[#7367F0]" />
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Menu Item
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Category
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Selling Price
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    HSN / GST
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Description
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
                {visibleItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-[#EBE9F1] transition hover:bg-[#F8F7FA]"
                  >
                    <td className="px-6 py-4">
                      <input type="checkbox" className="h-5 w-5 rounded accent-[#7367F0]" />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <MenuAvatar item={item} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-[#2F2B3D]">
                            {item.item_name || "-"}
                          </p>
                          <p className="truncate text-[13px] text-[#6F6B7D]">
                            {item.item_code || "-"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <CategoryBadge item={item} />
                    </td>

                    <td className="px-6 py-4 text-[14px] font-semibold text-[#2F2B3D]">
                      {formatINR(item.selling_price)}
                    </td>

                    <td className="px-6 py-4 text-[13px] text-[#6F6B7D]">
                      <div>{item.hsn_code || "-"}</div>
                      {item.gst_rate !== null && item.gst_rate !== undefined && item.gst_rate !== "" && (
                        <div className="text-[12px] text-[#A8AAAE]">{Number(item.gst_rate)}% GST</div>
                      )}
                    </td>

                    <td className="max-w-[280px] px-6 py-4 text-[14px] text-[#6F6B7D]">
                      <span className="line-clamp-2">
                        {item.description || "-"}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <StatusBadge active={item.is_active} />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 text-[#6F6B7D]">
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id}
                          className="transition hover:text-[#EA5455] disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === item.id ? (
                            <Loader2 size={20} className="animate-spin" />
                          ) : (
                            <Trash2 size={20} />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleView(item)}
                          className="transition hover:text-[#7367F0]"
                          title="View Details"
                        >
                          <Eye size={20} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
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

            {filteredItems.length > pageSize && (
              <div className="border-t border-[#EBE9F1] px-6 py-4 text-[14px] text-[#6F6B7D]">
                Showing first {pageSize} of {filteredItems.length} menu items.
              </div>
            )}
          </div>
        )}
      </div>

      {showBulkUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`w-full max-w-lg rounded-md border shadow-xl ${cardClass}`}>
            <div className="flex items-center justify-between gap-4 border-b border-[#EBE9F1] p-5">
              <h3 className={`text-[18px] font-semibold ${mainTextClass}`}>
                Bulk Upload Menu Items
              </h3>
              <button
                type="button"
                onClick={closeBulkUpload}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <p className={`text-[14px] ${mutedClass}`}>
                Existing item codes are updated; new codes are created. Category must already exist in Masters.
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

export default MenuItems;
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Search,
  Package,
  Coffee,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Filter,
  Eye,
  Download,
  Loader2,
  Folder,
  Store,
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
  category_name: "",
  category_type: "Raw Material",
  parent_id: "",
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

const getCategoryInitials = (name = "") => {
  const parts = String(name || "Category")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]).join("").toUpperCase() || "C";
};

const Categories = () => {
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [parentFilter, setParentFilter] = useState("all");

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
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);

    try {
      const response = await masterAPI.getCategories();
      setCategories(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch categories");
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
    setSelectedCategory(null);
  };

  const getParentCategory = (category) => {
    const parentId = category?.parent_id;

    if (!parentId) return null;

    return categories.find((item) => Number(item.id) === Number(parentId));
  };

  const selectedChildren = useMemo(() => {
    if (!selectedCategory) return [];

    return categories.filter(
      (item) => Number(item.parent_id) === Number(selectedCategory.id)
    );
  }, [categories, selectedCategory]);

  const parentCategories = useMemo(() => {
    return categories.filter((item) => !item.parent_id);
  }, [categories]);

  const filteredCategories = useMemo(() => {
    return categories.filter((category) => {
      const parentCategory = getParentCategory(category);

      const text = `${category.category_name || ""} ${
        category.category_type || ""
      } ${parentCategory?.category_name || ""}`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const typeMatch =
        typeFilter === "all" || category.category_type === typeFilter;

      const activeStatus = Number(category.is_active) === 1 ? "active" : "inactive";
      const statusMatch = statusFilter === "all" || activeStatus === statusFilter;

      const parentMatch =
        parentFilter === "all" ||
        (parentFilter === "parent" && !category.parent_id) ||
        (parentFilter === "child" && Boolean(category.parent_id)) ||
        String(category.parent_id || "") === String(parentFilter);

      return searchMatch && typeMatch && statusMatch && parentMatch;
    });
  }, [categories, searchTerm, typeFilter, statusFilter, parentFilter]);

  const stats = useMemo(() => {
    return {
      total: categories.length,
      active: categories.filter((item) => Number(item.is_active) === 1).length,
      rawMaterial: categories.filter((item) => item.category_type === "Raw Material")
        .length,
      menuItem: categories.filter((item) => item.category_type === "Menu Item").length,
      both: categories.filter((item) => item.category_type === "Both").length,
    };
  }, [categories]);

  const handleEdit = (category) => {
    setEditingId(category.id);
    setFormData({
      category_name: category.category_name || "",
      category_type: category.category_type || "Raw Material",
      parent_id: category.parent_id || "",
      is_active: Number(category.is_active) === 1 ? 1 : 0,
    });
    setShowForm(true);
    setSelectedCategory(null);
  };

  const handleView = (category) => {
    setSelectedCategory(category);
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this category?")) return;

    setDeletingId(id);

    try {
      await masterAPI.deleteCategory(id);
      toast.success("Category deleted successfully");

      if (selectedCategory?.id === id) {
        setSelectedCategory(null);
      }

      await fetchCategories();
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.category_name.trim()) {
      toast.error("Please enter category name");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        category_name: formData.category_name.trim(),
        category_type: formData.category_type,
        parent_id: formData.parent_id ? Number(formData.parent_id) : null,
        is_active: Number(formData.is_active),
      };

      if (editingId) {
        await masterAPI.updateCategory(editingId, payload);
        toast.success("Category updated successfully");
      } else {
        await masterAPI.createCategory(payload);
        toast.success("Category created successfully");
      }

      closeForm();
      await fetchCategories();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const headers = [
      "ID",
      "Category Name",
      "Category Type",
      "Parent Category",
      "Status",
      "Created At",
      "Updated At",
    ];

    const rows = filteredCategories.map((category) => {
      const parent = getParentCategory(category);

      return [
        category.id || "",
        category.category_name || "",
        category.category_type || "",
        parent?.category_name || "",
        Number(category.is_active) === 1 ? "Active" : "Inactive",
        formatDate(category.created_at),
        formatDate(category.updated_at),
      ];
    });

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
    link.download = "bigbean-categories.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Categories exported");
  };

  const getCategoryIcon = (type, size = 18) => {
    if (type === "Menu Item") return <Coffee size={size} />;
    if (type === "Both") return <Store size={size} />;
    return <Package size={size} />;
  };

  const getTypeStyle = (type) => {
    if (type === "Menu Item") {
      return "bg-[#FFF4E5] text-[#FF9F43]";
    }

    if (type === "Both") {
      return "bg-[#F0EEFF] text-[#7367F0]";
    }

    return "bg-[#E9F9EF] text-[#28C76F]";
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

  const CategoryAvatar = ({ category, size = "md" }) => {
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
        {getCategoryInitials(category?.category_name)}
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
            Categories Management
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Manage raw material, menu item and shared category masters.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={fetchCategories}
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
            Add Category
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total Categories"
          value={stats.total}
          subtitle="All category masters"
          icon={Folder}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />

        <StatCard
          title="Active"
          value={stats.active}
          subtitle="Currently usable"
          icon={CheckCircle2}
          color="#28C76F"
          bg="#E9F9EF"
        />

        <StatCard
          title="Raw Material"
          value={stats.rawMaterial}
          subtitle="Stock & purchase"
          icon={Package}
          color="#00CFE8"
          bg="#E6FAFD"
        />

        <StatCard
          title="Menu Item"
          value={stats.menuItem}
          subtitle="Sales & recipes"
          icon={Coffee}
          color="#FF9F43"
          bg="#FFF4E5"
        />

        <StatCard
          title="Both"
          value={stats.both}
          subtitle="Shared category"
          icon={Store}
          color="#7367F0"
          bg="#F0EEFF"
        />
      </div>

      {showForm && (
        <div
          className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
        >
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                {editingId ? "Edit Category" : "New Category"}
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Category names will reflect in stock, recipe, purchase and sales reports.
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
                  Category Name *
                </label>
                <input
                  type="text"
                  value={formData.category_name}
                  onChange={(event) =>
                    setFormData({ ...formData, category_name: event.target.value })
                  }
                  placeholder="Example: Dairy, Bakery, Hot Coffee"
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Category Type *
                </label>
                <select
                  value={formData.category_type}
                  onChange={(event) =>
                    setFormData({ ...formData, category_type: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                >
                  <option value="Raw Material">Raw Material</option>
                  <option value="Menu Item">Menu Item</option>
                  <option value="Both">Both</option>
                </select>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Parent Category
                </label>
                <select
                  value={formData.parent_id}
                  onChange={(event) =>
                    setFormData({ ...formData, parent_id: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                >
                  <option value="">No Parent Category</option>
                  {categories
                    .filter((category) => Number(category.id) !== Number(editingId))
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.category_name}
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
                    <Folder size={18} />
                    {editingId ? "Update Category" : "Create Category"}
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

      {selectedCategory && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
          <div
            className={`rounded-md border p-8 text-center shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
          >
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-2 flex justify-center">
              <CategoryAvatar category={selectedCategory} size="lg" />
            </div>

            <h2 className={`mt-6 text-[24px] font-semibold ${mainTextClass}`}>
              {selectedCategory.category_name || "-"}
            </h2>

            <div className="mt-3 flex justify-center">
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-semibold ${getTypeStyle(
                  selectedCategory.category_type
                )}`}
              >
                {getCategoryIcon(selectedCategory.category_type, 14)}
                {selectedCategory.category_type || "Category"}
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
                    <Folder size={22} />
                  </div>
                  <div>
                    <p className="text-[20px] font-semibold text-[#2F2B3D]">
                      {selectedChildren.length}
                    </p>
                    <p className="text-[13px] text-[#6F6B7D]">Sub Categories</p>
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
                      {Number(selectedCategory.is_active) === 1 ? "On" : "Off"}
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
                <DetailItem label="Category ID:" value={selectedCategory.id} />
                <DetailItem label="Name:" value={selectedCategory.category_name} />
                <DetailItem label="Type:" value={selectedCategory.category_type} />
                <DetailItem
                  label="Parent:"
                  value={getParentCategory(selectedCategory)?.category_name || "No Parent"}
                />
                <DetailItem
                  label="Status:"
                  value={Number(selectedCategory.is_active) === 1 ? "Active" : "Inactive"}
                />
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => handleEdit(selectedCategory)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Edit2 size={17} />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(selectedCategory.id)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-[#FCEAEA] px-4 py-2.5 text-[15px] font-semibold text-[#EA5455]"
                >
                  <Trash2 size={17} />
                  Delete
                </button>
              </div>
            </div>
          </div>

          <div
            className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
          >
            <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
              Category Overview
            </h3>
            <p className={`mt-1 text-[14px] ${mutedClass}`}>
              Parent/child relationship and usage reference.
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
                    <Folder size={22} />
                  </div>
                  <div>
                    <p className="text-[13px] text-[#6F6B7D]">Parent Category</p>
                    <p className="text-[15px] font-semibold text-[#2F2B3D]">
                      {getParentCategory(selectedCategory)?.category_name || "No Parent"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-[#EBE9F1] p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#FFF4E5] text-[#FF9F43]">
                    {getCategoryIcon(selectedCategory.category_type, 22)}
                  </div>
                  <div>
                    <p className="text-[13px] text-[#6F6B7D]">Used For</p>
                    <p className="text-[15px] font-semibold text-[#2F2B3D]">
                      {selectedCategory.category_type === "Raw Material"
                        ? "Stock / Purchase / Consumption"
                        : selectedCategory.category_type === "Menu Item"
                        ? "Menu / Sales / Recipes"
                        : "Stock, Menu, Sales & Reports"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h4 className={`text-[18px] font-semibold ${mainTextClass}`}>
                Sub Categories
              </h4>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[650px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#EBE9F1]">
                      <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                        Category
                      </th>
                      <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedChildren.length === 0 ? (
                      <tr>
                        <td
                          colSpan="3"
                          className="px-4 py-8 text-center text-[14px] text-[#6F6B7D]"
                        >
                          No sub categories added under this category.
                        </td>
                      </tr>
                    ) : (
                      selectedChildren.map((child) => (
                        <tr key={child.id} className="border-b border-[#EBE9F1]">
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <CategoryAvatar category={child} size="sm" />
                              <div>
                                <p className="text-[14px] font-semibold text-[#2F2B3D]">
                                  {child.category_name}
                                </p>
                                <p className="text-[12px] text-[#A8AAAE]">
                                  ID: {child.id}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold ${getTypeStyle(
                                child.category_type
                              )}`}
                            >
                              {getCategoryIcon(child.category_type, 14)}
                              {child.category_type}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <StatusBadge active={child.is_active} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
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
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Type</option>
              <option value="Raw Material">Raw Material</option>
              <option value="Menu Item">Menu Item</option>
              <option value="Both">Both</option>
            </select>

            <select
              value={parentFilter}
              onChange={(event) => setParentFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Parent</option>
              <option value="parent">Parent Categories Only</option>
              <option value="child">Child Categories Only</option>
              {parentCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.category_name}
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
                placeholder="Search Category"
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
              onClick={openCreateForm}
              className="flex h-12 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)]"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus size={18} />
              Add Category
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
                Loading categories...
              </p>
            </div>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <AlertCircle size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No categories found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add a new category or change filters.
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
                    Category
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Type
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Parent
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Sub Categories
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
                {filteredCategories.map((category) => {
                  const parent = getParentCategory(category);
                  const childrenCount = categories.filter(
                    (item) => Number(item.parent_id) === Number(category.id)
                  ).length;

                  return (
                    <tr
                      key={category.id}
                      className="border-b border-[#EBE9F1] transition hover:bg-[#F8F7FA]"
                    >
                      <td className="px-6 py-4">
                        <input type="checkbox" className="h-5 w-5 rounded accent-[#7367F0]" />
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <CategoryAvatar category={category} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-semibold text-[#2F2B3D]">
                              {category.category_name || "-"}
                            </p>
                            <p className="truncate text-[13px] text-[#6F6B7D]">
                              ID: {category.id}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold ${getTypeStyle(
                            category.category_type
                          )}`}
                        >
                          {getCategoryIcon(category.category_type, 14)}
                          {category.category_type || "-"}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span className="text-[14px] text-[#6F6B7D]">
                          {parent?.category_name || "No Parent"}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className="inline-flex rounded px-3 py-1 text-[12px] font-semibold"
                          style={{
                            color: primaryColor,
                            backgroundColor: `${primaryColor}18`,
                          }}
                        >
                          {childrenCount}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <StatusBadge active={category.is_active} />
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 text-[#6F6B7D]">
                          <button
                            type="button"
                            onClick={() => handleDelete(category.id)}
                            disabled={deletingId === category.id}
                            className="transition hover:text-[#EA5455] disabled:opacity-50"
                            title="Delete"
                          >
                            {deletingId === category.id ? (
                              <Loader2 size={20} className="animate-spin" />
                            ) : (
                              <Trash2 size={20} />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleView(category)}
                            className="transition hover:text-[#7367F0]"
                            title="View Details"
                          >
                            <Eye size={20} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleEdit(category)}
                            className="transition hover:text-[#00A6B7]"
                            title="Edit"
                          >
                            <Edit2 size={20} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Categories;
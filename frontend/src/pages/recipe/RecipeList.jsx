import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Edit2,
  Eye,
  X,
  Search,
  Download,
  Loader2,
  RefreshCw,
  FileText,
  Clock,
  Package,
  AlertCircle,
  CheckCircle2,
  Store,
} from "lucide-react";
import { recipeAPI } from "../../services/api";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

const getRows = (response) => {
  const data = response?.data?.data || response?.data || [];
  return Array.isArray(data) ? data : [];
};

const num = (value) => Number(value || 0);

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

const RecipeList = () => {
  const navigate = useNavigate();

  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";

  const cardClass = isDark
    ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
    : "border-[#EBE9F1] bg-white text-[#2F2B3D]";

  const inputClass = isDark
    ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6]"
    : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE]";

  const mutedClass = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainTextClass = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  useEffect(() => {
    fetchRecipes();
  }, []);

  const fetchRecipes = async () => {
    setLoading(true);

    try {
      const response = await recipeAPI.getRecipes();
      setRecipes(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch recipes");
    } finally {
      setLoading(false);
    }
  };

  const getTotalTime = (recipe) =>
    num(recipe?.prep_time) + num(recipe?.cooking_time) + num(recipe?.finishing_time);

  const getIngredientCount = (recipe) => {
    if (Array.isArray(recipe?.items)) return recipe.items.length;
    return num(recipe?.ingredient_count || recipe?.items_count || 0);
  };

  const categoryOptions = useMemo(() => {
    return Array.from(
      new Set(recipes.map((recipe) => recipe.recipe_category).filter(Boolean))
    );
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    return recipes.filter((recipe) => {
      const text = `${recipe.item_name || ""} ${recipe.recipe_category || ""} ${
        recipe.portion || ""
      } ${recipe.status || ""} ${recipe.version_no || ""}`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const categoryMatch =
        categoryFilter === "all" ||
        String(recipe.recipe_category || "") === String(categoryFilter);

      const statusMatch =
        statusFilter === "all" ||
        String(recipe.status || "").toLowerCase() ===
          String(statusFilter).toLowerCase();

      return searchMatch && categoryMatch && statusMatch;
    });
  }, [recipes, searchTerm, categoryFilter, statusFilter]);

  const visibleRecipes = useMemo(() => {
    return filteredRecipes.slice(0, Number(pageSize));
  }, [filteredRecipes, pageSize]);

  const summary = useMemo(() => {
    const active = filteredRecipes.filter((item) => item.status === "Active").length;
    const draft = filteredRecipes.filter((item) => item.status === "Draft").length;
    const inactive = filteredRecipes.filter((item) => item.status === "Inactive").length;

    const ingredients = filteredRecipes.reduce(
      (sum, recipe) => sum + getIngredientCount(recipe),
      0
    );

    const avgTime = filteredRecipes.length
      ? filteredRecipes.reduce((sum, recipe) => sum + getTotalTime(recipe), 0) /
        filteredRecipes.length
      : 0;

    return {
      total: filteredRecipes.length,
      active,
      draft,
      inactive,
      ingredients,
      avgTime,
    };
  }, [filteredRecipes]);

  const viewRecipeDetails = async (id) => {
    setDetailsLoading(true);
    setShowModal(true);

    try {
      const response = await recipeAPI.getRecipe(id);
      setSelectedRecipe(response?.data?.data || response?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch recipe details");
      setShowModal(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedRecipe(null);
  };

  const exportRecipes = () => {
    const headers = [
      "Menu Item",
      "Category",
      "Portion",
      "Prep Time",
      "Cooking Time",
      "Finishing Time",
      "Total Time",
      "Version",
      "Status",
      "Ingredients",
    ];

    const rows = filteredRecipes.map((recipe) => [
      recipe.item_name || "",
      recipe.recipe_category || "",
      recipe.portion || "",
      recipe.prep_time || 0,
      recipe.cooking_time || 0,
      recipe.finishing_time || 0,
      getTotalTime(recipe),
      recipe.version_no || 1,
      recipe.status || "",
      getIngredientCount(recipe),
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
    link.download = "bigbean-recipes.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Recipes exported");
  };

  const StatusBadge = ({ status }) => {
    const styles = {
      Draft: "bg-[#F3F2F7] text-[#6F6B7D]",
      Active: "bg-[#E9F9EF] text-[#28C76F]",
      Inactive: "bg-[#FCEAEA] text-[#EA5455]",
    };

    return (
      <span
        className={`inline-flex rounded px-3 py-1 text-[12px] font-semibold ${
          styles[status] || "bg-[#F3F2F7] text-[#6F6B7D]"
        }`}
      >
        {status || "Draft"}
      </span>
    );
  };

  const StatCard = ({ title, value, subtitle, icon: Icon, color, bg }) => (
    <div className={`rounded-md border p-5 shadow-sm ${cardClass}`}>
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
            Recipe / BOM List
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            View and manage all recipe configurations for menu item consumption.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={fetchRecipes}
            className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
          >
            <RefreshCw size={18} />
            Refresh
          </button>

          <button
            type="button"
            onClick={exportRecipes}
            className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
          >
            <Download size={18} />
            Export
          </button>

          <button
            type="button"
            onClick={() => navigate("/recipes/new")}
            className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus size={18} />
            Create Recipe
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Recipes"
          value={summary.total}
          subtitle="Filtered recipe count"
          icon={FileText}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />

        <StatCard
          title="Active"
          value={summary.active}
          subtitle="Live recipes"
          icon={CheckCircle2}
          color="#28C76F"
          bg="#E9F9EF"
        />

        <StatCard
          title="Draft"
          value={summary.draft}
          subtitle="Work in progress"
          icon={AlertCircle}
          color="#FF9F43"
          bg="#FFF4E5"
        />

        <StatCard
          title="Ingredients"
          value={summary.ingredients}
          subtitle="Mapped raw materials"
          icon={Package}
          color="#00CFE8"
          bg="#E6FAFD"
        />

        <StatCard
          title="Avg Time"
          value={`${summary.avgTime.toFixed(0)} min`}
          subtitle={`${summary.inactive} inactive recipes`}
          icon={Clock}
          color="#EA5455"
          bg="#FCEAEA"
        />
      </div>

      <div className={`rounded-md border p-5 shadow-sm ${cardClass}`}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
          >
            <option value="all">Select Category</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
          >
            <option value="all">Select Status</option>
            <option value="Draft">Draft</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>

          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
          >
            <option value={10}>Show 10</option>
            <option value={25}>Show 25</option>
            <option value={50}>Show 50</option>
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
              placeholder="Search Recipe"
              className={`h-12 w-full rounded-md border pl-11 pr-4 text-[15px] outline-none ${inputClass}`}
            />
          </div>
        </div>
      </div>

      <div className={`rounded-md border shadow-sm ${cardClass}`}>
        <div className="border-b border-[#EBE9F1] p-6">
          <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
            All Recipes
          </h3>
          <p className={`mt-1 text-[14px] ${mutedClass}`}>
            Recipe master list with version, status and timing details.
          </p>
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
                Loading recipes...
              </p>
            </div>
          </div>
        ) : visibleRecipes.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Package size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No recipes found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Create a recipe or change filters.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse">
              <thead>
                <tr className="border-b border-[#EBE9F1]">
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Menu Item
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Category
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Portion
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Total Time
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Version
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
                {visibleRecipes.map((recipe) => (
                  <tr
                    key={recipe.id}
                    className="border-b border-[#EBE9F1] transition hover:bg-[#F8F7FA]"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-md text-white"
                          style={{ backgroundColor: primaryColor }}
                        >
                          <Package size={18} />
                        </div>
                        <div>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            {recipe.item_name || "-"}
                          </p>
                          <p className="text-[13px] text-[#6F6B7D]">
                            {getIngredientCount(recipe)} ingredients
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className="inline-flex rounded-full px-3 py-1 text-[12px] font-semibold"
                        style={{
                          color: primaryColor,
                          backgroundColor: `${primaryColor}18`,
                        }}
                      >
                        {recipe.recipe_category || "-"}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                      {recipe.portion || "-"}
                    </td>

                    <td className="px-6 py-4 text-[14px] font-semibold text-[#2F2B3D]">
                      {getTotalTime(recipe)} min
                    </td>

                    <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                      v{recipe.version_no || 1}
                    </td>

                    <td className="px-6 py-4">
                      <StatusBadge status={recipe.status} />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 text-[#6F6B7D]">
                        <button
                          type="button"
                          onClick={() => navigate(`/recipes/edit/${recipe.id}`)}
                          className="transition hover:text-[#00A6B7]"
                          title="Edit"
                        >
                          <Edit2 size={20} />
                        </button>

                        <button
                          type="button"
                          onClick={() => viewRecipeDetails(recipe.id)}
                          className="transition hover:text-[#7367F0]"
                          title="View Details"
                        >
                          <Eye size={20} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredRecipes.length > pageSize && (
              <div className="border-t border-[#EBE9F1] px-6 py-4 text-[14px] text-[#6F6B7D]">
                Showing first {pageSize} of {filteredRecipes.length} recipes.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-md border border-[#FFECCC] bg-[#FFF4E5] p-5">
        <div className="flex gap-3">
          <AlertCircle className="mt-0.5 shrink-0 text-[#FF9F43]" size={22} />
          <div>
            <h3 className="text-[18px] font-semibold text-[#B76E00]">
              Missing Recipes
            </h3>
            <p className="mt-1 text-[14px] text-[#B76E00]">
              Menu items without recipes will show consumption variance warnings
              in reports.
            </p>
          </div>
        </div>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
          onClick={closeModal}
        >
          <div
            className={`max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-md border p-6 shadow-xl ${cardClass}`}
            onClick={(event) => event.stopPropagation()}
          >
            {detailsLoading ? (
              <div className="flex min-h-[300px] items-center justify-center">
                <div className="text-center">
                  <Loader2
                    size={36}
                    className="mx-auto animate-spin"
                    style={{ color: primaryColor }}
                  />
                  <p className={`mt-3 text-[14px] ${mutedClass}`}>
                    Loading recipe details...
                  </p>
                </div>
              </div>
            ) : selectedRecipe ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className={`text-[24px] font-semibold ${mainTextClass}`}>
                      {selectedRecipe.item_name || "Recipe Details"}
                    </h2>
                    <p className={`mt-1 text-[14px] ${mutedClass}`}>
                      Recipe details and ingredient configuration.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div className="rounded-md bg-[#F8F7FA] p-4">
                    <p className="text-[13px] text-[#6F6B7D]">Category</p>
                    <p className="mt-1 text-[16px] font-semibold text-[#2F2B3D]">
                      {selectedRecipe.recipe_category || "-"}
                    </p>
                  </div>

                  <div className="rounded-md bg-[#F8F7FA] p-4">
                    <p className="text-[13px] text-[#6F6B7D]">Portion</p>
                    <p className="mt-1 text-[16px] font-semibold text-[#2F2B3D]">
                      {selectedRecipe.portion || "-"}
                    </p>
                  </div>

                  <div className="rounded-md bg-[#F8F7FA] p-4">
                    <p className="text-[13px] text-[#6F6B7D]">Total Time</p>
                    <p className="mt-1 text-[16px] font-semibold text-[#2F2B3D]">
                      {getTotalTime(selectedRecipe)} min
                    </p>
                  </div>

                  <div className="rounded-md bg-[#F8F7FA] p-4">
                    <p className="text-[13px] text-[#6F6B7D]">Status</p>
                    <div className="mt-2">
                      <StatusBadge status={selectedRecipe.status} />
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
                  <div className="rounded-md border border-[#EBE9F1] p-5">
                    <DetailItem label="Prep Time:" value={`${num(selectedRecipe.prep_time)} min`} />
                    <DetailItem label="Cooking Time:" value={`${num(selectedRecipe.cooking_time)} min`} />
                    <DetailItem label="Finishing Time:" value={`${num(selectedRecipe.finishing_time)} min`} />
                  </div>

                  <div className="rounded-md border border-[#EBE9F1] p-5">
                    <DetailItem label="Recipe ID:" value={selectedRecipe.id} />
                    <DetailItem label="Version:" value={`v${selectedRecipe.version_no || 1}`} />
                    <DetailItem label="Outlet:" value={selectedRecipe.outlet_name || "All Outlets"} />
                  </div>

                  <div className="rounded-md border border-[#EBE9F1] p-5">
                    <DetailItem label="Ingredients:" value={selectedRecipe.items?.length || 0} />
                    <DetailItem label="Menu Item ID:" value={selectedRecipe.menu_item_id} />
                    <DetailItem label="Recipe Status:" value={selectedRecipe.status || "-"} />
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className={`text-[20px] font-semibold ${mainTextClass}`}>
                    Ingredients ({selectedRecipe.items?.length || 0})
                  </h3>

                  <div className="mt-4 overflow-x-auto rounded-md border border-[#EBE9F1]">
                    <table className="w-full min-w-[800px] border-collapse">
                      <thead>
                        <tr className="border-b border-[#EBE9F1]">
                          <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                            Material
                          </th>
                          <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                            Code
                          </th>
                          <th className="px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                            Quantity
                          </th>
                          <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                            Unit
                          </th>
                          <th className="px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide text-[#A8AAAE]">
                            Waste %
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {selectedRecipe.items && selectedRecipe.items.length > 0 ? (
                          selectedRecipe.items.map((item, index) => (
                            <tr
                              key={`${item.raw_material_id || index}-${index}`}
                              className="border-b border-[#EBE9F1]"
                            >
                              <td className="px-4 py-3 text-[14px] font-semibold text-[#2F2B3D]">
                                {item.material_name || "-"}
                              </td>
                              <td className="px-4 py-3 text-[14px] text-[#6F6B7D]">
                                {item.material_code || "-"}
                              </td>
                              <td className="px-4 py-3 text-right text-[14px] font-semibold text-[#2F2B3D]">
                                {item.qty_per_item || 0}
                              </td>
                              <td className="px-4 py-3 text-[14px] text-[#6F6B7D]">
                                {item.unit_name || "-"}
                              </td>
                              <td className="px-4 py-3 text-right text-[14px] text-[#EA5455]">
                                {item.waste_percentage || 0}%
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan="5"
                              className="px-4 py-10 text-center text-[14px] text-[#6F6B7D]"
                            >
                              No ingredients found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      closeModal();
                      navigate(`/recipes/edit/${selectedRecipe.id}`);
                    }}
                    className="flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[15px] font-semibold text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Edit2 size={18} />
                    Edit Recipe
                  </button>

                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-md bg-[#F3F2F7] px-5 py-2.5 text-[15px] font-semibold text-[#6F6B7D]"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipeList;
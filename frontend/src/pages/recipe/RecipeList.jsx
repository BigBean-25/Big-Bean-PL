import { useEffect, useMemo, useState } from "react";
import { Plus, Edit2, Eye, X, Search, Download, Loader2, RefreshCw, FileText, Package, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { recipeAPI, masterAPI } from "../../services/api";
import exportRecipeBOMToExcel from "../../utils/exportRecipeBOMToExcel";
import { getPrimaryColor, getThemeMode, getCardClass, getInputClass, StatusBadge } from "../../components/ui";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

const num = (value) => Number(value || 0);

const formatCurrency = (value) => {
  if (value === null || value === undefined || isNaN(value)) return "-";
  return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPercent = (value) => {
  if (value === null || value === undefined || isNaN(value)) return "-";
  return `${Number(value).toFixed(2)}%`;
};

const hasMissingCost = (recipe) => {
  const items = recipe?.items || [];
  return items.some((it) => it.raw_material_id && (it.rate == null || it.ingredient_cost == null));
};

export default function RecipeList() {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [outletFilter, setOutletFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardClass = getCardClass(isDark);
  const inputClass = getInputClass(isDark);
  const mutedClass = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainTextClass = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r, o, m, rm] = await Promise.all([recipeAPI.getRecipes(), masterAPI.getOutlets(), masterAPI.getMenuItems(), masterAPI.getRawMaterials()]);
      const getRows = (res) => res?.data?.data || res?.data || [];
      setRecipes(getRows(r));
      setOutlets(getRows(o));
      setMenuItems(getRows(m));
      setRawMaterials(getRows(rm));
    } catch (error) {
      toast.error("Failed to load recipes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const outletName = (id) => outlets.find((o) => Number(o.id) === Number(id))?.outlet_name || "All Outlets";
  const menuName = (id) => menuItems.find((m) => Number(m.id) === Number(id))?.item_name || "-";
  const rawMaterialName = (id) => rawMaterials.find((m) => Number(m.id) === Number(id))?.material_name || "-";
  const outputName = (r) => r.recipe_type === "Direct" ? menuName(r.menu_item_id) : rawMaterialName(r.output_raw_material_id);

  const categoryOptions = useMemo(() => [...new Set(recipes.map((r) => r.recipe_category).filter(Boolean))], [recipes]);

  const filtered = useMemo(() => {
    return recipes.filter((r) => {
      const text = `${r.recipe_name || ""} ${outputName(r)} ${r.recipe_category || ""} ${r.recipe_type || ""} ${r.status || ""}`.toLowerCase();
      return text.includes(searchTerm.toLowerCase())
        && (categoryFilter === "all" || String(r.recipe_category) === categoryFilter)
        && (statusFilter === "all" || String(r.status) === statusFilter)
        && (typeFilter === "all" || String(r.recipe_type) === typeFilter)
        && (outletFilter === "all" || String(r.for_outlet_id) === outletFilter);
    });
  }, [recipes, searchTerm, categoryFilter, statusFilter, typeFilter, outletFilter, menuItems]);

  const visible = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize]);

  const validCostRows = filtered.filter((r) => !hasMissingCost(r) && r.food_cost_percentage != null && r.food_cost_percentage !== "");

  const summary = useMemo(() => ({
    total: filtered.length,
    active: filtered.filter((r) => r.status === "Active").length,
    draft: filtered.filter((r) => r.status === "Draft").length,
    inactive: filtered.filter((r) => r.status === "Inactive").length,
    avgFoodCost: validCostRows.length ? validCostRows.reduce((sum, r) => sum + num(r.food_cost_percentage), 0) / validCostRows.length : null,
  }), [filtered]);

  const viewRecipe = async (id) => {
    setDetailsLoading(true);
    setShowModal(true);
    try {
      const res = await recipeAPI.getRecipe(id);
      setSelectedRecipe(res?.data?.data || res?.data || null);
    } catch (error) {
      toast.error("Failed to load recipe details");
      setShowModal(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeModal = () => { setShowModal(false); setSelectedRecipe(null); };

  const clearFilters = () => {
    setSearchTerm("");
    setCategoryFilter("all");
    setStatusFilter("all");
    setTypeFilter("all");
    setOutletFilter("all");
    setPageSize(10);
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete/archive recipe "${r.recipe_name}"?`)) return;
    try {
      await recipeAPI.deleteRecipe(r.id);
      toast.success("Recipe removed");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    }
  };

  const exportExcel = async () => {
    const activeFilters = [
      searchTerm ? `Search: ${searchTerm}` : "",
      categoryFilter !== "all" ? `Category: ${categoryFilter}` : "",
      statusFilter !== "all" ? `Status: ${statusFilter}` : "",
      typeFilter !== "all" ? `Type: ${typeFilter}` : "",
      outletFilter !== "all" ? `Outlet: ${outletName(outletFilter)}` : "",
    ].filter(Boolean).join(" | ");

    const enriched = filtered.map((r) => ({
      ...r,
      menu_output: outputName(r),
      outlet_name: outletName(r.for_outlet_id),
      hasMissingCost: hasMissingCost(r),
    }));

    const date = new Date().toISOString().split("T")[0];
    try {
      await exportRecipeBOMToExcel({
        filename: `Big_Bean_Cafe_Recipe_SOP_Report_${date}.xlsx`,
        recipes: enriched,
        outletLabel: outletFilter === "all" ? "All Outlets" : outletName(outletFilter),
        filters: activeFilters || "None",
      });
      toast.success("Recipe / SOP report exported");
    } catch (error) {
      toast.error("Export failed: " + (error.message || "Unknown"));
    }
  };

  return (
    <div className="space-y-5 p-1" style={{ fontFamily: '"Public Sans", "Inter", system-ui, sans-serif' }}>
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <h1 className={`text-2xl font-semibold ${mainTextClass}`}>Recipe / SOP Management</h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>Manage standardized recipes, production SOPs, costing and version control across outlets.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={fetchData} disabled={loading} className={`flex items-center gap-2 rounded-md border px-3.5 py-2 text-[14px] font-medium transition hover:opacity-90 disabled:opacity-60 ${cardClass}`}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
          </button>
          <button onClick={exportExcel} className={`flex items-center gap-2 rounded-md border px-3.5 py-2 text-[14px] font-medium transition hover:opacity-90 ${cardClass}`}>
            <Download size={16} /> Export Excel
          </button>
          <button onClick={() => navigate("/recipes/new")} className="flex items-center gap-2 rounded-md px-3.5 py-2 text-[14px] font-semibold text-white transition hover:opacity-90" style={{ backgroundColor: primaryColor }}>
            <Plus size={16} /> Create Recipe
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard title="Total Recipes" value={summary.total} icon={FileText} color={primaryColor} />
        <StatCard title="Active" value={summary.active} icon={CheckCircle2} color="#28C76F" />
        <StatCard title="Draft" value={summary.draft} icon={AlertCircle} color="#FF9F43" />
        <StatCard title="Inactive" value={summary.inactive} icon={Package} color="#00CFE8" />
        <StatCard title="Avg Food Cost %" value={summary.avgFoodCost != null ? `${summary.avgFoodCost.toFixed(2)}%` : "-"} icon={Clock} color="#EA5455" />
      </div>

      {/* Filter toolbar */}
      <div className={`rounded-md border p-4 shadow-sm ${cardClass}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A8AAAE]" size={16} />
            <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search recipe, menu item or output material..." className={`h-10 w-full rounded-md border pl-9 pr-3 text-[14px] outline-none ${inputClass}`} />
          </div>
          <Select value={categoryFilter} onChange={setCategoryFilter} options={[{ label: "All Categories", value: "all" }, ...categoryOptions.map((c) => ({ label: c, value: c }))]} inputClass={inputClass} />
          <Select value={statusFilter} onChange={setStatusFilter} options={[{ label: "All Status", value: "all" }, { label: "Draft", value: "Draft" }, { label: "Active", value: "Active" }, { label: "Inactive", value: "Inactive" }]} inputClass={inputClass} />
          <Select value={typeFilter} onChange={setTypeFilter} options={[{ label: "All Types", value: "all" }, { label: "Direct", value: "Direct" }, { label: "Batch", value: "Batch" }, { label: "Semi-Finished", value: "Semi-Finished" }, { label: "Production", value: "Production" }]} inputClass={inputClass} />
          <Select value={outletFilter} onChange={setOutletFilter} options={[{ label: "All Outlets", value: "all" }, ...outlets.map((o) => ({ label: o.outlet_name, value: String(o.id) }))]} inputClass={inputClass} />
          <Select value={String(pageSize)} onChange={(v) => setPageSize(Number(v))} options={[{ label: "10 rows", value: "10" }, { label: "25 rows", value: "25" }, { label: "50 rows", value: "50" }]} inputClass={inputClass} />
          <button onClick={clearFilters} className="flex items-center justify-center gap-2 rounded-md border px-3 text-[14px] font-medium transition hover:opacity-80" style={{ color: primaryColor, borderColor: `${primaryColor}66` }}>
            <X size={16} /> Clear
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={`rounded-md border shadow-sm ${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] border-collapse">
            <thead className={`sticky top-0 z-10 border-b ${isDark ? 'border-[#3B405A] bg-[#2F2B3D]' : 'border-[#EBE9F1] bg-[#F8F7FA]'}`}>
              <tr>
                {["Recipe","Menu / Output","Category","Outlet","Type","Yield","Ingredients","Recipe Cost","Selling Price","Food Cost %","Version","Status","Actions"].map((h, i) => (
                  <th key={h} className={`px-4 py-3.5 text-[12px] font-semibold uppercase tracking-wide ${isDark ? 'text-[#D0D2D6]' : 'text-[#2F2B3D]'} ${i >= 6 && i <= 10 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="13" className="py-12 text-center"><Loader2 className="mx-auto animate-spin" size={28} style={{ color: primaryColor }} /></td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan="13"><EmptyState isDark={isDark} onReset={clearFilters} /></td></tr>
              ) : visible.map((r) => {
                const missing = hasMissingCost(r);
                return (
                  <tr key={r.id} className={`border-b transition hover:bg-black/5 ${isDark ? 'border-[#3B405A]' : 'border-[#EBE9F1]'}`}>
                    <td className="px-4 py-3">
                      <p className={`font-semibold ${mainTextClass}`}>{r.recipe_name || "-"}</p>
                      {r.recipe_code && <p className={`text-[12px] ${mutedClass}`}>{r.recipe_code}</p>}
                    </td>
                    <td className="px-4 py-3 text-[14px]">{outputName(r)}</td>
                    <td className="px-4 py-3 text-[14px]">{r.recipe_category || "-"}</td>
                    <td className="px-4 py-3 text-[14px]">{outletName(r.for_outlet_id)}</td>
                    <td className="px-4 py-3"><TypeBadge type={r.recipe_type} isDark={isDark} /></td>
                    <td className="px-4 py-3 text-right text-[14px]">{r.yield_qty ?? "-"} <span className={mutedClass}>{r.yield_unit_name || ""}</span></td>
                    <td className="px-4 py-3 text-right text-[14px]">{r.items?.length || 0}</td>
                    <td className="px-4 py-3 text-right text-[14px] font-medium">{missing ? "-" : formatCurrency(r.total_recipe_cost)}</td>
                    <td className="px-4 py-3 text-right text-[14px]">{r.recipe_type === "Direct" ? formatCurrency(r.selling_price) : "N/A"}</td>
                    <td className="px-4 py-3 text-right text-[14px]">{missing ? "-" : formatPercent(r.food_cost_percentage)}</td>
                    <td className="px-4 py-3 text-right text-[14px]">v{r.version_no || 1}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status || "Draft"} /></td>
                    <td className="sticky right-0 z-0 px-4 py-3" style={{ backgroundColor: isDark ? "#2F2B3D" : "#fff" }}>
                      <div className="flex items-center justify-end gap-2">
                        <button title="Edit" onClick={() => navigate(`/recipes/edit/${r.id}`)} className="flex h-8 w-8 items-center justify-center rounded-md border bg-transparent transition hover:text-[#00A6B7]" style={{ borderColor: isDark ? "#3B405A" : "#EBE9F1" }}><Edit2 size={15} /></button>
                        <button title="View" onClick={() => viewRecipe(r.id)} className="flex h-8 w-8 items-center justify-center rounded-md border bg-transparent transition hover:text-[#7367F0]" style={{ borderColor: isDark ? "#3B405A" : "#EBE9F1" }}><Eye size={15} /></button>
                        <button title="Delete" onClick={() => handleDelete(r)} className="flex h-8 w-8 items-center justify-center rounded-md border bg-transparent transition hover:text-[#EA5455]" style={{ borderColor: isDark ? "#3B405A" : "#EBE9F1" }}><X size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={closeModal}>
          <div className={`max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-md border shadow-2xl ${cardClass}`} onClick={(e) => e.stopPropagation()}>
            {detailsLoading ? (
              <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin" size={32} style={{ color: primaryColor }} /></div>
            ) : selectedRecipe ? (
              <>
                <div className={`flex items-start justify-between border-b px-6 py-4 ${isDark ? 'border-[#3B405A]' : 'border-[#EBE9F1]'}`}>
                  <div>
                    <h2 className={`text-xl font-semibold ${mainTextClass}`}>{selectedRecipe.recipe_name || "Recipe Details"}</h2>
                    <p className={`mt-1 text-[14px] ${mutedClass}`}>{outputName(selectedRecipe)} <span className="mx-1">•</span> {selectedRecipe.recipe_type || "Direct"}</p>
                  </div>
                  <button onClick={closeModal} className="flex h-9 w-9 items-center justify-center rounded-md transition hover:bg-black/5"><X size={20} className={mutedClass} /></button>
                </div>
                <div className="max-h-[calc(92vh-140px)] overflow-y-auto p-6">
                  {(() => {
                    const missing = hasMissingCost(selectedRecipe);
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                          <Detail label="Recipe Type" value={selectedRecipe.recipe_type || "Direct"} isDark={isDark} />
                          <Detail label="Menu / Output" value={outputName(selectedRecipe)} isDark={isDark} />
                          <Detail label="Version" value={`v${selectedRecipe.version_no || 1}`} isDark={isDark} />
                          <Detail label="Outlet" value={outletName(selectedRecipe.for_outlet_id)} isDark={isDark} />
                          <Detail label="Yield" value={`${selectedRecipe.yield_qty ?? 1} ${selectedRecipe.yield_unit_name || ""}`} isDark={isDark} />
                          <Detail label="Status" value={<StatusBadge status={selectedRecipe.status || "Draft"} />} isDark={isDark} />
                          <Detail label="Recipe Cost" value={missing ? "-" : formatCurrency(selectedRecipe.total_recipe_cost)} isDark={isDark} />
                          <Detail label="Selling Price" value={selectedRecipe.recipe_type === "Direct" ? formatCurrency(selectedRecipe.selling_price) : "Not Applicable"} isDark={isDark} />
                          <Detail label="Food Cost %" value={missing ? "-" : formatPercent(selectedRecipe.food_cost_percentage)} isDark={isDark} />
                          <Detail label="Gross Margin %" value={missing ? "-" : formatPercent(selectedRecipe.gross_margin_percentage)} isDark={isDark} />
                        </div>
                        <div className="mt-6">
                          <h3 className={`text-base font-semibold ${mainTextClass}`}>Ingredients ({selectedRecipe.items?.length || 0})</h3>
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full min-w-[800px] border-collapse">
                              <thead className={`border-b ${isDark ? 'border-[#3B405A]' : 'border-[#EBE9F1]'}`}>
                                <tr>
                                  {["Material","Qty","UOM","Base Qty","Base UOM","Waste %","Rate","Cost","Notes"].map((h, i) => (
                                    <th key={h} className={`py-3 text-[11px] font-semibold uppercase tracking-wide ${i >= 5 && i <= 7 ? 'text-right' : 'text-left'} ${mutedClass}`}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {selectedRecipe.items?.map((it, idx) => (
                                  <tr key={idx} className={`border-b ${isDark ? 'border-[#3B405A]' : 'border-[#EBE9F1]'}`}>
                                    <td className="py-2.5 text-[14px]">{it.material_name || "-"}</td>
                                    <td className="py-2.5 text-right text-[14px]">{it.qty_per_item != null ? Number(it.qty_per_item).toFixed(4) : "-"}</td>
                                    <td className="py-2.5 text-[14px]">{it.recipe_unit_name || it.unit_name || "-"}</td>
                                    <td className="py-2.5 text-right text-[14px]">{it.base_qty != null ? Number(it.base_qty).toFixed(4) : "-"}</td>
                                    <td className="py-2.5 text-[14px]">{it.base_unit_name || "-"}</td>
                                    <td className="py-2.5 text-right text-[14px]">{it.waste_percentage != null ? Number(it.waste_percentage).toFixed(2) + "%" : "-"}</td>
                                    <td className="py-2.5 text-right text-[14px]">{it.rate != null ? formatCurrency(it.rate) : "-"}</td>
                                    <td className="py-2.5 text-right text-[14px]">{it.ingredient_cost != null ? formatCurrency(it.ingredient_cost) : "-"}</td>
                                    <td className="py-2.5 text-[14px] text-[#6F6B7D]">{it.notes || "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className={`flex justify-end border-t px-6 py-4 ${isDark ? 'border-[#3B405A]' : 'border-[#EBE9F1]'}`}>
                  <button onClick={() => { closeModal(); navigate(`/recipes/edit/${selectedRecipe.id}`); }} className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-semibold text-white" style={{ backgroundColor: primaryColor }}><Edit2 size={16} /> Edit</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }) {
  return (
    <div className="rounded-md border p-4 shadow-sm" style={{ borderColor: `${color}33` }}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${color}18` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div>
          <p className="text-[12px] font-medium text-[#6F6B7D]">{title}</p>
          <h3 className="text-xl font-bold text-[#2F2B3D]" style={{ color: "#2F2B3D" }}>{value}</h3>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, isDark }) {
  return (
    <div className={`rounded-md border p-3 ${isDark ? 'border-[#3B405A] bg-[#2F2B3D]/50' : 'border-[#EBE9F1] bg-[#F8F7FA]'}`}>
      <p className={`text-[11px] font-medium uppercase tracking-wide ${isDark ? 'text-[#A5A8B6]' : 'text-[#6F6B7D]'}`}>{label}</p>
      <p className={`mt-1 text-[15px] font-semibold ${isDark ? 'text-[#D0D2D6]' : 'text-[#2F2B3D]'}`}>{value || "-"}</p>
    </div>
  );
}

function Select({ value, onChange, options, inputClass }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`}>
      {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

function TypeBadge({ type, isDark }) {
  const styles = {
    Direct: "bg-[#7367F0]/12 text-[#7367F0] border-[#7367F0]/25",
    Batch: "bg-[#00A6B7]/12 text-[#00A6B7] border-[#00A6B7]/25",
    "Semi-Finished": "bg-[#FF9F43]/12 text-[#FF9F43] border-[#FF9F43]/25",
    Production: "bg-[#28C76F]/12 text-[#28C76F] border-[#28C76F]/25",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[12px] font-semibold ${styles[type] || (isDark ? "bg-[#3B405A] text-[#D0D2D6]" : "bg-[#F3F2F7] text-[#6F6B7D]")}`}>
      {type || "-"}
    </span>
  );
}

function EmptyState({ isDark, onReset }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <FileText size={40} className={isDark ? "text-[#3B405A]" : "text-[#EBE9F1]"} />
      <p className={`mt-3 text-base font-semibold ${isDark ? 'text-[#D0D2D6]' : 'text-[#2F2B3D]'}`}>No recipes found</p>
      <p className={`text-[14px] ${isDark ? 'text-[#A5A8B6]' : 'text-[#6F6B7D]'}`}>Try adjusting the selected filters.</p>
      <button onClick={onReset} className="mt-3 rounded-md px-3 py-1.5 text-[13px] font-medium text-white" style={{ backgroundColor: "#7367F0" }}>Clear filters</button>
    </div>
  );
}

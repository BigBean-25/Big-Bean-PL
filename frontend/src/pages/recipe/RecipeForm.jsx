import { useEffect, useMemo, useState, useCallback } from "react";
import { Plus, Trash2, Save, X, Loader2, RefreshCw, ArrowLeft, Package, Store, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { recipeAPI, masterAPI } from "../../services/api";
import { getPrimaryColor, getThemeMode, getCardClass, getInputClass } from "../../components/ui";
import toast from "react-hot-toast";
import { useNavigate, useParams, useOutletContext } from "react-router-dom";

const num = (value) => Number(value || 0);

const fmtDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const emptyHeader = () => ({
  recipe_name: "",
  menu_item_id: "",
  output_raw_material_id: "",
  recipe_category: "Beverages",
  recipe_type: "Direct",
  for_outlet_id: "",
  portion: "",
  yield_qty: "1",
  yield_unit_id: "",
  serving_size: "1",
  serving_unit_id: "",
  prep_time: "",
  cooking_time: "",
  finishing_time: "",
  effective_from: new Date().toISOString().split("T")[0],
  effective_to: "",
  status: "Draft",
  notes: "",
});

const emptyIngredient = () => ({
  raw_material_id: "",
  recipe_unit_id: "",
  qty_per_item: "",
  waste_percentage: "0",
  notes: "",
});

export default function RecipeForm() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [menuItems, setMenuItems] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [units, setUnits] = useState([]);

  const [formData, setFormData] = useState(emptyHeader);
  const [ingredients, setIngredients] = useState([emptyIngredient()]);

  const outletContext = useOutletContext() || {};
  const { selectedOutletId = "all" } = outletContext;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [activateOpen, setActivateOpen] = useState(false);
  const [activateDate, setActivateDate] = useState("");
  const [savingVersion, setSavingVersion] = useState(false);

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardClass = getCardClass(isDark);
  const inputClass = getInputClass(isDark);
  const mutedClass = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainTextClass = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  const fetchMasters = async () => {
    try {
      const [items, materials, outletsRes, unitsRes] = await Promise.all([
        masterAPI.getMenuItems(),
        masterAPI.getRawMaterials(),
        masterAPI.getOutlets(),
        masterAPI.getUnits(),
      ]);
      const getRows = (r) => r?.data?.data || r?.data || [];
      setMenuItems(getRows(items));
      setRawMaterials(getRows(materials));
      setOutlets(getRows(outletsRes));
      setUnits(getRows(unitsRes));
    } catch (error) {
      toast.error("Failed to load master data");
    }
  };

  const fetchRecipe = async () => {
    if (!id) return;
    try {
      const res = await recipeAPI.getRecipe(id);
      const r = res?.data?.data || res?.data || {};
      setFormData({
        recipe_name: r.recipe_name || "",
        menu_item_id: r.menu_item_id || "",
        output_raw_material_id: r.output_raw_material_id || "",
        recipe_category: r.recipe_category || "Beverages",
        recipe_type: r.recipe_type || "Direct",
        for_outlet_id: r.for_outlet_id || "",
        portion: r.portion || "",
        yield_qty: r.yield_qty ?? "1",
        yield_unit_id: r.yield_unit_id || "",
        serving_size: r.serving_size ?? "1",
        serving_unit_id: r.serving_unit_id || "",
        prep_time: r.prep_time || "",
        cooking_time: r.cooking_time || "",
        finishing_time: r.finishing_time || "",
        effective_from: r.effective_from || new Date().toISOString().split("T")[0],
        effective_to: r.effective_to || "",
        status: r.status || "Draft",
        notes: r.notes || "",
      });
      const mapped = (r.items || []).map((it) => ({
        raw_material_id: it.raw_material_id || "",
        recipe_unit_id: it.recipe_unit_id || it.unit_id || "",
        qty_per_item: it.qty_per_item ?? "",
        waste_percentage: it.waste_percentage ?? "0",
        notes: it.notes || "",
      }));
      setIngredients(mapped.length ? mapped : [emptyIngredient()]);
    } catch (error) {
      toast.error("Failed to load recipe");
      navigate("/recipes");
    }
  };

  const fetchInitialData = async () => {
    setLoading(true);
    await fetchMasters();
    if (id) await fetchRecipe();
    setLoading(false);
  };

  useEffect(() => { fetchInitialData(); }, [id]);
  useEffect(() => { if (id) fetchVersions(); }, [id]);

  const getMaterial = (mid) => rawMaterials.find((m) => Number(m.id) === Number(mid));
  const getUnit = (uid) => units.find((u) => Number(u.id) === Number(uid));

  const recalcRow = async (row) => {
    const material = getMaterial(row.raw_material_id);
    const inventoryUnitId = material?.unit_id || row.recipe_unit_id;
    const recipeUnitId = row.recipe_unit_id || inventoryUnitId;
    let factor = 1;
    if (recipeUnitId && inventoryUnitId && recipeUnitId !== inventoryUnitId) {
      try {
        const res = await recipeAPI.getUomConversion(recipeUnitId, inventoryUnitId);
        factor = res?.data?.data?.factor ?? null;
      } catch (error) {
        factor = null;
      }
    }
    const baseQty = factor !== null ? num(row.qty_per_item) * factor : null;
    const wastage = baseQty !== null ? baseQty * (num(row.waste_percentage) / 100) : 0;
    const netQty = baseQty !== null ? baseQty + wastage : null;
    let rate = null;
    if (baseQty !== null) {
      try {
        const res = await recipeAPI.getMaterialRate(row.raw_material_id, { outlet_id: formData.for_outlet_id });
        rate = res?.data?.data?.rate ?? null;
      } catch (error) {
        rate = null;
      }
    }
    const cost = netQty !== null && rate !== null ? netQty * rate : null;
    return {
      ...row,
      base_unit_id: inventoryUnitId,
      conversion_factor: factor,
      base_qty: baseQty,
      standard_wastage_qty: wastage,
      net_qty: netQty,
      rate,
      ingredient_cost: cost,
      inventory_unit_name: getUnit(inventoryUnitId)?.unit_name || "",
    };
  };

  useEffect(() => {
    if (selectedOutletId && selectedOutletId !== "all") {
      setFormData((prev) => ({ ...prev, for_outlet_id: String(selectedOutletId) }));
    }
  }, [selectedOutletId]);

  useEffect(() => {
    if (!ingredients.some((i) => i.raw_material_id)) return;
    let cancelled = false;
    const run = async () => {
      const recalculated = await Promise.all(ingredients.map((row) => recalcRow(row)));
      if (!cancelled) setIngredients(recalculated);
    };
    run();
    return () => { cancelled = true; };
  }, [formData.for_outlet_id, rawMaterials, units]);

  const validIngredients = useMemo(() => ingredients.filter((i) => i.raw_material_id && num(i.qty_per_item) > 0), [ingredients]);

  const totals = useMemo(() => {
    const selectedMenuItem = menuItems.find((m) => Number(m.id) === Number(formData.menu_item_id));
    const selectedYieldUnit = units.find((u) => Number(u.id) === Number(formData.yield_unit_id));
    const sellingPrice = num(selectedMenuItem?.selling_price);
    const yieldQty = num(formData.yield_qty) || 1;
    const hasMissingRate = ingredients.some(
      (row) => row.raw_material_id && (row.rate == null || row.ingredient_cost == null)
    );

    const totalBaseQty = validIngredients.reduce((sum, i) => sum + num(i.base_qty), 0);
    const totalWaste = validIngredients.reduce((sum, i) => sum + num(i.standard_wastage_qty), 0);

    if (validIngredients.length === 0) {
      return { totalCost: null, totalBaseQty: 0, totalWaste: 0, sellingPrice, foodCostPercent: null, grossMarginAmount: null, grossMarginPercent: null, costPerOutputUnit: null, yieldQty, yieldUnitName: selectedYieldUnit?.unit_name || "", hasMissingRate: false };
    }

    if (hasMissingRate) {
      return { totalCost: null, totalBaseQty, totalWaste, sellingPrice, foodCostPercent: null, grossMarginAmount: null, grossMarginPercent: null, costPerOutputUnit: null, yieldQty, yieldUnitName: selectedYieldUnit?.unit_name || "", hasMissingRate };
    }

    const totalCost = validIngredients.reduce((sum, i) => sum + num(i.ingredient_cost), 0);
    const foodCostPercent = sellingPrice > 0 ? (totalCost / sellingPrice) * 100 : null;
    const grossMarginAmount = sellingPrice - totalCost;
    const grossMarginPercent = sellingPrice > 0 ? (grossMarginAmount / sellingPrice) * 100 : null;
    const costPerOutputUnit = (formData.recipe_type !== "Direct" && yieldQty > 0) ? totalCost / yieldQty : null;
    return { totalCost, totalBaseQty, totalWaste, sellingPrice, foodCostPercent, grossMarginAmount, grossMarginPercent, costPerOutputUnit, yieldQty, yieldUnitName: selectedYieldUnit?.unit_name || "", hasMissingRate };
  }, [ingredients, validIngredients, menuItems, units, formData.menu_item_id, formData.yield_unit_id, formData.yield_qty, formData.recipe_type]);

  const addIngredient = () => setIngredients((prev) => [...prev, emptyIngredient()]);

  const removeIngredient = (index) => setIngredients((prev) => prev.filter((_, i) => i !== index));

  const updateIngredient = async (index, field, value) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    if (["raw_material_id", "recipe_unit_id", "qty_per_item", "waste_percentage"].includes(field)) {
      updated[index] = await recalcRow(updated[index]);
    }
    setIngredients(updated);
  };

  const fetchVersions = async () => {
    if (!id) return;
    setLoadingVersions(true);
    try {
      const res = await recipeAPI.getVersions(id);
      setVersions(res?.data?.data || []);
    } catch (error) {
      toast.error("Failed to load version history");
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleNewVersion = async () => {
    setSavingVersion(true);
    try {
      const res = await recipeAPI.createNewVersion(id);
      const newId = res?.data?.data?.id;
      toast.success("New version created");
      if (newId) navigate(`/recipes/edit/${newId}`);
      else fetchVersions();
    } catch (error) {
      toast.error(error.response?.data?.message || "Create version failed");
    } finally {
      setSavingVersion(false);
    }
  };

  const openActivate = () => {
    setActivateDate(formData.effective_from || new Date().toISOString().split("T")[0]);
    setActivateOpen(true);
  };

  const closeActivate = () => setActivateOpen(false);

  const handleActivate = async () => {
    if (!activateDate) return toast.error("Select effective from date");
    setSavingVersion(true);
    try {
      await recipeAPI.activateVersion(id, { effective_from: activateDate });
      toast.success("Version activated");
      setActivateOpen(false);
      await fetchRecipe();
      await fetchVersions();
    } catch (error) {
      const msg = error.response?.data?.message || "Activation failed";
      if (error.response?.status === 409) toast.error(`Overlap: ${msg}`);
      else toast.error(msg);
    } finally {
      setSavingVersion(false);
    }
  };

  const openSnapshot = (row) => {
    try {
      const data = typeof row.recipe_data === "string" ? JSON.parse(row.recipe_data) : row.recipe_data;
      setSnapshot(data);
    } catch (error) {
      setSnapshot(null);
    }
  };

  const closeSnapshot = () => setSnapshot(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formData.recipe_name.trim()) return toast.error("Enter recipe name");
    if (!formData.recipe_type) return toast.error("Select recipe type");
    if (formData.for_outlet_id === "all") return toast.error("Invalid outlet");
    if (validIngredients.length === 0) return toast.error("Add at least one valid ingredient");

    const isDirect = formData.recipe_type === "Direct";
    if (isDirect) {
      if (!formData.menu_item_id) return toast.error("Select menu item");
    } else {
      if (!formData.output_raw_material_id) return toast.error("Select output material");
      if (num(formData.yield_qty) <= 0) return toast.error("Yield quantity must be greater than 0");
      if (!formData.yield_unit_id) return toast.error("Select yield UOM");
    }

    const payload = {
      ...formData,
      menu_item_id: isDirect ? formData.menu_item_id : null,
      output_raw_material_id: isDirect ? null : formData.output_raw_material_id,
      for_outlet_id: formData.for_outlet_id || null,
      yield_qty: num(formData.yield_qty) || 1,
      serving_size: num(formData.serving_size) || (isDirect ? 1 : 1),
      prep_time: num(formData.prep_time),
      cooking_time: num(formData.cooking_time),
      finishing_time: num(formData.finishing_time),
      items: validIngredients.map((it) => ({
        raw_material_id: it.raw_material_id,
        recipe_unit_id: it.recipe_unit_id || getMaterial(it.raw_material_id)?.unit_id,
        qty_per_item: num(it.qty_per_item),
        waste_percentage: num(it.waste_percentage),
        notes: it.notes || "",
      })),
    };

    setSaving(true);
    try {
      if (id) {
        await recipeAPI.updateRecipe(id, payload);
        toast.success("Recipe updated");
      } else {
        await recipeAPI.createRecipe(payload);
        toast.success("Recipe created");
      }
      navigate("/recipes");
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="text-center">
          <Loader2 size={38} className="mx-auto animate-spin" style={{ color: primaryColor }} />
          <p className={`mt-3 text-[15px] ${mutedClass}`}>Loading recipe form...</p>
        </div>
      </div>
    );
  }

  const sectionTitle = (text) => (
    <h3 className={`mb-4 text-[18px] font-semibold ${mainTextClass}`}>{text}</h3>
  );

  const fieldLabel = (text, required = false) => (
    <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
      {text} {required && <span className="text-[#EA5455]">*</span>}
    </label>
  );

  return (
    <div className="space-y-6 p-1" style={{ fontFamily: '"Public Sans", "Inter", system-ui, sans-serif' }}>
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <h1 className={`text-2xl font-semibold ${mainTextClass}`}>{id ? "Edit Recipe" : "Add Recipe"}</h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>Create or modify recipe / SOP for café menu items.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={fetchInitialData} className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}>
            <RefreshCw size={18} /> Refresh
          </button>
          <button onClick={() => navigate("/recipes")} className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}>
            <ArrowLeft size={18} /> Back
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className={`rounded-md border p-6 shadow-sm ${cardClass}`}>
          {sectionTitle("A. Recipe Information")}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              {fieldLabel("Recipe Name", true)}
              <input type="text" value={formData.recipe_name} onChange={(e) => setFormData({ ...formData, recipe_name: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`} placeholder="e.g. Standard Cappuccino" />
            </div>
            {formData.recipe_type === "Direct" ? (
              <div>
                {fieldLabel("Menu Item", true)}
                <select value={formData.menu_item_id} onChange={(e) => setFormData({ ...formData, menu_item_id: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}>
                  <option value="">Select Menu Item</option>
                  {menuItems.map((m) => (<option key={m.id} value={m.id}>{m.item_name}</option>))}
                </select>
              </div>
            ) : (
              <div>
                {fieldLabel("Output Material", true)}
                <select value={formData.output_raw_material_id} onChange={(e) => setFormData({ ...formData, output_raw_material_id: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}>
                  <option value="">Select Output Material</option>
                  {rawMaterials.map((m) => (<option key={m.id} value={m.id}>{m.material_code} — {m.material_name} ({getUnit(m.unit_id)?.unit_name || '-'})</option>))}
                </select>
              </div>
            )}
            <div>
              {fieldLabel("Category", true)}
              <select value={formData.recipe_category} onChange={(e) => setFormData({ ...formData, recipe_category: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}>
                {["Beverages","Food","Desserts","Snacks","Bakery","Breakfast"].map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div>
              {fieldLabel("Recipe Type", true)}
              <select value={formData.recipe_type} onChange={(e) => setFormData({ ...formData, recipe_type: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}>
                {["Direct","Batch","Semi-Finished","Production"].map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
            <div>
              {fieldLabel("Outlet / Location")}
              <select value={formData.for_outlet_id} onChange={(e) => setFormData({ ...formData, for_outlet_id: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}>
                <option value="">All Outlets</option>
                {outlets.map((o) => (<option key={o.id} value={o.id}>{o.outlet_name}</option>))}
              </select>
            </div>
            <div>
              {fieldLabel("Effective From", true)}
              <input type="date" value={formData.effective_from} onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`} />
            </div>
            <div>
              {fieldLabel("Effective To")}
              <input type="date" value={formData.effective_to} onChange={(e) => setFormData({ ...formData, effective_to: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`} />
            </div>
            <div>
              {fieldLabel("Status", true)}
              <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}>
                {["Draft","Active","Inactive"].map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
          </div>
        </div>

        <div className={`rounded-md border p-6 shadow-sm ${cardClass}`}>
          {sectionTitle("B. Yield / Output")}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              {fieldLabel("Yield Quantity")}
              <input type="number" step="0.001" min="0" value={formData.yield_qty} onChange={(e) => setFormData({ ...formData, yield_qty: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`} />
            </div>
            <div>
              {fieldLabel("Yield UOM")}
              <select value={formData.yield_unit_id} onChange={(e) => setFormData({ ...formData, yield_unit_id: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}>
                <option value="">Select UOM</option>
                {units.map((u) => (<option key={u.id} value={u.id}>{u.unit_name}</option>))}
              </select>
            </div>
            <div>
              {fieldLabel("Serving Size")}
              <input type="number" step="0.001" min="0" value={formData.serving_size} onChange={(e) => setFormData({ ...formData, serving_size: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`} />
            </div>
            <div>
              {fieldLabel("Serving UOM")}
              <select value={formData.serving_unit_id} onChange={(e) => setFormData({ ...formData, serving_unit_id: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}>
                <option value="">Select UOM</option>
                {units.map((u) => (<option key={u.id} value={u.id}>{u.unit_name}</option>))}
              </select>
            </div>
            <div>
              {fieldLabel("Prep Time (min)")}
              <input type="number" min="0" value={formData.prep_time} onChange={(e) => setFormData({ ...formData, prep_time: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`} />
            </div>
            <div>
              {fieldLabel("Cooking Time (min)")}
              <input type="number" min="0" value={formData.cooking_time} onChange={(e) => setFormData({ ...formData, cooking_time: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`} />
            </div>
            <div>
              {fieldLabel("Finishing Time (min)")}
              <input type="number" min="0" value={formData.finishing_time} onChange={(e) => setFormData({ ...formData, finishing_time: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`} />
            </div>
            <div>
              {fieldLabel("Portion")}
              <input type="text" value={formData.portion} onChange={(e) => setFormData({ ...formData, portion: e.target.value })} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`} placeholder="e.g. 1 Cup" />
            </div>
          </div>
        </div>

        <div className={`rounded-md border p-6 shadow-sm ${cardClass}`}>
          <div className="mb-4 flex items-center justify-between">
            {sectionTitle("C. Ingredients")}
            <button type="button" onClick={addIngredient} className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white" style={{ backgroundColor: primaryColor }}>
              <Plus size={18} /> Add Ingredient
            </button>
          </div>
          {ingredients.some((r) => r.raw_material_id && r.rate === null) && (
            <div className="mb-4 flex items-start gap-3 rounded-md border border-[#FF9F43]/40 bg-[#FFF4E5] p-3 text-[14px]">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-[#FF9F43]" />
              <div>
                <p className="font-semibold text-[#2F2B3D]">Material rate unavailable</p>
                <p className="text-[#6F6B7D]">One or more ingredients do not have an applicable approved rate for the selected outlet and effective date.</p>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className={`border-b ${isDark ? 'border-[#3B405A]' : 'border-[#EBE9F1]'}`}>
                  <th className="py-2 pr-3 text-left text-[12px] font-semibold uppercase text-[#A8AAAE]">Material</th>
                  <th className="py-2 pr-3 text-left text-[12px] font-semibold uppercase text-[#A8AAAE]">Recipe UOM</th>
                  <th className="py-2 pr-3 text-left text-[12px] font-semibold uppercase text-[#A8AAAE]">Qty</th>
                  <th className="py-2 pr-3 text-left text-[12px] font-semibold uppercase text-[#A8AAAE]">Conv.</th>
                  <th className="py-2 pr-3 text-left text-[12px] font-semibold uppercase text-[#A8AAAE]">Base UOM</th>
                  <th className="py-2 pr-3 text-left text-[12px] font-semibold uppercase text-[#A8AAAE]">Base Qty</th>
                  <th className="py-2 pr-3 text-left text-[12px] font-semibold uppercase text-[#A8AAAE]">Waste %</th>
                  <th className="py-2 pr-3 text-left text-[12px] font-semibold uppercase text-[#A8AAAE]">Rate</th>
                  <th className="py-2 pr-3 text-left text-[12px] font-semibold uppercase text-[#A8AAAE]">Cost</th>
                  <th className="py-2 pr-3 text-left text-[12px] font-semibold uppercase text-[#A8AAAE]">Notes</th>
                  <th className="py-2 pr-3 text-left text-[12px] font-semibold uppercase text-[#A8AAAE]">Action</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((row, idx) => {
                  const material = getMaterial(row.raw_material_id);
                  return (
                    <tr key={idx} className={`border-b ${isDark ? 'border-[#3B405A]' : 'border-[#EBE9F1]'}`}>
                      <td className="py-2 pr-3">
                        <select value={row.raw_material_id} onChange={(e) => updateIngredient(idx, "raw_material_id", e.target.value)} className={`h-10 w-full rounded-md border px-2 text-[14px] outline-none ${inputClass}`}>
                          <option value="">Select</option>
                          {rawMaterials.map((m) => (<option key={m.id} value={m.id}>{m.material_name}</option>))}
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <select value={row.recipe_unit_id} onChange={(e) => updateIngredient(idx, "recipe_unit_id", e.target.value)} className={`h-10 w-full rounded-md border px-2 text-[14px] outline-none ${inputClass}`}>
                          <option value="">Select</option>
                          {units.map((u) => (<option key={u.id} value={u.id}>{u.unit_name}</option>))}
                        </select>
                      </td>
                      <td className="py-2 pr-3"><input type="number" step="0.001" min="0" value={row.qty_per_item} onChange={(e) => updateIngredient(idx, "qty_per_item", e.target.value)} className={`h-10 w-24 rounded-md border px-2 text-[14px] outline-none ${inputClass}`} /></td>
                      <td className="py-2 pr-3 text-[13px]" title="Conversion factor to base UOM">{!row.raw_material_id ? "-" : (Number.isFinite(Number(row.conversion_factor)) ? Number(row.conversion_factor).toFixed(6) : "-")}</td>
                      <td className="py-2 pr-3 text-[13px]">{!row.raw_material_id ? "-" : (row.inventory_unit_name || getUnit(material?.unit_id)?.unit_name || "-")}</td>
                      <td className="py-2 pr-3 text-[13px]">{!row.raw_material_id ? "-" : (Number.isFinite(Number(row.base_qty)) ? Number(row.base_qty).toFixed(4) : "-")}</td>
                      <td className="py-2 pr-3"><input type="number" step="0.1" min="0" value={row.waste_percentage} onChange={(e) => updateIngredient(idx, "waste_percentage", e.target.value)} className={`h-10 w-20 rounded-md border px-2 text-[14px] outline-none ${inputClass}`} /></td>
                      <td className="py-2 pr-3 text-[13px]">
                        {!row.raw_material_id ? "-" : (row.rate != null && Number.isFinite(Number(row.rate)) ? `₹${Number(row.rate).toFixed(4)}` : (
                          <span className="rounded bg-[#FFF4E5] px-2 py-0.5 text-[12px] text-[#FF9F43]">Not Set</span>
                        ))}
                      </td>
                      <td className="py-2 pr-3 text-[13px]">
                        {!row.raw_material_id ? "-" : (row.ingredient_cost != null && Number.isFinite(Number(row.ingredient_cost)) ? `₹${Number(row.ingredient_cost).toFixed(4)}` : (
                          <span className="rounded bg-[#FCEAEA] px-2 py-0.5 text-[12px] text-[#EA5455]">Not Available</span>
                        ))}
                      </td>
                      <td className="py-2 pr-3"><input type="text" value={row.notes} onChange={(e) => updateIngredient(idx, "notes", e.target.value)} className={`h-10 w-32 rounded-md border px-2 text-[14px] outline-none ${inputClass}`} placeholder="Notes" /></td>
                      <td className="py-2 pr-3"><button type="button" onClick={() => removeIngredient(idx)} disabled={ingredients.length === 1} className="flex h-10 w-10 items-center justify-center rounded-md bg-[#FCEAEA] text-[#EA5455] disabled:opacity-50"><Trash2 size={16} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`rounded-md border p-6 shadow-sm ${cardClass}`}>
          {sectionTitle("D. Cost Summary")}
          {formData.recipe_type === "Direct" ? (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard label="Raw Material Cost" value={Number.isFinite(totals.totalCost) ? `₹${totals.totalCost.toFixed(4)}` : "-"} icon={Package} color={primaryColor} />
                <StatCard label="Standard Wastage" value={Number.isFinite(totals.totalWaste) && totals.totalWaste !== 0 ? totals.totalWaste.toFixed(4) : "-"} icon={AlertCircle} color="#FF9F43" />
                <StatCard label="Selling Price" value={Number.isFinite(totals.sellingPrice) && totals.sellingPrice ? `₹${totals.sellingPrice.toFixed(2)}` : "-"} icon={CheckCircle2} color="#28C76F" />
                <StatCard label="Food Cost %" value={Number.isFinite(totals.foodCostPercent) ? `${totals.foodCostPercent.toFixed(2)}%` : "-"} icon={Clock} color="#EA5455" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className={`rounded-md p-4 ${isDark ? 'bg-[#25293C]' : 'bg-[#F8F7FA]'}`}>
                  <p className="text-[13px] text-[#6F6B7D]">Gross Margin</p>
                  <p className="mt-1 text-[18px] font-semibold">{Number.isFinite(totals.grossMarginAmount) ? `₹${totals.grossMarginAmount.toFixed(2)}` : "-"}</p>
                </div>
                <div className={`rounded-md p-4 ${isDark ? 'bg-[#25293C]' : 'bg-[#F8F7FA]'}`}>
                  <p className="text-[13px] text-[#6F6B7D]">Gross Margin %</p>
                  <p className="mt-1 text-[18px] font-semibold">{Number.isFinite(totals.grossMarginPercent) ? `${totals.grossMarginPercent.toFixed(2)}%` : "-"}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Total SOP Cost" value={Number.isFinite(totals.totalCost) ? `₹${totals.totalCost.toFixed(4)}` : "-"} icon={Package} color={primaryColor} />
              <StatCard label="Expected Yield" value={totals.yieldQty ? `${totals.yieldQty} ${totals.yieldUnitName}` : "-"} icon={CheckCircle2} color="#28C76F" />
              <StatCard label="Cost per Output Unit" value={Number.isFinite(totals.costPerOutputUnit) ? `₹${totals.costPerOutputUnit.toFixed(4)}` : "-"} icon={Clock} color="#EA5455" />
              <StatCard label="Standard Wastage" value={Number.isFinite(totals.totalWaste) && totals.totalWaste !== 0 ? totals.totalWaste.toFixed(4) : "-"} icon={AlertCircle} color="#FF9F43" />
            </div>
          )}
        </div>

        <div className={`rounded-md border p-6 shadow-sm ${cardClass}`}>
          {sectionTitle("E. Notes / Instructions")}
          <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className={`h-28 w-full rounded-md border p-4 text-[14px] outline-none ${inputClass}`} placeholder="Preparation method, process notes, storage instructions or internal production guidance..." />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 rounded-md px-5 py-3 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70" style={{ backgroundColor: primaryColor }}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? (id ? "Updating..." : "Creating...") : (id ? "Update Recipe" : "Create Recipe")}
          </button>
          <button type="button" onClick={() => navigate("/recipes")} className={`rounded-md border px-5 py-3 text-[15px] font-medium ${cardClass}`}>Cancel</button>
        </div>
      </form>

      {id && (
        <div className={`rounded-md border p-6 shadow-sm ${cardClass}`}>
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            {sectionTitle("F. Version History")}
            {formData.status !== "Draft" && (
              <button type='button' onClick={handleNewVersion} disabled={savingVersion} className='flex items-center gap-2 rounded-md px-4 py-2 text-[14px] font-semibold text-white' style={{ backgroundColor: primaryColor }}>
                {savingVersion ? <Loader2 size={16} className='animate-spin' /> : <Plus size={16} />}
                Create New Version
              </button>
            )}
          </div>
          {loadingVersions ? (
            <div className='flex items-center gap-2 py-4'><Loader2 size={18} className='animate-spin' style={{ color: primaryColor }} /> <span className={mutedClass}>Loading versions...</span></div>
          ) : versions.length === 0 ? (
            <p className={mutedClass}>No historical snapshots yet.</p>
          ) : (
            <div className='overflow-x-auto rounded-md border' style={{ borderColor: isDark ? "#3B405A" : "#EBE9F1" }}>
              <table className='w-full min-w-[700px] border-collapse'>
                <thead className={`sticky top-0 z-10 border-b ${isDark ? 'bg-[#25293C] border-[#3B405A]' : 'bg-[#F8F7FA] border-[#EBE9F1]'}`}>
                  <tr>
                    <th className='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#A8AAAE]'>Version</th>
                    <th className='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#A8AAAE]'>Effective From</th>
                    <th className='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#A8AAAE]'>Effective To</th>
                    <th className='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#A8AAAE]'>Status</th>
                    <th className='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#A8AAAE]'>Created By</th>
                    <th className='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#A8AAAE]'>Created At</th>
                    <th className='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#A8AAAE]'>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => {
                    const isCurrent = !!v.is_current;
                    const canActivate = isCurrent && (v.status === "Draft" || formData.status === "Draft");
                    return (
                      <tr key={v.id} className={`border-b transition hover:bg-black/5 ${isDark ? 'border-[#3B405A]' : 'border-[#EBE9F1]'}`}>
                        <td className='px-4 py-3 text-[14px] font-medium'>
                          V{v.version_no}
                          {isCurrent && <span className='ml-2 inline-flex items-center rounded-full bg-[#28C76F]/15 px-2 py-0.5 text-[11px] font-bold text-[#28C76F]'>Current</span>}
                        </td>
                        <td className='px-4 py-3 text-[14px]'>{fmtDate(v.effective_from)}</td>
                        <td className='px-4 py-3 text-[14px]'>{fmtDate(v.effective_to)}</td>
                        <td className='px-4 py-3 text-[14px]'>{v.status || "Active"}</td>
                        <td className='px-4 py-3 text-[14px]'>{v.created_by_name || "-"}</td>
                        <td className='px-4 py-3 text-[14px]'>{fmtDate(v.created_at)}</td>
                        <td className='px-4 py-3'>
                          <div className='flex flex-wrap gap-2'>
                            {v.recipe_data && (
                              <button type='button' onClick={() => openSnapshot(v)} className='flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] font-medium' style={{ color: primaryColor, borderColor: primaryColor }}><Store size={14} /> View Snapshot</button>
                            )}
                            {canActivate && (
                              <button type='button' onClick={openActivate} className='flex items-center gap-1.5 rounded-md bg-[#28C76F] px-2.5 py-1.5 text-[13px] font-semibold text-white'><CheckCircle2 size={14} /> Activate</button>
                            )}
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
      )}

      {snapshot && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'>
          <div className={`w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-md border shadow-2xl ${cardClass}`}>
            <div className={`flex items-center justify-between border-b px-6 py-4 ${isDark ? 'border-[#3B405A]' : 'border-[#EBE9F1]'}`}>
              <div>
                <h3 className={`text-lg font-semibold ${mainTextClass}`}>Version Snapshot</h3>
                <p className={`mt-0.5 text-[14px] ${mutedClass}`}>{snapshot.recipe_name}</p>
              </div>
              <button type='button' onClick={closeSnapshot} className='flex h-9 w-9 items-center justify-center rounded-md transition hover:bg-black/5'><X size={20} className={mutedClass} /></button>
            </div>
            <div className='max-h-[calc(90vh-130px)] overflow-y-auto p-6'>
              <div className='mb-5 grid grid-cols-2 gap-3 text-[14px]'>
                <DetailRow label="Menu / Output" value={menuItems.find((m) => Number(m.id) === Number(snapshot.menu_item_id))?.item_name || rawMaterials.find((rm) => Number(rm.id) === Number(snapshot.output_raw_material_id))?.material_name || "-"} muted={mutedClass} main={mainTextClass} />
                <DetailRow label="Recipe Type" value={snapshot.recipe_type} muted={mutedClass} main={mainTextClass} />
                <DetailRow label="Outlet" value={outlets.find((o) => Number(o.id) === Number(snapshot.for_outlet_id))?.outlet_name || "All Outlets"} muted={mutedClass} main={mainTextClass} />
                <DetailRow label="Version" value={`V${snapshot.version_no}`} muted={mutedClass} main={mainTextClass} />
                <DetailRow label="Effective From" value={fmtDate(snapshot.effective_from)} muted={mutedClass} main={mainTextClass} />
                <DetailRow label="Effective To" value={fmtDate(snapshot.effective_to)} muted={mutedClass} main={mainTextClass} />
                <DetailRow label="Yield" value={`${snapshot.yield_qty || "-"} ${units.find((u) => Number(u.id) === Number(snapshot.yield_unit_id))?.unit_name || ""}`} muted={mutedClass} main={mainTextClass} />
              </div>
              <h4 className={`mb-2 text-[15px] font-semibold ${mainTextClass}`}>Ingredients</h4>
              <div className='overflow-x-auto rounded-md border' style={{ borderColor: isDark ? "#3B405A" : "#EBE9F1" }}>
                <table className='w-full min-w-[700px] border-collapse'>
                  <thead className={`sticky top-0 z-10 border-b ${isDark ? 'bg-[#25293C] border-[#3B405A]' : 'bg-[#F8F7FA] border-[#EBE9F1]'}`}>
                    <tr>
                      <th className='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#A8AAAE]'>Material</th>
                      <th className='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#A8AAAE]'>Recipe Qty</th>
                      <th className='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#A8AAAE]'>Recipe UOM</th>
                      <th className='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#A8AAAE]'>Base Qty</th>
                      <th className='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#A8AAAE]'>Base UOM</th>
                      <th className='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#A8AAAE]'>Waste %</th>
                      <th className='px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#A8AAAE]'>Net Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(snapshot.items || []).map((it, idx) => (
                      <tr key={idx} className={`border-b transition hover:bg-black/5 ${isDark ? 'border-[#3B405A]' : 'border-[#EBE9F1]'}`}>
                        <td className='px-4 py-2.5 text-[14px]'>{getMaterial(it.raw_material_id)?.material_name || "-"}</td>
                        <td className='px-4 py-2.5 text-[14px]'>{it.qty_per_item}</td>
                        <td className='px-4 py-2.5 text-[14px]'>{getUnit(it.recipe_unit_id)?.unit_name || "-"}</td>
                        <td className='px-4 py-2.5 text-[14px]'>{Number.isFinite(Number(it.base_qty)) ? Number(it.base_qty).toFixed(4) : "-"}</td>
                        <td className='px-4 py-2.5 text-[14px]'>{getUnit(it.base_unit_id)?.unit_name || "-"}</td>
                        <td className='px-4 py-2.5 text-[14px]'>{it.waste_percentage}</td>
                        <td className='px-4 py-2.5 text-[14px]'>{Number.isFinite(Number(it.net_qty)) ? Number(it.net_qty).toFixed(4) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className='mt-5 flex justify-end'>
                <button type='button' onClick={closeSnapshot} className='rounded-md border px-4 py-2 text-[14px] font-medium' style={{ color: primaryColor, borderColor: primaryColor }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activateOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
          <div className={`w-full max-w-md rounded-lg border p-6 shadow-lg ${cardClass}`}>
            <h3 className={`mb-4 text-lg font-semibold ${mainTextClass}`}>Activate Version</h3>
            <p className={`mb-4 text-[14px] ${mutedClass}`}>Activating will close the previous active version to the day before.</p>
            <div className='mb-4'>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>Effective From</label>
              <input type='date' value={activateDate} onChange={(e) => setActivateDate(e.target.value)} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`} />
            </div>
            <div className='flex justify-end gap-3'>
              <button type='button' onClick={closeActivate} className='rounded-md border px-4 py-2 text-[14px] font-medium' style={{ color: primaryColor, borderColor: primaryColor }}>Cancel</button>
              <button type='button' onClick={handleActivate} disabled={savingVersion} className='flex items-center gap-2 rounded-md px-4 py-2 text-[14px] font-semibold text-white' style={{ backgroundColor: primaryColor }}>
                {savingVersion ? <Loader2 size={16} className='animate-spin' /> : <CheckCircle2 size={16} />}
                Activate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, muted, main }) {
  return (
    <div className={`rounded-md border p-3 ${main}`} style={{ borderColor: "#EBE9F1" }}>
      <p className={`text-[11px] font-medium uppercase tracking-wide ${muted}`}>{label}</p>
      <p className="mt-1 text-[15px] font-semibold">{value || "-"}</p>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="rounded-md border p-4 shadow-sm" style={{ borderColor: `${color}33` }}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${color}18` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div>
          <p className="text-[12px] font-medium text-[#6F6B7D]">{label}</p>
          <p className="text-[18px] font-bold text-[#2F2B3D]" style={{ color: "#2F2B3D" }}>{value}</p>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Save,
  X,
  Loader2,
  RefreshCw,
  Package,
  Store,
  Clock,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { recipeAPI, masterAPI } from "../../services/api";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";

const getRows = (response) => {
  const data = response?.data?.data || response?.data || [];
  return Array.isArray(data) ? data : [];
};

const num = (value) => Number(value || 0);

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

const getPrimaryColor = () => {
  try {
    return localStorage.getItem("bbc_primary_color") || "#7367F0";
  } catch {
    return "#7367F0";
  }
};

const emptyHeader = () => ({
  menu_item_id: "",
  recipe_category: "Beverages",
  for_outlet_id: "",
  portion: "",
  prep_time: "",
  cooking_time: "",
  finishing_time: "",
  status: "Active",
});

const emptyIngredient = () => ({
  material_id: "",
  quantity: "",
  waste_percent: "0",
  unit_id: "",
});

const RecipeForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [menuItems, setMenuItems] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [outlets, setOutlets] = useState([]);

  const [formData, setFormData] = useState(emptyHeader);
  const [ingredients, setIngredients] = useState([emptyIngredient()]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    fetchInitialData();
  }, [id]);

  const fetchInitialData = async () => {
    setLoading(true);

    try {
      await fetchMasters();

      if (id) {
        await fetchRecipe();
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchMasters = async () => {
    try {
      const [itemsRes, materialsRes, outletsRes] = await Promise.all([
        masterAPI.getMenuItems(),
        masterAPI.getRawMaterials(),
        masterAPI.getOutlets(),
      ]);

      setMenuItems(getRows(itemsRes));
      setRawMaterials(getRows(materialsRes));
      setOutlets(getRows(outletsRes));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch master data");
    }
  };

  const fetchRecipe = async () => {
    try {
      const response = await recipeAPI.getRecipe(id);
      const recipe = response?.data?.data || response?.data || {};

      setFormData({
        menu_item_id: recipe.menu_item_id || "",
        recipe_category: recipe.recipe_category || "Beverages",
        for_outlet_id: recipe.for_outlet_id || "",
        portion: recipe.portion || "",
        prep_time: recipe.prep_time || "",
        cooking_time: recipe.cooking_time || "",
        finishing_time: recipe.finishing_time || "",
        status: recipe.status || "Active",
      });

      const recipeItems = Array.isArray(recipe.items) ? recipe.items : [];

      if (recipeItems.length > 0) {
        setIngredients(
          recipeItems.map((item) => ({
            material_id: item.raw_material_id || item.material_id || "",
            quantity: item.qty_per_item || item.quantity || "",
            waste_percent: item.waste_percentage || item.waste_percent || "0",
            unit_id: item.unit_id || "",
          }))
        );
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch recipe");
    }
  };

  const selectedMenuItem = useMemo(() => {
    return menuItems.find((item) => Number(item.id) === Number(formData.menu_item_id));
  }, [menuItems, formData.menu_item_id]);

  const selectedOutlet = useMemo(() => {
    return outlets.find((outlet) => Number(outlet.id) === Number(formData.for_outlet_id));
  }, [outlets, formData.for_outlet_id]);

  const validIngredients = useMemo(() => {
    return ingredients.filter((item) => item.material_id && num(item.quantity) > 0);
  }, [ingredients]);

  const totalTime = useMemo(() => {
    return num(formData.prep_time) + num(formData.cooking_time) + num(formData.finishing_time);
  }, [formData.prep_time, formData.cooking_time, formData.finishing_time]);

  const totalQty = useMemo(() => {
    return validIngredients.reduce((sum, item) => sum + num(item.quantity), 0);
  }, [validIngredients]);

  const totalWasteQty = useMemo(() => {
    return validIngredients.reduce((sum, item) => {
      return sum + (num(item.quantity) * num(item.waste_percent)) / 100;
    }, 0);
  }, [validIngredients]);

  const getMaterial = (materialId) => {
    return rawMaterials.find((material) => Number(material.id) === Number(materialId));
  };

  const getMaterialUnitName = (ingredient) => {
    const material = getMaterial(ingredient.material_id);
    return material?.unit_name || material?.default_unit_name || material?.unit || "Unit";
  };

  const addIngredient = () => {
    setIngredients((prev) => [...prev, emptyIngredient()]);
  };

  const removeIngredient = (index) => {
    setIngredients((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const updateIngredient = (index, field, value) => {
    setIngredients((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
      };

      if (field === "material_id") {
        const material = getMaterial(value);

        updated[index].unit_id =
          material?.default_unit_id || material?.unit_id || material?.unit || "";
      }

      return updated;
    });
  };

  const resetForm = () => {
    setFormData(emptyHeader());
    setIngredients([emptyIngredient()]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.menu_item_id) {
      toast.error("Please select menu item");
      return;
    }

    if (!formData.portion.trim()) {
      toast.error("Please enter portion");
      return;
    }

    if (validIngredients.length === 0) {
      toast.error("Please add at least one valid ingredient");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        menu_item_id: formData.menu_item_id,
        recipe_category: formData.recipe_category,
        for_outlet_id: formData.for_outlet_id || null,
        portion: formData.portion.trim(),
        prep_time: num(formData.prep_time),
        cooking_time: num(formData.cooking_time),
        finishing_time: num(formData.finishing_time),
        status: formData.status,
        items: validIngredients.map((ingredient) => ({
          raw_material_id: ingredient.material_id,
          qty_per_item: num(ingredient.quantity),
          unit_id: ingredient.unit_id || null,
          waste_percentage: num(ingredient.waste_percent),
          extra_cost: 0,
          remarks: "",
        })),
      };

      if (id) {
        await recipeAPI.updateRecipe(id, payload);
        toast.success("Recipe updated successfully");
      } else {
        await recipeAPI.createRecipe(payload);
        toast.success("Recipe created successfully");
      }

      navigate("/recipe");
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setSaving(false);
    }
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

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="text-center">
          <Loader2
            size={38}
            className="mx-auto animate-spin"
            style={{ color: primaryColor }}
          />
          <p className={`mt-3 text-[15px] ${mutedClass}`}>Loading recipe form...</p>
        </div>
      </div>
    );
  }

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
            {id ? "Edit Recipe" : "Add Recipe"}
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Create or modify recipe / BOM for café menu items.
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
            onClick={() => navigate("/recipe")}
            className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
          >
            <ArrowLeft size={18} />
            Back
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Menu Item"
          value={selectedMenuItem?.item_name || "-"}
          subtitle="Selected recipe product"
          icon={Package}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />

        <StatCard
          title="Outlet"
          value={selectedOutlet?.outlet_name || "All Outlets"}
          subtitle="Recipe availability"
          icon={Store}
          color="#00CFE8"
          bg="#E6FAFD"
        />

        <StatCard
          title="Ingredients"
          value={validIngredients.length}
          subtitle={`${ingredients.length} total rows`}
          icon={CheckCircle2}
          color="#28C76F"
          bg="#E9F9EF"
        />

        <StatCard
          title="Total Qty"
          value={totalQty.toFixed(3)}
          subtitle={`${totalWasteQty.toFixed(3)} waste qty`}
          icon={AlertCircle}
          color="#FF9F43"
          bg="#FFF4E5"
        />

        <StatCard
          title="Total Time"
          value={`${totalTime} min`}
          subtitle="Prep + cooking + finishing"
          icon={Clock}
          color="#EA5455"
          bg="#FCEAEA"
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className={`rounded-md border p-6 shadow-sm ${cardClass}`}>
          <div className="mb-6">
            <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
              Recipe Header
            </h3>
            <p className={`mt-1 text-[14px] ${mutedClass}`}>
              Select menu item, category, outlet and timing details.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                Menu Item *
              </label>
              <select
                value={formData.menu_item_id}
                onChange={(event) =>
                  setFormData({ ...formData, menu_item_id: event.target.value })
                }
                className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                required
              >
                <option value="">Select Menu Item</option>
                {menuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.item_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                Category *
              </label>
              <select
                value={formData.recipe_category}
                onChange={(event) =>
                  setFormData({ ...formData, recipe_category: event.target.value })
                }
                className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                required
              >
                <option value="Beverages">Beverages</option>
                <option value="Food">Food</option>
                <option value="Desserts">Desserts</option>
                <option value="Snacks">Snacks</option>
                <option value="Bakery">Bakery</option>
                <option value="Breakfast">Breakfast</option>
              </select>
            </div>

            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                Portion *
              </label>
              <input
                type="text"
                value={formData.portion}
                onChange={(event) =>
                  setFormData({ ...formData, portion: event.target.value })
                }
                className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                placeholder="Example: 1 Cup, 1 Plate"
                required
              />
            </div>

            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                For Outlet
              </label>
              <select
                value={formData.for_outlet_id}
                onChange={(event) =>
                  setFormData({ ...formData, for_outlet_id: event.target.value })
                }
                className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
              >
                <option value="">All Outlets</option>
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.outlet_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                Prep Time
              </label>
              <input
                type="number"
                min="0"
                value={formData.prep_time}
                onChange={(event) =>
                  setFormData({ ...formData, prep_time: event.target.value })
                }
                className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                placeholder="Minutes"
              />
            </div>

            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                Cooking Time
              </label>
              <input
                type="number"
                min="0"
                value={formData.cooking_time}
                onChange={(event) =>
                  setFormData({ ...formData, cooking_time: event.target.value })
                }
                className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                placeholder="Minutes"
              />
            </div>

            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                Finishing Time
              </label>
              <input
                type="number"
                min="0"
                value={formData.finishing_time}
                onChange={(event) =>
                  setFormData({ ...formData, finishing_time: event.target.value })
                }
                className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                placeholder="Minutes"
              />
            </div>

            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                Status
              </label>
              <select
                value={formData.status}
                onChange={(event) =>
                  setFormData({ ...formData, status: event.target.value })
                }
                className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
              >
                <option value="Draft">Draft</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        <div className={`rounded-md border p-6 shadow-sm ${cardClass}`}>
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                Ingredients
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add raw materials, quantity and wastage percentage per item.
              </p>
            </div>

            <button
              type="button"
              onClick={addIngredient}
              className="flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus size={18} />
              Add Ingredient
            </button>
          </div>

          <div className="space-y-4">
            {ingredients.map((ingredient, index) => {
              const selectedMaterial = getMaterial(ingredient.material_id);

              return (
                <div
                  key={`${index}-${ingredient.material_id}`}
                  className="grid grid-cols-1 gap-3 rounded-md border border-[#EBE9F1] p-4 md:grid-cols-12 md:items-end"
                >
                  <div className="md:col-span-5">
                    <label
                      className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}
                    >
                      Raw Material *
                    </label>
                    <select
                      value={ingredient.material_id}
                      onChange={(event) =>
                        updateIngredient(index, "material_id", event.target.value)
                      }
                      className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                      required
                    >
                      <option value="">Select Material</option>
                      {rawMaterials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.material_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label
                      className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}
                    >
                      Quantity *
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={ingredient.quantity}
                      onChange={(event) =>
                        updateIngredient(index, "quantity", event.target.value)
                      }
                      className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                      placeholder={selectedMaterial?.unit_name || "Qty"}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label
                      className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}
                    >
                      Waste %
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={ingredient.waste_percent}
                      onChange={(event) =>
                        updateIngredient(index, "waste_percent", event.target.value)
                      }
                      className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label
                      className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}
                    >
                      Unit
                    </label>
                    <input
                      type="text"
                      value={getMaterialUnitName(ingredient)}
                      readOnly
                      className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                    />
                  </div>

                  <div className="md:col-span-1">
                    <button
                      type="button"
                      onClick={() => removeIngredient(index)}
                      disabled={ingredients.length === 1}
                      className="flex h-11 w-full items-center justify-center rounded-md bg-[#FCEAEA] text-[#EA5455] disabled:cursor-not-allowed disabled:opacity-50"
                      title="Remove"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-md bg-[#F8F7FA] p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <p className="text-[13px] font-medium text-[#6F6B7D]">
                  Valid Ingredients
                </p>
                <p className="mt-1 text-[22px] font-semibold text-[#2F2B3D]">
                  {validIngredients.length}
                </p>
              </div>

              <div>
                <p className="text-[13px] font-medium text-[#6F6B7D]">
                  Total Quantity
                </p>
                <p className="mt-1 text-[22px] font-semibold text-[#2F2B3D]">
                  {totalQty.toFixed(3)}
                </p>
              </div>

              <div>
                <p className="text-[13px] font-medium text-[#6F6B7D]">
                  Waste Quantity
                </p>
                <p className="mt-1 text-[22px] font-semibold text-[#EA5455]">
                  {totalWasteQty.toFixed(3)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-md px-5 py-3 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
            style={{ backgroundColor: primaryColor }}
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={18} />
                {id ? "Update Recipe" : "Create Recipe"}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => navigate("/recipe")}
            className={`rounded-md border px-5 py-3 text-[15px] font-medium ${cardClass}`}
          >
            Cancel
          </button>

          {!id && (
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center justify-center gap-2 rounded-md bg-[#F3F2F7] px-5 py-3 text-[15px] font-semibold text-[#6F6B7D]"
            >
              <X size={18} />
              Clear
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default RecipeForm;
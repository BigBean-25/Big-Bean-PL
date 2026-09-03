import { useEffect, useState } from "react";
import { warehouseAPI } from "../../services/api";
import { SectionCard, TableWrapper, LoadingRows, EmptyState, getInputClass } from "../../components/ui";
import { KpiCard, WarehouseStatusBadge, fmtCurrency, fmtQty, num, EmptyRow, fmtDate } from "./WarehouseShared";
import { Search, RotateCcw, Plus, X, Eye, Send, CheckCircle, ShieldCheck, Lock, Trash2, FileText } from "lucide-react";
import toast from "react-hot-toast";

const MODULE_CONFIG = {
  physical_stock_counts: {
    title: "Physical Stock Count",
    noLabel: "Count No",
    noKey: "count_no",
    dateKey: "count_date",
    singular: "count",
    prefix: "count",
    api: {
      list: warehouseAPI.getPhysicalStockCounts,
      create: warehouseAPI.createPhysicalStockCount,
      update: warehouseAPI.updatePhysicalStockCount,
      remove: warehouseAPI.deletePhysicalStockCount,
      submit: warehouseAPI.submitPhysicalStockCount,
      verify: warehouseAPI.verifyPhysicalStockCount,
      approve: warehouseAPI.approvePhysicalStockCount,
      post: warehouseAPI.postPhysicalStockCount,
      lock: warehouseAPI.lockPhysicalStockCount,
    },
    statuses: ["Draft", "Submitted", "Verified", "Approved", "Posted", "Locked"],
    hasAdjustmentType: false,
    hasWastageType: false,
    hasSystemQty: true,
    hasCountedQty: true,
    hasQty: false,
    reason: "",
  },
  stock_adjustments: {
    title: "Stock Adjustments",
    noLabel: "Adjustment No",
    noKey: "adjustment_no",
    dateKey: "adjustment_date",
    singular: "adjustment",
    prefix: "adjustment",
    api: {
      list: warehouseAPI.getStockAdjustments,
      create: warehouseAPI.createStockAdjustment,
      update: warehouseAPI.updateStockAdjustment,
      remove: warehouseAPI.deleteStockAdjustment,
      submit: warehouseAPI.submitStockAdjustment,
      verify: warehouseAPI.verifyStockAdjustment,
      approve: warehouseAPI.approveStockAdjustment,
      post: warehouseAPI.postStockAdjustment,
      lock: warehouseAPI.lockStockAdjustment,
    },
    statuses: ["Draft", "Submitted", "Verified", "Approved", "Posted", "Locked"],
    hasAdjustmentType: true,
    hasWastageType: false,
    hasSystemQty: false,
    hasCountedQty: false,
    hasQty: true,
    reason: "",
  },
  warehouse_wastage: {
    title: "Wastage & Damage",
    noLabel: "Wastage No",
    noKey: "wastage_no",
    dateKey: "wastage_date",
    singular: "wastage",
    prefix: "wastage",
    api: {
      list: warehouseAPI.getWarehouseWastages,
      create: warehouseAPI.createWarehouseWastage,
      update: warehouseAPI.updateWarehouseWastage,
      remove: warehouseAPI.deleteWarehouseWastage,
      submit: warehouseAPI.submitWarehouseWastage,
      verify: warehouseAPI.verifyWarehouseWastage,
      approve: warehouseAPI.approveWarehouseWastage,
      post: warehouseAPI.postWarehouseWastage,
      lock: warehouseAPI.lockWarehouseWastage,
    },
    statuses: ["Draft", "Submitted", "Verified", "Approved", "Posted", "Locked"],
    hasAdjustmentType: false,
    hasWastageType: true,
    hasSystemQty: false,
    hasCountedQty: false,
    hasQty: true,
    reason: "",
  },
};

const initialItem = (module) => ({
  raw_material_id: "",
  unit_id: "",
  batch_no: "",
  expiry_date: "",
  reason: "",
  ...(module === "physical_stock_counts" ? { system_qty: "", counted_qty: "" } : { qty: "" }),
  ...(module === "stock_adjustments" ? { adjustment_type: "Positive" } : {}),
  ...(module === "warehouse_wastage" ? { wastage_type: "Damage" } : {}),
});

export default function WarehousePhase2c({ module, locationId, locations, materials, units, isDark }) {
  const config = MODULE_CONFIG[module];
  const inputClass = getInputClass(isDark);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState([]);
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    [config.noKey]: "",
    [config.dateKey]: new Date().toISOString().split("T")[0],
    remarks: "",
    items: [initialItem(module)],
  });

  const fetchDocs = async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      const res = await config.api.list({ location_id: locationId });
      setDocs(res?.data?.data || []);
    } catch (error) {
      toast.error(`Failed to load ${config.title}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, [locationId, module]);

  const resetForm = () => {
    setForm({ [config.noKey]: "", [config.dateKey]: new Date().toISOString().split("T")[0], remarks: "", items: [initialItem(module)] });
    setEditingId(null);
  };

  const openCreate = () => { resetForm(); setShowCreate(true); };
  const closeCreate = () => { setShowCreate(false); resetForm(); };

  const addItem = () => setForm({ ...form, items: [...form.items, initialItem(module)] });
  const updateItem = (idx, key, value) => {
    const items = [...form.items];
    items[idx][key] = value;
    if (key === "raw_material_id") {
      const mat = materials.find((m) => String(m.id) === value);
      if (mat) items[idx].unit_id = String(mat.unit_id);
    }
    setForm({ ...form, items });
  };
  const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const buildPayload = () => ({
    [config.noKey]: form[config.noKey],
    [config.dateKey]: form[config.dateKey],
    location_id: Number(locationId),
    remarks: form.remarks || null,
    items: form.items.map((it) => ({
      raw_material_id: Number(it.raw_material_id),
      unit_id: Number(it.unit_id),
      batch_no: it.batch_no || null,
      expiry_date: it.expiry_date || null,
      reason: it.reason || null,
      ...(module === "physical_stock_counts" ? { system_qty: num(it.system_qty), counted_qty: num(it.counted_qty) } : {}),
      ...(module === "stock_adjustments" ? { qty: num(it.qty), adjustment_type: it.adjustment_type } : {}),
      ...(module === "warehouse_wastage" ? { qty: num(it.qty), wastage_type: it.wastage_type } : {}),
    })),
  });

  const save = async () => {
    if (saving) return;
    const hasNegative = form.items.some((it) =>
      module === "physical_stock_counts"
        ? num(it.system_qty) < 0 || num(it.counted_qty) < 0
        : num(it.qty) < 0
    );
    if (hasNegative) {
      toast.error("Quantities cannot be negative");
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editingId) {
        await config.api.update(editingId, payload);
        toast.success(`${config.title} updated`);
      } else {
        await config.api.create(payload);
        toast.success(`${config.title} created`);
      }
      closeCreate();
      fetchDocs();
    } catch (error) {
      toast.error(error.response?.data?.message || `${config.title} failed`);
    } finally {
      setSaving(false);
    }
  };

  const runAction = (doc, action, actionLabel) => {
    toast.promise(
      config.api[action](doc.id).then(fetchDocs),
      { loading: `${actionLabel}...`, success: `${actionLabel} completed`, error: `${actionLabel} failed` }
    );
  };

  const onDelete = (doc) => {
    toast.promise(
      config.api.remove(doc.id).then(fetchDocs),
      { loading: "Deleting...", success: "Deleted", error: "Delete failed" }
    );
  };

  const onEdit = (doc) => {
    setForm({
      [config.noKey]: doc[config.noKey] || "",
      [config.dateKey]: doc[config.dateKey] ? new Date(doc[config.dateKey]).toISOString().split("T")[0] : "",
      remarks: doc.remarks || "",
      items: (doc.items || []).map((it) => ({
        raw_material_id: String(it.raw_material_id || ""),
        unit_id: String(it.unit_id || ""),
        batch_no: it.batch_no || "",
        expiry_date: it.expiry_date ? new Date(it.expiry_date).toISOString().split("T")[0] : "",
        reason: it.reason || "",
        ...(module === "physical_stock_counts" ? { system_qty: it.system_qty ?? "", counted_qty: it.counted_qty ?? "" } : {}),
        ...(module === "stock_adjustments" ? { qty: it.qty ?? "", adjustment_type: it.adjustment_type || "Positive" } : {}),
        ...(module === "warehouse_wastage" ? { qty: it.qty ?? "", wastage_type: it.wastage_type || "Damage" } : {}),
      })),
    });
    setEditingId(doc.id);
    setShowCreate(true);
  };

  const filtered = docs.filter((d) => {
    const term = filters.search.toLowerCase();
    return (term === "" || String(d[config.noKey] || "").toLowerCase().includes(term))
      && (filters.status === "" || d.status === filters.status);
  });

  const resetFilters = () => setFilters({ search: "", status: "" });

  const itemColumns = () => {
    const cols = ["Material", "Unit", "Batch", "Expiry"];
    if (module === "physical_stock_counts") cols.push("System Qty", "Counted Qty", "Variance", "Reason");
    if (module === "stock_adjustments") cols.push("Type", "Qty", "Reason");
    if (module === "warehouse_wastage") cols.push("Wastage Type", "Qty", "Reason");
    cols.push("");
    return cols;
  };

  const renderItemCells = (it, idx) => (
    <>
      <td className="px-2 py-2">
        <select value={it.raw_material_id} onChange={(e) => updateItem(idx, "raw_material_id", e.target.value)} className={`h-9 w-44 rounded-md border px-2 text-[13px] outline-none ${inputClass}`}>
          <option value="">Select</option>
          {materials.map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        <select value={it.unit_id} onChange={(e) => updateItem(idx, "unit_id", e.target.value)} className={`h-9 w-28 rounded-md border px-2 text-[13px] outline-none ${inputClass}`}>
          <option value="">Unit</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.unit_name}</option>)}
        </select>
      </td>
      <td className="px-2 py-2"><input value={it.batch_no} onChange={(e) => updateItem(idx, "batch_no", e.target.value)} className={`h-9 w-24 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} placeholder="Batch" /></td>
      <td className="px-2 py-2"><input type="date" value={it.expiry_date} onChange={(e) => updateItem(idx, "expiry_date", e.target.value)} className={`h-9 w-32 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} /></td>
      {module === "physical_stock_counts" && (
        <>
          <td className="px-2 py-2"><input type="number" min="0" value={it.system_qty} onChange={(e) => updateItem(idx, "system_qty", e.target.value)} className={`h-9 w-24 rounded-md border px-2 text-right text-[13px] outline-none ${inputClass}`} /></td>
          <td className="px-2 py-2"><input type="number" min="0" value={it.counted_qty} onChange={(e) => updateItem(idx, "counted_qty", e.target.value)} className={`h-9 w-24 rounded-md border px-2 text-right text-[13px] outline-none ${inputClass}`} /></td>
          <td className="px-2 py-2 text-right text-[13px]">{fmtQty(num(it.counted_qty) - num(it.system_qty))}</td>
          <td className="px-2 py-2"><input value={it.reason} onChange={(e) => updateItem(idx, "reason", e.target.value)} className={`h-9 w-32 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} placeholder="Reason" /></td>
        </>
      )}
      {module === "stock_adjustments" && (
        <>
          <td className="px-2 py-2">
            <select value={it.adjustment_type} onChange={(e) => updateItem(idx, "adjustment_type", e.target.value)} className={`h-9 w-28 rounded-md border px-2 text-[13px] outline-none ${inputClass}`}>
              <option value="Positive">Positive</option>
              <option value="Negative">Negative</option>
            </select>
          </td>
          <td className="px-2 py-2"><input type="number" min="0" value={it.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} className={`h-9 w-24 rounded-md border px-2 text-right text-[13px] outline-none ${inputClass}`} /></td>
          <td className="px-2 py-2"><input value={it.reason} onChange={(e) => updateItem(idx, "reason", e.target.value)} className={`h-9 w-32 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} placeholder="Reason" /></td>
        </>
      )}
      {module === "warehouse_wastage" && (
        <>
          <td className="px-2 py-2">
            <select value={it.wastage_type} onChange={(e) => updateItem(idx, "wastage_type", e.target.value)} className={`h-9 w-32 rounded-md border px-2 text-[13px] outline-none ${inputClass}`}>
              <option value="Damage">Damage</option>
              <option value="Expiry">Expiry</option>
              <option value="Spoilage">Spoilage</option>
              <option value="Other">Other</option>
            </select>
          </td>
          <td className="px-2 py-2"><input type="number" min="0" value={it.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} className={`h-9 w-24 rounded-md border px-2 text-right text-[13px] outline-none ${inputClass}`} /></td>
          <td className="px-2 py-2"><input value={it.reason} onChange={(e) => updateItem(idx, "reason", e.target.value)} className={`h-9 w-32 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} placeholder="Reason" /></td>
        </>
      )}
      <td className="px-2 py-2"><button onClick={() => removeItem(idx)} className="text-rose-500" disabled={form.items.length === 1}><X size={16} /></button></td>
    </>
  );

  if (!locationId) return <EmptyState icon={FileText} title={`Select a warehouse`} subtitle={`Choose a warehouse to view ${config.title}.`} isDark={isDark} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={FileText} label={`Draft ${config.title}`} value={docs.filter((d) => d.status === "Draft").length} isDark={isDark} />
        <KpiCard icon={Send} label={`Submitted`} value={docs.filter((d) => d.status === "Submitted").length} isDark={isDark} />
        <KpiCard icon={CheckCircle} label={`Approved`} value={docs.filter((d) => d.status === "Approved").length} isDark={isDark} />
        <KpiCard icon={ShieldCheck} label={`Posted`} value={docs.filter((d) => d.status === "Posted").length} isDark={isDark} />
      </div>

      <SectionCard title="Filters" isDark={isDark}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className={`h-10 w-full rounded-lg border pl-9 pr-3 text-[14px] outline-none ${inputClass}`} placeholder={`Search ${config.title}`} />
          </div>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">All Status</option>
            {config.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={resetFilters} className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#A5A8B6]" : "border-[#EBE9F1] bg-white text-[#6F6B7D]"}`}>
            <RotateCcw size={14} /> Reset
          </button>
          <button onClick={openCreate} className="flex h-10 items-center gap-2 rounded-lg bg-[#7367F0] px-3 text-[13px] font-semibold text-white hover:bg-[#6354D8]">
            <Plus size={16} /> New {config.title}
          </button>
        </div>
      </SectionCard>

      <SectionCard isDark={isDark}>
        <TableWrapper isDark={isDark}>
          <table className="w-full border-collapse text-[13px]">
            <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
              <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                <th className="px-3 py-3">{config.noLabel}</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Location</th>
                <th className="px-3 py-3 text-right">Items</th>
                <th className="px-3 py-3 text-right">Total Qty</th>
                <th className="px-3 py-3 text-right">Total Value</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="sticky right-0 px-3 py-3 text-center" style={{ background: isDark ? "#2F3349" : "white" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRows rows={5} cols={8} isDark={isDark} /> : (
                <>
                  {filtered.map((d) => {
                    const loc = locations.find((l) => String(l.id) === String(d.location_id));
                    const totalQty = num(d.total_counted_qty || d.total_qty);
                    const totalValue = num(d.total_variance_value || d.total_value);
                    return (
                      <tr key={d.id} className={`border-b transition ${isDark ? "border-[#3B405A] hover:bg-[#3B405A]/30" : "border-[#F3F2F7] hover:bg-[#F8F7FA]"}`}>
                        <td className="px-3 py-2.5 font-medium">{d[config.noKey]}</td>
                        <td className="px-3 py-2.5">{fmtDate(d[config.dateKey])}</td>
                        <td className="px-3 py-2.5">{loc?.location_name || "-"}</td>
                        <td className="px-3 py-2.5 text-right">{d.items?.length || 0}</td>
                        <td className="px-3 py-2.5 text-right">{fmtQty(totalQty)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtCurrency(totalValue)}</td>
                        <td className="px-3 py-2.5 text-center"><WarehouseStatusBadge status={d.status} /></td>
                        <td className="sticky right-0 px-3 py-2.5 text-center" style={{ background: isDark ? "#2F3349" : "white" }}>
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setViewing(d)} className={`rounded-md p-1.5 ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`} title="View"><Eye size={16} /></button>
                            {d.status === "Draft" && <button onClick={() => onEdit(d)} className={`rounded-md p-1.5 ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`} title="Edit"><FileText size={16} /></button>}
                            {d.status === "Draft" && <button onClick={() => runAction(d, "submit", "Submit")} className="rounded-md bg-blue-500 px-2 py-1 text-[11px] font-semibold text-white">Submit</button>}
                            {d.status === "Submitted" && <button onClick={() => runAction(d, "verify", "Verify")} className="rounded-md bg-sky-500 px-2 py-1 text-[11px] font-semibold text-white">Verify</button>}
                            {d.status === "Verified" && <button onClick={() => runAction(d, "approve", "Approve")} className="rounded-md bg-emerald-500 px-2 py-1 text-[11px] font-semibold text-white">Approve</button>}
                            {d.status === "Approved" && <button onClick={() => runAction(d, "post", "Post")} className="rounded-md bg-[#7367F0] px-2 py-1 text-[11px] font-semibold text-white">Post</button>}
                            {d.status === "Posted" && <button onClick={() => runAction(d, "lock", "Lock")} className="rounded-md bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white"><Lock size={12} className="inline" /></button>}
                            {d.status === "Draft" && <button onClick={() => onDelete(d)} className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50" title="Delete"><Trash2 size={16} /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && <EmptyRow colSpan={8} isDark={isDark} />}
                </>
              )}
            </tbody>
          </table>
        </TableWrapper>
      </SectionCard>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{editingId ? `Edit ${config.title}` : `Create ${config.title}`}</h3>
              <button onClick={closeCreate} className="text-2xl leading-none">&times;</button>
            </div>
            <div className="space-y-5 p-4">
              <SectionCard title={`${config.title} Information`} isDark={isDark}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <input value={form[config.noKey]} onChange={(e) => setForm({ ...form, [config.noKey]: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} placeholder={config.noLabel} />
                  <input type="date" value={form[config.dateKey]} onChange={(e) => setForm({ ...form, [config.dateKey]: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                  <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} placeholder="Remarks" />
                </div>
              </SectionCard>

              <SectionCard title="Items" isDark={isDark}>
                <TableWrapper isDark={isDark}>
                  <table className="w-full border-collapse text-[13px]">
                    <thead className={`${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                      <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                        {itemColumns().map((c, i) => <th key={i} className="px-2 py-2">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((it, idx) => (
                        <tr key={idx} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                          {renderItemCells(it, idx)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
                <button onClick={addItem} className="mt-3 flex h-9 items-center gap-1.5 rounded-lg border border-[#7367F0] px-3 text-[13px] font-medium text-[#7367F0]">
                  <Plus size={14} /> Add Item
                </button>
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button onClick={closeCreate} disabled={saving} className="h-10 rounded-lg border px-4 text-[14px] font-medium disabled:opacity-50">Cancel</button>
                <button onClick={save} disabled={saving} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8] disabled:opacity-50">{saving ? "Saving…" : (editingId ? "Update" : `Save ${config.title}`)}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewing(null)}>
          <div className={`w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{viewing[config.noKey]}</h3>
              <button onClick={() => setViewing(null)} className="text-2xl leading-none">&times;</button>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <p><strong>Date:</strong> {fmtDate(viewing[config.dateKey])}</p>
                <p><strong>Status:</strong> <WarehouseStatusBadge status={viewing.status} /></p>
                <p><strong>Total Qty:</strong> {fmtQty(viewing.total_counted_qty || viewing.total_qty)}</p>
                <p><strong>Total Value:</strong> {fmtCurrency(viewing.total_variance_value || viewing.total_value)}</p>
                <p className="col-span-2"><strong>Remarks:</strong> {viewing.remarks || "-"}</p>
              </div>
              <SectionCard title="Items" isDark={isDark}>
                <TableWrapper isDark={isDark}>
                  <table className="w-full border-collapse text-[13px]">
                    <thead className={`${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                      <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                        <th className="px-2 py-2">Material</th>
                        <th className="px-2 py-2">Unit</th>
                        <th className="px-2 py-2">Batch</th>
                        {module === "physical_stock_counts" && <><th className="px-2 py-2 text-right">System</th><th className="px-2 py-2 text-right">Counted</th><th className="px-2 py-2 text-right">Variance</th></>}
                        {module !== "physical_stock_counts" && <th className="px-2 py-2 text-right">Qty</th>}
                        <th className="px-2 py-2 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewing.items || []).map((it) => (
                        <tr key={it.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                          <td className="px-2 py-2">{it.material_name}</td>
                          <td className="px-2 py-2">{it.unit_name}</td>
                          <td className="px-2 py-2">{it.batch_no || "-"}</td>
                          {module === "physical_stock_counts" && <><td className="px-2 py-2 text-right">{fmtQty(it.system_qty)}</td><td className="px-2 py-2 text-right">{fmtQty(it.counted_qty)}</td><td className="px-2 py-2 text-right">{fmtQty(it.variance_qty)}</td></>}
                          {module !== "physical_stock_counts" && <td className="px-2 py-2 text-right">{fmtQty(it.qty)}</td>}
                          <td className="px-2 py-2 text-right">{fmtCurrency(it.variance_value || it.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
              </SectionCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

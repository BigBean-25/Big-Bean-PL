import { useState } from "react";
import { productionAPI } from "../../../services/api";
import { SectionCard, TableWrapper, EmptyState, getInputClass, StatusBadge } from "../../../components/ui";
import { Plus, X, Send, CheckCircle, XCircle, ShieldCheck, Lock, Eye, Download } from "lucide-react";
import toast from "react-hot-toast";

const emptyItem = () => ({ raw_material_id: "", wastage_scope: "RAW_MATERIAL", qty: "", unit_id: "", batch_no: "", expiry_date: "", remarks: "" });

export default function WastageTab({ wastage, kitchenId, batches, materials, units, isDark, canCreate, canEdit, onRefresh }) {
  const inputClass = getInputClass(isDark);
  const [showCreate, setShowCreate] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [form, setForm] = useState({
    wastage_no: "", production_batch_id: "", wastage_date: new Date().toISOString().split("T")[0],
    wastage_type: "Damage", reason: "", remarks: "", items: [emptyItem()],
  });

  const resetForm = () => setForm({
    wastage_no: "", production_batch_id: "", wastage_date: new Date().toISOString().split("T")[0],
    wastage_type: "Damage", reason: "", remarks: "", items: [emptyItem()],
  });

  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (idx) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const updateItem = (idx, key, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [key]: value };
    if (key === "raw_material_id") {
      const mat = materials.find((m) => String(m.id) === value);
      if (mat) items[idx].unit_id = String(mat.unit_id);
    }
    setForm((f) => ({ ...f, items }));
  };

  const create = async () => {
    if (!form.wastage_no || !form.items.some((it) => it.wastage_scope === "PROCESS_LOSS" || (it.raw_material_id && Number(it.qty) > 0))) {
      return toast.error("Wastage number and at least one item are required");
    }
    if (form.items.some((it) => Number(it.qty) < 0)) {
      return toast.error("Quantities cannot be negative");
    }
    try {
      await productionAPI.createProductionWastage({
        ...form,
        central_kitchen_id: Number(kitchenId),
        production_batch_id: form.production_batch_id ? Number(form.production_batch_id) : null,
        items: form.items.filter((it) => it.raw_material_id && Number(it.qty) > 0).map((it) => ({
          raw_material_id: Number(it.raw_material_id),
          wastage_scope: it.wastage_scope,
          qty: Number(it.qty),
          unit_id: Number(it.unit_id),
          batch_no: it.batch_no || null,
          expiry_date: it.expiry_date || null,
          remarks: it.remarks || null,
        })),
      });
      toast.success("Wastage record created");
      setShowCreate(false);
      resetForm();
      onRefresh();
    } catch (error) { toast.error(error?.response?.data?.message || "Failed to create wastage"); }
  };

  const runAction = (id, action, label) => {
    toast.promise(
      productionAPI[action](id).then(onRefresh),
      { loading: `${label}...`, success: `${label} completed`, error: (e) => e?.response?.data?.message || `${label} failed` }
    );
  };

  const openView = async (w) => {
    try { const res = await productionAPI.getProductionWastage(w.id); setViewing(res?.data?.data || w); }
    catch { setViewing(w); }
  };

  const handleExport = async () => {
    try {
      const res = await productionAPI.exportProductionWastage({ central_kitchen_id: kitchenId });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `production_wastage_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button onClick={handleExport} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[14px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}><Download size={16} /> Export</button>
        {canCreate && (
          <button onClick={() => setShowCreate(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#7367F0] px-3 text-[14px] font-medium text-white hover:bg-[#6354D8]"><Plus size={16} /> New Wastage</button>
        )}
      </div>
      <SectionCard isDark={isDark}>
        {wastage.length === 0 ? <EmptyState isDark={isDark} title="No Production Wastage Found" subtitle="Wastage records will appear here once posted." /> : (
          <TableWrapper isDark={isDark}>
            <table className="w-full border-collapse text-[13px]">
              <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                  <th className="px-3 py-3">Wastage No</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Value</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {wastage.map((w) => (
                  <tr key={w.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                    <td className="px-3 py-3">{w.wastage_no}</td>
                    <td className="px-3 py-3">{w.wastage_date}</td>
                    <td className="px-3 py-3">{w.wastage_type}</td>
                    <td className="px-3 py-3">₹{Number(w.total_value || 0).toFixed(2)}</td>
                    <td className="px-3 py-3"><StatusBadge status={w.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openView(w)} className={`rounded p-1.5 ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`} title="View"><Eye size={16} className="text-[#7367F0]" /></button>
                        {canEdit && w.status === "Draft" && <button onClick={() => runAction(w.id, "submitProductionWastage", "Submit")} className="rounded p-1.5 text-blue-500" title="Submit"><Send size={16} /></button>}
                        {canEdit && w.status === "Submitted" && <button onClick={() => runAction(w.id, "verifyProductionWastage", "Verify")} className="rounded p-1.5 text-sky-500" title="Verify"><CheckCircle size={16} /></button>}
                        {canEdit && w.status === "Verified" && <button onClick={() => runAction(w.id, "approveProductionWastage", "Approve")} className="rounded p-1.5 text-emerald-500" title="Approve"><CheckCircle size={16} /></button>}
                        {canEdit && ["Draft", "Submitted", "Verified"].includes(w.status) && <button onClick={() => runAction(w.id, "rejectProductionWastage", "Reject")} className="rounded p-1.5 text-rose-500" title="Reject"><XCircle size={16} /></button>}
                        {canEdit && w.status === "Approved" && <button onClick={() => runAction(w.id, "postProductionWastage", "Post")} className="rounded p-1.5 text-[#7367F0]" title="Post"><ShieldCheck size={16} /></button>}
                        {canEdit && w.status === "Posted" && <button onClick={() => runAction(w.id, "lockProductionWastage", "Lock")} className="rounded p-1.5 text-amber-500" title="Lock"><Lock size={16} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </SectionCard>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCreate(false)}>
          <div className={`w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">New Production Wastage</h3>
              <button onClick={() => setShowCreate(false)} aria-label="Close"><X size={20} /></button>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input placeholder="Wastage No" value={form.wastage_no} onChange={(e) => setForm({ ...form, wastage_no: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                <select value={form.production_batch_id} onChange={(e) => setForm({ ...form, production_batch_id: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                  <option value="">Related Batch (optional)</option>
                  {(batches || []).map((b) => <option key={b.id} value={b.id}>{b.batch_no}</option>)}
                </select>
                <input type="date" value={form.wastage_date} onChange={(e) => setForm({ ...form, wastage_date: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                <select value={form.wastage_type} onChange={(e) => setForm({ ...form, wastage_type: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                  <option value="Damage">Damage</option><option value="Expiry">Expiry</option><option value="Spoilage">Spoilage</option><option value="Process Loss">Process Loss</option><option value="Other">Other</option>
                </select>
                <input placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none sm:col-span-2 ${inputClass}`} />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold">Items</h4>
                  <button onClick={addItem} className="text-[12px] font-medium text-[#7367F0]">+ Add Item</button>
                </div>
                <div className="space-y-2">
                  {form.items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 items-center gap-2">
                      <select value={it.wastage_scope} onChange={(e) => updateItem(idx, "wastage_scope", e.target.value)} className={`col-span-2 h-9 rounded-md border px-2 text-[13px] outline-none ${inputClass}`}>
                        <option value="RAW_MATERIAL">Raw Material</option>
                        <option value="FINISHED_GOOD">Finished Good</option>
                        <option value="PROCESS_LOSS">Process Loss</option>
                      </select>
                      <select value={it.raw_material_id} onChange={(e) => updateItem(idx, "raw_material_id", e.target.value)} className={`col-span-3 h-9 rounded-md border px-2 text-[13px] outline-none ${inputClass}`}>
                        <option value="">Select Material</option>
                        {(materials || []).map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}
                      </select>
                      <input type="number" min="0" placeholder="Qty" value={it.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} className={`col-span-2 h-9 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} />
                      <select value={it.unit_id} onChange={(e) => updateItem(idx, "unit_id", e.target.value)} className={`col-span-2 h-9 rounded-md border px-2 text-[13px] outline-none ${inputClass}`}>
                        <option value="">Unit</option>
                        {(units || []).map((u) => <option key={u.id} value={u.id}>{u.unit_name}</option>)}
                      </select>
                      <input placeholder="Batch" value={it.batch_no} onChange={(e) => updateItem(idx, "batch_no", e.target.value)} className={`col-span-2 h-9 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} />
                      <button onClick={() => removeItem(idx)} disabled={form.items.length === 1} className="col-span-1 text-rose-500 disabled:opacity-30"><X size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowCreate(false)} className="h-10 rounded-lg border px-4 text-[14px] font-medium">Cancel</button>
                <button onClick={create} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8]">Save Wastage</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewing(null)}>
          <div className={`w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{viewing.wastage_no}</h3>
              <button onClick={() => setViewing(null)} aria-label="Close"><X size={20} /></button>
            </div>
            <div className="space-y-3 p-4 text-[13px]">
              <div className="grid grid-cols-2 gap-2">
                <p><strong>Status:</strong> {viewing.status}</p>
                <p><strong>Total Value:</strong> ₹{Number(viewing.total_value || 0).toFixed(2)}</p>
                <p><strong>Type:</strong> {viewing.wastage_type}</p>
                <p><strong>Reason:</strong> {viewing.reason || "-"}</p>
              </div>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className={`border-b text-left ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                    <th className="px-2 py-2">Material</th><th className="px-2 py-2">Scope</th><th className="px-2 py-2">Qty</th><th className="px-2 py-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewing.items || []).map((it) => (
                    <tr key={it.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                      <td className="px-2 py-2">{it.material_name}</td>
                      <td className="px-2 py-2">{it.wastage_scope}</td>
                      <td className="px-2 py-2">{it.qty} {it.unit_symbol}</td>
                      <td className="px-2 py-2">₹{Number(it.value || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { productionAPI } from "../../../services/api";
import { SectionCard, TableWrapper, EmptyState, getInputClass, StatusBadge } from "../../../components/ui";
import { Plus, X, CheckCircle, Settings } from "lucide-react";
import toast from "react-hot-toast";

export default function BatchesTab({ batches, kitchenId, materials, units, recipes, isDark, canCreate, canEdit, onRefresh }) {
  const inputClass = getInputClass(isDark);
  const [showCreate, setShowCreate] = useState(false);
  const [managing, setManaging] = useState(null);
  const [managingDetail, setManagingDetail] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [outputForm, setOutputForm] = useState({ actual_qty: "", gross_output_qty: "", rejected_output_qty: "", accepted_output_qty: "" });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    batch_no: "", recipe_id: "", finished_product_id: "", planned_qty: "", unit_id: "",
    batch_no_output: "", mfg_date: new Date().toISOString().split("T")[0], expiry_date: "",
  });

  const resetForm = () => setForm({
    batch_no: "", recipe_id: "", finished_product_id: "", planned_qty: "", unit_id: "",
    batch_no_output: "", mfg_date: new Date().toISOString().split("T")[0], expiry_date: "",
  });

  const create = async () => {
    if (saving) return;
    if (!form.batch_no || !form.finished_product_id || !form.unit_id || !Number(form.planned_qty)) {
      return toast.error("Batch number, finished item, unit and planned quantity are required");
    }
    setSaving(true);
    try {
      await productionAPI.createProductionBatch({
        ...form,
        central_kitchen_id: Number(kitchenId),
        finished_product_id: Number(form.finished_product_id),
        recipe_id: form.recipe_id ? Number(form.recipe_id) : null,
        unit_id: Number(form.unit_id),
        planned_qty: Number(form.planned_qty),
        expiry_date: form.expiry_date || null,
      });
      toast.success("Production batch created");
      setShowCreate(false);
      resetForm();
      onRefresh();
    } catch (error) { toast.error(error?.response?.data?.message || "Failed to create batch"); }
    finally { setSaving(false); }
  };

  const openManage = async (b) => {
    setManaging(b);
    setOutputForm({
      actual_qty: b.actual_qty ?? "", gross_output_qty: b.gross_output_qty ?? "",
      rejected_output_qty: b.rejected_output_qty ?? "", accepted_output_qty: b.accepted_output_qty ?? "",
    });
    try {
      const [detailRes, availRes] = await Promise.all([
        productionAPI.getProductionBatch(b.id),
        productionAPI.getBatchAvailability(b.id),
      ]);
      const detail = detailRes?.data?.data;
      setManagingDetail({
        ...detail,
        materials: (detail?.materials || []).map((m) => ({
          ...m,
          // API returns DECIMAL columns as numeric strings (e.g. "0.0000"), which are
          // truthy - Number(...) first so an unissued 0 doesn't win over required_qty.
          actual_issued_qty: Number(m.actual_issued_qty) || m.required_qty,
          actual_unit_id: m.actual_unit_id || m.required_unit_id,
          batch_no: m.batch_no || "",
          expiry_date: m.expiry_date ? m.expiry_date.split("T")[0] : "",
        })),
      });
      setAvailability(availRes?.data?.data || []);
    } catch (error) { toast.error("Failed to load batch details"); }
  };

  const updateMaterial = (idx, key, value) => {
    const materialsList = [...managingDetail.materials];
    materialsList[idx] = { ...materialsList[idx], [key]: value };
    setManagingDetail((d) => ({ ...d, materials: materialsList }));
  };

  const saveMaterials = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await productionAPI.setBatchMaterials(managing.id, {
        materials: managingDetail.materials.map((m) => ({
          raw_material_id: m.raw_material_id,
          required_qty: Number(m.required_qty),
          required_unit_id: m.required_unit_id,
          actual_issued_qty: Number(m.actual_issued_qty) || 0,
          actual_unit_id: Number(m.actual_unit_id) || m.required_unit_id,
          batch_no: m.batch_no || null,
          expiry_date: m.expiry_date || null,
        })),
      });
      toast.success("Materials issue saved");
      await openManage(managing);
    } catch (error) { toast.error(error?.response?.data?.message || "Failed to save materials"); }
    finally { setSaving(false); }
  };

  const saveOutput = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await productionAPI.setBatchActualQty(managing.id, {
        actual_qty: Number(outputForm.actual_qty) || undefined,
        gross_output_qty: Number(outputForm.gross_output_qty) || undefined,
        rejected_output_qty: Number(outputForm.rejected_output_qty) || undefined,
        accepted_output_qty: Number(outputForm.accepted_output_qty) || undefined,
      });
      toast.success("Output quantities saved");
    } catch (error) { toast.error(error?.response?.data?.message || "Failed to save output"); }
    finally { setSaving(false); }
  };

  const handlePost = async (id) => {
    if (!canEdit) return toast.error("Permission denied");
    if (saving) return;
    setSaving(true);
    try {
      await productionAPI.postProductionBatch(id);
      toast.success("Production batch posted");
      setManaging(null);
      onRefresh();
    } catch (error) { toast.error(error?.response?.data?.message || "Post failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex justify-end">
          <button onClick={() => setShowCreate(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#7367F0] px-3 text-[14px] font-medium text-white hover:bg-[#6354D8]">
            <Plus size={16} /> New Batch
          </button>
        </div>
      )}
      <SectionCard isDark={isDark}>
        {batches.length === 0 ? <EmptyState isDark={isDark} title="No Production Batches Found" subtitle="Production batches will appear here once a plan is converted into production." /> : (
          <TableWrapper isDark={isDark}>
            <table className="w-full border-collapse text-[13px]">
              <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                  <th className="px-3 py-3">Batch No</th><th className="px-3 py-3">Product</th><th className="px-3 py-3">Planned / Actual</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                    <td className="px-3 py-3">{b.batch_no}</td>
                    <td className="px-3 py-3">{b.material_name}</td>
                    <td className="px-3 py-3">{b.planned_qty} / {b.actual_qty} {b.unit_name}</td>
                    <td className="px-3 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {b.status !== "Posted" && canEdit && (
                          <button onClick={() => openManage(b)} className="inline-flex items-center gap-1 rounded bg-[#ECE8FD] px-2 py-1 text-[11px] font-semibold text-[#7367F0]"><Settings size={12} /> Manage</button>
                        )}
                        {b.status === "Posted" && <CheckCircle size={16} className="text-[#28C76F]" />}
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
          <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">New Production Batch</h3>
              <button onClick={() => setShowCreate(false)}><X size={20} /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              <input placeholder="Batch No" value={form.batch_no} onChange={(e) => setForm({ ...form, batch_no: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
              <input placeholder="Output Batch No (label)" value={form.batch_no_output} onChange={(e) => setForm({ ...form, batch_no_output: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
              <select value={form.recipe_id} onChange={(e) => setForm({ ...form, recipe_id: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                <option value="">Recipe (auto-fills materials)</option>
                {(recipes || []).map((r) => <option key={r.id} value={r.id}>{r.recipe_name}</option>)}
              </select>
              <select value={form.finished_product_id} onChange={(e) => setForm({ ...form, finished_product_id: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                <option value="">Finished Item</option>
                {(materials || []).map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}
              </select>
              <input type="number" placeholder="Planned Qty" value={form.planned_qty} onChange={(e) => setForm({ ...form, planned_qty: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
              <select value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                <option value="">Unit</option>
                {(units || []).map((u) => <option key={u.id} value={u.id}>{u.unit_name}</option>)}
              </select>
              <input type="date" value={form.mfg_date} onChange={(e) => setForm({ ...form, mfg_date: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
              <input type="date" placeholder="Expiry" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
            </div>
            <div className="flex justify-end gap-2 p-4 pt-0">
              <button onClick={() => setShowCreate(false)} disabled={saving} className="h-10 rounded-lg border px-4 text-[14px] font-medium disabled:opacity-50">Cancel</button>
              <button onClick={create} disabled={saving} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8] disabled:opacity-50">{saving ? "Saving…" : "Save Batch"}</button>
            </div>
          </div>
        </div>
      )}

      {managing && managingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setManaging(null)}>
          <div className={`w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">Manage Batch {managing.batch_no}</h3>
              <button onClick={() => setManaging(null)}><X size={20} /></button>
            </div>
            <div className="space-y-5 p-4">
              <SectionCard title="Materials Issue" isDark={isDark}>
                <TableWrapper isDark={isDark}>
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                        <th className="px-2 py-2">Material</th><th className="px-2 py-2">Required</th><th className="px-2 py-2">Available</th><th className="px-2 py-2">Issue Qty</th><th className="px-2 py-2">Batch No</th><th className="px-2 py-2">Expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {managingDetail.materials.map((m, idx) => {
                        const avail = availability.find((a) => Number(a.raw_material_id) === Number(m.raw_material_id));
                        const short = avail && Number(avail.available_qty) < Number(m.required_qty);
                        return (
                          <tr key={m.id || idx} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                            <td className="px-2 py-2">{m.material_name}</td>
                            <td className="px-2 py-2">{Number(m.required_qty).toFixed(2)} {m.required_unit_name}</td>
                            <td className={`px-2 py-2 ${short ? "font-semibold text-rose-500" : ""}`}>{Number(avail?.available_qty || 0).toFixed(2)}</td>
                            <td className="px-2 py-2"><input type="number" value={m.actual_issued_qty} onChange={(e) => updateMaterial(idx, "actual_issued_qty", e.target.value)} className={`h-9 w-24 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} /></td>
                            <td className="px-2 py-2"><input value={m.batch_no} onChange={(e) => updateMaterial(idx, "batch_no", e.target.value)} className={`h-9 w-24 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} /></td>
                            <td className="px-2 py-2"><input type="date" value={m.expiry_date} onChange={(e) => updateMaterial(idx, "expiry_date", e.target.value)} className={`h-9 w-32 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrapper>
                <button onClick={saveMaterials} disabled={saving} className="mt-3 h-9 rounded-lg bg-[#7367F0] px-3 text-[13px] font-semibold text-white hover:bg-[#6354D8] disabled:opacity-50">{saving ? "Saving…" : "Save Materials"}</button>
              </SectionCard>

              <SectionCard title="Output Quantities" isDark={isDark}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <input type="number" placeholder="Actual Qty" value={outputForm.actual_qty} onChange={(e) => setOutputForm({ ...outputForm, actual_qty: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                  <input type="number" placeholder="Gross Output" value={outputForm.gross_output_qty} onChange={(e) => setOutputForm({ ...outputForm, gross_output_qty: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                  <input type="number" placeholder="Rejected" value={outputForm.rejected_output_qty} onChange={(e) => setOutputForm({ ...outputForm, rejected_output_qty: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                  <input type="number" placeholder="Accepted" value={outputForm.accepted_output_qty} onChange={(e) => setOutputForm({ ...outputForm, accepted_output_qty: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                </div>
                <button onClick={saveOutput} disabled={saving} className="mt-3 h-9 rounded-lg bg-[#7367F0] px-3 text-[13px] font-semibold text-white hover:bg-[#6354D8] disabled:opacity-50">{saving ? "Saving…" : "Save Output"}</button>
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button onClick={() => setManaging(null)} disabled={saving} className="h-10 rounded-lg border px-4 text-[14px] font-medium disabled:opacity-50">Close</button>
                <button onClick={() => handlePost(managing.id)} disabled={saving} className="h-10 rounded-lg bg-[#28C76F] px-4 text-[14px] font-semibold text-white hover:bg-[#22A860] disabled:opacity-50">{saving ? "Posting…" : "Post Batch"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { productionAPI } from "../../../services/api";
import { SectionCard, TableWrapper, EmptyState, getInputClass, StatusBadge } from "../../../components/ui";
import { Plus, X, CheckCircle, XCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function PlanningTab({ plans, kitchenId, materials, units, recipes, isDark, canCreate, canEdit, onRefresh }) {
  const inputClass = getInputClass(isDark);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    plan_no: "",
    plan_date: new Date().toISOString().split("T")[0],
    production_item_id: "",
    demand_qty: "",
    existing_finished_stock: "0",
    planned_production_qty: "",
    unit_id: "",
    recipe_id: "",
    priority: "Normal",
    remarks: "",
  });

  const resetForm = () => setForm({
    plan_no: "", plan_date: new Date().toISOString().split("T")[0], production_item_id: "",
    demand_qty: "", existing_finished_stock: "0", planned_production_qty: "", unit_id: "",
    recipe_id: "", priority: "Normal", remarks: "",
  });

  const create = async () => {
    if (!form.plan_no || !form.production_item_id || !form.unit_id || !Number(form.planned_production_qty)) {
      return toast.error("Plan number, item, unit and planned quantity are required");
    }
    try {
      await productionAPI.createProductionPlan({
        ...form,
        central_kitchen_id: Number(kitchenId),
        production_item_id: Number(form.production_item_id),
        unit_id: Number(form.unit_id),
        recipe_id: form.recipe_id ? Number(form.recipe_id) : null,
        demand_qty: Number(form.demand_qty) || 0,
        existing_finished_stock: Number(form.existing_finished_stock) || 0,
        planned_production_qty: Number(form.planned_production_qty),
      });
      toast.success("Production plan created");
      setShowCreate(false);
      resetForm();
      onRefresh();
    } catch (error) { toast.error(error?.response?.data?.message || "Failed to create plan"); }
  };

  const transition = (id, status) => {
    toast.promise(
      productionAPI.updatePlanStatus(id, status).then(onRefresh),
      { loading: `Setting ${status}...`, success: `Marked ${status}`, error: (e) => e?.response?.data?.message || "Update failed" }
    );
  };

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex justify-end">
          <button onClick={() => setShowCreate(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#7367F0] px-3 text-[14px] font-medium text-white hover:bg-[#6354D8]">
            <Plus size={16} /> New Plan
          </button>
        </div>
      )}
      <SectionCard isDark={isDark}>
        {plans.length === 0 ? <EmptyState isDark={isDark} title="No Production Plans Found" subtitle="Approved production requirements will appear here for planning." /> : (
          <TableWrapper isDark={isDark}>
            <table className="w-full border-collapse text-[13px]">
              <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                  <th className="px-3 py-3">Plan No</th><th className="px-3 py-3">Item</th><th className="px-3 py-3">Recipe</th><th className="px-3 py-3">Planned Qty</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                    <td className="px-3 py-3 font-medium">{p.plan_no}</td>
                    <td className="px-3 py-3">{p.material_name}</td>
                    <td className="px-3 py-3">{p.recipe_name || "-"}</td>
                    <td className="px-3 py-3">{p.planned_production_qty} {p.unit_name}</td>
                    <td className="px-3 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-3 py-3">
                      {canEdit && p.status === "Draft" && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => transition(p.id, "Approved")} className="rounded p-1.5 text-emerald-500" title="Approve"><CheckCircle size={16} /></button>
                          <button onClick={() => transition(p.id, "Rejected")} className="rounded p-1.5 text-rose-500" title="Reject"><XCircle size={16} /></button>
                        </div>
                      )}
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
              <h3 className="text-lg font-semibold">New Production Plan</h3>
              <button onClick={() => setShowCreate(false)}><X size={20} /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              <input placeholder="Plan No" value={form.plan_no} onChange={(e) => setForm({ ...form, plan_no: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
              <input type="date" value={form.plan_date} onChange={(e) => setForm({ ...form, plan_date: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
              <select value={form.production_item_id} onChange={(e) => setForm({ ...form, production_item_id: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                <option value="">Finished Item</option>
                {(materials || []).map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}
              </select>
              <select value={form.recipe_id} onChange={(e) => setForm({ ...form, recipe_id: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                <option value="">Recipe (optional)</option>
                {(recipes || []).map((r) => <option key={r.id} value={r.id}>{r.recipe_name}</option>)}
              </select>
              <input type="number" placeholder="Demand Qty" value={form.demand_qty} onChange={(e) => setForm({ ...form, demand_qty: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
              <input type="number" placeholder="Existing Finished Stock" value={form.existing_finished_stock} onChange={(e) => setForm({ ...form, existing_finished_stock: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
              <input type="number" placeholder="Planned Production Qty" value={form.planned_production_qty} onChange={(e) => setForm({ ...form, planned_production_qty: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
              <select value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                <option value="">Unit</option>
                {(units || []).map((u) => <option key={u.id} value={u.id}>{u.unit_name}</option>)}
              </select>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                <option value="Low">Low</option><option value="Normal">Normal</option><option value="High">High</option><option value="Urgent">Urgent</option>
              </select>
              <input placeholder="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none sm:col-span-2 ${inputClass}`} />
            </div>
            <div className="flex justify-end gap-2 p-4 pt-0">
              <button onClick={() => setShowCreate(false)} className="h-10 rounded-lg border px-4 text-[14px] font-medium">Cancel</button>
              <button onClick={create} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8]">Save Plan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

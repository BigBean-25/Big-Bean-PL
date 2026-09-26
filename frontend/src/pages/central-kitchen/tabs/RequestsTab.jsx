import { useState } from "react";
import { productionAPI, getStoredPermissions } from "../../../services/api";
import useAuthStore from "../../../store/authStore";
import { SectionCard, TableWrapper, EmptyState, getInputClass, StatusBadge } from "../../../components/ui";
import { Plus, X, Send, CheckCircle, XCircle, Eye } from "lucide-react";
import toast from "react-hot-toast";

const emptyItem = () => ({ raw_material_id: "", requested_qty: "", unit_id: "", remarks: "" });

export default function RequestsTab({ requests, kitchenId, outlets, materials, units, isDark, canCreate, canEdit, onRefresh }) {
  const inputClass = getInputClass(isDark);
  const { user } = useAuthStore();
  const isAdminRole = ["Super Admin", "Admin", "Developer"].includes(user?.role_name);
  const reqPerms = getStoredPermissions()?.production_requests || {};
  const can = (a) => isAdminRole || Boolean(reqPerms[a]);
  const isOwn = (r) =>
    Boolean(user?.id && r?.created_by && Number(user.id) === Number(r.created_by));
  // Backend: submit accepts can_submit OR can_edit; approve/reject accept
  // can_approve/can_reject OR can_edit - and the creator can never
  // review/approve/reject their own request.
  const canSubmit = canEdit || can("can_submit");
  const canApprove = canEdit || can("can_approve");
  const canReject = canEdit || can("can_reject");
  const [showCreate, setShowCreate] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustItems, setAdjustItems] = useState({});
  const [approvalTarget, setApprovalTarget] = useState(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [form, setForm] = useState({
    request_no: "",
    request_date: new Date().toISOString().split("T")[0],
    required_date: "",
    from_outlet_id: outlets?.[0]?.id || "",
    priority: "Normal",
    remarks: "",
    items: [emptyItem()],
  });

  const resetForm = () => setForm({
    request_no: "",
    request_date: new Date().toISOString().split("T")[0],
    required_date: "",
    from_outlet_id: outlets?.[0]?.id || "",
    priority: "Normal",
    remarks: "",
    items: [emptyItem()],
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
    if (saving) return;
    if (!form.request_no || !form.from_outlet_id || !form.items.some((it) => it.raw_material_id && Number(it.requested_qty) > 0)) {
      return toast.error("Request number, outlet and at least one item are required");
    }
    if (form.items.some((it) => Number(it.requested_qty) < 0)) {
      return toast.error("Quantities cannot be negative");
    }
    setSaving(true);
    try {
      await productionAPI.createProductionRequest({
        ...form,
        to_central_kitchen_id: Number(kitchenId),
        from_outlet_id: Number(form.from_outlet_id),
        items: form.items.filter((it) => it.raw_material_id && Number(it.requested_qty) > 0).map((it) => ({
          raw_material_id: Number(it.raw_material_id),
          requested_qty: Number(it.requested_qty),
          unit_id: Number(it.unit_id),
          remarks: it.remarks || null,
        })),
      });
      toast.success("Production request created");
      setShowCreate(false);
      resetForm();
      onRefresh();
    } catch (error) { toast.error(error?.response?.data?.message || "Failed to create request"); }
    finally { setSaving(false); }
  };

  const transition = (id, status) => {
    toast.promise(
      productionAPI.updateRequestStatus(id, { status }).then(onRefresh),
      { loading: `Setting ${status}...`, success: `Marked ${status}`, error: (e) => e?.response?.data?.message || "Update failed" }
    );
  };

  const openView = async (r) => {
    setAdjusting(false);
    setAdjustItems({});
    try { const res = await productionAPI.getProductionRequest(r.id); setViewing(res?.data?.data || r); }
    catch { setViewing(r); }
  };

  // Req #21: Bakehouse-accepted qty lives in planned_qty (schema default 0 =
  // unset), requested_qty is the immutable original. Backend enforces
  // kitchen-side-only edit while Submitted/Reviewed; mirror it for the UI.
  const bakeQty = (it) => (Number(it.planned_qty) > 0 ? it.planned_qty : it.requested_qty);
  const canAdjustItems = (r) => canEdit && !isOwn(r) && ["Submitted", "Reviewed"].includes(r?.status);

  const startAdjust = () => {
    const init = {};
    (viewing?.items || []).forEach((it) => {
      init[it.id] = { qty: String(bakeQty(it) ?? ""), reason: it.reason_for_adjustment || "" };
    });
    setAdjustItems(init);
    setAdjusting(true);
  };

  const saveAdjust = async () => {
    if (saving) return;
    const items = Object.entries(adjustItems).map(([id, v]) => ({ id: Number(id), planned_qty: Number(v.qty), reason_for_adjustment: String(v.reason || "").trim() }));
    for (const it of items) {
      if (!Number.isFinite(it.planned_qty) || it.planned_qty <= 0) { toast.error("Every Bakehouse quantity must be a positive number"); return; }
      const src = (viewing?.items || []).find((x) => Number(x.id) === it.id);
      if (src && it.planned_qty !== Number(src.requested_qty) && it.reason_for_adjustment === "") {
        toast.error("Reason for adjustment is required when changing the requested quantity"); return;
      }
    }
    setSaving(true);
    try {
      const res = await productionAPI.updateRequestItems(viewing.id, { items });
      toast.success("Bakehouse quantities saved");
      setAdjusting(false);
      if (res?.data?.data) setViewing(res.data.data);
      onRefresh?.();
    } catch (e) { toast.error(e?.response?.data?.message || "Failed to save quantities"); }
    finally { setSaving(false); }
  };

  // Req #22: approval is a decision on the quantities ALREADY saved by the
  // Req #21 adjustment step, so the confirmation must preview fresh item-level
  // data from the server - the list row doesn't carry planned_qty/reason.
  const openApprove = async (r) => {
    setApprovalLoading(true);
    try {
      const res = await productionAPI.getProductionRequest(r.id);
      const data = res?.data?.data;
      if (!data) throw new Error("Request details unavailable");
      setApprovalTarget(data);
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message || "Failed to load request details");
    } finally {
      setApprovalLoading(false);
    }
  };

  const confirmApprove = async () => {
    if (approvalSaving || !approvalTarget) return;
    setApprovalSaving(true);
    try {
      // No item overrides are sent - approval confirms the planned_qty values
      // the Bakehouse already saved (or the outlet's requested_qty where unset).
      await productionAPI.updateRequestStatus(approvalTarget.id, { status: "Approved" });
      toast.success(`Request ${approvalTarget.request_no} approved`);
      if (viewing?.id === approvalTarget.id) setViewing(null);
      setApprovalTarget(null);
      onRefresh?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Approval failed");
    } finally {
      setApprovalSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex justify-end">
          <button onClick={() => setShowCreate(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#7367F0] px-3 text-[14px] font-medium text-white hover:bg-[#6354D8]">
            <Plus size={16} /> New Request
          </button>
        </div>
      )}
      <SectionCard isDark={isDark}>
        {requests.length === 0 ? <EmptyState isDark={isDark} title="No Production Requests Found" subtitle="Production requests raised by outlets will appear here." /> : (
          <TableWrapper isDark={isDark}>
            <table className="w-full border-collapse text-[13px]">
              <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                  <th className="px-3 py-3">Request No</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Outlet</th><th className="px-3 py-3">Priority</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                    <td className="px-3 py-3 font-medium">{r.request_no}</td>
                    <td className="px-3 py-3">{r.request_date}</td>
                    <td className="px-3 py-3">{r.outlet_name}</td>
                    <td className="px-3 py-3">{r.priority}</td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openView(r)} className={`rounded p-1.5 ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`} title="View"><Eye size={16} className="text-[#7367F0]" /></button>
                        {canSubmit && r.status === "Draft" && (
                          <button onClick={() => transition(r.id, "Submitted")} className="rounded p-1.5 text-blue-500" title="Submit"><Send size={16} /></button>
                        )}
                        {canEdit && r.status === "Submitted" && !isOwn(r) && (
                          <button onClick={() => transition(r.id, "Reviewed")} className="rounded p-1.5 text-sky-500" title="Review"><CheckCircle size={16} /></button>
                        )}
                        {(r.status === "Submitted" || r.status === "Reviewed") && !isOwn(r) && (
                          <>
                            {canApprove && (
                              <button onClick={() => openApprove(r)} disabled={approvalLoading} className="rounded p-1.5 text-emerald-500 disabled:opacity-40" title="Approve"><CheckCircle size={16} /></button>
                            )}
                            {canReject && (
                              <button onClick={() => transition(r.id, "Rejected")} className="rounded p-1.5 text-rose-500" title="Reject"><XCircle size={16} /></button>
                            )}
                          </>
                        )}
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
          <div className={`w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">New Production Request</h3>
              <button onClick={() => setShowCreate(false)}><X size={20} /></button>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input placeholder="Request No" value={form.request_no} onChange={(e) => setForm({ ...form, request_no: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                <select value={form.from_outlet_id} onChange={(e) => setForm({ ...form, from_outlet_id: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                  <option value="">Select Outlet</option>
                  {(outlets || []).map((o) => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
                </select>
                <input type="date" value={form.request_date} onChange={(e) => setForm({ ...form, request_date: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                <input type="date" placeholder="Required Date" value={form.required_date} onChange={(e) => setForm({ ...form, required_date: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                  <option value="Low">Low</option><option value="Normal">Normal</option><option value="High">High</option><option value="Urgent">Urgent</option>
                </select>
                <input placeholder="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold">Items</h4>
                  <button onClick={addItem} className="text-[12px] font-medium text-[#7367F0]">+ Add Item</button>
                </div>
                <div className="space-y-2">
                  {form.items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 items-center gap-2">
                      <select value={it.raw_material_id} onChange={(e) => updateItem(idx, "raw_material_id", e.target.value)} className={`col-span-5 h-9 rounded-md border px-2 text-[13px] outline-none ${inputClass}`}>
                        <option value="">Select Material</option>
                        {(materials || []).map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}
                      </select>
                      <input type="number" min="0" placeholder="Qty" value={it.requested_qty} onChange={(e) => updateItem(idx, "requested_qty", e.target.value)} className={`col-span-2 h-9 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} />
                      <select value={it.unit_id} onChange={(e) => updateItem(idx, "unit_id", e.target.value)} className={`col-span-2 h-9 rounded-md border px-2 text-[13px] outline-none ${inputClass}`}>
                        <option value="">Unit</option>
                        {(units || []).map((u) => <option key={u.id} value={u.id}>{u.unit_name}</option>)}
                      </select>
                      <input placeholder="Remarks" value={it.remarks} onChange={(e) => updateItem(idx, "remarks", e.target.value)} className={`col-span-2 h-9 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} />
                      <button onClick={() => removeItem(idx)} disabled={form.items.length === 1} className="col-span-1 text-rose-500 disabled:opacity-30"><X size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowCreate(false)} disabled={saving} className="h-10 rounded-lg border px-4 text-[14px] font-medium disabled:opacity-50">Cancel</button>
                <button onClick={create} disabled={saving} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8] disabled:opacity-50">{saving ? "Saving…" : "Save Request"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewing(null)}>
          <div className={`w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{viewing.request_no}</h3>
              <button onClick={() => setViewing(null)}><X size={20} /></button>
            </div>
            <div className="space-y-3 p-4 text-[13px]">
              <div className="grid grid-cols-2 gap-2">
                <p><strong>Outlet:</strong> {viewing.outlet_name}</p>
                <p><strong>Status:</strong> {viewing.status}</p>
                <p><strong>Date:</strong> {viewing.request_date}</p>
                <p><strong>Required:</strong> {viewing.required_date || "-"}</p>
                <p className="col-span-2"><strong>Remarks:</strong> {viewing.remarks || "-"}</p>
              </div>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className={`border-b text-left ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                    <th className="px-2 py-2">Material</th><th className="px-2 py-2">Requested Qty</th><th className="px-2 py-2">Bakehouse Qty</th><th className="px-2 py-2">Unit</th><th className="px-2 py-2">Adjustment Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewing.items || []).map((it) => (
                    <tr key={it.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                      <td className="px-2 py-2">{it.material_name}</td>
                      <td className="px-2 py-2">{it.requested_qty}</td>
                      <td className="px-2 py-2">
                        {adjusting ? (
                          <input type="number" min="0.0001" step="any" value={adjustItems[it.id]?.qty ?? ""} onChange={(e) => setAdjustItems((s) => ({ ...s, [it.id]: { ...s[it.id], qty: e.target.value } }))} className={`h-8 w-24 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} />
                        ) : (
                          bakeQty(it)
                        )}
                      </td>
                      <td className="px-2 py-2">{it.unit_name}</td>
                      <td className="px-2 py-2">
                        {adjusting ? (
                          <input value={adjustItems[it.id]?.reason ?? ""} onChange={(e) => setAdjustItems((s) => ({ ...s, [it.id]: { ...s[it.id], reason: e.target.value } }))} placeholder="Reason" className={`h-8 w-full min-w-[120px] rounded-md border px-2 text-[13px] outline-none ${inputClass}`} />
                        ) : (
                          it.reason_for_adjustment || "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {canAdjustItems(viewing) && !adjusting && (
                <div className="flex justify-end">
                  <button onClick={startAdjust} className="rounded-md bg-[#7367F0] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#6354D8]">Adjust Quantities</button>
                </div>
              )}
              {adjusting && (
                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => { setAdjusting(false); setAdjustItems({}); }} className={`rounded-md border px-4 py-2 text-[13px] font-medium ${isDark ? "border-[#3B405A]" : "border-[#DBDADE]"}`}>Cancel</button>
                  <button onClick={saveAdjust} disabled={saving} className="rounded-md bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60">{saving ? "Saving…" : "Save Bakehouse Qty"}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {approvalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !approvalSaving && setApprovalTarget(null)}>
          <div className={`w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">Approve / Accept Request</h3>
              <button onClick={() => !approvalSaving && setApprovalTarget(null)}><X size={20} /></button>
            </div>
            <div className="space-y-3 p-4 text-[13px]">
              <div className="grid grid-cols-2 gap-2">
                <p><strong>Request No:</strong> {approvalTarget.request_no}</p>
                <p><strong>Outlet:</strong> {approvalTarget.outlet_name}</p>
                <p><strong>Required:</strong> {approvalTarget.required_date || "-"}</p>
                <p><strong>Status:</strong> {approvalTarget.status}</p>
              </div>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className={`border-b text-left ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                    <th className="px-2 py-2">Material</th><th className="px-2 py-2">Requested Qty</th><th className="px-2 py-2">Bakehouse Qty</th><th className="px-2 py-2">Unit</th><th className="px-2 py-2">Adjustment Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(approvalTarget.items || []).map((it) => (
                    <tr key={it.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                      <td className="px-2 py-2">{it.material_name}</td>
                      <td className="px-2 py-2">{it.requested_qty}</td>
                      <td className="px-2 py-2 font-medium">{bakeQty(it)}</td>
                      <td className="px-2 py-2">{it.unit_name}</td>
                      <td className="px-2 py-2">{it.reason_for_adjustment || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={`rounded-md border px-3 py-2 text-[13px] ${isDark ? "border-[#3B405A] bg-[#3B405A]/40" : "border-[#EBE9F1] bg-[#F8F7FA]"}`}>
                Approve this request with the Bakehouse quantities shown? Approval confirms these quantities for downstream fulfilment and dispatch.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={() => setApprovalTarget(null)} disabled={approvalSaving} className={`rounded-md border px-4 py-2 text-[13px] font-medium disabled:opacity-50 ${isDark ? "border-[#3B405A]" : "border-[#DBDADE]"}`}>Cancel</button>
                <button onClick={confirmApprove} disabled={approvalSaving} className="rounded-md bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60">{approvalSaving ? "Approving…" : "Approve Request"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

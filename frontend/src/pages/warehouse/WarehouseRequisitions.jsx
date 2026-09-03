import { useEffect, useState } from "react";
import { warehouseAPI } from "../../services/api";
import { SectionCard, TableWrapper, LoadingRows, EmptyState } from "../../components/ui";
import { KpiCard, WarehouseStatusBadge, fmtCurrency, fmtQty, fmtDate, num, EmptyRow } from "./WarehouseShared";
import { getInputClass } from "../../components/ui";
import { Search, RotateCcw, Plus, Eye, CheckCircle, XCircle, Truck, ClipboardList } from "lucide-react";
import toast from "react-hot-toast";

export default function WarehouseRequisitions({ locationId, locations, materials, isDark }) {
  const [loading, setLoading] = useState(true);
  const [requisitions, setRequisitions] = useState([]);
  const [filters, setFilters] = useState({ search: "", status: "", from: "", to: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState(null);
  const [approval, setApproval] = useState({ items: [], open: false });
  const [warehouseStock, setWarehouseStock] = useState({});
  const [saving, setSaving] = useState(false);
  const inputClass = getInputClass(isDark);

  const warehouses = locations.filter((l) => l.location_type === "Central Warehouse");
  const outlets = locations.filter((l) => l.location_type === "Outlet");

  // Requisitions are meant to reflect what the warehouse actually has, so
  // the create form shows live available quantity per material rather than
  // making the requester guess or check a separate tab.
  const fetchWarehouseStock = async (fromLocationId) => {
    if (!fromLocationId) { setWarehouseStock({}); return; }
    try {
      const res = await warehouseAPI.getStock({ location_id: fromLocationId });
      const rows = res?.data?.data || [];
      setWarehouseStock(Object.fromEntries(rows.map((r) => [String(r.raw_material_id), r])));
    } catch { setWarehouseStock({}); }
  };

  const [form, setForm] = useState({
    requisition_no: "",
    from_location_id: warehouses[0]?.id || "",
    to_location_id: outlets[0]?.id || "",
    request_date: new Date().toISOString().split("T")[0],
    required_date: "",
    remarks: "",
    items: [{ raw_material_id: "", requested_qty: "", unit_id: "", remarks: "" }],
  });

  const fetchRequisitions = async () => {
    setLoading(true);
    try {
      const res = await warehouseAPI.getRequisitions(filters);
      setRequisitions(res?.data?.data || []);
    } catch (error) { toast.error("Failed to load outlet purchase orders"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRequisitions(); }, [filters]);

  const addItem = () => setForm({ ...form, items: [...form.items, { raw_material_id: "", requested_qty: "", unit_id: "", remarks: "" }] });
  const updateItem = (idx, key, value) => {
    const items = [...form.items];
    items[idx][key] = value;
    if (key === "raw_material_id") {
      const mat = materials.find((m) => String(m.id) === value);
      if (mat) items[idx].unit_id = String(mat.unit_id);
    }
    setForm({ ...form, items });
  };

  const create = async (submit = false) => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = { ...form, items: form.items.map((it) => ({ ...it, raw_material_id: Number(it.raw_material_id), requested_qty: Number(it.requested_qty), unit_id: Number(it.unit_id) })) };
      const created = await warehouseAPI.createRequisition(payload);
      if (submit && created?.data?.data?.id) await warehouseAPI.submitRequisition(created.data.data.id);
      toast.success(submit ? "Outlet Purchase Order submitted" : "Outlet Purchase Order saved");
      setShowCreate(false);
      setForm({ requisition_no: "", from_location_id: warehouses[0]?.id || "", to_location_id: outlets[0]?.id || "", request_date: new Date().toISOString().split("T")[0], required_date: "", remarks: "", items: [{ raw_material_id: "", requested_qty: "", unit_id: "", remarks: "" }] });
      fetchRequisitions();
    } catch (error) { toast.error(error.response?.data?.message || "Save failed"); }
    finally { setSaving(false); }
  };

  const openDetail = async (r) => {
    try {
      const res = await warehouseAPI.getRequisition(r.id);
      const d = res?.data?.data;
      setDetail(d);
      setApproval({ open: false, items: (d?.items || []).map((it) => ({ ...it, approved_qty: "", rejected_qty: "", approval_remarks: "" })) });
    } catch (error) { toast.error("Failed to load outlet purchase order"); }
  };

  const approve = async (reject = false) => {
    try {
      const payload = {
        items: approval.items.map((it) => ({ id: it.id, approved_qty: reject ? 0 : num(it.approved_qty), rejected_qty: reject ? num(it.requested_qty) : 0, remarks: it.approval_remarks })),
      };
      await warehouseAPI.approveRequisition(detail.id, payload);
      toast.success(reject ? "Rejected" : "Approved");
      setApproval({ ...approval, open: false });
      openDetail(detail);
      fetchRequisitions();
    } catch (error) { toast.error(error.response?.data?.message || "Approval failed"); }
  };

  const dispatch = async () => {
    try {
      const items = detail.items.filter((it) => num(it.approved_qty) > 0 && num(it.dispatched_qty) < num(it.approved_qty));
      if (!items.length) return toast.error("Nothing to dispatch");
      const payload = {
        transfer_no: `TRF-${Date.now()}`,
        dispatch_date: new Date().toISOString().split("T")[0],
        items: items.map((it) => ({ raw_material_id: it.raw_material_id, dispatched_qty: Number(it._dispatch || 0), unit_id: it.unit_id, batch_no: it._batch || "", expiry_date: it._expiry || null })),
      };
      await warehouseAPI.dispatchRequisition(detail.id, payload);
      toast.success("Dispatched");
      openDetail(detail);
      fetchRequisitions();
    } catch (error) { toast.error(error.response?.data?.message || "Dispatch failed"); }
  };

  const filtered = requisitions.filter((r) => {
    const term = filters.search.toLowerCase();
    return (term === "" || (r.requisition_no || "").toLowerCase().includes(term) || (r.to_location || "").toLowerCase().includes(term))
      && (filters.status === "" || r.status === filters.status)
      && (filters.from === "" || String(r.from_location_id) === filters.from)
      && (filters.to === "" || String(r.to_location_id) === filters.to);
  });

  const reset = () => setFilters({ search: "", status: "", from: "", to: "" });

  const statusOptions = ["Draft", "Submitted", "Approved", "Partially Approved", "Rejected", "Dispatched", "Partially Received", "Received"];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={ClipboardList} label="Draft" value={requisitions.filter((r) => r.status === "Draft").length} isDark={isDark} />
        <KpiCard icon={ClipboardList} label="Submitted" value={requisitions.filter((r) => r.status === "Submitted").length} isDark={isDark} />
        <KpiCard icon={ClipboardList} label="Approved" value={requisitions.filter((r) => r.status === "Approved").length} isDark={isDark} />
        <KpiCard icon={ClipboardList} label="Partially Approved" value={requisitions.filter((r) => r.status === "Partially Approved").length} isDark={isDark} />
        <KpiCard icon={Truck} label="Pending Dispatch" value={requisitions.filter((r) => r.status === "Approved").length} isDark={isDark} />
      </div>

      <SectionCard title="Filters" isDark={isDark}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className={`h-10 w-full rounded-lg border pl-9 pr-3 text-[14px] outline-none ${inputClass}`} placeholder="Search outlet purchase order or outlet" />
          </div>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">All Status</option>
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">From Warehouse</option>
            {warehouses.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}
          </select>
          <select value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">To Outlet</option>
            {outlets.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}
          </select>
          <button onClick={reset} className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#A5A8B6]" : "border-[#EBE9F1] bg-white text-[#6F6B7D]"}`}>
            <RotateCcw size={14} /> Reset
          </button>
          <button onClick={() => { setShowCreate(true); fetchWarehouseStock(form.from_location_id); }} className="flex h-10 items-center gap-2 rounded-lg bg-[#7367F0] px-3 text-[13px] font-semibold text-white hover:bg-[#6354D8]">
            <Plus size={16} /> New Outlet Purchase Order
          </button>
        </div>
      </SectionCard>

      <SectionCard isDark={isDark}>
        <TableWrapper isDark={isDark}>
          <table className="w-full border-collapse text-[13px]">
            <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
              <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                <th className="px-3 py-3">Outlet PO No</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Outlet</th>
                <th className="px-3 py-3">Warehouse</th>
                <th className="px-3 py-3 text-center">Items</th>
                <th className="px-3 py-3 text-right">Requested</th>
                <th className="px-3 py-3 text-right">Approved</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3">Created By</th>
                <th className="sticky right-0 px-3 py-3 text-center" style={{ background: isDark ? "#2F3349" : "white" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRows rows={5} cols={10} isDark={isDark} /> : (
                <>
                  {filtered.map((r) => (
                    <tr key={r.id} className={`border-b transition ${isDark ? "border-[#3B405A] hover:bg-[#3B405A]/30" : "border-[#F3F2F7] hover:bg-[#F8F7FA]"}`}>
                      <td className="px-3 py-2.5 font-medium">{r.requisition_no}</td>
                      <td className="px-3 py-2.5">{fmtDate(r.request_date)}</td>
                      <td className="px-3 py-2.5">{r.to_location}</td>
                      <td className="px-3 py-2.5">{r.from_location}</td>
                      <td className="px-3 py-2.5 text-center">{r.item_count || r.items || 0}</td>
                      <td className="px-3 py-2.5 text-right">{fmtQty(r.total_requested)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtQty(r.total_approved)}</td>
                      <td className="px-3 py-2.5 text-center"><WarehouseStatusBadge status={r.status} /></td>
                      <td className="px-3 py-2.5">{r.created_by_name}</td>
                      <td className="sticky right-0 px-3 py-2.5 text-center" style={{ background: isDark ? "#2F3349" : "white" }}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openDetail(r)} className={`rounded-md p-1.5 ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><Eye size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && <EmptyRow colSpan={10} isDark={isDark} />}
                </>
              )}
            </tbody>
          </table>
        </TableWrapper>
      </SectionCard>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">Create Outlet Purchase Order</h3>
              <button onClick={() => setShowCreate(false)} className="text-2xl leading-none">&times;</button>
            </div>
            <div className="space-y-4 p-4">
              <SectionCard title="Outlet Purchase Order Details" isDark={isDark}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <input value={form.requisition_no} onChange={(e) => setForm({ ...form, requisition_no: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} placeholder="Outlet PO No" />
                  <select value={form.from_location_id} onChange={(e) => { const v = e.target.value; setForm({ ...form, from_location_id: v }); fetchWarehouseStock(v); }} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                    <option value="">Requested Warehouse</option>
                    {warehouses.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}
                  </select>
                  <select value={form.to_location_id} onChange={(e) => setForm({ ...form, to_location_id: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                    <option value="">Outlet</option>
                    {outlets.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}
                  </select>
                  <input type="date" value={form.request_date} onChange={(e) => setForm({ ...form, request_date: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                  <input type="date" value={form.required_date} onChange={(e) => setForm({ ...form, required_date: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                  <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} placeholder="Remarks" />
                </div>
              </SectionCard>

              <SectionCard title="Items" isDark={isDark}>
                <div className="space-y-3">
                  {form.items.map((it, idx) => {
                    const mat = materials.find((m) => String(m.id) === it.raw_material_id);
                    const uom = mat?.unit_name || "";
                    const available = it.raw_material_id ? num(warehouseStock[it.raw_material_id]?.current_qty) : null;
                    const overRequested = available !== null && Number(it.requested_qty || 0) > available;
                    return (
                      <div key={idx} className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                          <select value={it.raw_material_id} onChange={(e) => updateItem(idx, "raw_material_id", e.target.value)} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                            <option value="">Material</option>
                            {materials.map((m) => {
                              const stock = warehouseStock[String(m.id)];
                              return <option key={m.id} value={m.id}>{m.material_name}{stock ? ` (${fmtQty(stock.current_qty)} ${stock.unit_name || ""} in stock)` : ""}</option>;
                            })}
                          </select>
                          <input type="number" value={it.requested_qty} onChange={(e) => updateItem(idx, "requested_qty", e.target.value)} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass} ${overRequested ? "border-rose-400" : ""}`} placeholder={`Qty (${uom})`} />
                          <input value={it.remarks} onChange={(e) => updateItem(idx, "remarks", e.target.value)} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} placeholder="Item Remarks" />
                          <div className={`flex h-10 items-center rounded-lg border px-3 text-[14px] ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>{uom || "Unit"}</div>
                          <button onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })} className="h-10 rounded-lg border border-rose-300 text-rose-500" disabled={form.items.length === 1}>Remove</button>
                        </div>
                        {it.raw_material_id && (
                          <p className={`mt-1.5 text-[12px] ${overRequested ? "text-rose-500" : isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>
                            {available !== null ? `Available in warehouse: ${fmtQty(available)} ${uom}` : "No stock record for this material at this warehouse"}
                            {overRequested ? " — requested quantity exceeds current stock" : ""}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={addItem} className="flex h-9 items-center gap-1.5 rounded-lg border border-[#7367F0] px-3 text-[13px] font-medium text-[#7367F0]">
                    <Plus size={14} /> Add Item
                  </button>
                </div>
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreate(false)} disabled={saving} className="h-10 rounded-lg border px-4 text-[14px] font-medium disabled:opacity-50">Cancel</button>
                <button onClick={() => create(false)} disabled={saving} className="h-10 rounded-lg border border-[#7367F0] px-4 text-[14px] font-medium text-[#7367F0] disabled:opacity-50">{saving ? "Saving…" : "Save Draft"}</button>
                <button onClick={() => create(true)} disabled={saving} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8] disabled:opacity-50">{saving ? "Submitting…" : "Submit Outlet Purchase Order"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{detail.requisition_no}</h3>
              <button onClick={() => setDetail(null)} className="text-2xl leading-none">&times;</button>
            </div>
            <div className="space-y-4 p-4">
              <SectionCard isDark={isDark}>
                <div className="grid grid-cols-2 gap-4 text-[14px]">
                  <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Outlet:</span> {detail.to_location}</div>
                  <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Warehouse:</span> {detail.from_location}</div>
                  <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Requested Date:</span> {fmtDate(detail.request_date)}</div>
                  <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Required Date:</span> {fmtDate(detail.required_date)}</div>
                  <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Status:</span> <WarehouseStatusBadge status={detail.status} /></div>
                </div>
              </SectionCard>

              <SectionCard title="Items" isDark={isDark}>
                <TableWrapper isDark={isDark}>
                  <table className="w-full border-collapse text-[13px]">
                    <thead className={`${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                      <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                        <th className="px-2 py-2">Material</th>
                        <th className="px-2 py-2 text-right">Requested</th>
                        <th className="px-2 py-2 text-right">Approved</th>
                        <th className="px-2 py-2 text-right">Dispatched</th>
                        <th className="px-2 py-2 text-right">Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((it) => (
                        <tr key={it.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                          <td className="px-2 py-2">{it.material_name}</td>
                          <td className="px-2 py-2 text-right">{fmtQty(it.requested_qty)}</td>
                          <td className="px-2 py-2 text-right">{fmtQty(it.approved_qty)}</td>
                          <td className="px-2 py-2 text-right">{fmtQty(it.dispatched_qty)}</td>
                          <td className="px-2 py-2">{it.unit_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button onClick={() => setDetail(null)} className="h-10 rounded-lg border px-4 text-[14px] font-medium">Close</button>
                {detail.status === "Draft" && <button onClick={() => { toast.promise(warehouseAPI.submitRequisition(detail.id).then(() => { openDetail(detail); fetchRequisitions(); }), { loading: "Submitting...", success: "Submitted", error: "Failed" }); }} className="h-10 rounded-lg bg-[#00CFE8] px-4 text-[14px] font-semibold text-white">Submit</button>}
                {(detail.status === "Submitted" || detail.status === "Partially Approved") && <button onClick={() => setApproval({ ...approval, open: true })} className="h-10 rounded-lg bg-[#28C76F] px-4 text-[14px] font-semibold text-white"><CheckCircle size={16} className="inline mr-1" /> Approve</button>}
                {detail.status === "Submitted" && <button onClick={() => approve(true)} className="h-10 rounded-lg bg-[#EA5455] px-4 text-[14px] font-semibold text-white"><XCircle size={16} className="inline mr-1" /> Reject</button>}
                {detail.status === "Approved" && <button onClick={() => setApproval({ ...approval, open: true, mode: "dispatch" })} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white"><Truck size={16} className="inline mr-1" /> Dispatch</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {approval.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-4xl rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{approval.mode === "dispatch" ? "Dispatch Outlet Purchase Order" : "Approve / Reject Items"}</h3>
            </div>
            <div className="p-4">
              <TableWrapper isDark={isDark}>
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                      <th className="px-2 py-2">Material</th>
                      <th className="px-2 py-2 text-right">Requested</th>
                      <th className="px-2 py-2 text-right">Approved</th>
                      <th className="px-2 py-2 text-right">{approval.mode === "dispatch" ? "Dispatch Qty" : "Approve Qty"}</th>
                      <th className="px-2 py-2">{approval.mode === "dispatch" ? "Batch / Expiry" : "Remarks"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approval.items.map((it, idx) => (
                      <tr key={it.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                        <td className="px-2 py-2">{it.material_name}</td>
                        <td className="px-2 py-2 text-right">{fmtQty(it.requested_qty)}</td>
                        <td className="px-2 py-2 text-right">{fmtQty(it.approved_qty)}</td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" value={it._dispatch || ""} onChange={(e) => {
                            const items = [...approval.items];
                            items[idx]._dispatch = e.target.value;
                            items[idx].approved_qty = e.target.value;
                            setApproval({ ...approval, items });
                          }} className={`w-24 rounded-md border px-2 py-1 text-right text-[13px] outline-none ${inputClass}`} />
                        </td>
                        <td className="px-2 py-2">
                          {approval.mode === "dispatch" ? (
                            <div className="flex gap-2">
                              <input value={it._batch || ""} onChange={(e) => { const items = [...approval.items]; items[idx]._batch = e.target.value; setApproval({ ...approval, items }); }} className={`w-20 rounded-md border px-2 py-1 text-[13px] outline-none ${inputClass}`} placeholder="Batch" />
                              <input type="date" value={it._expiry || ""} onChange={(e) => { const items = [...approval.items]; items[idx]._expiry = e.target.value; setApproval({ ...approval, items }); }} className={`w-32 rounded-md border px-2 py-1 text-[13px] outline-none ${inputClass}`} />
                            </div>
                          ) : (
                            <input value={it.approval_remarks || ""} onChange={(e) => { const items = [...approval.items]; items[idx].approval_remarks = e.target.value; setApproval({ ...approval, items }); }} className={`w-full rounded-md border px-2 py-1 text-[13px] outline-none ${inputClass}`} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setApproval({ ...approval, open: false })} className="h-10 rounded-lg border px-4 text-[14px] font-medium">Cancel</button>
                {approval.mode === "dispatch" ? (
                  <button onClick={dispatch} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8]">Confirm Dispatch</button>
                ) : (
                  <>
                    <button onClick={() => approve(true)} className="h-10 rounded-lg bg-[#EA5455] px-4 text-[14px] font-semibold text-white">Reject</button>
                    <button onClick={() => approve(false)} className="h-10 rounded-lg bg-[#28C76F] px-4 text-[14px] font-semibold text-white">Approve</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

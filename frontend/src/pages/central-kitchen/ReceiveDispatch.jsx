import { useEffect, useState } from "react";
import { productionAPI, warehouseAPI, getStoredPermissions } from "../../services/api";
import { PageHeader, SectionCard, TableWrapper, EmptyState, LoadingSpinner, getThemeMode, getInputClass } from "../../components/ui";
import { Truck, X, PackageCheck } from "lucide-react";
import toast from "react-hot-toast";

const num = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v));

const DISCREPANCY_REASON_OPTIONS = [
  { value: "SHORT_SUPPLY", label: "Short Supply" },
  { value: "DAMAGED_IN_TRANSIT", label: "Damaged in Transit" },
  { value: "NOT_RECEIVED", label: "Not Received" },
  { value: "WRONG_ITEM", label: "Wrong Item" },
  { value: "QUALITY_ISSUE", label: "Quality Issue" },
  { value: "EXPIRED", label: "Expired" },
  { value: "REJECTED", label: "Rejected" },
  { value: "OTHER", label: "Other" },
];

// One key per receipt attempt - kept across retries of the same submit so
// the backend UNIQUE(transfer_id, receipt_key) can never double-apply stock.
const newReceiptKey = () => {
  try { return crypto.randomUUID(); }
  catch { return `rcpt-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
};

export default function ReceiveDispatch() {
  const isDark = getThemeMode() === "dark";
  const inputClass = getInputClass(isDark);
  const [loading, setLoading] = useState(true);
  const [outletLocations, setOutletLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [dispatches, setDispatches] = useState([]);
  const [detail, setDetail] = useState(null);
  const [receipt, setReceipt] = useState({});
  const [receiptKey, setReceiptKey] = useState(null);
  const [receiptRemarks, setReceiptRemarks] = useState("");
  const [receiptHistory, setReceiptHistory] = useState([]);
  const [receiptHistoryLoading, setReceiptHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const canReceive = !!(getStoredPermissions()?.production_dispatch?.can_edit);

  const fetchOutletLocations = async () => {
    try {
      const res = await warehouseAPI.getLocations({ scope: "all" });
      const outlets = (res?.data?.data || []).filter((l) => l.location_type === "Outlet");
      setOutletLocations(outlets);
      if (outlets.length && !locationId) setLocationId(String(outlets[0].id));
    } catch (error) { toast.error("Failed to load outlet locations"); }
  };

  const fetchDispatches = async () => {
    if (!locationId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await productionAPI.getProductionDispatches({ to_location_id: locationId });
      const pending = (res?.data?.data || []).filter((d) => d.status === "In Transit" || d.status === "Partially Received");
      setDispatches(pending);
    } catch (error) { toast.error("Failed to load dispatches"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchOutletLocations(); }, []);
  useEffect(() => { fetchDispatches(); }, [locationId]);

  const fetchReceiptHistory = async (dispatchId) => {
    setReceiptHistoryLoading(true);
    try {
      const res = await productionAPI.getProductionDispatchReceipts(dispatchId);
      setReceiptHistory(res?.data?.data || []);
    } catch { setReceiptHistory([]); }
    finally { setReceiptHistoryLoading(false); }
  };

  const openDetail = async (d) => {
    try {
      const res = await productionAPI.getProductionDispatch(d.id);
      const full = res?.data?.data || d;
      setDetail(full);
      setReceipt((full.items || []).reduce((acc, it) => ({
        ...acc,
        [it.id]: {
          received_qty: Math.max(0, num(it.dispatched_qty) - num(it.received_qty)).toString(),
          short_qty: "0",
          damaged_qty: "0",
          reason: "",
          remarks: "",
        },
      }), {}));
      setReceiptKey(newReceiptKey());
      setReceiptRemarks("");
      fetchReceiptHistory(full.id);
    } catch (error) { toast.error("Failed to load dispatch details"); }
  };

  const updateReceipt = (id, key, value) => setReceipt((r) => ({ ...r, [id]: { ...r[id], [key]: value } }));

  const submitReceipt = async () => {
    if (saving) return;
    const items = Object.entries(receipt).map(([id, r]) => ({
      id: Number(id),
      received_qty: num(r.received_qty),
      short_qty: num(r.short_qty),
      damaged_qty: num(r.damaged_qty),
      discrepancy_reason: r.reason || null,
      remarks: r.remarks || null,
    }));
    if (items.some((it) => it.received_qty < 0 || it.short_qty < 0 || it.damaged_qty < 0)) {
      toast.error("Received, short and damaged quantities cannot be negative");
      return;
    }
    for (const it of items) {
      if ((it.damaged_qty > 0 || it.short_qty > 0) && !it.discrepancy_reason) {
        toast.error("Select a discrepancy reason for items with damaged or short quantity");
        return;
      }
      if (it.discrepancy_reason === "OTHER" && !String(it.remarks || "").trim()) {
        toast.error("Remarks are required when the discrepancy reason is Other");
        return;
      }
    }
    setSaving(true);
    try {
      await productionAPI.receiveProductionDispatch(detail.id, {
        received_at: new Date().toISOString().split("T")[0],
        items,
        receipt_key: receiptKey,
        receipt_remarks: receiptRemarks || null,
      });
      toast.success("Dispatch received");
      setDetail(null);
      fetchDispatches();
    } catch (error) { toast.error(error?.response?.data?.message || "Receipt failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden p-1">
      <PageHeader
        title="Receive Bakehouse Dispatch"
        subtitle="Confirm receipt of finished goods dispatched from the Bakehouse to your outlet."
        actions={outletLocations.length > 1 ? (
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            {outletLocations.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}
          </select>
        ) : null}
        isDark={isDark}
      />

      {!locationId && <EmptyState icon={Truck} isDark={isDark} title="No outlet location found" subtitle="Your account isn't linked to an outlet location." />}

      {locationId && (
        loading ? (
          <div className="flex h-48 items-center justify-center"><LoadingSpinner size={28} isDark={isDark} /></div>
        ) : (
          <SectionCard isDark={isDark}>
            {dispatches.length === 0 ? (
              <EmptyState icon={PackageCheck} isDark={isDark} title="Nothing pending receipt" subtitle="Dispatches from the Bakehouse awaiting receipt will appear here." />
            ) : (
              <TableWrapper isDark={isDark}>
                <table className="w-full border-collapse text-[13px]">
                  <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                    <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                      <th className="px-3 py-3">Dispatch No</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">From</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatches.map((d) => (
                      <tr key={d.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                        <td className="px-3 py-3 font-medium">{d.transfer_no}</td>
                        <td className="px-3 py-3">{d.dispatch_date}</td>
                        <td className="px-3 py-3">{d.from_location}</td>
                        <td className="px-3 py-3"><span className="rounded-full bg-[#FFEAC2] px-2 py-0.5 text-[11px] font-medium text-[#FF9F43]">{d.status}</span></td>
                        <td className="px-3 py-3">
                          {canReceive ? (
                            <button onClick={() => openDetail(d)} className="inline-flex items-center gap-1 rounded bg-[#7367F0] px-2 py-1 text-[11px] font-semibold text-white"><PackageCheck size={12} /> Receive</button>
                          ) : <span className="text-[11px] text-[#A5A8B6]">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
            )}
          </SectionCard>
        )
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className={`w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">Receive {detail.transfer_no}</h3>
              <button onClick={() => setDetail(null)}><X size={20} /></button>
            </div>
            <div className="p-4">
              <TableWrapper isDark={isDark}>
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                      <th className="px-2 py-2">Product</th><th className="px-2 py-2">Dispatched</th><th className="px-2 py-2">Already Received</th><th className="px-2 py-2">Pending to Receive</th><th className="px-2 py-2">Receiving Now</th><th className="px-2 py-2">Short / Not Received</th><th className="px-2 py-2">Damaged</th><th className="px-2 py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.items || []).map((it) => {
                      const pending = Math.max(0, num(it.dispatched_qty) - num(it.received_qty) - num(it.damaged_qty) - num(it.short_qty));
                      const needsReason = num(receipt[it.id]?.damaged_qty) > 0 || num(receipt[it.id]?.short_qty) > 0;
                      return (
                      <tr key={it.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                        <td className="px-2 py-2">{it.material_name}</td>
                        <td className="px-2 py-2">{Number(it.dispatched_qty).toFixed(2)} {it.unit_name}</td>
                        <td className="px-2 py-2">{Number(it.received_qty).toFixed(2)}</td>
                        <td className="px-2 py-2">{pending.toFixed(2)}</td>
                        <td className="px-2 py-2"><input type="number" min="0" value={receipt[it.id]?.received_qty || ""} onChange={(e) => updateReceipt(it.id, "received_qty", e.target.value)} className={`h-9 w-24 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} /></td>
                        <td className="px-2 py-2"><input type="number" min="0" value={receipt[it.id]?.short_qty || ""} onChange={(e) => updateReceipt(it.id, "short_qty", e.target.value)} className={`h-9 w-20 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} /></td>
                        <td className="px-2 py-2"><input type="number" min="0" value={receipt[it.id]?.damaged_qty || ""} onChange={(e) => updateReceipt(it.id, "damaged_qty", e.target.value)} className={`h-9 w-20 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} /></td>
                        <td className="px-2 py-2">
                          <div className="flex min-w-56 flex-col gap-1">
                            {needsReason && (
                              <select value={receipt[it.id]?.reason || ""} onChange={(e) => updateReceipt(it.id, "reason", e.target.value)} className={`h-9 rounded-md border px-2 text-[13px] outline-none ${inputClass}`}>
                                <option value="">Discrepancy reason *</option>
                                {DISCREPANCY_REASON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            )}
                            <input value={receipt[it.id]?.remarks || ""} onChange={(e) => updateReceipt(it.id, "remarks", e.target.value)} placeholder="Remarks" className={`h-9 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} />
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrapper>

              <div className="mt-4">
                <input value={receiptRemarks} onChange={(e) => setReceiptRemarks(e.target.value)} placeholder="Receipt remarks (optional)" className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputClass}`} />
              </div>

              <div className="mt-4">
                <h4 className={`mb-2 text-[12px] font-semibold uppercase tracking-wider ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Receipt History</h4>
                {receiptHistoryLoading ? (
                  <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Loading receipts…</p>
                ) : receiptHistory.length === 0 ? (
                  <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>No receipts recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {receiptHistory.map((r) => (
                      <div key={r.id} className={`rounded-md border p-3 ${Number(r.discrepancy_flag) === 1 ? (isDark ? "border-[#FF9F43] bg-[#FF9F43]/10" : "border-[#FF9F43] bg-[#FFF4E5]") : (isDark ? "border-[#3B405A]" : "border-[#EBE9F1]")}`}>
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
                          <span className={`font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{new Date(r.received_at).toLocaleString()}</span>
                          <span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>by {r.received_by_name || "—"}</span>
                          {Number(r.discrepancy_flag) === 1 && <span className="rounded-full bg-[#FF9F43]/20 px-2 py-0.5 text-[11px] font-semibold text-[#FF9F43]">Discrepancy</span>}
                          {r.receipt_remarks && <span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>· {r.receipt_remarks}</span>}
                        </div>
                        <TableWrapper isDark={isDark}>
                          <table className="w-full border-collapse text-[12px]">
                            <thead>
                              <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                                <th className="px-2 py-1.5">Item</th>
                                <th className="px-2 py-1.5 text-right">Received</th>
                                <th className="px-2 py-1.5 text-right">Damaged</th>
                                <th className="px-2 py-1.5 text-right">Short / Not Received</th>
                                <th className="px-2 py-1.5 text-right">Pending After</th>
                                <th className="px-2 py-1.5">Reason</th>
                                <th className="px-2 py-1.5">Remarks</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.items.map((ri) => (
                                <tr key={`${r.id}-${ri.transfer_item_id}`} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                                  <td className="px-2 py-1.5">{ri.material_name || `#${ri.transfer_item_id}`}</td>
                                  <td className="px-2 py-1.5 text-right">{Number(ri.received_qty).toFixed(2)}</td>
                                  <td className="px-2 py-1.5 text-right">{Number(ri.damaged_qty).toFixed(2)}</td>
                                  <td className="px-2 py-1.5 text-right">{Number(ri.short_qty).toFixed(2)}</td>
                                  <td className="px-2 py-1.5 text-right">{Number(ri.pending_after_qty).toFixed(2)}</td>
                                  <td className="px-2 py-1.5">{ri.discrepancy_reason ? (DISCREPANCY_REASON_OPTIONS.find((o) => o.value === ri.discrepancy_reason)?.label || ri.discrepancy_reason) : "—"}</td>
                                  <td className="px-2 py-1.5">{ri.remarks || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </TableWrapper>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setDetail(null)} className="h-10 rounded-lg border px-4 text-[14px] font-medium">Cancel</button>
                <button onClick={submitReceipt} disabled={saving} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8] disabled:opacity-50">{saving ? "Recording…" : "Confirm Receipt"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

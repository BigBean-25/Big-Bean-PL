import { useEffect, useState } from "react";
import { warehouseAPI } from "../../services/api";
import { SectionCard, TableWrapper, LoadingRows, EmptyState } from "../../components/ui";
import { KpiCard, WarehouseStatusBadge, fmtCurrency, fmtQty, fmtDate, num, EmptyRow } from "./WarehouseShared";
import { getInputClass } from "../../components/ui";
import { Search, RotateCcw, ArrowRightLeft, Eye, Package, CheckCircle, Printer } from "lucide-react";
import toast from "react-hot-toast";
import { amountInWords } from "./invoiceWords";

export default function WarehouseTransfers({ locationId, locations, isDark }) {
  const [loading, setLoading] = useState(true);
  const [transfers, setTransfers] = useState([]);
  const [filters, setFilters] = useState({ search: "", status: "", from: "", to: "" });
  const [detail, setDetail] = useState(null);
  const [receipt, setReceipt] = useState({});
  const [saving, setSaving] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const inputClass = getInputClass(isDark);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const res = await warehouseAPI.getTransfers(filters);
      setTransfers(res?.data?.data || []);
    } catch (error) { toast.error("Failed to load transfers"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTransfers(); }, [filters]);

  const openDetail = async (t) => {
    try {
      const res = await warehouseAPI.getTransfer(t.id);
      const d = res?.data?.data;
      if (d) {
        setDetail(d);
        setReceipt(d.items.reduce((acc, it) => ({ ...acc, [it.id]: { received: "", damaged: "", short: "", remarks: "" } }), {}));
      }
    } catch (error) { toast.error("Failed to load transfer"); }
  };

  const updateReceipt = (id, key, value) => setReceipt({ ...receipt, [id]: { ...receipt[id], [key]: value } });

  const submitReceipt = async () => {
    if (saving) return;
    const items = Object.entries(receipt).map(([id, r]) => ({ id: Number(id), received_qty: num(r.received), damaged_qty: num(r.damaged), short_qty: num(r.short), remarks: r.remarks }));
    if (items.some((it) => it.received_qty < 0 || it.damaged_qty < 0 || it.short_qty < 0)) {
      toast.error("Received, damaged and short quantities cannot be negative");
      return;
    }
    setSaving(true);
    try {
      await warehouseAPI.receiveTransfer(detail.id, { items });
      toast.success("Receipt recorded");
      setDetail(null);
      fetchTransfers();
    } catch (error) { toast.error(error.response?.data?.message || "Receipt failed"); }
    finally { setSaving(false); }
  };

  const filtered = transfers.filter((t) => {
    const term = filters.search.toLowerCase();
    return (term === "" || (t.transfer_no || "").toLowerCase().includes(term) || (t.requisition_no || "").toLowerCase().includes(term))
      && (filters.status === "" || t.status === filters.status)
      && (filters.from === "" || String(t.from_location_id) === filters.from)
      && (filters.to === "" || String(t.to_location_id) === filters.to);
  });

  const reset = () => setFilters({ search: "", status: "", from: "", to: "" });

  const statusOptions = ["In Transit", "Partially Received", "Received"];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={ArrowRightLeft} label="In Transit" value={transfers.filter((t) => t.status === "In Transit").length} isDark={isDark} />
        <KpiCard icon={ArrowRightLeft} label="Partially Received" value={transfers.filter((t) => t.status === "Partially Received").length} isDark={isDark} />
        <KpiCard icon={ArrowRightLeft} label="Received" value={transfers.filter((t) => t.status === "Received").length} isDark={isDark} />
        <KpiCard icon={Package} label="Transit Variance" value={transfers.filter((t) => t.items?.some((i) => num(i.damaged_qty) + num(i.short_qty) > 0)).length} isDark={isDark} />
      </div>

      <SectionCard title="Filters" isDark={isDark}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className={`h-10 w-full rounded-lg border pl-9 pr-3 text-[14px] outline-none ${inputClass}`} placeholder="Search transfer or requisition" />
          </div>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">All Status</option>
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">From</option>
            {[...new Map(transfers.map((t) => [t.from_location_id, t.from_location])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">To</option>
            {[...new Map(transfers.map((t) => [t.to_location_id, t.to_location])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <button onClick={reset} className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#A5A8B6]" : "border-[#EBE9F1] bg-white text-[#6F6B7D]"}`}>
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </SectionCard>

      <SectionCard isDark={isDark}>
        <TableWrapper isDark={isDark}>
          <table className="w-full border-collapse text-[13px]">
            <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
              <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                <th className="px-3 py-3">Transfer No</th>
                <th className="px-3 py-3">Requisition</th>
                <th className="px-3 py-3">From</th>
                <th className="px-3 py-3">To</th>
                <th className="px-3 py-3">Dispatch Date</th>
                <th className="px-3 py-3 text-right">Items</th>
                <th className="px-3 py-3 text-right">Value</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3">Received Date</th>
                <th className="sticky right-0 px-3 py-3 text-center" style={{ background: isDark ? "#2F3349" : "white" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRows rows={5} cols={10} isDark={isDark} /> : (
                <>
                  {filtered.map((t) => (
                    <tr key={t.id} className={`border-b transition ${isDark ? "border-[#3B405A] hover:bg-[#3B405A]/30" : "border-[#F3F2F7] hover:bg-[#F8F7FA]"}`}>
                      <td className="px-3 py-2.5 font-medium">{t.transfer_no}</td>
                      <td className="px-3 py-2.5">{t.requisition_no || "-"}</td>
                      <td className="px-3 py-2.5">{t.from_location}</td>
                      <td className="px-3 py-2.5">{t.to_location}</td>
                      <td className="px-3 py-2.5">{fmtDate(t.dispatch_date)}</td>
                      <td className="px-3 py-2.5 text-right">{t.items || 0}</td>
                      <td className="px-3 py-2.5 text-right">{fmtCurrency(t.total_value)}</td>
                      <td className="px-3 py-2.5 text-center"><WarehouseStatusBadge status={t.status} /></td>
                      <td className="px-3 py-2.5">{fmtDate(t.received_at)}</td>
                      <td className="sticky right-0 px-3 py-2.5 text-center" style={{ background: isDark ? "#2F3349" : "white" }}>
                        <button onClick={() => openDetail(t)} className={`rounded-md p-1.5 ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><Eye size={16} /></button>
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

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <div>
                <h3 className="text-lg font-semibold">{detail.transfer_no}</h3>
                <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>{detail.requisition_no ? `Requisition: ${detail.requisition_no}` : "Stock Transfer"}</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setPrintOpen(true)} className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] font-medium ${isDark ? "border-[#3B405A] hover:bg-[#3B405A]" : "border-[#EBE9F1] hover:bg-[#F3F2F7]"}`}><Printer size={14} /> Delivery Challan</button>
                <button onClick={() => setDetail(null)} className="text-2xl leading-none">&times;</button>
              </div>
            </div>
            <div className="space-y-5 p-4">
              <div className="grid grid-cols-2 gap-4 text-[14px]">
                <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>From:</span> {detail.from_location}</div>
                <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>To:</span> {detail.to_location}</div>
                <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Vehicle:</span> {detail.vehicle_no || "-"}</div>
                <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Driver:</span> {detail.driver_name || "-"}</div>
                <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Status:</span> <WarehouseStatusBadge status={detail.status} /></div>
                <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Dispatch Date:</span> {fmtDate(detail.dispatch_date)}</div>
              </div>

              <SectionCard title="Transfer Items" isDark={isDark}>
                <TableWrapper isDark={isDark}>
                  <table className="w-full border-collapse text-[13px]">
                    <thead className={`${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                      <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                        <th className="px-2 py-2">Material</th>
                        <th className="px-2 py-2 text-right">Dispatched</th>
                        <th className="px-2 py-2 text-right">Received</th>
                        <th className="px-2 py-2 text-right">Damaged</th>
                        <th className="px-2 py-2 text-right">Short</th>
                        <th className="px-2 py-2 text-right">UOM</th>
                        {detail.status !== "Received" && <th className="px-2 py-2 text-center">Receive</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((it) => {
                        const remaining = num(it.dispatched_qty) - num(it.received_qty) - num(it.damaged_qty) - num(it.short_qty);
                        return (
                          <tr key={it.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                            <td className="px-2 py-2">{it.material_name}</td>
                            <td className="px-2 py-2 text-right">{fmtQty(it.dispatched_qty)}</td>
                            <td className="px-2 py-2 text-right">{fmtQty(it.received_qty)}</td>
                            <td className="px-2 py-2 text-right">{fmtQty(it.damaged_qty)}</td>
                            <td className="px-2 py-2 text-right">{fmtQty(it.short_qty)}</td>
                            <td className="px-2 py-2 text-right">{it.unit_name}</td>
                            {detail.status !== "Received" && (
                              <td className="px-2 py-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <input type="number" min="0" value={receipt[it.id]?.received || ""} onChange={(e) => updateReceipt(it.id, "received", e.target.value)} className={`rounded-md border px-2 py-1 text-[13px] outline-none ${inputClass}`} placeholder={`Recv (${remaining})`} />
                                  <input type="number" min="0" value={receipt[it.id]?.damaged || ""} onChange={(e) => updateReceipt(it.id, "damaged", e.target.value)} className={`rounded-md border px-2 py-1 text-[13px] outline-none ${inputClass}`} placeholder="Damage" />
                                  <input type="number" min="0" value={receipt[it.id]?.short || ""} onChange={(e) => updateReceipt(it.id, "short", e.target.value)} className={`rounded-md border px-2 py-1 text-[13px] outline-none ${inputClass}`} placeholder="Short" />
                                  <input value={receipt[it.id]?.remarks || ""} onChange={(e) => updateReceipt(it.id, "remarks", e.target.value)} className={`rounded-md border px-2 py-1 text-[13px] outline-none ${inputClass}`} placeholder="Remarks" />
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrapper>
              </SectionCard>

              <ReconciliationCard items={detail.items} isDark={isDark} />

              <div className="flex justify-end gap-2">
                <button onClick={() => setDetail(null)} disabled={saving} className="h-10 rounded-lg border px-4 text-[14px] font-medium disabled:opacity-50">Close</button>
                {detail.status !== "Received" && (
                  <button onClick={submitReceipt} disabled={saving} className="h-10 rounded-lg bg-[#28C76F] px-4 text-[14px] font-semibold text-white hover:bg-[#20B158] disabled:opacity-50">
                    <CheckCircle size={16} className="inline mr-1" /> {saving ? "Recording…" : "Confirm Receipt"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {printOpen && detail && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 print:hidden print:bg-white print:p-0">
          <div data-print-root className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border bg-white p-6 text-[12px] text-black shadow-xl print:max-h-none print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
            <p className="mb-1 text-center text-[15px] font-bold underline">Delivery Challan</p>
            <p className="mb-3 text-center text-[11px] text-gray-600">Internal stock transfer — not a tax invoice / not a taxable supply</p>

            <table className="w-full border-collapse border border-black text-[11px]">
              <tbody>
                <tr>
                  <td className="w-1/2 border border-black p-2 align-top">
                    <p className="font-semibold">From</p>
                    <p className="text-[13px] font-bold">{detail.from_location_name || detail.from_location}</p>
                    <p className="mt-0.5 whitespace-pre-line">{detail.from_location_address || "-"}</p>
                    <p>{[detail.from_location_city, detail.from_location_state, detail.from_location_pincode].filter(Boolean).join(", ") || "-"}</p>
                    {detail.from_location_gstin && <p>GSTIN/UIN: {detail.from_location_gstin}</p>}
                  </td>
                  <td className="w-1/2 border border-black p-2 align-top">
                    <table className="w-full text-[11px]">
                      <tbody>
                        <tr><td className="pb-1 font-semibold">Challan No.:</td><td className="pb-1 text-right">{detail.transfer_no}</td></tr>
                        <tr><td className="pb-1 font-semibold">Dated:</td><td className="pb-1 text-right">{fmtDate(detail.dispatch_date)}</td></tr>
                        <tr><td className="font-semibold">Vehicle No.:</td><td className="text-right">{detail.vehicle_no || "-"}</td></tr>
                        <tr><td className="font-semibold">Driver:</td><td className="text-right">{detail.driver_name || "-"}</td></tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-black p-2 align-top">
                    <p className="font-semibold">Ship To</p>
                    <p className="text-[13px] font-bold">{detail.to_location_name || detail.to_location}</p>
                    <p className="mt-0.5 whitespace-pre-line">{detail.to_location_address || "-"}</p>
                    <p>{[detail.to_location_city, detail.to_location_state, detail.to_location_pincode].filter(Boolean).join(", ") || "-"}</p>
                    {detail.to_location_gstin && <p>GSTIN/UIN: {detail.to_location_gstin}</p>}
                  </td>
                </tr>
              </tbody>
            </table>

            <table className="mt-2 w-full border-collapse border border-black text-[11px]">
              <thead>
                <tr className="text-center">
                  <th className="border border-black p-1">SI No.</th>
                  <th className="border border-black p-1 text-left">Description of Goods</th>
                  <th className="border border-black p-1">HSN</th>
                  <th className="border border-black p-1">Quantity</th>
                  <th className="border border-black p-1">Rate</th>
                  <th className="border border-black p-1">Value</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((it, idx) => (
                  <tr key={it.id}>
                    <td className="border border-black p-1 text-center">{idx + 1}</td>
                    <td className="border border-black p-1">{it.material_name}</td>
                    <td className="border border-black p-1 text-center">{it.hsn_code || "-"}</td>
                    <td className="border border-black p-1 text-right">{fmtQty(it.dispatched_qty)} {it.unit_name}</td>
                    <td className="border border-black p-1 text-right">{it.transfer_price !== null && it.transfer_price !== undefined ? Number(it.transfer_price).toFixed(2) : "-"}</td>
                    <td className="border border-black p-1 text-right">{it.sale_value !== null && it.sale_value !== undefined ? Number(it.sale_value).toFixed(2) : "-"}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={5} className="border border-black p-1 text-right font-bold">Total Value</td>
                  <td className="border border-black p-1 text-right font-bold">
                    {detail.items.reduce((s, it) => s + (Number(it.sale_value) || 0), 0).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="mt-2"><span className="font-semibold">Value (in words):</span> {amountInWords(detail.items.reduce((s, it) => s + (Number(it.sale_value) || 0), 0))}</p>
            {detail.remarks && <p className="mt-2"><span className="font-semibold">Remarks:</span> {detail.remarks}</p>}

            <div className="mt-8 flex items-end justify-between">
              <p>Receiver's Signature</p>
              <div className="text-right">
                <p>for {detail.from_location_name || detail.from_location}</p>
                <p className="mt-8">Authorised Signatory</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 print:hidden">
              <button onClick={() => window.print()} className="rounded bg-gray-800 px-4 py-2 text-white">Print</button>
              <button onClick={() => setPrintOpen(false)} className="rounded border px-4 py-2">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReconciliationCard({ items, isDark }) {
  const totals = items.reduce(
    (acc, it) => {
      const unitCost = num(it.unit_cost);
      const disp = num(it.dispatched_qty);
      const rec = num(it.received_qty);
      const dam = num(it.damaged_qty);
      const sh = num(it.short_qty);
      const un = disp - rec - dam - sh;
      return {
        dispQty: acc.dispQty + disp,
        recQty: acc.recQty + rec,
        damQty: acc.damQty + dam,
        shortQty: acc.shortQty + sh,
        unQty: acc.unQty + un,
        dispVal: acc.dispVal + disp * unitCost,
        recVal: acc.recVal + rec * unitCost,
        damVal: acc.damVal + dam * unitCost,
        shortVal: acc.shortVal + sh * unitCost,
        unVal: acc.unVal + un * unitCost,
      };
    },
    { dispQty: 0, recQty: 0, damQty: 0, shortQty: 0, unQty: 0, dispVal: 0, recVal: 0, damVal: 0, shortVal: 0, unVal: 0 }
  );

  const reconciled = Math.abs(totals.unQty) < 0.001 && Math.abs(totals.unVal) < 0.001;

  return (
    <SectionCard title="Transfer Reconciliation" isDark={isDark}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <ReconMetric label="Dispatched" qty={totals.dispQty} val={totals.dispVal} color="slate" isDark={isDark} />
        <ReconMetric label="Received" qty={totals.recQty} val={totals.recVal} color="emerald" isDark={isDark} />
        <ReconMetric label="Damaged" qty={totals.damQty} val={totals.damVal} color="amber" isDark={isDark} />
        <ReconMetric label="Short" qty={totals.shortQty} val={totals.shortVal} color="rose" isDark={isDark} />
        <ReconMetric label="Unaccounted" qty={totals.unQty} val={totals.unVal} color="purple" isDark={isDark} />
        <div className={`flex flex-col items-center justify-center rounded-xl border p-3 ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
          <p className={`text-[11px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Reconciliation</p>
          <div className="mt-1 flex items-center gap-1 text-[13px] font-semibold">
            {reconciled ? (
              <><CheckCircle size={14} className="text-emerald-500" /> 100% Reconciled</>
            ) : (
              <><span className="text-amber-500">Attention Required</span></>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function ReconMetric({ label, qty, val, color, isDark }) {
  const colorMap = {
    slate: { text: isDark ? "text-slate-300" : "text-slate-700", sub: isDark ? "text-slate-400" : "text-slate-500" },
    emerald: { text: "text-emerald-600 dark:text-emerald-400", sub: isDark ? "text-emerald-400/70" : "text-emerald-600/70" },
    amber: { text: "text-amber-600 dark:text-amber-400", sub: isDark ? "text-amber-400/70" : "text-amber-600/70" },
    rose: { text: "text-rose-600 dark:text-rose-400", sub: isDark ? "text-rose-400/70" : "text-rose-600/70" },
    purple: { text: "text-purple-600 dark:text-purple-400", sub: isDark ? "text-purple-400/70" : "text-purple-600/70" },
  };
  const c = colorMap[color] || colorMap.slate;
  return (
    <div className={`rounded-xl border p-3 text-center ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
      <p className={`text-[11px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>{label}</p>
      <p className={`mt-1 text-lg font-bold ${c.text}`}>{fmtQty(qty)}</p>
      <p className={`text-[11px] ${c.sub}`}>{fmtCurrency(val)}</p>
    </div>
  );
}

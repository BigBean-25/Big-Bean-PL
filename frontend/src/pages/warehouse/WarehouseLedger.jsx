import { useEffect, useState } from "react";
import { warehouseAPI } from "../../services/api";
import { SectionCard, TableWrapper, LoadingRows, EmptyState, StatusBadge } from "../../components/ui";
import { KpiCard, TransactionLabel, fmtQty, fmtCurrency, fmtDate, num, EmptyRow } from "./WarehouseShared";
import { getInputClass } from "../../components/ui";
import { Search, RotateCcw, BookOpen } from "lucide-react";
import toast from "react-hot-toast";

export default function WarehouseLedger({ locationId, locations, isDark }) {
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState([]);
  const [filters, setFilters] = useState({ search: "", transaction_type: "", from_date: "", to_date: "" });
  const inputClass = getInputClass(isDark);

  const fetchLedger = async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      const res = await warehouseAPI.getLedger({ location_id: locationId });
      setLedger(res?.data?.data || []);
    } catch (error) { toast.error("Failed to load stock ledger"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLedger(); }, [locationId]);

  const filtered = ledger.filter((r) => {
    const term = filters.search.toLowerCase();
    const type = filters.transaction_type;
    const date = r.transaction_date ? new Date(r.transaction_date) : null;
    const from = filters.from_date ? new Date(filters.from_date) : null;
    const to = filters.to_date ? new Date(filters.to_date) : null;
    const matchesTerm = !term || (r.material_name || "").toLowerCase().includes(term) || (r.reference_type || "").toLowerCase().includes(term);
    const matchesType = !type || r.transaction_type === type;
    const matchesDate = (!from || !date || date >= from) && (!to || !date || date <= to);
    return matchesTerm && matchesType && matchesDate;
  });

  const totals = filtered.reduce((acc, r) => ({ in: acc.in + num(r.qty_in), out: acc.out + num(r.qty_out), count: acc.count + 1 }), { in: 0, out: 0, count: 0 });

  const reset = () => setFilters({ search: "", transaction_type: "", from_date: "", to_date: "" });

  const txnTypes = [
    "OPENING", "PURCHASE_GRN", "TRANSFER_IN", "TRANSFER_OUT", "TRANSIT_DAMAGE", "TRANSIT_SHORT",
    "PRODUCTION_RECEIPT", "PRODUCTION_ISSUE", "PURCHASE_RETURN", "WASTAGE", "ADJUSTMENT_POSITIVE",
    "ADJUSTMENT_NEGATIVE", "PHYSICAL_ADJUSTMENT",
  ];

  if (!locationId) return <EmptyState icon={BookOpen} title="Select a location" subtitle="Choose a warehouse to view the stock ledger." isDark={isDark} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={BookOpen} label="Total In" value={fmtQty(totals.in)} isDark={isDark} />
        <KpiCard icon={BookOpen} label="Total Out" value={fmtQty(totals.out)} isDark={isDark} />
        <KpiCard icon={BookOpen} label="Net Movement" value={fmtQty(totals.in - totals.out)} isDark={isDark} />
        <KpiCard icon={BookOpen} label="Transactions" value={totals.count} isDark={isDark} />
      </div>

      <SectionCard title="Filters" isDark={isDark}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className={`h-10 w-full rounded-lg border pl-9 pr-3 text-[14px] outline-none ${inputClass}`} placeholder="Search material or reference" />
          </div>
          <select value={filters.transaction_type} onChange={(e) => setFilters({ ...filters, transaction_type: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">All Transaction Types</option>
            {txnTypes.map((t) => <option key={t} value={t}>{TransactionLabel(t)}</option>)}
          </select>
          <input type="date" value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
          <input type="date" value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
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
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Material</th>
                <th className="px-3 py-3">Transaction</th>
                <th className="px-3 py-3">Reference</th>
                <th className="px-3 py-3 text-right">Qty In</th>
                <th className="px-3 py-3 text-right">Qty Out</th>
                <th className="px-3 py-3 text-right">Balance</th>
                <th className="px-3 py-3">Unit</th>
                <th className="px-3 py-3 text-right">Unit Cost</th>
                <th className="px-3 py-3 text-right">Value</th>
                <th className="px-3 py-3">Batch</th>
                <th className="px-3 py-3">Expiry</th>
                <th className="px-3 py-3">User</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRows rows={6} cols={13} isDark={isDark} /> : (
                <>
                  {filtered.map((r) => (
                    <tr key={r.id} className={`border-b transition ${isDark ? "border-[#3B405A] hover:bg-[#3B405A]/30" : "border-[#F3F2F7] hover:bg-[#F8F7FA]"}`}>
                      <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(r.transaction_date)}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{r.material_name}</div>
                        <div className={`text-[11px] ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>{r.material_code || "-"}</div>
                      </td>
                      <td className="px-3 py-2.5"><StatusBadge status={TransactionLabel(r.transaction_type)} /></td>
                      <td className="px-3 py-2.5">{r.reference_type} #{r.reference_id}</td>
                      <td className="px-3 py-2.5 text-right">{fmtQty(r.qty_in)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtQty(r.qty_out)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{fmtQty(r.running_balance)}</td>
                      <td className="px-3 py-2.5">{r.unit_name}</td>
                      <td className="px-3 py-2.5 text-right">{fmtCurrency(r.unit_cost)}/{r.unit_name}</td>
                      <td className="px-3 py-2.5 text-right">{fmtCurrency(r.value_in || r.value_out)}</td>
                      <td className="px-3 py-2.5">{r.batch_no || "-"}</td>
                      <td className="px-3 py-2.5">{fmtDate(r.expiry_date)}</td>
                      <td className="px-3 py-2.5">{r.created_by_name || "-"}</td>
                    </tr>
                  ))}
                  {!filtered.length && <EmptyRow colSpan={13} isDark={isDark} />}
                </>
              )}
            </tbody>
          </table>
        </TableWrapper>
      </SectionCard>
    </div>
  );
}

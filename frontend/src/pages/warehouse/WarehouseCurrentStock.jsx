import { useEffect, useState } from "react";
import { warehouseAPI } from "../../services/api";
import { SectionCard, TableWrapper, LoadingRows, EmptyState, StatusBadge } from "../../components/ui";
import { KpiCard, fmtCurrency, fmtQty, num, EmptyRow } from "./WarehouseShared";
import { Search, Filter, RotateCcw, Package, Eye, ArrowUpDown } from "lucide-react";
import { getInputClass } from "../../components/ui";
import toast from "react-hot-toast";

export default function WarehouseCurrentStock({ locationId, locations, categories, materials, isDark }) {
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState([]);
  const [filters, setFilters] = useState({ search: "", status: "", category: "" });
  const [detail, setDetail] = useState(null);
  const inputClass = getInputClass(isDark);

  const fetchStock = async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      const res = await warehouseAPI.getStock({ location_id: locationId });
      setStock(res?.data?.data || []);
    } catch (error) { toast.error("Failed to load current stock"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStock(); }, [locationId]);

  const filtered = stock.filter((s) => {
    const term = filters.search.toLowerCase();
    const matchesSearch = !term || (s.material_name || "").toLowerCase().includes(term) || (s.material_code || "").toLowerCase().includes(term);
    const matchesStatus = !filters.status || (s.status || "") === filters.status;
    const matchesCategory = !filters.category || (s.category || "") === filters.category;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const totals = filtered.reduce((acc, s) => ({ value: acc.value + num(s.total_value), qty: acc.qty + num(s.current_qty) }), { value: 0, qty: 0 });

  const openDetail = (row) => setDetail(row);

  const reset = () => setFilters({ search: "", status: "", category: "" });

  if (!locationId) return <EmptyState icon={Package} title="Select a location" subtitle="Choose a warehouse to view current stock." isDark={isDark} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Package} label="Total Stock Value" value={fmtCurrency(totals.value)} isDark={isDark} />
        <KpiCard icon={Package} label="Materials In Stock" value={filtered.filter((s) => s.status === "In Stock").length} isDark={isDark} />
        <KpiCard icon={RotateCcw} label="Low Stock" value={filtered.filter((s) => s.status === "Low Stock").length} isDark={isDark} />
        <KpiCard icon={RotateCcw} label="Out of Stock" value={filtered.filter((s) => s.status === "Out of Stock").length} isDark={isDark} />
      </div>

      <SectionCard title="Filters" isDark={isDark}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className={`h-10 w-full rounded-lg border pl-9 pr-3 text-[14px] outline-none ${inputClass}`} placeholder="Search material or code" />
          </div>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">All Status</option>
            <option value="In Stock">In Stock</option>
            <option value="Low Stock">Low Stock</option>
            <option value="Out of Stock">Out of Stock</option>
            <option value="Near Expiry">Near Expiry</option>
          </select>
          <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.id} value={c.category_name}>{c.category_name}</option>)}
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
                <th className="px-3 py-3">Material</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3 text-right">Opening</th>
                <th className="px-3 py-3 text-right">Receipts</th>
                <th className="px-3 py-3 text-right">Issues</th>
                <th className="px-3 py-3 text-right">Current Qty</th>
                <th className="px-3 py-3 text-right">Avg Cost</th>
                <th className="px-3 py-3 text-right">Value</th>
                <th className="px-3 py-3 text-center">Min/Reorder</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="sticky right-0 px-3 py-3 text-center" style={{ background: isDark ? "#2F3349" : "white" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRows rows={6} cols={11} isDark={isDark} /> : (
                <>
                  {filtered.map((s) => (
                    <tr key={s.raw_material_id} className={`border-b transition hover:bg-opacity-50 ${isDark ? "border-[#3B405A] hover:bg-[#3B405A]/30" : "border-[#F3F2F7] hover:bg-[#F8F7FA]"}`}>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{s.material_name}</div>
                        <div className={`text-[11px] ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>{s.material_code || "-"}</div>
                      </td>
                      <td className="px-3 py-2.5">{s.category || "-"}</td>
                      <td className="px-3 py-2.5 text-right">-</td>
                      <td className="px-3 py-2.5 text-right">-</td>
                      <td className="px-3 py-2.5 text-right">-</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{fmtQty(s.current_qty, s.unit_name)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtCurrency(s.average_cost)}/{s.unit_name}</td>
                      <td className="px-3 py-2.5 text-right">{fmtCurrency(s.total_value)}</td>
                      <td className="px-3 py-2.5 text-center text-[11px]">{num(s.min_stock_qty).toFixed(0)} / {num(s.reorder_level).toFixed(0)}</td>
                      <td className="px-3 py-2.5 text-center"><StatusBadge status={s.status} /></td>
                      <td className="sticky right-0 px-3 py-2.5 text-center" style={{ background: isDark ? "#2F3349" : "white" }}>
                        <button onClick={() => openDetail(s)} className={`rounded-md p-1.5 transition ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><Eye size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && <EmptyRow colSpan={11} isDark={isDark} />}
                </>
              )}
            </tbody>
          </table>
        </TableWrapper>
      </SectionCard>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-2xl rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{detail.material_name}</h3>
              <button onClick={() => setDetail(null)} className="text-2xl leading-none">&times;</button>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 text-[14px]">
              <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Material Code:</span> {detail.material_code || "-"}</div>
              <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Category:</span> {detail.category || "-"}</div>
              <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Current Qty:</span> {fmtQty(detail.current_qty, detail.unit_name)}</div>
              <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Average Cost:</span> {fmtCurrency(detail.average_cost)}/{detail.unit_name}</div>
              <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Stock Value:</span> {fmtCurrency(detail.total_value)}</div>
              <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Min / Reorder:</span> {num(detail.min_stock_qty).toFixed(0)} / {num(detail.reorder_level).toFixed(0)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

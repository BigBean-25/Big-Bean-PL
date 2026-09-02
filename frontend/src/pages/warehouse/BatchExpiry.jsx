import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { warehouseAPI } from "../../services/api";
import {
  PageHeader, FilterBar, StatusBadge, LoadingRows, EmptyState, getThemeMode, getCardClass, getInputClass,
} from "../../components/ui";
import { Package, Search, Calendar, AlertTriangle, RotateCcw, Download } from "lucide-react";
import toast from "react-hot-toast";

const EXPIRY_STATUS = ["All", "Healthy", "Near Expiry", "Expiring Today", "Expired", "No Expiry Date"];

const BatchExpiry = () => {
  const [isDark] = useState(() => getThemeMode() === "dark");
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [filters, setFilters] = useState({
    search: searchParams.get("search") || "",
    status: searchParams.get("status") || "All",
    from_date: searchParams.get("from_date") || "",
    to_date: searchParams.get("to_date") || "",
    location_id: searchParams.get("location_id") || "",
  });

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const params = { ...filters };
      if (params.status === "All") delete params.status;
      const [bRes, aRes] = await Promise.all([
        warehouseAPI.getBatches(params),
        warehouseAPI.getExpiryAlerts({ location_id: filters.location_id }),
      ]);
      setRows(bRes?.data?.data || []);
      setAlerts(aRes?.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load batch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBatches(); }, [filters]);

  const updateFilter = (key, value) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    const sp = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => { if (v) sp.set(k, v); });
    setSearchParams(sp);
  };

  const kpis = useMemo(() => {
    const active = rows.length;
    const near = rows.filter(r => r.status === "Near Expiry" || r.status === "Expiring Today").length;
    const expired = rows.filter(r => r.status === "Expired").length;
    const value = rows.reduce((s, r) => s + (Number(r.batch_value) || 0), 0);
    const atRisk = new Set(rows.filter(r => r.status !== "Healthy" && r.status !== "No Expiry").map(r => r.raw_material_id)).size;
    return { active, near, expired, value, atRisk };
  }, [rows]);

  const handleExport = () => {
    const csv = [
      ["Material Code", "Material Name", "Batch No", "Expiry Date", "Days Remaining", "Available Qty", "UOM", "Unit Cost", "Batch Value", "Status", "Location"].join(","),
      ...rows.map(r => [
        r.material_code, r.material_name, r.batch_no, r.expiry_date || "", r.days_remaining ?? "",
        r.available_qty, r.unit_name, r.average_cost, r.batch_value, r.status, r.location_name,
      ].join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `batch-expiry-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cardClass = getCardClass(isDark);
  const inputClass = getInputClass(isDark);

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden">
      <PageHeader
        title="Batch & Expiry Management"
        subtitle="Track inventory batches, expiry dates and FEFO stock movement."
        actions={
          <button onClick={handleExport} className="inline-flex items-center gap-2 rounded-md bg-[#7367F0] px-4 py-2 text-sm font-medium text-white hover:bg-[#5E50EE]">
            <Download size={16} /> Export
          </button>
        }
        isDark={isDark}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Active Batches", value: kpis.active, icon: Package },
          { label: "Near Expiry", value: kpis.near, icon: Calendar, warn: kpis.near > 0 },
          { label: "Expired Batches", value: kpis.expired, icon: AlertTriangle, danger: kpis.expired > 0 },
          { label: "Batch Stock Value", value: `₹${kpis.value.toFixed(2)}`, icon: Package },
          { label: "Materials At Risk", value: kpis.atRisk, icon: AlertTriangle, warn: kpis.atRisk > 0 },
        ].map((k) => (
          <div key={k.label} className={`rounded-xl border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardClass}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[13px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>{k.label}</p>
                <p className={`mt-1 text-2xl font-bold ${k.danger ? "text-[#EA5455]" : k.warn ? "text-[#FF9F43]" : isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{k.value}</p>
              </div>
              <div className="rounded-lg bg-[#F3F2F7] p-2.5 text-[#6F6B7D] dark:bg-[#3B405A] dark:text-[#D0D2D6]">
                <k.icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <FilterBar isDark={isDark} title="Filters">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8AAAE]" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              placeholder="Search material / batch"
              className={`w-full rounded-md py-2 pl-9 pr-3 text-sm ${inputClass}`}
            />
          </div>
          <select value={filters.status} onChange={(e) => updateFilter("status", e.target.value)} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}>
            {EXPIRY_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={filters.from_date} onChange={(e) => updateFilter("from_date", e.target.value)} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`} />
          <input type="date" value={filters.to_date} onChange={(e) => updateFilter("to_date", e.target.value)} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`} />
          <button onClick={() => { setFilters({ search: "", status: "All", from_date: "", to_date: "", location_id: "" }); setSearchParams({}); }} className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]"}`}>
            <RotateCcw size={16} /> Reset
          </button>
        </div>
      </FilterBar>

      {alerts.length > 0 && (
        <div className={`rounded-md border p-4 ${isDark ? "border-[#FF9F43]/30 bg-[#2F3349]" : "border-[#FF9F43]/30 bg-[#FFF4E5]"}`}>
          <p className={`text-sm font-semibold ${isDark ? "text-[#FF9F43]" : "text-[#FF9F43]"}`}>Expiry Alerts ({alerts.length})</p>
          <ul className="mt-2 space-y-1 text-sm">
            {alerts.slice(0, 5).map(a => (
              <li key={`${a.raw_material_id}-${a.batch_no}`} className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>
                {a.material_name} — Batch {a.batch_no} — {a.expiry_date} ({a.days_remaining} days) — Qty {a.available_qty} {a.unit_name}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={`overflow-x-auto rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardClass}`}>
        <table className="min-w-full text-left text-sm">
          <thead className={isDark ? "border-b border-[#3B405A] bg-[#25293C]" : "border-b border-[#EBE9F1] bg-[#F8F7FA]"}>
            <tr>
              <th className="px-4 py-3 font-semibold">Material</th>
              <th className="px-4 py-3 font-semibold">Batch No</th>
              <th className="px-4 py-3 font-semibold">Expiry Date</th>
              <th className="px-4 py-3 font-semibold">Days</th>
              <th className="px-4 py-3 font-semibold">Available Qty</th>
              <th className="px-4 py-3 font-semibold">UOM</th>
              <th className="px-4 py-3 font-semibold">Unit Cost</th>
              <th className="px-4 py-3 font-semibold">Value</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Location</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <LoadingRows rows={5} cols={10} isDark={isDark} />
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8"><EmptyState message="No batch records found" isDark={isDark} /></td></tr>
            ) : (
              rows.map((r) => (
                <tr key={`${r.raw_material_id}-${r.batch_no}-${r.expiry_date}`} className={isDark ? "border-b border-[#3B405A]" : "border-b border-[#F3F2F7]"}>
                  <td className="px-4 py-3">{r.material_name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.batch_no}</td>
                  <td className="px-4 py-3">{r.expiry_date || "—"}</td>
                  <td className="px-4 py-3">{r.days_remaining !== null ? `${r.days_remaining}d` : "—"}</td>
                  <td className="px-4 py-3">{Number(r.available_qty).toFixed(2)}</td>
                  <td className="px-4 py-3">{r.unit_name}</td>
                  <td className="px-4 py-3">{Number(r.average_cost).toFixed(4)}</td>
                  <td className="px-4 py-3">{Number(r.batch_value).toFixed(2)}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3">{r.location_name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BatchExpiry;

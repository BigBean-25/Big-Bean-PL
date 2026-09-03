import { useState, useEffect } from 'react';
import { Download, Search, Loader2, Package, FileText, BarChart2 } from 'lucide-react';
import { reportAPI, masterAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { exportReportPDF } from '../../utils/pdfReport';

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };
const fmtQty = (n = 0) => Number(n || 0).toFixed(3);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const TheoreticalConsumptionReport = () => {
  const [outlets, setOutlets] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    outlet_id: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6]" : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const labelCls = isDark ? "text-[#D0D2D6]" : "text-[#5D596C]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const thCls = isDark ? "bg-[#25293C] text-[#A5A8B6]" : "bg-[#F8F7FA] text-[#A8AAAE]";
  const trHover = isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F8F7FA]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

  useEffect(() => { fetchOutlets(); }, []);

  const fetchOutlets = async () => {
    try {
      const r = await masterAPI.getOutlets();
      setOutlets(r.data?.data || r.data || []);
    } catch { /* silent */ }
  };

  const handleGenerateReport = async () => {
    if (!filters.outlet_id) { toast.error('Please select an outlet'); return; }
    setLoading(true);
    try {
      const r = await reportAPI.getTheoreticalConsumption(filters);
      setReportData(r.data?.data || r.data || []);
      toast.success('Report generated');
    } catch { toast.error('Failed to generate report'); }
    finally { setLoading(false); }
  };

  // Group rows (one per menu-item/material pair) by raw material, since that's
  // what a warehouse/production planner actually needs to see - total theoretical
  // usage per material across every menu item sold that month.
  const byMaterial = {};
  for (const row of reportData) {
    const key = row.raw_material_id;
    if (!byMaterial[key]) byMaterial[key] = { material_name: row.material_name, material_code: row.material_code, unit: row.unit, total_used_qty: 0, items: [] };
    byMaterial[key].total_used_qty += Number(row.total_used_qty || 0);
    byMaterial[key].items.push(row);
  }
  const materialRows = Object.values(byMaterial);

  const handleExport = async () => {
    const rows = materialRows.map((m) => [
      m.material_name,
      m.material_code,
      m.unit,
      m.items.map((i) => i.item_name).join(", "),
      fmtQty(m.total_used_qty),
    ]);

    const outletName = outlets.find((o) => String(o.id) === String(filters.outlet_id))?.outlet_name;

    await exportReportPDF({
      title: "Theoretical Consumption Report",
      outletName,
      dateRangeLabel: `${MONTHS[filters.month - 1]} ${filters.year}`,
      columns: ["Material", "Code", "Unit", "Sold From (menu items)", "Total Theoretical Qty"],
      rows,
      summaryLines: [`Materials with Theoretical Usage: ${materialRows.length}`],
      fileName: `theoretical-consumption-${filters.month}-${filters.year}.pdf`,
    });
    toast.success("Report exported");
  };

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Theoretical Consumption Report</h1>
          <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>Expected raw-material usage, derived from recipes and units sold</p>
        </div>
        {!loading && materialRows.length > 0 && (
          <button onClick={handleExport} className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]" style={{ backgroundColor: primaryColor }}>
            <Download size={16} /> Export
          </button>
        )}
      </div>

      <div className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
        <div className={`border-b px-4 py-3 sm:px-6 ${borderCls}`}>
          <span className={`text-[12px] font-semibold uppercase tracking-wider ${mutedCls}`}>Filters</span>
        </div>
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${labelCls}`}>Outlet *</label>
              <select value={filters.outlet_id} onChange={(e) => setFilters({ ...filters, outlet_id: e.target.value })}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`}>
                <option value="">Select Outlet</option>
                {outlets.map(o => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
              </select>
            </div>
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${labelCls}`}>Month *</label>
              <select value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`}>
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${labelCls}`}>Year *</label>
              <input type="number" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`} />
            </div>
            <div className="flex items-end">
              <button onClick={handleGenerateReport} disabled={loading}
                className="flex h-[42px] w-full items-center justify-center gap-2 rounded-md px-4 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:opacity-70"
                style={{ backgroundColor: primaryColor }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {loading ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className={`flex items-center justify-center gap-3 rounded-md border py-12 ${cardCls}`}>
          <Loader2 size={22} className="animate-spin" style={{ color: primaryColor }} />
          <span className={`text-[15px] font-medium ${mutedCls}`}>Generating report…</span>
        </div>
      )}

      {!loading && materialRows.length > 0 && (
        <div className={`animate-fade-up flex flex-col gap-3 rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:flex-row sm:items-center sm:p-5 ${cardCls}`}>
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E0E7FF]">
              <BarChart2 size={22} className="text-[#5B6FE0]" />
            </div>
            <div>
              <p className={`text-[13px] ${mutedCls}`}>Materials with Theoretical Usage</p>
              <p className="mt-0.5 text-[22px] font-bold text-[#5B6FE0]">{materialRows.length}</p>
            </div>
          </div>
          <div className={`sm:ml-8 flex items-center gap-2 text-[13px] ${mutedCls}`}>
            <Package size={15} />
            <span>{reportData.length} menu-item / material line{reportData.length !== 1 ? "s" : ""} behind these totals</span>
          </div>
        </div>
      )}

      {!loading && materialRows.length > 0 && (
        <div className={`animate-fade-up rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
          <div className={`flex items-center gap-3 border-b px-4 py-3 sm:px-6 ${borderCls}`}>
            <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
              <Package size={17} />
            </div>
            <h3 className={`text-[15px] font-semibold ${mainCls}`}>Theoretical Usage by Material</h3>
          </div>
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="min-w-full" style={{ minWidth: "700px" }}>
              <thead>
                <tr>
                  {["Material", "Code", "Unit", "Sold From (menu items)", "Total Theoretical Qty"].map((h) => (
                    <th key={h} className={`whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider ${thCls}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${borderCls}`}>
                {materialRows.map((m, idx) => (
                  <tr key={idx} className={`transition ${trHover}`}>
                    <td className={`px-4 py-3 text-[14px] font-medium ${mainCls}`}>{m.material_name}</td>
                    <td className={`px-4 py-3 text-[14px] ${mutedCls}`}>{m.material_code}</td>
                    <td className={`px-4 py-3 text-[14px] ${mutedCls}`}>{m.unit}</td>
                    <td className={`px-4 py-3 text-[13px] ${mutedCls}`}>{m.items.map((i) => i.item_name).join(", ")}</td>
                    <td className={`px-4 py-3 text-[14px] font-semibold tabular-nums text-[#5B6FE0]`}>{fmtQty(m.total_used_qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && reportData.length === 0 && (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 px-4 text-center ${cardCls}`}>
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-[#3B405A]" : "bg-[#EBE9F1]"}`}>
            <FileText size={26} className={mutedCls} />
          </div>
          <p className={`text-[16px] font-semibold ${mainCls}`}>No theoretical consumption data yet</p>
          <p className={`mt-1 text-[13px] ${mutedCls}`}>Select outlet, month and year then click Generate. Only sold items with an Active recipe are included.</p>
        </div>
      )}
    </div>
  );
};

export default TheoreticalConsumptionReport;

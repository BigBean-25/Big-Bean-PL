import { useState, useEffect } from 'react';
import { Search, Loader2, FileText, BarChart2, AlertTriangle } from 'lucide-react';
import { reportAPI, masterAPI } from '../../services/api';
import toast from 'react-hot-toast';

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };
const fmtINR = (n = 0) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n = 0) => Number(n || 0).toFixed(3);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const STATUS_STYLE = {
  Normal: "bg-[#DDF6E8] text-[#28C76F]",
  Warning: "bg-[#FFEAC2] text-[#FF9F43]",
  Critical: "bg-[#FCE7E7] text-[#EA5455]",
};

const ConsumptionVarianceReport = () => {
  const [outlets, setOutlets] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
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
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to fetch outlets');
    }
  };

  const handleGenerateReport = async () => {
    if (!filters.outlet_id) { toast.error('Please select an outlet'); return; }
    setLoading(true);
    try {
      const r = await reportAPI.getConsumptionVariance(filters);
      setReportData(r.data?.data || r.data || []);
      setHasGenerated(true);
      toast.success('Report generated');
    } catch (error) { toast.error(error.response?.data?.message || 'Failed to generate report'); }
    finally { setLoading(false); }
  };

  const criticalCount = reportData.filter((r) => r.status === 'Critical').length;
  const warningCount = reportData.filter((r) => r.status === 'Warning').length;
  const totalVarianceValue = reportData.reduce((sum, r) => sum + Number(r.variance_value || 0), 0);

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Consumption Variance Report</h1>
        <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>Actual vs. theoretical raw-material usage per outlet, per month</p>
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

      {!loading && reportData.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className={`animate-fade-up rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
            <p className={`text-[13px] ${mutedCls}`}>Net Variance Value</p>
            <p className={`mt-1 text-[20px] font-bold ${totalVarianceValue > 0 ? "text-[#EA5455]" : "text-[#28C76F]"}`}>{fmtINR(totalVarianceValue)}</p>
          </div>
          <div className={`animate-fade-up rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
            <p className={`text-[13px] ${mutedCls}`}>Warning Materials</p>
            <p className="mt-1 text-[20px] font-bold text-[#FF9F43]">{warningCount}</p>
          </div>
          <div className={`animate-fade-up rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
            <p className={`text-[13px] ${mutedCls}`}>Critical Materials</p>
            <p className="mt-1 text-[20px] font-bold text-[#EA5455]">{criticalCount}</p>
          </div>
        </div>
      )}

      {!loading && reportData.length > 0 && (
        <div className={`animate-fade-up rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
          <div className={`flex items-center gap-3 border-b px-4 py-3 sm:px-6 ${borderCls}`}>
            <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
              <BarChart2 size={17} />
            </div>
            <h3 className={`text-[15px] font-semibold ${mainCls}`}>Variance by Material</h3>
            <span className={`ml-auto text-[12px] ${mutedCls} hidden sm:inline`}>← Scroll to see all columns</span>
          </div>
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="min-w-full" style={{ minWidth: "800px" }}>
              <thead>
                <tr>
                  {["Material", "Actual Qty", "Theoretical Qty", "Variance Qty", "Variance %", "Variance Value", "Status"].map((h) => (
                    <th key={h} className={`whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider ${thCls}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${borderCls}`}>
                {reportData.map((item, idx) => (
                  <tr key={idx} className={`transition ${trHover}`}>
                    <td className={`px-4 py-3 text-[14px] font-medium ${mainCls}`}>{item.material_name}</td>
                    <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{fmtQty(item.actual_qty)} {item.unit}</td>
                    <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{fmtQty(item.theoretical_qty)} {item.unit}</td>
                    <td className={`px-4 py-3 text-[14px] font-semibold tabular-nums ${Number(item.variance_qty) > 0 ? "text-[#EA5455]" : "text-[#28C76F]"}`}>{fmtQty(item.variance_qty)}</td>
                    <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{Number(item.variance_percentage).toFixed(1)}%</td>
                    <td className={`px-4 py-3 text-[14px] font-semibold tabular-nums ${Number(item.variance_value) > 0 ? "text-[#EA5455]" : "text-[#28C76F]"}`}>{fmtINR(item.variance_value)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[item.status] || "bg-gray-200 text-gray-700"}`}>{item.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && hasGenerated && reportData.length === 0 && (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 px-4 text-center ${cardCls}`}>
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-[#3B405A]" : "bg-[#EBE9F1]"}`}>
            <AlertTriangle size={26} className={mutedCls} />
          </div>
          <p className={`text-[16px] font-semibold ${mainCls}`}>No consumption data for this month</p>
          <p className={`mt-1 text-[13px] ${mutedCls}`}>Needs completed Opening/Closing Stock, Purchase and Item Sales uploads for this outlet and month</p>
        </div>
      )}

      {!loading && !hasGenerated && (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 px-4 text-center ${cardCls}`}>
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-[#3B405A]" : "bg-[#EBE9F1]"}`}>
            <FileText size={26} className={mutedCls} />
          </div>
          <p className={`text-[16px] font-semibold ${mainCls}`}>No report generated yet</p>
          <p className={`mt-1 text-[13px] ${mutedCls}`}>Select outlet, month and year then click Generate</p>
        </div>
      )}
    </div>
  );
};

export default ConsumptionVarianceReport;

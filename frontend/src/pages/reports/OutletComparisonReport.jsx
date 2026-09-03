import { useState } from 'react';
import { Download, Search, Loader2, FileText, TrendingUp, TrendingDown } from 'lucide-react';
import { reportAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { exportReportPDF } from '../../utils/pdfReport';

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };
const fmtINR = (n = 0) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const OutletComparisonReport = () => {
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [deniedMessage, setDeniedMessage] = useState('');
  const [filters, setFilters] = useState({
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

  const handleGenerateReport = async () => {
    setLoading(true);
    setDeniedMessage('');
    try {
      const r = await reportAPI.getOutletComparison(filters);
      setComparison(r.data?.data || null);
      setHasGenerated(true);
      toast.success('Comparison generated');
    } catch (error) {
      if (error?.response?.status === 403) {
        setDeniedMessage(error.response.data?.message || 'You do not have permission to view this report');
      } else {
        toast.error('Failed to generate comparison');
      }
    } finally { setLoading(false); }
  };

  const outlets = comparison?.outlets || [];
  const best = outlets.length ? outlets.reduce((a, b) => (Number(a.profit_loss) >= Number(b.profit_loss) ? a : b)) : null;
  const worst = outlets.length ? outlets.reduce((a, b) => (Number(a.profit_loss) <= Number(b.profit_loss) ? a : b)) : null;

  const handleExport = async () => {
    const rows = outlets.map((o) => [
      o.outlet_name,
      fmtINR(o.adjusted_sales),
      fmtINR(o.actual_consumption),
      fmtINR(o.total_operating_expenses),
      fmtINR(o.profit_loss),
      `${o.food_cost_percentage}%`,
      `${o.net_profit_percentage}%`,
    ]);
    rows.push([
      "Company Total",
      fmtINR(comparison.company_total.adjusted_sales),
      fmtINR(comparison.company_total.actual_consumption),
      fmtINR(comparison.company_total.total_operating_expenses),
      fmtINR(comparison.company_total.profit_loss),
      `${comparison.company_total.net_profit_percentage}%`,
      '',
    ]);

    await exportReportPDF({
      title: "Outlet Comparison Report",
      outletName: "All Outlets",
      dateRangeLabel: `${MONTHS[filters.month - 1]} ${filters.year}`,
      columns: ["Outlet", "Adjusted Sales", "COGS", "Operating Exp.", "Net Profit", "Food Cost %", "Net Margin %"],
      rows,
      summaryLines: [
        `Company Net Profit: ${fmtINR(comparison.company_total.profit_loss)} (${comparison.company_total.net_profit_percentage}% margin)`,
        `Best Performing: ${best?.outlet_name} (${fmtINR(best?.profit_loss)})`,
        `Needs Attention: ${worst?.outlet_name} (${fmtINR(worst?.profit_loss)})`,
      ],
      fileName: `outlet-comparison-${filters.month}-${filters.year}.pdf`,
    });
    toast.success("Report exported");
  };

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Outlet Comparison Report</h1>
          <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>Side-by-side monthly P&L across every outlet</p>
        </div>
        {!loading && !deniedMessage && outlets.length > 0 && (
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          <span className={`text-[15px] font-medium ${mutedCls}`}>Generating comparison…</span>
        </div>
      )}

      {!loading && deniedMessage && (
        <div className={`rounded-md border py-8 px-4 text-center ${cardCls}`}>
          <p className={`text-[14px] font-medium text-[#EA5455]`}>{deniedMessage}</p>
        </div>
      )}

      {!loading && !deniedMessage && outlets.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className={`animate-fade-up rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
              <p className={`text-[13px] ${mutedCls}`}>Company Net Profit</p>
              <p className={`mt-1 text-[20px] font-bold ${Number(comparison.company_total.profit_loss) >= 0 ? "text-[#28C76F]" : "text-[#EA5455]"}`}>{fmtINR(comparison.company_total.profit_loss)}</p>
              <p className={`text-[12px] ${mutedCls}`}>{comparison.company_total.net_profit_percentage}% margin</p>
            </div>
            <div className={`animate-fade-up rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-[#28C76F]" />
                <p className={`text-[13px] ${mutedCls}`}>Best Performing</p>
              </div>
              <p className={`mt-1 text-[16px] font-bold ${mainCls}`}>{best?.outlet_name}</p>
              <p className="text-[13px] text-[#28C76F]">{fmtINR(best?.profit_loss)}</p>
            </div>
            <div className={`animate-fade-up rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
              <div className="flex items-center gap-2">
                <TrendingDown size={16} className="text-[#EA5455]" />
                <p className={`text-[13px] ${mutedCls}`}>Needs Attention</p>
              </div>
              <p className={`mt-1 text-[16px] font-bold ${mainCls}`}>{worst?.outlet_name}</p>
              <p className="text-[13px] text-[#EA5455]">{fmtINR(worst?.profit_loss)}</p>
            </div>
          </div>

          <div className={`animate-fade-up rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
            <div className={`flex items-center gap-3 border-b px-4 py-3 sm:px-6 ${borderCls}`}>
              <h3 className={`text-[15px] font-semibold ${mainCls}`}>Outlet-by-Outlet P&L</h3>
              <span className={`ml-auto text-[12px] ${mutedCls} hidden sm:inline`}>← Scroll to see all columns</span>
            </div>
            <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
              <table className="min-w-full" style={{ minWidth: "800px" }}>
                <thead>
                  <tr>
                    {["Outlet", "Adjusted Sales", "COGS", "Operating Exp.", "Net Profit", "Food Cost %", "Net Margin %"].map((h) => (
                      <th key={h} className={`whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider ${thCls}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${borderCls}`}>
                  {outlets.map((o) => (
                    <tr key={o.outlet_id} className={`transition ${trHover}`}>
                      <td className={`px-4 py-3 text-[14px] font-medium ${mainCls}`}>{o.outlet_name}</td>
                      <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{fmtINR(o.adjusted_sales)}</td>
                      <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{fmtINR(o.actual_consumption)}</td>
                      <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{fmtINR(o.total_operating_expenses)}</td>
                      <td className={`px-4 py-3 text-[14px] font-semibold tabular-nums ${Number(o.profit_loss) >= 0 ? "text-[#28C76F]" : "text-[#EA5455]"}`}>{fmtINR(o.profit_loss)}</td>
                      <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{o.food_cost_percentage}%</td>
                      <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{o.net_profit_percentage}%</td>
                    </tr>
                  ))}
                  <tr className={isDark ? "bg-[#25293C]" : "bg-[#F8F7FA]"}>
                    <td className={`px-4 py-3 text-[13px] font-semibold ${mainCls}`}>Company Total</td>
                    <td className={`px-4 py-3 text-[14px] font-bold ${mainCls}`}>{fmtINR(comparison.company_total.adjusted_sales)}</td>
                    <td className={`px-4 py-3 text-[14px] font-bold ${mainCls}`}>{fmtINR(comparison.company_total.actual_consumption)}</td>
                    <td className={`px-4 py-3 text-[14px] font-bold ${mainCls}`}>{fmtINR(comparison.company_total.total_operating_expenses)}</td>
                    <td className={`px-4 py-3 text-[14px] font-bold ${Number(comparison.company_total.profit_loss) >= 0 ? "text-[#28C76F]" : "text-[#EA5455]"}`}>{fmtINR(comparison.company_total.profit_loss)}</td>
                    <td colSpan="2" className={`px-4 py-3 text-[14px] font-bold ${mainCls}`}>{comparison.company_total.net_profit_percentage}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && !deniedMessage && hasGenerated && outlets.length === 0 && (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 px-4 text-center ${cardCls}`}>
          <p className={`text-[16px] font-semibold ${mainCls}`}>No active outlets found</p>
        </div>
      )}

      {!loading && !hasGenerated && (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 px-4 text-center ${cardCls}`}>
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-[#3B405A]" : "bg-[#EBE9F1]"}`}>
            <FileText size={26} className={mutedCls} />
          </div>
          <p className={`text-[16px] font-semibold ${mainCls}`}>No comparison generated yet</p>
          <p className={`mt-1 text-[13px] ${mutedCls}`}>Select month and year then click Generate</p>
        </div>
      )}
    </div>
  );
};

export default OutletComparisonReport;

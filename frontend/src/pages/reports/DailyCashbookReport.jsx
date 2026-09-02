import { useState, useEffect } from 'react';
import { Download, Search, Loader2, BookOpen, FileText, Banknote } from 'lucide-react';
import { reportAPI, masterAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { exportReportPDF } from '../../utils/pdfReport';

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };
const fmtINR = (n = 0) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safeDate = (d) => { try { return format(new Date(d), 'dd MMM yyyy'); } catch { return d || "—"; } };

const DailyCashbookReport = () => {
  const [outlets, setOutlets] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    outlet_id: '',
    from_date: format(new Date(), 'yyyy-MM-dd'),
    to_date: format(new Date(), 'yyyy-MM-dd')
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
      const r = await reportAPI.getDailyCashbook(filters);
      const rows = r.data?.data || r.data || [];
      // daily_cashbooks stores per-platform sales (zomato_sales, swiggy_sales, own_app_sales,
      // etc.) rather than one online_sales column - sum them here for this report's view.
      setReportData(rows.map((e) => ({
        ...e,
        cashbook_date: e.date,
        online_sales: Number(e.zomato_sales || 0) + Number(e.swiggy_sales || 0) + Number(e.own_app_sales || 0) +
          Number(e.ownly_sales || 0) + Number(e.swiggy_dineout_sales || 0) + Number(e.zomato_dining_sales || 0) +
          Number(e.district_sales || 0) + Number(e.eazydiner_sales || 0) + Number(e.other_sales || 0),
      })));
      toast.success('Report generated');
    } catch { toast.error('Failed to generate report'); }
    finally { setLoading(false); }
  };

  const totalSales = reportData.reduce((s, e) => s + parseFloat(e.total_sales || 0), 0);

  const COLS = [
    { key: "cashbook_date", label: "Date", render: (v) => safeDate(v) },
    { key: "cash_sales",    label: "Cash Sales",   render: (v) => fmtINR(v) },
    { key: "card_sales",    label: "Card Sales",   render: (v) => fmtINR(v) },
    { key: "upi_sales",     label: "UPI Sales",    render: (v) => fmtINR(v) },
    { key: "online_sales",  label: "Online Sales", render: (v) => fmtINR(v) },
    { key: "total_sales",   label: "Total Sales",  render: (v) => fmtINR(v), bold: true },
    {
      key: "cash_difference",
      label: "Cash Diff.",
      render: (v) => {
        const n = parseFloat(v || 0);
        return (
          <span className={n < 0 ? "text-[#EA5455]" : "text-[#28C76F]"}>
            {fmtINR(v)}
          </span>
        );
      },
    },
  ];

  const handleExport = async () => {
    const headers = COLS.map((c) => c.label);
    const rows = reportData.map((entry) => COLS.map((c) => {
      if (c.key === "cashbook_date") return safeDate(entry[c.key]);
      return fmtINR(entry[c.key] ?? 0);
    }));

    const outletName = outlets.find((o) => String(o.id) === String(filters.outlet_id))?.outlet_name;
    const dateRangeLabel = filters.from_date === filters.to_date
      ? safeDate(filters.from_date)
      : `${safeDate(filters.from_date)} - ${safeDate(filters.to_date)}`;

    await exportReportPDF({
      title: "Daily Cashbook Report",
      outletName,
      dateRangeLabel,
      columns: headers,
      rows,
      summaryLines: [`Total Sales: ${fmtINR(totalSales)}`],
      fileName: `daily-cashbook-${filters.from_date}-to-${filters.to_date}.pdf`,
    });
    toast.success("Report exported");
  };

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Daily Cashbook Report</h1>
          <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>Daily cash, card and online sales summary</p>
        </div>
        {reportData.length > 0 && (
          <button onClick={handleExport} className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]" style={{ backgroundColor: primaryColor }}>
            <Download size={16} /> Export
          </button>
        )}
      </div>

      {/* Filters */}
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
              <label className={`mb-1.5 block text-[13px] font-medium ${labelCls}`}>From Date *</label>
              <input type="date" value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`} />
            </div>
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${labelCls}`}>To Date *</label>
              <input type="date" value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })}
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

      {/* Loading */}
      {loading && (
        <div className={`flex items-center justify-center gap-3 rounded-md border py-12 ${cardCls}`}>
          <Loader2 size={22} className="animate-spin" style={{ color: primaryColor }} />
          <span className={`text-[15px] font-medium ${mutedCls}`}>Generating report…</span>
        </div>
      )}

      {/* Total KPI */}
      {!loading && reportData.length > 0 && (
        <div className={`animate-fade-up flex items-center gap-4 rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:p-5 ${cardCls}`}>
          <div className="flex h-11 w-11 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18` }}>
            <Banknote size={22} style={{ color: primaryColor }} />
          </div>
          <div>
            <p className={`text-[13px] ${mutedCls}`}>Total Sales ({reportData.length} days)</p>
            <p className="mt-0.5 text-[22px] font-bold" style={{ color: primaryColor }}>{fmtINR(totalSales)}</p>
          </div>
        </div>
      )}

      {/* Table */}
      {!loading && reportData.length > 0 && (
        <div className={`animate-fade-up rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
          <div className={`flex items-center gap-3 border-b px-4 py-3 sm:px-6 ${borderCls}`}>
            <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
              <BookOpen size={17} />
            </div>
            <h3 className={`text-[15px] font-semibold ${mainCls}`}>Cashbook Entries</h3>
          </div>
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="min-w-full">
              <thead>
                <tr>
                  {COLS.map(c => (
                    <th key={c.key} className={`whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider ${thCls}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${borderCls}`}>
                {reportData.map((entry, idx) => (
                  <tr key={idx} className={`transition ${trHover}`}>
                    {COLS.map(c => (
                      <td key={c.key} className={`px-4 py-3 text-[14px] ${c.bold ? `font-semibold ${mainCls}` : mutedCls}`}>
                        {c.render ? c.render(entry[c.key]) : entry[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && reportData.length === 0 && (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 px-4 text-center ${cardCls}`}>
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-[#3B405A]" : "bg-[#EBE9F1]"}`}>
            <FileText size={26} className={mutedCls} />
          </div>
          <p className={`text-[16px] font-semibold ${mainCls}`}>No data yet</p>
          <p className={`mt-1 text-[13px] ${mutedCls}`}>Select an outlet and date range then click Generate</p>
        </div>
      )}
    </div>
  );
};

export default DailyCashbookReport;

import { useState, useEffect } from 'react';
import { Download, Search, TrendingUp, TrendingDown, FileText, Loader2, ShoppingBag, Wallet, BarChart2, Lock, LockKeyhole } from 'lucide-react';
import { reportAPI, masterAPI } from '../../services/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { exportReportPDF } from '../../utils/pdfReport';

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };
const fmt = (n = 0) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const PLRow = ({ label, value, isTotal, isNegative, isDark, border }) => (
  <div className={`flex items-center justify-between py-2.5 ${border ? `border-t ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}` : ""}`}>
    <span className={`text-[14px] ${isTotal ? "font-semibold" : ""} ${isDark ? "text-[#D0D2D6]" : "text-[#5D596C]"}`}>{label}</span>
    <span className={`text-[14px] font-semibold tabular-nums ${isNegative ? "text-[#EA5455]" : isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{value}</span>
  </div>
);

const PLSection = ({ title, icon: Icon, children, isDark, color = "#7367F0" }) => {
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white";
  return (
    <div className={`animate-fade-up rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
      <div className={`flex items-center gap-3 border-b px-4 py-3 sm:px-6 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
        <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${color}18`, color }}>
          <Icon size={17} />
        </div>
        <h3 className={`text-[15px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{title}</h3>
      </div>
      <div className="px-4 py-3 sm:px-6">{children}</div>
    </div>
  );
};

const MonthlyPLReport = () => {
  const { user } = useAuthStore();
  const canFinalize = ["Super Admin", "Admin", "Developer"].includes(user?.role_name);

  const [outlets, setOutlets] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
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
      const r = await reportAPI.getMonthlyPL(filters);
      setReportData(r.data?.data || r.data || null);
      toast.success('Report generated');
    } catch { toast.error('Failed to generate report'); }
    finally { setLoading(false); }
  };

  const handleFinalizeMonth = async () => {
    if (!filters.outlet_id) return;
    setFinalizing(true);
    try {
      const r = await reportAPI.finalizeMonthlyPL(filters);
      setReportData(r.data?.data || r.data || null);
      toast.success('Month finalized — P&L is now locked');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to finalize month');
    } finally { setFinalizing(false); }
  };

  // getOutletPL() returns a nested { revenue, cost_of_goods, operating_expenses,
  // summary } shape - flatten it here once so the JSX below can stay simple.
  const revenue = reportData?.revenue || {};
  const cogs = reportData?.cost_of_goods || {};
  const opex = reportData?.operating_expenses || {};
  const summary = reportData?.summary || {};

  const netProfit = reportData ? parseFloat(summary.profit_loss || 0) : 0;
  const isProfitable = netProfit >= 0;

  const handleExport = async () => {
    const rows = [
      ["Revenue", "Gross Sales", fmt(revenue.gross_sales || 0)],
      ["Revenue", "Discounts", fmt(-(revenue.discounts || 0))],
      ["Revenue", "Taxes", fmt(-(revenue.taxes || 0))],
      ["Revenue", "Online/Dine-in Commissions & Deductions", fmt(-((revenue.total_online_deductions || 0) + (revenue.total_dinein_deductions || 0)))],
      ["Revenue", "Net Revenue (Adjusted Sales)", fmt(revenue.adjusted_sales || 0)],
      ["COGS", "Opening Stock", fmt(cogs.opening_stock || 0)],
      ["COGS", "Purchases", fmt(cogs.purchases || 0)],
      ["COGS", "Closing Stock", fmt(-(cogs.closing_stock || 0))],
      ["COGS", "Actual Consumption (COGS)", fmt(cogs.actual_consumption || 0)],
      ["Operating Expenses", "Daily Cash Expenses", fmt(opex.daily_cash_expenses || 0)],
      ["Operating Expenses", "Utility Bills", fmt(opex.total_utilities || 0)],
      ["Operating Expenses", "Payroll", fmt(opex.total_salary || 0)],
      ["Operating Expenses", "Fixed Costs", fmt(opex.fixed_costs || 0)],
      ["Operating Expenses", "Total Operating Expenses", fmt(opex.total_operating_expenses || 0)],
    ];

    const outletName = outlets.find((o) => String(o.id) === String(filters.outlet_id))?.outlet_name;

    await exportReportPDF({
      title: "Monthly P&L Report",
      outletName,
      dateRangeLabel: `${MONTHS[filters.month - 1]} ${filters.year}`,
      columns: ["Section", "Line Item", "Amount"],
      rows,
      summaryLines: [
        `Net Revenue: ${fmt(revenue.adjusted_sales || 0)}`,
        `Total COGS: ${fmt(-(cogs.actual_consumption || 0))}`,
        `Total Operating Expenses: ${fmt(-(opex.total_operating_expenses || 0))}`,
        `Food Cost: ${parseFloat(summary.food_cost_percentage || 0).toFixed(2)}%   |   Profit Margin: ${parseFloat(summary.net_profit_percentage || 0).toFixed(2)}%`,
        `Net Profit / Loss: ${fmt(netProfit)}`,
      ],
      fileName: `monthly-pl-${filters.outlet_id}-${filters.month}-${filters.year}.pdf`,
    });
    toast.success("Report exported");
  };

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={`text-xl font-bold sm:text-2xl ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Monthly Outlet P&L Report</h1>
          <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>Detailed profit &amp; loss statement per outlet per month</p>
        </div>
        {reportData && (
          <div className="flex flex-wrap items-center gap-2">
            {reportData.is_finalized ? (
              <span className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-[13px] font-semibold ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#28C76F]" : "border-[#EBE9F1] bg-[#E9F9EF] text-[#28C76F]"}`}>
                <LockKeyhole size={15} /> Finalized{reportData.finalized_at ? ` on ${new Date(reportData.finalized_at).toLocaleDateString('en-IN')}` : ''}
              </span>
            ) : canFinalize ? (
              <button onClick={handleFinalizeMonth} disabled={finalizing}
                className="flex items-center gap-2 rounded-md border px-4 py-2.5 text-[14px] font-semibold shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                style={{ borderColor: primaryColor, color: primaryColor }}>
                {finalizing ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                {finalizing ? "Finalizing…" : "Finalize Month"}
              </button>
            ) : null}
            <button onClick={handleExport} className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]" style={{ backgroundColor: primaryColor }}>
              <Download size={16} /> Export
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
        <div className={`border-b px-4 py-3 sm:px-6 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
          <span className={`text-[12px] font-semibold uppercase tracking-wider ${mutedCls}`}>Filters</span>
        </div>
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#5D596C]"}`}>Outlet *</label>
              <select value={filters.outlet_id} onChange={(e) => setFilters({ ...filters, outlet_id: e.target.value })}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`}>
                <option value="">Select Outlet</option>
                {outlets.map(o => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
              </select>
            </div>
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#5D596C]"}`}>Month *</label>
              <select value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`}>
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#5D596C]"}`}>Year *</label>
              <input type="number" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`} />
            </div>
            <div className="flex items-end">
              <button onClick={handleGenerateReport} disabled={loading}
                className="flex h-[42px] w-full items-center justify-center gap-2 rounded-md px-4 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                style={{ backgroundColor: primaryColor }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {loading ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className={`flex items-center justify-center gap-3 rounded-md border py-12 ${cardCls}`}>
          <Loader2 size={22} className="animate-spin" style={{ color: primaryColor }} />
          <span className={`text-[15px] font-medium ${mutedCls}`}>Generating report…</span>
        </div>
      )}

      {/* Report Data */}
      {!loading && reportData && (
        <div className="space-y-4">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {[
              { label: "Net Revenue", value: fmt(revenue.adjusted_sales), color: primaryColor, bg: `${primaryColor}18`, icon: TrendingUp },
              { label: "Total Costs", value: fmt(summary.total_expenses), color: "#EA5455", bg: "#FCEAEA", icon: ShoppingBag },
              { label: "Net Profit", value: fmt(netProfit), color: isProfitable ? "#28C76F" : "#EA5455", bg: isProfitable ? "#E9F9EF" : "#FCEAEA", icon: isProfitable ? TrendingUp : TrendingDown },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className={`animate-fade-up rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:p-5 ${cardCls}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md" style={{ backgroundColor: item.bg, color: item.color }}>
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-[12px] font-medium ${mutedCls}`}>{item.label}</p>
                      <p className="mt-0.5 truncate text-[18px] font-bold sm:text-[20px]" style={{ color: item.color }}>{item.value}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Revenue Section */}
          <PLSection title="Revenue" icon={TrendingUp} isDark={isDark} color={primaryColor}>
            <PLRow label="Gross Sales" value={fmt(revenue.gross_sales)} isDark={isDark} />
            <PLRow label="Discounts" value={`−${fmt(revenue.discounts)}`} isNegative isDark={isDark} />
            <PLRow label="Taxes" value={`−${fmt(revenue.taxes)}`} isNegative isDark={isDark} />
            <PLRow label="Online/Dine-in Commissions & Deductions" value={`−${fmt(revenue.total_online_deductions + revenue.total_dinein_deductions)}`} isNegative isDark={isDark} />
            <PLRow label="Net Revenue (Adjusted Sales)" value={fmt(revenue.adjusted_sales)} isTotal isDark={isDark} border />
          </PLSection>

          {/* COGS Section */}
          <PLSection title="Cost of Goods Sold (COGS)" icon={ShoppingBag} isDark={isDark} color="#FF9F43">
            <PLRow label="Opening Stock" value={fmt(cogs.opening_stock)} isDark={isDark} />
            <PLRow label="Purchases" value={fmt(cogs.purchases)} isDark={isDark} />
            <PLRow label="Closing Stock" value={`−${fmt(cogs.closing_stock)}`} isNegative isDark={isDark} />
            <PLRow label="Actual Consumption (COGS)" value={fmt(cogs.actual_consumption)} isTotal isDark={isDark} border />
          </PLSection>

          {/* Expenses Section */}
          <PLSection title="Operating Expenses" icon={Wallet} isDark={isDark} color="#EA5455">
            <PLRow label="Daily Cash Expenses" value={fmt(opex.daily_cash_expenses)} isDark={isDark} />
            <PLRow label="Utility Bills" value={fmt(opex.total_utilities)} isDark={isDark} />
            <PLRow label="Payroll (Salary, Incentives, Accommodation)" value={fmt(opex.total_salary)} isDark={isDark} />
            <PLRow label="Fixed Costs (Rent, Marketing, Other)" value={fmt(opex.fixed_costs)} isDark={isDark} />
            <PLRow label="Total Operating Expenses" value={fmt(opex.total_operating_expenses)} isTotal isDark={isDark} border />
          </PLSection>

          {/* Summary Section */}
          <PLSection title="P&L Summary" icon={BarChart2} isDark={isDark} color={isProfitable ? "#28C76F" : "#EA5455"}>
            <PLRow label="Net Revenue" value={fmt(revenue.adjusted_sales)} isDark={isDark} />
            <PLRow label="Total COGS" value={`−${fmt(cogs.actual_consumption)}`} isNegative isDark={isDark} />
            <PLRow label="Total Operating Expenses" value={`−${fmt(opex.total_operating_expenses)}`} isNegative isDark={isDark} />
            <PLRow label="Net Profit / Loss" value={fmt(netProfit)} isTotal isDark={isDark} border isNegative={!isProfitable} />
            <div className={`mt-4 grid grid-cols-2 gap-3 border-t pt-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              {[
                { label: "Food Cost %", value: `${parseFloat(summary.food_cost_percentage||0).toFixed(2)}%` },
                { label: "Profit Margin %", value: `${parseFloat(summary.net_profit_percentage||0).toFixed(2)}%` },
              ].map((m) => (
                <div key={m.label} className={`rounded-md p-3 text-center ${isDark ? "bg-[#25293C]" : "bg-[#F8F7FA]"}`}>
                  <p className={`text-[12px] ${mutedCls}`}>{m.label}</p>
                  <p className={`mt-1 text-[18px] font-bold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{m.value}</p>
                </div>
              ))}
            </div>
          </PLSection>
        </div>
      )}

      {/* Empty state */}
      {!loading && !reportData && (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 px-4 text-center ${cardCls}`}>
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-[#3B405A]" : "bg-[#EBE9F1]"}`}>
            <FileText size={26} className={mutedCls} />
          </div>
          <p className={`text-[16px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>No report generated yet</p>
          <p className={`mt-1 text-[13px] ${mutedCls}`}>Select an outlet, month and year then click Generate</p>
        </div>
      )}
    </div>
  );
};

export default MonthlyPLReport;

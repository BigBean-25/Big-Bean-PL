import { useEffect, useState } from "react";
import { RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { outletDashboardAPI } from "../../services/api";
import { useSelectedOutlet, OutletScopeBadge } from "../../hooks/useSelectedOutlet";

const getPrimaryColor = () => {
  try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; }
};
const getThemeMode = () => {
  try {
    const mode = localStorage.getItem("bbc_theme_mode") || "light";
    if (mode === "system") return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
    return mode;
  } catch { return "light"; }
};

const fmtINR = (n = 0) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);
const startOfMonthISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

const Row = ({ label, value, bold, negative, cardCls, mutedCls, mainCls }) => (
  <div className={`flex items-center justify-between border-b py-2.5 last:border-b-0 ${cardCls}`}>
    <span className={`text-[14px] ${bold ? `font-semibold ${mainCls}` : mutedCls}`}>{label}</span>
    <span className={`text-[14px] ${bold ? `font-semibold ${mainCls}` : mainCls}`}>{negative ? "− " : ""}{fmtINR(value)}</span>
  </div>
);

const OutletSalesBreakdown = () => {
  const { selectedOutletId } = useSelectedOutlet(() => fetchData());
  const [from, setFrom] = useState(startOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

  const hasOutlet = selectedOutletId && selectedOutletId !== "all";

  const fetchData = async () => {
    if (!hasOutlet) { setData(null); setError(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await outletDashboardAPI.getSalesBreakdown({ outlet_id: selectedOutletId, from, to });
      setData(res?.data?.data || null);
    } catch (error) {
      setData(null);
      setError(error.response?.data?.message || "Failed to load sales breakdown");
      toast.error(error.response?.data?.message || "Failed to load sales breakdown");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [selectedOutletId, from, to]);

  const range = data?.range;
  const payouts = data?.monthly_payouts;

  return (
    <div className="space-y-5" style={{ fontFamily: '"Public Sans", "Inter", system-ui, sans-serif' }}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${mainCls}`}>Sales Analysis</h1>
          <p className={`mt-1 text-[14px] ${mutedCls}`}>Gross, tax, discount and net sales for the selected range; commission and app collection are shown for the covered month (entered monthly, not daily).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OutletScopeBadge />
          <button type="button" onClick={fetchData} className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[14px] font-medium ${cardCls}`}>
            <RefreshCw size={18} /> Refresh
          </button>
        </div>
      </div>

      <div className={`flex flex-wrap items-end gap-3 rounded-md border p-4 ${cardCls}`}>
        <div>
          <label className={`mb-1 block text-[12px] font-medium ${mutedCls}`}>From</label>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`h-10 rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
        </div>
        <div>
          <label className={`mb-1 block text-[12px] font-medium ${mutedCls}`}>To</label>
          <input type="date" value={to} min={from} max={todayISO()} onChange={(e) => setTo(e.target.value)} className={`h-10 rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
        </div>
      </div>

      {!hasOutlet ? (
        <div className={`flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-md border p-8 text-center ${cardCls}`}>
          <AlertCircle size={32} className={mutedCls} />
          <p className={`text-[15px] font-semibold ${mainCls}`}>Select a specific outlet</p>
          <p className={`text-[13px] ${mutedCls}`}>Choose an outlet from the top bar to view its sales breakdown.</p>
        </div>
      ) : error ? (
        <div className={`flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-md border p-8 text-center ${cardCls}`}>
          <AlertCircle size={32} className={mutedCls} />
          <p className={`text-[15px] font-semibold ${mainCls}`}>Failed to load sales analysis</p>
          <p className={`text-[13px] ${mutedCls}`}>{error}</p>
        </div>
      ) : loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <Loader2 size={32} className="animate-spin" style={{ color: primaryColor }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={`rounded-md border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
            <h3 className={`mb-3 text-[15px] font-semibold ${mainCls}`}>Sales ({from} to {to})</h3>
            <Row label="Gross Sales" value={range?.gross_sales} cardCls={borderCls} mutedCls={mutedCls} mainCls={mainCls} />
            <Row label="Discount" value={range?.total_discount} negative cardCls={borderCls} mutedCls={mutedCls} mainCls={mainCls} />
            <Row label="Tax Collection" value={range?.total_tax} negative cardCls={borderCls} mutedCls={mutedCls} mainCls={mainCls} />
            <Row label="Net Sales" value={range?.net_sales} bold cardCls={borderCls} mutedCls={mutedCls} mainCls={mainCls} />
          </div>

          <div className={`rounded-md border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
            <h3 className={`mb-3 text-[15px] font-semibold ${mainCls}`}>
              Platform Deductions ({payouts?.month}/{payouts?.year}, month-only)
            </h3>
            <Row label="App / Platform Collection" value={payouts?.app_collection} cardCls={borderCls} mutedCls={mutedCls} mainCls={mainCls} />
            <Row label="Commission" value={payouts?.commission} negative cardCls={borderCls} mutedCls={mutedCls} mainCls={mainCls} />
            <Row label="Payment Gateway Charges" value={payouts?.payment_gateway_charges} negative cardCls={borderCls} mutedCls={mutedCls} mainCls={mainCls} />
            <Row label="TCS" value={payouts?.tcs} negative cardCls={borderCls} mutedCls={mutedCls} mainCls={mainCls} />
            <Row label="TDS" value={payouts?.tds} negative cardCls={borderCls} mutedCls={mutedCls} mainCls={mainCls} />
          </div>
        </div>
      )}
    </div>
  );
};

export default OutletSalesBreakdown;

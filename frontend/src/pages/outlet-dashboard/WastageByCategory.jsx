import { useEffect, useState } from "react";
import { RefreshCw, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { warehouseAPI } from "../../services/api";

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

const WastageByCategory = () => {
  const [from, setFrom] = useState(startOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await warehouseAPI.getWarehouseReport("wastage-by-category", { from_date: from, to_date: to });
      setRows(res?.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load wastage by category");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [from, to]);

  const totalValue = rows.reduce((sum, r) => sum + Number(r.total_value || 0), 0);

  return (
    <div className="space-y-5" style={{ fontFamily: '"Public Sans", "Inter", system-ui, sans-serif' }}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${mainCls}`}>Wastage — Category Wise</h1>
          <p className={`mt-1 text-[14px] ${mutedCls}`}>Posted/approved warehouse wastage grouped by raw material category.</p>
        </div>
        <button type="button" onClick={fetchData} className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[14px] font-medium ${cardCls}`}>
          <RefreshCw size={18} /> Refresh
        </button>
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
        <div className="ml-auto text-right">
          <p className={`text-[12px] ${mutedCls}`}>Total Wastage Value</p>
          <p className={`text-[18px] font-semibold ${mainCls}`}>{fmtINR(totalValue)}</p>
        </div>
      </div>

      <div className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 size={28} className="animate-spin" style={{ color: primaryColor }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
            <Trash2 size={28} className={mutedCls} />
            <p className={`text-[14px] ${mutedCls}`}>No wastage recorded for this range.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr className={`border-b ${borderCls}`}>
                  <th className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide ${mutedCls}`}>Category</th>
                  <th className={`px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide ${mutedCls}`}>Wastage Entries</th>
                  <th className={`px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide ${mutedCls}`}>Total Qty</th>
                  <th className={`px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide ${mutedCls}`}>Total Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.category_name} className={`border-b last:border-b-0 ${borderCls}`}>
                    <td className={`px-4 py-3 text-[14px] font-medium ${mainCls}`}>{row.category_name}</td>
                    <td className={`px-4 py-3 text-right text-[14px] ${mainCls}`}>{row.wastage_count}</td>
                    <td className={`px-4 py-3 text-right text-[14px] ${mainCls}`}>{Number(row.total_qty).toFixed(3)}</td>
                    <td className={`px-4 py-3 text-right text-[14px] font-semibold ${mainCls}`}>{fmtINR(row.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default WastageByCategory;

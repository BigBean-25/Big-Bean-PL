import { useState, useEffect } from 'react';
import { Loader2, Scale, FileSearch } from 'lucide-react';
import api, { masterAPI } from '../../services/api';
import toast from 'react-hot-toast';

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };
const fmtINR = (n) => n === null || n === undefined ? '—' : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ConsumptionReconciliationReport = () => {
  const [outlets, setOutlets] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const now = new Date();
  const [filters, setFilters] = useState({ outlet_id: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()) });

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

  useEffect(() => {
    (async () => {
      try {
        const o = await masterAPI.getOutlets();
        const list = o.data?.data || o.data || [];
        setOutlets(list);
        if (list.length === 1) setFilters((f) => ({ ...f, outlet_id: String(list[0].id) }));
      } catch { /* silent */ }
    })();
  }, []);

  const generate = async () => {
    if (!filters.outlet_id) { toast.error('Select an outlet'); return; }
    setLoading(true);
    try {
      const r = await api.get('/reports/outlet-consumption-reconciliation', { params: filters });
      setData(r.data?.data || r.data || null);
      setHasGenerated(true);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to load reconciliation'); }
    finally { setLoading(false); }
  };

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Physical vs Theoretical Consumption</h1>
        <p className={`mt-1 text-[13px] ${mutedCls}`}>PHYSICAL POSTING REQUIRES EXPLICIT REVIEW — SALES DO NOT AUTOMATICALLY DEDUCT STOCK</p>
      </div>

      <div className={`rounded-md border p-4 ${cardCls}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={`mb-1 block text-[12px] font-medium ${mainCls}`}>Outlet</label>
            <select value={filters.outlet_id} onChange={(e) => setFilters({ ...filters, outlet_id: e.target.value })}
              className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
              <option value="">Select outlet</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
            </select>
          </div>
          <div>
            <label className={`mb-1 block text-[12px] font-medium ${mainCls}`}>Month</label>
            <select value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })}
              className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={`mb-1 block text-[12px] font-medium ${mainCls}`}>Year</label>
            <input type="number" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })}
              className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
          </div>
          <div className="flex items-end">
            <button onClick={generate} disabled={loading}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md text-[14px] font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Scale size={16} />}
              Generate
            </button>
          </div>
        </div>
      </div>

      {hasGenerated && data && (
        <>
          <div className={`rounded-md border p-4 ${cardCls}`}>
            <p className={`text-[12px] ${mutedCls}`}>{data.disclaimer}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><p className={`text-[12px] ${mutedCls}`}>Physical Qty (Posted)</p><p className={`text-[16px] font-bold ${mainCls}`}>{fmtQty(data.totals?.physical_qty)}</p></div>
              <div><p className={`text-[12px] ${mutedCls}`}>Physical Value</p><p className={`text-[16px] font-bold ${mainCls}`}>{fmtINR(data.totals?.physical_value)}</p></div>
              <div><p className={`text-[12px] ${mutedCls}`}>Theoretical Qty</p><p className={`text-[16px] font-bold ${mainCls}`}>{fmtQty(data.totals?.theoretical_qty)}</p></div>
              <div><p className={`text-[12px] ${mutedCls}`}>Variance Qty</p><p className={`text-[16px] font-bold ${data.totals?.variance_qty ? 'text-[#FF9F43]' : mainCls}`}>{fmtQty(data.totals?.variance_qty)}</p></div>
            </div>
          </div>

          <div className={`overflow-hidden rounded-md border ${cardCls}`}>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${borderCls} ${mutedCls}`}>
                  <th className="px-3 py-3">Material</th>
                  <th className="px-3 py-3">Code</th>
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3 text-right">Physical Qty</th>
                  <th className="px-3 py-3 text-right">Physical Value</th>
                  <th className="px-3 py-3 text-right">Theoretical Qty</th>
                  <th className="px-3 py-3 text-right">Variance Qty</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((it) => (
                  <tr key={it.raw_material_id} className={`border-b ${borderCls}`}>
                    <td className="px-3 py-2.5">{it.material_name}</td>
                    <td className="px-3 py-2.5">{it.material_code}</td>
                    <td className="px-3 py-2.5">{it.unit}</td>
                    <td className="px-3 py-2.5 text-right">{fmtQty(it.physical_qty)}</td>
                    <td className="px-3 py-2.5 text-right">{fmtINR(it.physical_value)}</td>
                    <td className="px-3 py-2.5 text-right">{fmtQty(it.theoretical_qty)}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${it.variance_qty ? 'text-[#FF9F43]' : mainCls}`}>{fmtQty(it.variance_qty)}</td>
                  </tr>
                ))}
                {!(data.items || []).length && (
                  <tr><td colSpan={7} className={`px-3 py-8 text-center ${mutedCls}`}>No physical or theoretical consumption in this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {hasGenerated && !data && !loading && (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 ${cardCls}`}>
          <FileSearch size={26} className={mutedCls} />
          <p className={`mt-3 text-[15px] font-semibold ${mainCls}`}>No data returned</p>
        </div>
      )}
    </div>
  );
};

export default ConsumptionReconciliationReport;

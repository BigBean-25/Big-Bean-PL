import { useState, useEffect } from 'react';
import { Loader2, Scale, AlertTriangle, CheckCircle2, AlertCircle, FileSearch } from 'lucide-react';
import api, { masterAPI } from '../../services/api';
import toast from 'react-hot-toast';

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };
const fmtINR = (n) => n === null || n === undefined ? '—' : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CLASS_STYLES = {
  PHYSICAL_COMPLETE_MATCH: 'bg-[#28C76F]/15 text-[#28C76F]',
  PHYSICAL_COMPLETE_VARIANCE: 'bg-[#FF9F43]/15 text-[#FF9F43]',
  PHYSICAL_PARTIAL: 'bg-[#FF9F43]/15 text-[#FF9F43]',
  VALUATION_INCOMPLETE: 'bg-[#FF9F43]/15 text-[#FF9F43]',
  MISSING_PHYSICAL_CONSUMPTION: 'bg-[#00CFE8]/15 text-[#00CFE8]',
  FINANCIAL_ONLY: 'bg-[#A8AAAE]/15 text-[#A8AAAE]',
};

const HybridCogsReport = () => {
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
  const labelCls = isDark ? "text-[#D0D2D6]" : "text-[#5D596C]";
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
      const r = await api.get('/reports/hybrid-cogs-reconciliation', { params: filters });
      setData(r.data?.data || r.data || null);
      setHasGenerated(true);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to load reconciliation'); }
    finally { setLoading(false); }
  };

  const Row = ({ label, value, bold }) => (
    <div className={`flex items-center justify-between border-b px-4 py-2 ${borderCls}`}>
      <span className={`text-[13px] ${bold ? `font-semibold ${mainCls}` : mutedCls}`}>{label}</span>
      <span className={`text-[13px] ${bold ? `font-bold ${mainCls}` : mainCls}`}>{value}</span>
    </div>
  );

  const f = data?.financial;
  const p = data?.physical;

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Hybrid COGS Reconciliation</h1>
        <p className={`mt-1 text-[13px] ${mutedCls}`}>FINANCIAL COGS — OFFICIAL P&L · PHYSICAL COGS — MANAGEMENT RECONCILIATION ONLY</p>
      </div>

      <div className={`rounded-md border p-4 ${cardCls}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={`mb-1 block text-[12px] font-medium ${labelCls}`}>Outlet</label>
            <select value={filters.outlet_id} onChange={(e) => setFilters({ ...filters, outlet_id: e.target.value })}
              className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
              <option value="">Select outlet</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
            </select>
          </div>
          <div>
            <label className={`mb-1 block text-[12px] font-medium ${labelCls}`}>Month</label>
            <select value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })}
              className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={`mb-1 block text-[12px] font-medium ${labelCls}`}>Year</label>
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
            <div className="flex flex-wrap items-center gap-3">
              {data.classification === 'PHYSICAL_COMPLETE_MATCH' ? <CheckCircle2 size={20} className="text-[#28C76F]" />
                : ['PHYSICAL_COMPLETE_VARIANCE', 'PHYSICAL_PARTIAL', 'VALUATION_INCOMPLETE'].includes(data.classification) ? <AlertTriangle size={20} className="text-[#FF9F43]" />
                : <AlertCircle size={20} className="text-[#00CFE8]" />}
              <span className={`rounded px-3 py-1 text-[13px] font-bold ${CLASS_STYLES[data.classification] || ''}`}>{data.classification}</span>
              <span className={`text-[12px] ${mutedCls}`}>
                Valuation: {p?.valuation_state} · Consumption model: {p?.consumption?.model} · Variance: {fmtINR(data.cogs_variance)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className={`overflow-hidden rounded-md border ${cardCls}`}>
              <div className={`border-b px-4 py-3 ${borderCls}`}>
                <h2 className="text-[15px] font-semibold text-[#28C76F]">FINANCIAL COGS — OFFICIAL P&L</h2>
                <p className={`text-[12px] ${mutedCls}`}>{f?.rule}</p>
              </div>
              <div>
                <Row label="Verified Opening Stock" value={fmtINR(f?.opening_stock)} />
                <Row label="Effective Purchases" value={fmtINR(f?.effective_purchases)} />
                <Row label="Verified Closing Stock" value={`−${fmtINR(f?.verified_closing_stock)}`} />
                <Row label="Financial COGS" value={fmtINR(f?.financial_cogs)} bold />
              </div>
            </div>

            <div className={`overflow-hidden rounded-md border ${cardCls}`}>
              <div className={`border-b px-4 py-3 ${borderCls}`}>
                <h2 className="text-[15px] font-semibold text-[#00CFE8]">PHYSICAL COGS — RECONCILIATION ONLY</h2>
                <p className={`text-[12px] ${mutedCls}`}>Stock-ledger movement values · never posted to accounts</p>
              </div>
              <div>
                <Row label="Physical Opening" value={fmtINR(p?.opening?.value)} />
                <Row label="External Receipts" value={fmtINR(p?.external_receipts?.value_in)} />
                <Row label="Transfers In / Out" value={`${fmtINR(p?.internal_transfer_in?.value_in)} / −${fmtINR(p?.internal_transfer_out?.value_out)}`} />
                <Row label="Production Receipt / Issue" value={`${fmtINR(p?.production_receipt?.value_in)} / −${fmtINR(p?.production_issue?.value_out)}`} />
                <Row label="Purchase Returns" value={`−${fmtINR(p?.purchase_return?.value_out)}`} />
                <Row label="Wastage" value={`−${fmtINR(p?.wastage?.value_out)}`} />
                <Row label="Adjustments (+ / −)" value={`${fmtINR(p?.adjustment_positive?.value_in)} / −${fmtINR((p?.adjustment_negative?.value_out || 0) + (p?.physical_count_adjustment?.value_out || 0))}`} />
                <Row label="Physical Closing" value={fmtINR(p?.closing?.value)} />
                <Row label="Physical Diagnostic COGS" value={p?.diagnostic_cogs === null ? 'N/A (consumption incomplete)' : fmtINR(p?.diagnostic_cogs)} bold />
              </div>
            </div>
          </div>

          <div className={`rounded-md border p-4 ${cardCls}`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className={`text-[12px] ${mutedCls}`}>COGS Variance (physical − financial)</p>
                <p className={`text-[18px] font-bold ${data.cogs_variance !== null && Number(data.cogs_variance) !== 0 ? 'text-[#FF9F43]' : mainCls}`}>
                  {data.cogs_variance === null ? 'N/A' : fmtINR(data.cogs_variance)}
                </p>
              </div>
              <div>
                <p className={`text-[12px] ${mutedCls}`}>Company Transfers (in − out)</p>
                <p className={`text-[18px] font-bold ${mainCls}`}>
                  {fmtINR(data.company_level?.transfer_in_value)} / {fmtINR(data.company_level?.transfer_out_value)} → P&L effect: ₹0.00
                </p>
              </div>
              <div>
                <p className={`text-[12px] ${mutedCls}`}>Unexplained Physical Residual</p>
                <p className={`text-[18px] font-bold ${mainCls}`}>{fmtINR(p?.unexplained_residual_value)}</p>
              </div>
            </div>
            {p?.consumption?.model === 'INCOMPLETE' && (
              <p className={`mt-3 text-[12px] ${mutedCls}`}>{p.consumption.note}</p>
            )}
            {(data.unowned_physical_activity || []).length > 0 && (
              <p className={`mt-2 text-[12px] ${mutedCls}`}>
                {data.unowned_physical_activity.length} central/unowned ledger movement(s) excluded — never allocated to an outlet.
              </p>
            )}
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

export default HybridCogsReport;

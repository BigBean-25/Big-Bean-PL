import { useState, useEffect } from 'react';
import { Loader2, Scale, AlertTriangle, CheckCircle2, AlertCircle, FileSearch } from 'lucide-react';
import { closingReconciliationAPI, masterAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { useReportOutletSync } from '../../hooks/useSelectedOutlet';

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };
const fmtNum = (n) => n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const fmtINR = (n) => n === null || n === undefined ? '—' : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const READINESS_STYLES = {
  READY: 'bg-[#28C76F]/15 text-[#28C76F]',
  READY_WITH_VARIANCE: 'bg-[#FF9F43]/15 text-[#FF9F43]',
  NOT_READY: 'bg-[#EA5455]/15 text-[#EA5455]',
};

const ClosingReconciliationReport = () => {
  const [outlets, setOutlets] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const now = new Date();
  const [filters, setFilters] = useState({ outlet_id: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()) });
  const { outletLocked } = useReportOutletSync({ setFilters, allModeValue: "", clearResult: () => setData(null) });

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const labelCls = isDark ? "text-[#D0D2D6]" : "text-[#5D596C]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const thCls = isDark ? "bg-[#25293C] text-[#A5A8B6]" : "bg-[#F8F7FA] text-[#A8AAAE]";
  const trHover = isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F8F7FA]";
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
      const r = await closingReconciliationAPI.get(filters);
      setData(r.data?.data || r.data || null);
      setHasGenerated(true);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to load reconciliation'); }
    finally { setLoading(false); }
  };

  const r = data?.readiness;
  const rows = data?.materials || [];
  const unresolved = data?.unresolved || {};

  const ConditionRow = ({ label, state }) => (
    <div className={`flex items-center justify-between border-b px-4 py-2 ${borderCls}`}>
      <span className={`text-[13px] ${mainCls}`}>{label}</span>
      <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${state ? 'bg-[#EA5455]/15 text-[#EA5455]' : 'bg-[#28C76F]/15 text-[#28C76F]'}`}>
        {state ? state : 'CLEAR'}
      </span>
    </div>
  );

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Closing Stock Reconciliation</h1>
        <p className={`mt-1 text-[13px] ${mutedCls}`}>RECONCILIATION ONLY — ACCOUNTING CLOSING REMAINS VERIFIED UPLOAD</p>
      </div>

      <div className={`rounded-md border p-4 ${cardCls}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={`mb-1 block text-[12px] font-medium ${labelCls}`}>Outlet</label>
            <select value={filters.outlet_id} disabled={outletLocked} style={outletLocked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined} onChange={(e) => setFilters({ ...filters, outlet_id: e.target.value })}
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
              {r?.status === 'READY' ? <CheckCircle2 size={20} className="text-[#28C76F]" />
                : r?.status === 'READY_WITH_VARIANCE' ? <AlertTriangle size={20} className="text-[#FF9F43]" />
                : <AlertCircle size={20} className="text-[#EA5455]" />}
              <span className={`rounded px-3 py-1 text-[13px] font-bold ${READINESS_STYLES[r?.status] || ''}`}>{r?.status || '—'}</span>
              <span className={`text-[12px] ${mutedCls}`}>Month-close readiness (advisory — does not block finalization)</span>
            </div>
            {(r?.reasons || []).length > 0 && (
              <ul className={`mt-3 list-inside list-disc space-y-1 text-[13px] ${mutedCls}`}>
                {r.reasons.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            )}
            {data.consumption_model === 'INCOMPLETE' && (
              <p className={`mt-2 text-[12px] ${mutedCls}`}>
                Physical consumption model is INCOMPLETE for this outlet — ledger-vs-closing variance may partly reflect missing outlet consumption movements.
              </p>
            )}
          </div>

          <div className={`overflow-hidden rounded-md border ${cardCls}`}>
            <div className={`border-b px-4 py-3 ${borderCls}`}>
              <h2 className={`text-[15px] font-semibold ${mainCls}`}>Material Reconciliation</h2>
              <p className={`text-[12px] ${mutedCls}`}>Accounting = Verified closing upload · Physical = stock-ledger balance at month end</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-[13px]">
                <thead>
                  <tr className={thCls}>
                    <th className="px-4 py-2 font-semibold">Material</th>
                    <th className="px-4 py-2 font-semibold">Physical Qty</th>
                    <th className="px-4 py-2 font-semibold">Acct Qty</th>
                    <th className="px-4 py-2 font-semibold">Qty Var</th>
                    <th className="px-4 py-2 font-semibold">Physical Value</th>
                    <th className="px-4 py-2 font-semibold">Acct Value</th>
                    <th className="px-4 py-2 font-semibold">Value Var</th>
                    <th className="px-4 py-2 font-semibold">Mapping</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan="8" className={`px-4 py-8 text-center ${mutedCls}`}>No materials</td></tr>
                  ) : rows.map((m) => (
                    <tr key={m.material_id} className={`border-t ${borderCls} ${trHover}`}>
                      <td className={`px-4 py-2 ${mainCls}`}>{m.material_name || `#${m.material_id}`}</td>
                      <td className="px-4 py-2">{fmtNum(m.physical_qty)}</td>
                      <td className="px-4 py-2">{fmtNum(m.accounting_qty)}</td>
                      <td className={`px-4 py-2 font-semibold ${Number(m.qty_variance) !== 0 ? 'text-[#FF9F43]' : ''}`}>{fmtNum(m.qty_variance)}</td>
                      <td className="px-4 py-2">{m.physical_value_state === 'UNAVAILABLE' ? 'N/A' : fmtINR(m.physical_value)}</td>
                      <td className="px-4 py-2">{fmtINR(m.accounting_value)}</td>
                      <td className="px-4 py-2">{fmtINR(m.value_variance)}</td>
                      <td className={`px-4 py-2 ${mutedCls}`}>{m.mapping_state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {(data.latest_physical_counts || []).length > 0 && (
            <div className={`overflow-hidden rounded-md border ${cardCls}`}>
              <div className={`border-b px-4 py-3 ${borderCls}`}>
                <h2 className={`text-[15px] font-semibold ${mainCls}`}>Latest Verified Physical Counts</h2>
                <p className={`text-[12px] ${mutedCls}`}>Counts are diagnostic — ledger balance is NOT replaced</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-[13px]">
                  <thead>
                    <tr className={thCls}>
                      <th className="px-4 py-2 font-semibold">Material</th>
                      <th className="px-4 py-2 font-semibold">Ledger Qty</th>
                      <th className="px-4 py-2 font-semibold">Counted Qty</th>
                      <th className="px-4 py-2 font-semibold">Count vs Ledger</th>
                      <th className="px-4 py-2 font-semibold">Count Date</th>
                      <th className="px-4 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.latest_physical_counts.map((c, i) => (
                      <tr key={i} className={`border-t ${borderCls} ${trHover}`}>
                        <td className={`px-4 py-2 ${mainCls}`}>{c.material_name || `#${c.material_id}`}</td>
                        <td className="px-4 py-2">{fmtNum(c.system_qty)}</td>
                        <td className="px-4 py-2">{fmtNum(c.counted_qty)}</td>
                        <td className={`px-4 py-2 font-semibold ${Number(c.count_vs_ledger_variance) !== 0 ? 'text-[#FF9F43]' : ''}`}>{fmtNum(c.count_vs_ledger_variance)}</td>
                        <td className="px-4 py-2">{c.count_date}</td>
                        <td className={`px-4 py-2 ${mutedCls}`}>{c.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className={`overflow-hidden rounded-md border ${cardCls}`}>
            <div className={`border-b px-4 py-3 ${borderCls}`}>
              <h2 className={`text-[15px] font-semibold ${mainCls}`}>Unresolved Physical Conditions</h2>
            </div>
            <div>
              <ConditionRow label="GRNs pending posting" state={unresolved.unposted_grns?.length ? 'PENDING' : null} />
              <ConditionRow label="In-transit transfers" state={unresolved.in_transit_transfers?.length ? 'PENDING' : null} />
              <ConditionRow label="Unposted purchase returns" state={unresolved.unposted_returns?.length ? 'PENDING' : null} />
              <ConditionRow label="Unposted physical counts" state={unresolved.unposted_counts?.length ? 'PENDING' : null} />
              <ConditionRow label="Unposted stock adjustments" state={unresolved.unposted_adjustments?.length ? 'PENDING' : null} />
              <ConditionRow label="Unposted wastage" state={unresolved.unposted_wastage?.length ? 'PENDING' : null} />
              <ConditionRow label="Unposted production wastage" state={unresolved.unposted_production_wastage?.length ? 'PENDING' : null} />
              <ConditionRow label="Unposted production batches (stock effect expected)" state={unresolved.unposted_production_batches?.length ? 'PENDING' : null} />
              <ConditionRow label="Purchase bridge effects" state={unresolved.purchase_bridge?.some((b) => ['DRAFT_ACCOUNTING_EFFECT', 'UNRESOLVED_OWNER', 'DUPLICATE_RISK'].includes(b.state)) ? 'UNRESOLVED' : null} />
              <ConditionRow label="Verified closing upload" state={unresolved.closing_upload_state === 'MISSING' || unresolved.closing_upload_state === 'NOT_VERIFIED' ? unresolved.closing_upload_state : null} />
            </div>
          </div>

          {(data.unowned_activity || []).length > 0 && (
            <div className={`rounded-md border p-4 ${cardCls}`}>
              <h2 className={`text-[15px] font-semibold ${mainCls}`}>Unowned / Central Activity</h2>
              <p className={`mt-1 text-[12px] ${mutedCls}`}>
                {data.unowned_activity.length} ledger movement(s) at central locations (no outlet mapping) — not included in this outlet's reconciliation.
              </p>
            </div>
          )}
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

export default ClosingReconciliationReport;

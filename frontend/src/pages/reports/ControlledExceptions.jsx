import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, X, ShieldAlert } from 'lucide-react';
import { exceptionAPI } from '../../services/api';
import toast from 'react-hot-toast';

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };

const SOURCE_MODULES = [
  { key: 'supplier_payments', label: 'Supplier Payment', terminal: 'Verified' },
  { key: 'outlet_vendor_payments', label: 'Outlet Vendor Payment', terminal: 'Verified' },
  { key: 'accounting_effects', label: 'GRN Accounting Effect', terminal: 'Posted' },
  { key: 'purchase_returns', label: 'Purchase Return', terminal: 'Posted / Locked' },
  { key: 'outlet_consumptions', label: 'Outlet Consumption', terminal: 'Posted / Locked' },
];

const EXCEPTION_TYPES = [
  ['DATA_CORRECTION', 'Data Correction'],
  ['FINANCIAL_REVERSAL', 'Financial Reversal'],
  ['PHYSICAL_REVERSAL', 'Physical Reversal'],
  ['DUPLICATE_TRANSACTION', 'Duplicate Transaction'],
  ['WRONG_OUTLET', 'Wrong Outlet'],
  ['WRONG_AMOUNT', 'Wrong Amount'],
  ['WRONG_DATE', 'Wrong Date'],
  ['WRONG_MATERIAL', 'Wrong Material'],
  ['OTHER', 'Other'],
];

const STATUS_BADGE = {
  Requested: 'bg-blue-100 text-blue-700',
  'Under Review': 'bg-amber-100 text-amber-700',
  Approved: 'bg-purple-100 text-purple-700',
  Rejected: 'bg-red-100 text-red-600',
  Executed: 'bg-emerald-100 text-emerald-700',
  Cancelled: 'bg-gray-200 text-gray-500',
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const ControlledExceptions = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deniedMessage, setDeniedMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [form, setForm] = useState({ source_module: 'supplier_payments', source_id: '', exception_type: 'FINANCIAL_REVERSAL', reason: '', business_impact: '' });

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6]" : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const thCls = isDark ? "bg-[#25293C] text-[#A5A8B6]" : "bg-[#F8F7FA] text-[#A8AAAE]";
  const trHover = isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F8F7FA]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

  const load = useCallback(async () => {
    setLoading(true); setDeniedMessage('');
    try {
      const r = await exceptionAPI.list();
      setRows(r.data?.data || []);
    } catch (e) {
      if (e?.response?.status === 403) setDeniedMessage(e.response.data?.message || 'You do not have permission to view exceptions');
      else toast.error('Failed to load exceptions');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    try {
      const r = await exceptionAPI.detail(id);
      setDetail(r.data?.data || null);
      setRejectReason('');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to load exception'); }
  };

  const runAction = async (action, id, body) => {
    setActionLoading(true);
    try {
      await exceptionAPI[action](id, body);
      toast.success(`Exception ${action} successful`);
      await load();
      await openDetail(id);
    } catch (e) {
      toast.error(e.response?.data?.message || `${action} failed`);
    } finally { setActionLoading(false); }
  };

  const submitCreate = async () => {
    if (!form.source_id || !form.reason.trim()) { toast.error('Source ID and reason are required'); return; }
    setActionLoading(true);
    try {
      await exceptionAPI.create({ source_module: form.source_module, source_id: Number(form.source_id), exception_type: form.exception_type, reason: form.reason.trim(), business_impact: form.business_impact || null });
      toast.success('Exception request created');
      setShowCreate(false);
      setForm({ source_module: 'supplier_payments', source_id: '', exception_type: 'FINANCIAL_REVERSAL', reason: '', business_impact: '' });
      await load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to create exception');
    } finally { setActionLoading(false); }
  };

  if (deniedMessage) {
    return (
      <div className="page-enter">
        <div className={`rounded-md border p-8 text-center ${cardCls}`}>
          <ShieldAlert className="mx-auto mb-3 text-red-500" size={40} />
          <p className={`text-[15px] font-medium ${mainCls}`}>{deniedMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Exceptions & Reversals</h1>
          <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>Controlled corrections for locked and posted records</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]" style={{ backgroundColor: primaryColor }}>
          <Plus size={16} /> Request Correction
        </button>
      </div>

      <div className={`rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-800 ${isDark ? 'bg-amber-950/40 text-amber-300' : ''}`}>
        ORIGINAL LOCKED RECORD IS NEVER EDITED. APPROVED EXCEPTIONS CREATE AUDITABLE COMPENSATING EFFECTS.
      </div>

      <div className={`overflow-hidden rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className={thCls}>
              <tr>
                {['Exception No', 'Source', 'Record', 'Type', 'Status', 'Requested By', 'Approved By', 'Reversal', ''].map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center"><Loader2 className="mx-auto animate-spin" size={22} /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className={`px-4 py-10 text-center ${mutedCls}`}>No exception requests found</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className={`border-t ${borderCls} ${trHover} cursor-pointer`} onClick={() => openDetail(r.id)}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{r.exception_no}</td>
                  <td className="whitespace-nowrap px-4 py-3">{SOURCE_MODULES.find(m => m.key === r.source_module)?.label || r.source_module}</td>
                  <td className="whitespace-nowrap px-4 py-3">#{r.source_id}</td>
                  <td className="whitespace-nowrap px-4 py-3">{r.exception_type}</td>
                  <td className="whitespace-nowrap px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span></td>
                  <td className="whitespace-nowrap px-4 py-3">{r.requested_by_name || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3">{r.approved_by_name || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3">{r.reversal_reference_id ? `${r.reversal_reference_type} #${r.reversal_reference_id}` : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{fmtDate(r.requested_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCreate(false)}>
          <div className={`w-full max-w-lg rounded-md border shadow-xl ${cardCls}`} onClick={e => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b px-5 py-4 ${borderCls}`}>
              <h2 className={`text-[16px] font-bold ${mainCls}`}>Request Correction</h2>
              <button onClick={() => setShowCreate(false)} className={mutedCls}><X size={18} /></button>
            </div>
            <div className="space-y-4 p-5">
              <div className={`rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800 ${isDark ? 'bg-amber-950/40 text-amber-300' : ''}`}>
                The locked record will NOT be unlocked or edited. Approval creates a compensating effect.
              </div>
              <div>
                <label className={`mb-1.5 block text-[13px] font-medium ${mainCls}`}>Source Module *</label>
                <select value={form.source_module} onChange={e => setForm({ ...form, source_module: e.target.value })} className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
                  {SOURCE_MODULES.map(m => <option key={m.key} value={m.key}>{m.label} (terminal: {m.terminal})</option>)}
                </select>
              </div>
              <div>
                <label className={`mb-1.5 block text-[13px] font-medium ${mainCls}`}>Source Record ID *</label>
                <input type="number" value={form.source_id} onChange={e => setForm({ ...form, source_id: e.target.value })} placeholder="e.g. 123" className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
              </div>
              <div>
                <label className={`mb-1.5 block text-[13px] font-medium ${mainCls}`}>Exception Type</label>
                <select value={form.exception_type} onChange={e => setForm({ ...form, exception_type: e.target.value })} className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
                  {EXCEPTION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className={`mb-1.5 block text-[13px] font-medium ${mainCls}`}>Reason *</label>
                <textarea rows={3} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Why does this record need correction?" className={`w-full rounded-md border px-3 py-2 text-[14px] outline-none ${inputCls}`} />
              </div>
              <div>
                <label className={`mb-1.5 block text-[13px] font-medium ${mainCls}`}>Business Impact</label>
                <input value={form.business_impact} onChange={e => setForm({ ...form, business_impact: e.target.value })} placeholder="Optional" className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
              </div>
            </div>
            <div className={`flex justify-end gap-3 border-t px-5 py-4 ${borderCls}`}>
              <button onClick={() => setShowCreate(false)} className={`rounded-md border px-4 py-2 text-[14px] font-medium ${borderCls} ${mainCls}`}>Cancel</button>
              <button onClick={submitCreate} disabled={actionLoading} className="flex items-center gap-2 rounded-md px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-60" style={{ backgroundColor: primaryColor }}>
                {actionLoading && <Loader2 className="animate-spin" size={15} />} Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className={`max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md border shadow-xl ${cardCls}`} onClick={e => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b px-5 py-4 ${borderCls}`}>
              <div>
                <h2 className={`text-[16px] font-bold ${mainCls}`}>{detail.exception_no}</h2>
                <p className={`text-[12px] ${mutedCls}`}>{SOURCE_MODULES.find(m => m.key === detail.source_module)?.label || detail.source_module} · Record #{detail.source_id}{detail.source_status ? ` · ${detail.source_status}` : ''}</p>
              </div>
              <button onClick={() => setDetail(null)} className={mutedCls}><X size={18} /></button>
            </div>
            <div className="space-y-4 p-5">
              <div className={`rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800 ${isDark ? 'bg-amber-950/40 text-amber-300' : ''}`}>
                ORIGINAL LOCKED RECORD IS NEVER EDITED. APPROVED EXCEPTIONS CREATE AUDITABLE COMPENSATING EFFECTS.
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {[
                  ['Status', <span key="s" className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_BADGE[detail.status] || 'bg-gray-100 text-gray-600'}`}>{detail.status}</span>],
                  ['Type', detail.exception_type],
                  ['Outlet', detail.outlet_name || '—'],
                  ['Original Date', fmtDate(detail.source_date)],
                  ['Reversal Date', fmtDate(detail.reversal_effective_date)],
                  ['Reversal Ref', detail.reversal_reference_id ? `${detail.reversal_reference_type} #${detail.reversal_reference_id}` : '—'],
                ].map(([l, v], i) => (
                  <div key={i}><p className={`text-[11px] uppercase tracking-wider ${mutedCls}`}>{l}</p><p className={`mt-0.5 text-[14px] font-medium ${mainCls}`}>{v}</p></div>
                ))}
              </div>
              <div>
                <p className={`text-[11px] uppercase tracking-wider ${mutedCls}`}>Reason</p>
                <p className={`mt-1 rounded-md border px-3 py-2 text-[13px] ${borderCls} ${mainCls}`}>{detail.reason}</p>
              </div>
              {detail.business_impact && <div><p className={`text-[11px] uppercase tracking-wider ${mutedCls}`}>Business Impact</p><p className={`mt-1 text-[13px] ${mainCls}`}>{detail.business_impact}</p></div>}
              {detail.rejection_reason && <div><p className={`text-[11px] uppercase tracking-wider ${mutedCls}`}>Rejection Reason</p><p className="mt-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{detail.rejection_reason}</p></div>}
              {detail.original_payload_json && (
                <div>
                  <p className={`text-[11px] uppercase tracking-wider ${mutedCls}`}>Original Transaction Snapshot</p>
                  <pre className={`mt-1 max-h-40 overflow-auto rounded-md border px-3 py-2 text-[11px] ${borderCls} ${mainCls}`}>{JSON.stringify(detail.original_payload_json, null, 2)}</pre>
                </div>
              )}
              <div>
                <p className={`text-[11px] uppercase tracking-wider ${mutedCls}`}>Audit Trail</p>
                <div className="mt-1 space-y-1">
                  {[
                    ['Requested', detail.requested_by_name, detail.requested_at],
                    ['Submitted', detail.submitted_by_name, detail.submitted_at],
                    ['Reviewed', detail.reviewed_by_name, detail.reviewed_at],
                    ['Approved', detail.approved_by_name, detail.approved_at],
                    ['Rejected', detail.rejected_by_name, detail.rejected_at],
                    ['Executed', detail.executed_by_name, detail.executed_at],
                  ].filter(([, n]) => n).map(([l, n, t]) => (
                    <div key={l} className={`flex items-center justify-between rounded-md border px-3 py-1.5 text-[12px] ${borderCls}`}>
                      <span className={mainCls}>{l} by <span className="font-medium">{n}</span></span>
                      <span className={mutedCls}>{fmtDateTime(t)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={`flex flex-wrap justify-end gap-2 border-t pt-4 ${borderCls}`}>
                {(detail.status === 'Requested' || detail.status === 'Under Review') && (
                  <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Rejection reason (required to reject)" className={`h-[38px] flex-1 rounded-md border px-3 text-[13px] outline-none ${inputCls}`} />
                )}
                {detail.status === 'Requested' && <>
                  <button disabled={actionLoading} onClick={() => rejectReason.trim() ? runAction('reject', detail.id, { rejection_reason: rejectReason.trim() }) : toast.error('Enter rejection reason')} className="rounded-md bg-red-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">Reject</button>
                  <button disabled={actionLoading} onClick={() => runAction('submit', detail.id)} className="rounded-md bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">Submit for Review</button>
                </>}
                {detail.status === 'Under Review' && <>
                  <button disabled={actionLoading} onClick={() => rejectReason.trim() ? runAction('reject', detail.id, { rejection_reason: rejectReason.trim() }) : toast.error('Enter rejection reason')} className="rounded-md bg-red-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">Reject</button>
                  {!detail.reviewed_by
                    ? <button disabled={actionLoading} onClick={() => runAction('verify', detail.id)} className="rounded-md bg-amber-500 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">Mark Reviewed</button>
                    : <button disabled={actionLoading} onClick={() => runAction('approve', detail.id)} className="rounded-md bg-purple-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">Approve</button>}
                </>}
                {detail.status === 'Approved' && <button disabled={actionLoading} onClick={() => runAction('execute', detail.id)} className="rounded-md bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">Execute Reversal</button>}
                {actionLoading && <Loader2 className="animate-spin self-center" size={18} />}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ControlledExceptions;

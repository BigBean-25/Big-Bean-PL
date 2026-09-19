import { useState, useEffect } from 'react';
import { Loader2, Plus, X, Eye, FileText, Search, RotateCcw, AlertTriangle } from 'lucide-react';
import { outletConsumptionAPI, warehouseAPI, masterAPI, getStoredPermissions } from '../../services/api';
import useAuthStore from '../../store/authStore';
import { SectionCard, TableWrapper, LoadingRows, EmptyState, StatusBadge } from '../../components/ui';
import toast from 'react-hot-toast';

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const fmtQty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 });
const fmtINR = (n) => n === null || n === undefined ? '—' : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '-');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUSES = ["Draft", "Submitted", "Verified", "Approved", "Posted", "Locked"];

const blankItem = () => ({ raw_material_id: '', unit_id: '', qty: '', theoretical_qty: '', remarks: '' });

export default function OutletConsumption() {
  const { user } = useAuthStore();
  const isDark = getThemeMode() === "dark";
  const primaryColor = getPrimaryColor();
  const inputCls = getInputCls(isDark);
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

  const isAdminRole = ["Super Admin", "Admin", "Developer"].includes(user?.role_name);
  const modulePerms = getStoredPermissions()?.outlet_consumption || {};
  const can = (a) => isAdminRole || Boolean(modulePerms[a]);
  const isOwn = (d) => Boolean(user?.id && d?.created_by && Number(user.id) === Number(d.created_by));

  const [outlets, setOutlets] = useState([]);
  const [locations, setLocations] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [units, setUnits] = useState([]);
  const [outletId, setOutletId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [prefillBusy, setPrefillBusy] = useState(false);
  const [form, setForm] = useState({
    consumption_no: '', consumption_date: new Date().toISOString().split('T')[0],
    source_type: 'MANUAL', source_period_month: String(new Date().getMonth() + 1),
    source_period_year: String(new Date().getFullYear()), remarks: '', items: [blankItem()],
  });

  useEffect(() => {
    (async () => {
      try {
        const [o, l, m, u] = await Promise.all([
          masterAPI.getOutlets(), warehouseAPI.getLocations({ scope: 'all' }),
          masterAPI.getRawMaterials(), masterAPI.getUnits(),
        ]);
        const outletList = o.data?.data || o.data || [];
        setOutlets(outletList);
        setLocations(l.data?.data || l.data || []);
        setMaterials(m.data?.data || m.data || []);
        setUnits(u.data?.data || u.data || []);
        if (user?.outlet_ids?.length && !isAdminRole) setOutletId(String(user.outlet_ids[0]));
      } catch { toast.error('Failed to load masters'); }
    })();
  }, []);

  const outletLocations = locations.filter((l) => String(l.outlet_id) === String(outletId) && l.is_active === 1);
  useEffect(() => {
    if (outletLocations.length === 1) setLocationId(String(outletLocations[0].id));
    else if (!outletLocations.some((l) => String(l.id) === String(locationId))) setLocationId('');
  }, [outletId]);

  const fetchDocs = async () => {
    if (!locationId) { setDocs([]); return; }
    setLoading(true);
    try {
      const res = await outletConsumptionAPI.list({ location_id: locationId });
      setDocs(res?.data?.data || []);
    } catch { toast.error('Failed to load consumption documents'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchDocs(); }, [locationId]);

  const resetForm = () => {
    setForm({
      consumption_no: '', consumption_date: new Date().toISOString().split('T')[0],
      source_type: 'MANUAL', source_period_month: String(new Date().getMonth() + 1),
      source_period_year: String(new Date().getFullYear()), remarks: '', items: [blankItem()],
    });
    setEditingId(null);
  };

  const updateItem = (idx, key, value) => {
    const items = [...form.items];
    items[idx][key] = value;
    if (key === 'raw_material_id') {
      const mat = materials.find((m) => String(m.id) === value);
      if (mat) items[idx].unit_id = String(mat.unit_id);
    }
    setForm({ ...form, items });
  };

  const applyPrefill = async () => {
    if (form.source_type !== 'ITEM_SALES_THEORETICAL') { toast.error('Select ITEM_SALES_THEORETICAL source first'); return; }
    setPrefillBusy(true);
    try {
      const res = await outletConsumptionAPI.prefill({ outlet_id: outletId, month: form.source_period_month, year: form.source_period_year });
      const items = res?.data?.data || [];
      if (!items.length) { toast.error('No theoretical consumption found for that period'); return; }
      setForm({
        ...form,
        items: items.map((it) => ({ raw_material_id: String(it.raw_material_id), unit_id: String(it.unit_id), qty: String(it.qty), theoretical_qty: String(it.theoretical_qty), remarks: '' })),
      });
      toast.success(`Prefilled ${items.length} material line(s) - review before submitting`);
    } catch (e) { toast.error(e.response?.data?.message || 'Prefill failed'); }
    finally { setPrefillBusy(false); }
  };

  const save = async () => {
    if (saving) return;
    if (!form.consumption_no || !form.consumption_date) { toast.error('Consumption number and date are required'); return; }
    if (!form.items.length || form.items.some((it) => !it.raw_material_id || !it.unit_id || num(it.qty) <= 0)) {
      toast.error('Every item needs a material, unit and positive quantity'); return;
    }
    setSaving(true);
    try {
      const payload = {
        consumption_no: form.consumption_no,
        outlet_id: Number(outletId),
        location_id: Number(locationId),
        consumption_date: form.consumption_date,
        source_type: form.source_type,
        source_period_month: form.source_type === 'MANUAL' ? null : Number(form.source_period_month),
        source_period_year: form.source_type === 'MANUAL' ? null : Number(form.source_period_year),
        remarks: form.remarks || null,
        items: form.items.map((it) => ({
          raw_material_id: Number(it.raw_material_id), unit_id: Number(it.unit_id), qty: num(it.qty),
          theoretical_qty: it.theoretical_qty !== '' ? num(it.theoretical_qty) : null, remarks: it.remarks || null,
        })),
      };
      if (editingId) { await outletConsumptionAPI.update(editingId, payload); toast.success('Consumption updated'); }
      else { await outletConsumptionAPI.create(payload); toast.success('Consumption created as Draft'); }
      setShowForm(false); resetForm(); fetchDocs();
    } catch (e) { toast.error(e.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const runAction = (doc, action, label) => {
    toast.promise(outletConsumptionAPI[action](doc.id).then(fetchDocs),
      { loading: `${label}...`, success: `${label} completed`, error: (e) => e.response?.data?.message || `${label} failed` });
  };

  const onEdit = (doc) => {
    setForm({
      consumption_no: doc.consumption_no || '',
      consumption_date: doc.consumption_date ? new Date(doc.consumption_date).toISOString().split('T')[0] : '',
      source_type: doc.source_type || 'MANUAL',
      source_period_month: doc.source_period_month ? String(doc.source_period_month) : String(new Date().getMonth() + 1),
      source_period_year: doc.source_period_year ? String(doc.source_period_year) : String(new Date().getFullYear()),
      remarks: doc.remarks || '',
      items: (doc.items || []).map((it) => ({
        raw_material_id: String(it.raw_material_id || ''), unit_id: String(it.unit_id || ''),
        qty: it.qty ?? '', theoretical_qty: it.theoretical_qty ?? '', remarks: it.remarks || '',
      })),
    });
    setEditingId(doc.id); setShowForm(true);
  };

  const filtered = docs.filter((d) =>
    (filters.search === '' || String(d.consumption_no || '').toLowerCase().includes(filters.search.toLowerCase())) &&
    (filters.status === '' || d.status === filters.status));

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Outlet Consumption</h1>
        <p className={`mt-1 text-[13px] ${mutedCls}`}>PHYSICAL POSTING REQUIRES EXPLICIT REVIEW — SALES DO NOT AUTOMATICALLY DEDUCT STOCK</p>
      </div>

      <div className={`rounded-md border p-4 ${cardCls}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={`mb-1 block text-[12px] font-medium ${mainCls}`}>Outlet</label>
            <select value={outletId} onChange={(e) => setOutletId(e.target.value)} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
              <option value="">Select outlet</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
            </select>
          </div>
          <div>
            <label className={`mb-1 block text-[12px] font-medium ${mainCls}`}>Location</label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
              <option value="">{outletLocations.length ? 'Select location' : 'No location mapped to this outlet'}</option>
              {outletLocations.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}
            </select>
          </div>
          <div className="relative">
            <label className={`mb-1 block text-[12px] font-medium ${mainCls}`}>Search</label>
            <Search size={15} className="absolute left-3 top-[38px] text-gray-400" />
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className={`h-10 w-full rounded-md border pl-9 pr-3 text-[14px] outline-none ${inputCls}`} placeholder="Consumption no" />
          </div>
          <div className="flex items-end gap-2">
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={`h-10 flex-1 rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
              <option value="">All Status</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => setFilters({ search: '', status: '' })} className={`flex h-10 items-center gap-1 rounded-md border px-3 text-[13px] ${borderCls} ${mutedCls}`}><RotateCcw size={14} /></button>
            {can('can_create') && locationId && (
              <button onClick={() => { resetForm(); setShowForm(true); }} className="flex h-10 items-center gap-2 rounded-md px-3 text-[13px] font-semibold text-white" style={{ backgroundColor: primaryColor }}>
                <Plus size={15} /> New
              </button>
            )}
          </div>
        </div>
      </div>

      {!locationId ? (
        <EmptyState icon={FileText} title="Select an outlet location" subtitle="Consumption documents are recorded per outlet inventory location." isDark={isDark} />
      ) : (
        <SectionCard isDark={isDark}>
          <TableWrapper isDark={isDark}>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${borderCls} ${mutedCls}`}>
                  <th className="px-3 py-3">Consumption No</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3 text-right">Total Qty</th>
                  <th className="px-3 py-3 text-right">Total Value</th>
                  <th className="px-3 py-3">Creator</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-3 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <LoadingRows rows={5} cols={8} isDark={isDark} /> : (
                  <>
                    {filtered.map((d) => (
                      <tr key={d.id} className={`border-b ${borderCls}`}>
                        <td className="px-3 py-2.5 font-medium">{d.consumption_no}</td>
                        <td className="px-3 py-2.5">{fmtDate(d.consumption_date)}</td>
                        <td className="px-3 py-2.5">{d.source_type}{d.source_period_month ? ` (${MONTHS[d.source_period_month - 1]} ${d.source_period_year})` : ''}</td>
                        <td className="px-3 py-2.5 text-right">{fmtQty(d.total_qty)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtINR(d.total_value)}</td>
                        <td className="px-3 py-2.5">{d.created_by_name || '-'}</td>
                        <td className="px-3 py-2.5 text-center"><StatusBadge status={d.status} /></td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={async () => { const r = await outletConsumptionAPI.get(d.id); setViewing(r?.data?.data || d); }} className={`rounded-md p-1.5 ${isDark ? 'hover:bg-[#3B405A]' : 'hover:bg-[#F3F2F7]'}`} title="View"><Eye size={16} /></button>
                            {d.status === 'Draft' && can('can_edit') && <button onClick={async () => { const r = await outletConsumptionAPI.get(d.id); onEdit(r?.data?.data || d); }} className={`rounded-md p-1.5 ${isDark ? 'hover:bg-[#3B405A]' : 'hover:bg-[#F3F2F7]'}`} title="Edit"><FileText size={16} /></button>}
                            {d.status === 'Draft' && can('can_submit') && <button onClick={() => runAction(d, 'submit', 'Submit')} className="rounded-md bg-blue-500 px-2 py-1 text-[11px] font-semibold text-white">Submit</button>}
                            {d.status === 'Submitted' && can('can_verify') && !isOwn(d) && <button onClick={() => runAction(d, 'verify', 'Verify')} className="rounded-md bg-sky-500 px-2 py-1 text-[11px] font-semibold text-white">Verify</button>}
                            {d.status === 'Verified' && can('can_approve') && !isOwn(d) && <button onClick={() => runAction(d, 'approve', 'Approve')} className="rounded-md bg-emerald-500 px-2 py-1 text-[11px] font-semibold text-white">Approve</button>}
                            {d.status === 'Approved' && can('can_approve') && <button onClick={() => runAction(d, 'post', 'Post')} className="rounded-md bg-violet-600 px-2 py-1 text-[11px] font-semibold text-white">Post</button>}
                            {d.status === 'Posted' && can('can_lock') && <button onClick={() => runAction(d, 'lock', 'Lock')} className="rounded-md bg-gray-600 px-2 py-1 text-[11px] font-semibold text-white">Lock</button>}
                            {d.status === 'Draft' && can('can_delete') && <button onClick={() => toast.promise(outletConsumptionAPI.remove(d.id).then(fetchDocs), { loading: 'Deleting...', success: 'Deleted', error: 'Delete failed' })} className={`rounded-md p-1.5 text-rose-500 ${isDark ? 'hover:bg-[#3B405A]' : 'hover:bg-[#F3F2F7]'}`} title="Delete"><X size={16} /></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filtered.length && <tr><td colSpan={8} className={`px-3 py-8 text-center ${mutedCls}`}>No consumption documents</td></tr>}
                  </>
                )}
              </tbody>
            </table>
          </TableWrapper>
        </SectionCard>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border p-5 ${cardCls}`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className={`text-lg font-semibold ${mainCls}`}>{editingId ? 'Edit' : 'New'} Outlet Consumption</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className={mutedCls}><X size={20} /></button>
            </div>

            {form.source_type !== 'MANUAL' && (
              <div className={`mb-4 flex items-start gap-2 rounded-md border p-3 text-[12px] ${isDark ? 'border-[#FF9F43]/40 bg-[#FF9F43]/10' : 'border-amber-200 bg-amber-50'} `}>
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[#FF9F43]" />
                <span className={mainCls}>Theoretical prefill only drafts proposed quantities - a human-controlled workflow must review and Post. Nothing is deducted automatically.</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className={`mb-1 block text-[12px] ${mutedCls}`}>Consumption No</label>
                <input value={form.consumption_no} onChange={(e) => setForm({ ...form, consumption_no: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`} placeholder="OC-0001" />
              </div>
              <div>
                <label className={`mb-1 block text-[12px] ${mutedCls}`}>Date</label>
                <input type="date" value={form.consumption_date} onChange={(e) => setForm({ ...form, consumption_date: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`} />
              </div>
              <div>
                <label className={`mb-1 block text-[12px] ${mutedCls}`}>Source</label>
                <select value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}>
                  <option value="MANUAL">MANUAL</option>
                  <option value="ITEM_SALES_THEORETICAL">ITEM_SALES_THEORETICAL</option>
                </select>
              </div>
              {form.source_type !== 'MANUAL' && (
                <div className="col-span-2 grid grid-cols-3 gap-3 sm:col-span-1">
                  <select value={form.source_period_month} onChange={(e) => setForm({ ...form, source_period_month: e.target.value })} className={`h-10 rounded-md border px-2 text-[13px] outline-none ${inputCls}`}>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <input type="number" value={form.source_period_year} onChange={(e) => setForm({ ...form, source_period_year: e.target.value })} className={`h-10 rounded-md border px-2 text-[13px] outline-none ${inputCls}`} />
                  <button onClick={applyPrefill} disabled={prefillBusy} className="flex h-10 items-center justify-center gap-1 rounded-md bg-sky-500 px-2 text-[12px] font-semibold text-white disabled:opacity-60">
                    {prefillBusy ? <Loader2 size={13} className="animate-spin" /> : null} Prefill
                  </button>
                </div>
              )}
            </div>

            <table className="mt-4 w-full border-collapse text-[13px]">
              <thead>
                <tr className={`border-b text-left text-[11px] uppercase ${borderCls} ${mutedCls}`}>
                  <th className="px-2 py-2">Material</th><th className="px-2 py-2">Unit</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  {form.source_type !== 'MANUAL' && <th className="px-2 py-2 text-right">Theoretical</th>}
                  <th className="px-2 py-2">Remarks</th><th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((it, idx) => (
                  <tr key={idx} className={`border-b ${borderCls}`}>
                    <td className="px-2 py-1.5">
                      <select value={it.raw_material_id} onChange={(e) => updateItem(idx, 'raw_material_id', e.target.value)} className={`h-9 w-48 rounded-md border px-2 text-[13px] outline-none ${inputCls}`}>
                        <option value="">Select</option>
                        {materials.map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={it.unit_id} onChange={(e) => updateItem(idx, 'unit_id', e.target.value)} className={`h-9 w-28 rounded-md border px-2 text-[13px] outline-none ${inputCls}`}>
                        <option value="">Unit</option>
                        {units.map((u) => <option key={u.id} value={u.id}>{u.unit_name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5"><input type="number" min="0" value={it.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} className={`h-9 w-24 rounded-md border px-2 text-right text-[13px] outline-none ${inputCls}`} /></td>
                    {form.source_type !== 'MANUAL' && <td className="px-2 py-1.5 text-right text-[13px]">{it.theoretical_qty !== '' ? fmtQty(it.theoretical_qty) : '—'}</td>}
                    <td className="px-2 py-1.5"><input value={it.remarks} onChange={(e) => updateItem(idx, 'remarks', e.target.value)} className={`h-9 w-32 rounded-md border px-2 text-[13px] outline-none ${inputCls}`} /></td>
                    <td className="px-2 py-1.5"><button onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })} disabled={form.items.length === 1} className="text-rose-500"><X size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setForm({ ...form, items: [...form.items, blankItem()] })} className={`mt-2 flex items-center gap-1 text-[13px] font-medium ${mutedCls}`}><Plus size={14} /> Add item</button>

            <div className="mt-4">
              <label className={`mb-1 block text-[12px] ${mutedCls}`}>Remarks</label>
              <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`} />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => { setShowForm(false); resetForm(); }} className={`h-10 rounded-md border px-4 text-[13px] ${borderCls} ${mutedCls}`}>Cancel</button>
              <button onClick={save} disabled={saving} className="flex h-10 items-center gap-2 rounded-md px-4 text-[13px] font-semibold text-white disabled:opacity-60" style={{ backgroundColor: primaryColor }}>
                {saving && <Loader2 size={14} className="animate-spin" />} {editingId ? 'Update' : 'Create Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border p-5 ${cardCls}`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className={`text-lg font-semibold ${mainCls}`}>{viewing.consumption_no} <StatusBadge status={viewing.status} /></h2>
              <button onClick={() => setViewing(null)} className={mutedCls}><X size={20} /></button>
            </div>
            <p className={`mb-3 text-[12px] ${mutedCls}`}>
              {fmtDate(viewing.consumption_date)} · {viewing.location_name || ''} · {viewing.source_type}
              {viewing.posted_at ? ` · Posted ${fmtDate(viewing.posted_at)}` : ''}
            </p>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className={`border-b text-left text-[11px] uppercase ${borderCls} ${mutedCls}`}>
                  <th className="px-2 py-2">Material</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2">Unit</th>
                  <th className="px-2 py-2 text-right">Base Qty</th><th className="px-2 py-2 text-right">Unit Cost</th><th className="px-2 py-2 text-right">Value</th>
                  <th className="px-2 py-2 text-right">Theoretical</th><th className="px-2 py-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {(viewing.items || []).map((it) => (
                  <tr key={it.id} className={`border-b ${borderCls}`}>
                    <td className="px-2 py-2">{it.material_name}</td>
                    <td className="px-2 py-2 text-right">{fmtQty(it.qty)}</td>
                    <td className="px-2 py-2">{it.unit_name}</td>
                    <td className="px-2 py-2 text-right">{it.base_qty !== null ? fmtQty(it.base_qty) : '—'}</td>
                    <td className="px-2 py-2 text-right">{it.unit_cost !== null ? fmtINR(it.unit_cost) : '—'}</td>
                    <td className="px-2 py-2 text-right">{it.consumption_value !== null ? fmtINR(it.consumption_value) : '—'}</td>
                    <td className="px-2 py-2 text-right">{it.theoretical_qty !== null ? fmtQty(it.theoretical_qty) : '—'}</td>
                    <td className="px-2 py-2 text-right">{it.variance_qty !== null ? fmtQty(it.variance_qty) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function getInputCls(isDark) {
  return isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]";
}

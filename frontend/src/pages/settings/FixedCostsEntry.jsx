import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, Edit2, Loader2, Search, Wallet, Info, X, Check } from 'lucide-react';
import { fixedCostsAPI, masterAPI } from '../../services/api';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };
const fmt = (n = 0) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CATEGORY_SUGGESTIONS = ["Rent", "Marketing", "Insurance", "Equipment Lease", "Software Subscriptions", "License Fees", "Other"];

const emptyEntry = () => ({ category: '', amount: '', remarks: '' });

const FixedCostsEntry = () => {
  const { user } = useAuthStore();
  const perms = user?.permissions?.fixed_costs || {};

  const outletContext = useOutletContext() || {};
  const { selectedOutletId = "all" } = outletContext;
  const dashboardOutletId =
    selectedOutletId && String(selectedOutletId) !== "all"
      ? String(selectedOutletId)
      : "all";

  const [outlets, setOutlets] = useState([]);
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({
    outlet_id: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });
  const [newEntry, setNewEntry] = useState(emptyEntry());
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState(emptyEntry());
  const [deletingId, setDeletingId] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6]" : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";

  useEffect(() => { fetchOutlets(); }, []);

  useEffect(() => {
    if (dashboardOutletId !== "all") {
      setFilters((current) => ({ ...current, outlet_id: dashboardOutletId }));
    }
  }, [dashboardOutletId]);

  const fetchOutlets = async () => {
    try {
      const r = await masterAPI.getOutlets();
      setOutlets(r.data?.data || r.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to fetch outlets');
    }
  };

  const fetchEntries = async () => {
    if (!filters.outlet_id) { toast.error('Please select an outlet'); return; }
    setLoading(true);
    try {
      const r = await fixedCostsAPI.getFixedCosts(filters);
      setEntries(r.data?.data || []);
      setTotal(r.data?.total || 0);
      setHasLoaded(true);
    } catch (error) { toast.error(error.response?.data?.message || 'Failed to load fixed costs'); }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!filters.outlet_id) { toast.error('Please select an outlet, month and year first'); return; }
    if (!newEntry.category.trim() || newEntry.amount === '') { toast.error('Category and amount are required'); return; }
    setSaving(true);
    try {
      await fixedCostsAPI.createFixedCost({
        outlet_id: filters.outlet_id,
        month: filters.month,
        year: filters.year,
        category: newEntry.category.trim(),
        amount: Number(newEntry.amount),
        remarks: newEntry.remarks
      });
      toast.success('Fixed cost added');
      setNewEntry(emptyEntry());
      fetchEntries();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to add fixed cost'); }
    finally { setSaving(false); }
  };

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setEditValues({ category: entry.category, amount: entry.amount, remarks: entry.remarks || '' });
  };

  const cancelEdit = () => { setEditingId(null); setEditValues(emptyEntry()); };

  const saveEdit = async (id) => {
    setSaving(true);
    try {
      await fixedCostsAPI.updateFixedCost(id, { amount: Number(editValues.amount), remarks: editValues.remarks });
      toast.success('Fixed cost updated');
      cancelEdit();
      fetchEntries();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update fixed cost'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this fixed cost entry?')) return;
    setDeletingId(id);
    try {
      await fixedCostsAPI.deleteFixedCost(id);
      toast.success('Fixed cost deleted');
      fetchEntries();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to delete fixed cost'); }
    finally { setDeletingId(null); }
  };

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl font-bold sm:text-2xl ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Fixed Costs</h1>
        <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>Enter outlet-wise recurring costs — rent, marketing, and other monthly fixed expenses</p>
      </div>

      <div className={`flex items-start gap-3 rounded-md border p-4 ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#FFF4E5]"}`} style={!isDark ? { borderColor: "#FFDCA8" } : undefined}>
        <Info size={18} className="mt-0.5 shrink-0 text-[#FF9F43]" />
        <p className={`text-[13px] ${isDark ? "text-[#D0D2D6]" : "text-[#5D596C]"}`}>
          Fixed costs entered here are <span className="font-semibold">included in the Net Profit calculation</span> on the Monthly P&amp;L report for the same outlet/month. Entries can only be added, edited, or deleted before that month is finalized.
        </p>
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
                disabled={dashboardOutletId !== "all"}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] disabled:cursor-not-allowed disabled:opacity-70 ${inputCls}`}>
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
              <button onClick={fetchEntries} disabled={loading}
                className="flex h-[42px] w-full items-center justify-center gap-2 rounded-md px-4 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                style={{ backgroundColor: primaryColor }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {loading ? "Loading…" : "Load"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {hasLoaded && (
        <div className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
          <div className={`flex items-center justify-between border-b px-4 py-3 sm:px-6 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
            <span className={`text-[12px] font-semibold uppercase tracking-wider ${mutedCls}`}>Fixed Cost Entries</span>
            <span className="text-[14px] font-bold" style={{ color: primaryColor }}>Total: {fmt(total)}</span>
          </div>

          <div className="p-4 sm:p-5">
            {entries.length === 0 && (
              <p className={`py-4 text-center text-[14px] ${mutedCls}`}>No fixed cost entries for this outlet/month yet.</p>
            )}

            {entries.map((entry) => (
              <div key={entry.id} className={`flex items-center justify-between gap-3 border-b py-3 last:border-b-0 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                {editingId === entry.id ? (
                  <>
                    <div className="flex-1">
                      <p className={`text-[14px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{entry.category}</p>
                      <input type="number" step="0.01" value={editValues.amount}
                        onChange={(e) => setEditValues({ ...editValues, amount: e.target.value })}
                        className={`mt-1 h-[36px] w-32 rounded-md border px-2 text-[13px] outline-none ${inputCls}`} />
                      <input type="text" placeholder="Remarks" value={editValues.remarks}
                        onChange={(e) => setEditValues({ ...editValues, remarks: e.target.value })}
                        className={`mt-1 ml-2 h-[36px] w-48 rounded-md border px-2 text-[13px] outline-none ${inputCls}`} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => saveEdit(entry.id)} disabled={saving} className="rounded-md bg-[#28C76F] p-2 text-white transition hover:opacity-90"><Check size={16} /></button>
                      <button onClick={cancelEdit} className="rounded-md bg-[#EA5455] p-2 text-white transition hover:opacity-90"><X size={16} /></button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                        <Wallet size={16} />
                      </div>
                      <div>
                        <p className={`text-[14px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{entry.category}</p>
                        {entry.remarks && <p className={`text-[12px] ${mutedCls}`}>{entry.remarks}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-[14px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{fmt(entry.amount)}</span>
                      {perms.can_edit ? (
                        <button onClick={() => startEdit(entry)} className={mutedCls}><Edit2 size={16} /></button>
                      ) : null}
                      {perms.can_delete ? (
                        <button onClick={() => handleDelete(entry.id)} disabled={deletingId === entry.id} className="text-[#EA5455]">
                          {deletingId === entry.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            ))}

            {perms.can_create && (
              <div className={`mt-4 flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-end ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                <div className="flex-1">
                  <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#5D596C]"}`}>Category</label>
                  <input list="fixed-cost-categories" value={newEntry.category}
                    onChange={(e) => setNewEntry({ ...newEntry, category: e.target.value })}
                    placeholder="e.g. Rent"
                    className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
                  <datalist id="fixed-cost-categories">
                    {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className="w-full sm:w-40">
                  <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#5D596C]"}`}>Amount</label>
                  <input type="number" step="0.01" value={newEntry.amount}
                    onChange={(e) => setNewEntry({ ...newEntry, amount: e.target.value })}
                    className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
                </div>
                <div className="flex-1">
                  <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#5D596C]"}`}>Remarks</label>
                  <input type="text" value={newEntry.remarks}
                    onChange={(e) => setNewEntry({ ...newEntry, remarks: e.target.value })}
                    className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
                </div>
                <button onClick={handleAdd} disabled={saving}
                  className="flex h-[42px] items-center justify-center gap-2 rounded-md px-4 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                  style={{ backgroundColor: primaryColor }}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Add
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FixedCostsEntry;

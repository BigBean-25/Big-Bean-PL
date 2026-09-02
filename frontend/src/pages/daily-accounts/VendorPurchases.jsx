import { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, RotateCcw, Trash2, AlertTriangle, Wallet, ChevronRight,
  IndianRupee, ShoppingCart, Clock, ShieldAlert, CheckCircle2, Loader2,
} from "lucide-react";
import { outletVendorAPI, masterAPI } from "../../services/api";
import useAuthStore from "../../store/authStore";
import toast from "react-hot-toast";

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };
const fmtINR = (n = 0) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

const emptyPurchase = () => ({
  outlet_id: "", vendor_id: "", purchase_date: today(), description: "", amount: "",
  paid_by: "Outlet", payment_mode_id: "", is_emergency: false, invoice_no: "", remarks: "",
});

export default function VendorPurchases() {
  const { user } = useAuthStore();
  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

  const isAdmin = ["Super Admin", "Admin", "Developer"].includes(user?.role_name);
  const userOutletIds = useMemo(() => (user?.outlets || []).map((o) => String(o.id || o.outlet_id)), [user]);

  const [outlets, setOutlets] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [paymentModes, setPaymentModes] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyPurchase());
  const [filters, setFilters] = useState({ outlet_id: "", vendor_id: "", from_date: "", to_date: "" });

  const visibleOutlets = useMemo(
    () => (isAdmin ? outlets : outlets.filter((o) => userOutletIds.includes(String(o.id)))),
    [outlets, userOutletIds, isAdmin]
  );

  // Ledger panel
  const [ledgerOutlet, setLedgerOutlet] = useState("");
  const [ledgerVendor, setLedgerVendor] = useState("");
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payModeId, setPayModeId] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payingLoading, setPayingLoading] = useState(false);

  const fetchLookups = async () => {
    try {
      const [o, v, pm] = await Promise.all([
        masterAPI.getOutlets(),
        outletVendorAPI.getVendors({ is_active: 1 }),
        masterAPI.getPaymentModes(),
      ]);
      setOutlets(o?.data?.data || []);
      setVendors(v?.data?.data || []);
      setPaymentModes(pm?.data?.data || []);
    } catch { /* non-fatal */ }
  };

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const res = await outletVendorAPI.getPurchases({
        outlet_id: filters.outlet_id || undefined,
        vendor_id: filters.vendor_id || undefined,
        from_date: filters.from_date || undefined,
        to_date: filters.to_date || undefined,
        limit: 100,
      });
      setPurchases(res?.data?.data || []);
    } catch { toast.error("Failed to load purchases"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchLookups(); }, []);
  useEffect(() => { fetchPurchases(); }, [filters]);

  useEffect(() => {
    if (visibleOutlets.length === 1 && !form.outlet_id) {
      setForm((f) => ({ ...f, outlet_id: String(visibleOutlets[0].id) }));
    }
  }, [visibleOutlets]);

  const summary = useMemo(() => {
    const totalAmount = purchases.reduce((s, p) => s + Number(p.amount || 0), 0);
    const emergencyCount = purchases.filter((p) => Number(p.is_emergency) === 1).length;
    const creditCount = purchases.filter((p) => !p.payment_mode_name).length;
    return { count: purchases.length, totalAmount, emergencyCount, creditCount };
  }, [purchases]);

  const vendorMap = useMemo(() => Object.fromEntries(vendors.map((v) => [String(v.id), v])), [vendors]);
  const selectedVendorCreditDays = Number(vendorMap[String(form.vendor_id)]?.credit_days) || 0;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.outlet_id || !form.vendor_id || !form.purchase_date || !form.description.trim()) {
      toast.error("Outlet, vendor, date and description are required");
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Amount must be greater than zero");
      return;
    }
    setSaving(true);
    try {
      await outletVendorAPI.createPurchase({
        ...form,
        amount: Number(form.amount),
        is_emergency: form.is_emergency ? 1 : 0,
        payment_mode_id: form.payment_mode_id || null,
      });
      toast.success("Purchase recorded");
      setForm({ ...emptyPurchase(), outlet_id: form.outlet_id });
      fetchPurchases();
      if (String(ledgerOutlet) === String(form.outlet_id) && String(ledgerVendor) === String(form.vendor_id)) fetchLedger();
    } catch (error) { toast.error(error.response?.data?.message || "Failed to record purchase"); }
    finally { setSaving(false); }
  };

  const handleDeletePurchase = async (id) => {
    if (!window.confirm("Delete this purchase record?")) return;
    try { await outletVendorAPI.deletePurchase(id); toast.success("Purchase deleted"); fetchPurchases(); }
    catch (error) { toast.error(error.response?.data?.message || "Delete failed"); }
  };

  const fetchLedger = async () => {
    if (!ledgerOutlet || !ledgerVendor) return;
    setLedgerLoading(true);
    try {
      const res = await outletVendorAPI.getLedger({ outlet_id: ledgerOutlet, vendor_id: ledgerVendor, date: today() });
      setLedger(res?.data?.data || null);
    } catch { toast.error("Failed to load ledger"); }
    finally { setLedgerLoading(false); }
  };
  useEffect(() => { fetchLedger(); }, [ledgerOutlet, ledgerVendor]);

  const handleRecordPayment = async () => {
    if (payingLoading) return;
    if (!payAmount || Number(payAmount) <= 0) { toast.error("Enter a valid payment amount"); return; }
    setPayingLoading(true);
    try {
      await outletVendorAPI.createPayment({
        outlet_id: ledgerOutlet, vendor_id: ledgerVendor, date: today(),
        paid_amount: Number(payAmount), payment_mode_id: payModeId || null, reference_no: payRef || null,
      });
      toast.success("Payment recorded");
      setPayAmount(""); setPayRef("");
      fetchLedger();
    } catch (error) { toast.error(error.response?.data?.message || "Failed to record payment"); }
    finally { setPayingLoading(false); }
  };

  const StatCard = ({ title, value, subtitle, icon: Icon, color, bg }) => (
    <div className={`rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:p-5 ${cardCls}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[13px] font-medium ${mutedCls}`}>{title}</p>
          <h3 className={`mt-1.5 text-[20px] font-semibold ${mainCls}`}>{value}</h3>
          <p className={`mt-1 text-[12px] ${mutedCls}`}>{subtitle}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: bg }}>
          <Icon size={20} style={{ color }} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Vendor Purchases</h1>
        <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>Quick entry for direct outlet purchases from vendors (milk, vegetables, chicken, eggs) and emergency top-up buys (Zepto, Hyperpure) when warehouse stock runs low — paid by the outlet or by management.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard title="Purchases Shown" value={summary.count} subtitle="In current filter" icon={ShoppingCart} color={primaryColor} bg={`${primaryColor}18`} />
        <StatCard title="Total Value" value={fmtINR(summary.totalAmount)} subtitle="Sum of shown purchases" icon={IndianRupee} color="#28C76F" bg="#E9F9EF" />
        <StatCard title="On Credit" value={summary.creditCount} subtitle="Not yet paid at entry" icon={Clock} color="#FF9F43" bg="#FFF4E5" />
        <StatCard title="Emergency Buys" value={summary.emergencyCount} subtitle="Zepto / Hyperpure / top-up" icon={ShieldAlert} color="#EA5455" bg="#FCEAEA" />
      </div>

      <div className={`rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:p-5 ${cardCls}`}>
        <span className={`mb-3 block text-[12px] font-semibold uppercase tracking-wider ${mutedCls}`}>Record a Purchase</span>
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-[13px] font-medium">Outlet *</label>
            <select value={form.outlet_id} onChange={(e) => setForm({ ...form, outlet_id: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
              <option value="">Select outlet</option>
              {visibleOutlets.map((o) => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium">
              Vendor *
              {form.vendor_id && <span className={`ml-1.5 font-normal ${mutedCls}`}>({selectedVendorCreditDays === 0 ? "cash" : `${selectedVendorCreditDays}d credit`})</span>}
            </label>
            <select value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
              <option value="">Select vendor</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_name} ({v.category})</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium">Date *</label>
            <input type="date" value={form.purchase_date} max={today()} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="mb-1 block text-[13px] font-medium">Description *</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Milk 20L, Curd 5kg" className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium">Amount *</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium">Paid By</label>
            <select value={form.paid_by} onChange={(e) => setForm({ ...form, paid_by: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
              <option value="Outlet">Outlet (cash/UPI)</option>
              <option value="Management">Management / HQ</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium">Payment Mode</label>
            <select value={form.payment_mode_id} onChange={(e) => setForm({ ...form, payment_mode_id: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
              <option value="">Not paid yet (credit)</option>
              {paymentModes.map((pm) => <option key={pm.id} value={pm.id}>{pm.mode_name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium">Invoice / Bill No</label>
            <input value={form.invoice_no} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
          </div>
          <div className="flex items-end">
            <label className="flex h-10 items-center gap-2 text-[13px] font-medium">
              <input type="checkbox" checked={form.is_emergency} onChange={(e) => setForm({ ...form, is_emergency: e.target.checked })} />
              <AlertTriangle size={14} className="text-[#FF9F43]" /> Emergency / top-up purchase
            </label>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="mb-1 block text-[13px] font-medium">Remarks</label>
            <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <button type="submit" disabled={saving} className="flex h-[42px] items-center justify-center gap-2 rounded-md px-5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-70" style={{ backgroundColor: primaryColor }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {saving ? "Saving…" : "Record Purchase"}
            </button>
          </div>
        </form>
      </div>

      <div className={`rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:p-5 ${cardCls}`}>
        <div className="mb-3 flex items-center gap-2">
          <Wallet size={16} style={{ color: primaryColor }} />
          <span className={`text-[12px] font-semibold uppercase tracking-wider ${mutedCls}`}>Vendor Ledger &amp; Payment</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select value={ledgerOutlet} onChange={(e) => setLedgerOutlet(e.target.value)} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
            <option value="">Select outlet</option>
            {visibleOutlets.map((o) => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
          </select>
          <select value={ledgerVendor} onChange={(e) => setLedgerVendor(e.target.value)} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
            <option value="">Select vendor</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
          </select>
        </div>

        {ledgerLoading ? (
          <div className={`mt-4 flex items-center gap-2 text-[13px] ${mutedCls}`}><Loader2 size={15} className="animate-spin" /> Loading ledger…</div>
        ) : ledger ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className={`rounded-md border p-3 ${isDark ? "border-[#3B405A] bg-[#25293C]" : "border-[#EBE9F1] bg-[#F8F7FA]"}`}>
              <p className={`text-[12px] ${mutedCls}`}>Total Outstanding</p>
              <p className={`mt-1 text-[18px] font-semibold ${mainCls}`}>{fmtINR(ledger.current_outstanding)}</p>
            </div>
            <div className="rounded-md border border-[#FCEAEA] bg-[#FCEAEA]/40 p-3">
              <p className="flex items-center gap-1 text-[12px] font-medium text-[#EA5455]"><ShieldAlert size={13} /> Overdue</p>
              <p className="mt-1 text-[18px] font-semibold text-[#EA5455]">{fmtINR(ledger.overdue_amount)}</p>
            </div>
            <div className="rounded-md border border-[#FFF4E5] bg-[#FFF4E5]/40 p-3">
              <p className="flex items-center gap-1 text-[12px] font-medium text-[#FF9F43]"><Clock size={13} /> Not Yet Due</p>
              <p className="mt-1 text-[18px] font-semibold text-[#FF9F43]">{fmtINR(ledger.not_due_amount)}</p>
            </div>
          </div>
        ) : (
          <p className={`mt-4 text-[13px] ${mutedCls}`}>Select an outlet and vendor to view their ledger.</p>
        )}

        {ledger && ledger.current_outstanding > 0.005 && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input type="number" min="0" step="0.01" max={ledger.current_outstanding} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Payment amount" className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
            <select value={payModeId} onChange={(e) => setPayModeId(e.target.value)} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
              <option value="">Payment mode</option>
              {paymentModes.map((pm) => <option key={pm.id} value={pm.id}>{pm.mode_name}</option>)}
            </select>
            <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Reference no. (optional)" className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
            <button onClick={handleRecordPayment} disabled={payingLoading} className="flex h-10 items-center justify-center gap-2 rounded-md px-4 text-[14px] font-semibold text-white disabled:opacity-70" style={{ backgroundColor: primaryColor }}>
              {payingLoading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} {payingLoading ? "Saving…" : "Record Payment"} {!payingLoading && <ChevronRight size={15} />}
            </button>
          </div>
        )}
        {ledger && ledger.current_outstanding <= 0.005 && (
          <div className="mt-3 flex items-center gap-2 text-[13px] text-[#28C76F]"><CheckCircle2 size={15} /> Fully settled — no outstanding balance.</div>
        )}
      </div>

      <div className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
        <div className={`border-b px-4 py-3 sm:px-6 ${borderCls}`}>
          <span className={`text-[12px] font-semibold uppercase tracking-wider ${mutedCls}`}>Recent Purchases</span>
        </div>
        <div className="p-4 sm:p-5">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
            <select value={filters.outlet_id} onChange={(e) => setFilters({ ...filters, outlet_id: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}>
              <option value="">All Outlets</option>
              {visibleOutlets.map((o) => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
            </select>
            <select value={filters.vendor_id} onChange={(e) => setFilters({ ...filters, vendor_id: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}>
              <option value="">All Vendors</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
            </select>
            <input type="date" value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`} />
            <input type="date" value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`} />
            <button onClick={() => setFilters({ outlet_id: "", vendor_id: "", from_date: "", to_date: "" })} className={`flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-[13px] font-medium ${inputCls}`}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full" style={{ minWidth: "800px" }}>
              <thead>
                <tr>
                  {["Date", "Outlet", "Vendor", "Description", "Amount", "Paid By", "Mode", ""].map((h) => (
                    <th key={h} className={`whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider ${isDark ? "bg-[#25293C] text-[#A5A8B6]" : "bg-[#F8F7FA] text-[#A8AAAE]"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${borderCls}`}>
                {loading ? (
                  <tr><td colSpan={8} className="px-3 py-10 text-center">
                    <Loader2 size={24} className="mx-auto animate-spin" style={{ color: primaryColor }} />
                  </td></tr>
                ) : purchases.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center"><span className={mutedCls}>No purchases recorded yet</span></td></tr>
                ) : purchases.map((p) => (
                  <tr key={p.id} className={isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F8F7FA]"}>
                    <td className={`px-3 py-2.5 text-[13px] ${mutedCls}`}>{p.purchase_date}</td>
                    <td className={`px-3 py-2.5 text-[13px] ${mainCls}`}>{p.outlet_name}</td>
                    <td className={`px-3 py-2.5 text-[13px] ${mainCls}`}>{p.vendor_name}</td>
                    <td className={`px-3 py-2.5 text-[13px] ${mutedCls}`}>
                      {p.description}
                      {Number(p.is_emergency) === 1 && <span className="ml-1.5 rounded-full bg-[#FFF4E5] px-2 py-0.5 text-[11px] font-medium text-[#FF9F43]">Emergency</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-[13px] font-semibold ${mainCls}`}>{fmtINR(p.amount)}</td>
                    <td className={`px-3 py-2.5 text-[13px] ${mutedCls}`}>{p.paid_by}</td>
                    <td className={`px-3 py-2.5 text-[13px] ${mutedCls}`}>{p.payment_mode_name || "Credit"}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => handleDeletePurchase(p.id)} className="text-[#EA5455]"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

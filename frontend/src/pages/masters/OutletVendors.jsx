import { useEffect, useMemo, useState } from "react";
import {
  Plus, Edit2, Trash2, X, Search, RotateCcw, Store, Phone, Mail, Download,
  Loader2, Package, CheckCircle2, AlertCircle, Clock, CreditCard,
  Milk, Carrot, Drumstick, Egg, Croissant, ShoppingBasket, Boxes,
} from "lucide-react";
import { outletVendorAPI } from "../../services/api";
import toast from "react-hot-toast";

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };

const CATEGORIES = ["Milk", "Vegetables", "Chicken & Meat", "Eggs", "Bakery Supplies", "Groceries", "Other"];
const CATEGORY_ICONS = { "Milk": Milk, "Vegetables": Carrot, "Chicken & Meat": Drumstick, "Eggs": Egg, "Bakery Supplies": Croissant, "Groceries": ShoppingBasket, "Other": Boxes };
const CATEGORY_COLORS = {
  "Milk": { color: "#00CFE8", bg: "#E6FAFD" },
  "Vegetables": { color: "#28C76F", bg: "#E9F9EF" },
  "Chicken & Meat": { color: "#EA5455", bg: "#FCEAEA" },
  "Eggs": { color: "#FF9F43", bg: "#FFF4E5" },
  "Bakery Supplies": { color: "#7367F0", bg: "#EDEBFC" },
  "Groceries": { color: "#82868B", bg: "#F3F2F7" },
  "Other": { color: "#82868B", bg: "#F3F2F7" },
};

const emptyForm = () => ({
  vendor_code: "", vendor_name: "", category: "Vegetables", phone: "", email: "",
  address: "", city: "", state: "", pincode: "", gstin: "", credit_days: 0, is_active: 1,
});

const getInitials = (name = "") => {
  const parts = String(name || "Vendor").trim().split(" ").filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase() || "V";
};

export default function OutletVendors() {
  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";
  const rowHoverCls = isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F8F7FA]";

  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await outletVendorAPI.getVendors({ search, category: categoryFilter });
      setVendors(res?.data?.data || []);
    } catch { toast.error("Failed to load vendors"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchVendors(); }, [search, categoryFilter]);

  const summary = useMemo(() => {
    const active = vendors.filter((v) => Number(v.is_active) === 1).length;
    const withGstin = vendors.filter((v) => Boolean(String(v.gstin || "").trim())).length;
    const withCredit = vendors.filter((v) => Number(v.credit_days) > 0).length;
    return { total: vendors.length, active, withGstin, withCredit };
  }, [vendors]);

  const openCreate = () => { setFormData(emptyForm()); setEditingId(null); setShowForm(true); };
  const openEdit = (v) => {
    setFormData({
      vendor_code: v.vendor_code || "", vendor_name: v.vendor_name || "", category: v.category || "Other",
      phone: v.phone || "", email: v.email || "", address: v.address || "", city: v.city || "",
      state: v.state || "", pincode: v.pincode || "", gstin: v.gstin || "", credit_days: Number(v.credit_days) || 0,
      is_active: Number(v.is_active) === 1 ? 1 : 0,
    });
    setEditingId(v.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.vendor_name.trim()) { toast.error("Vendor name is required"); return; }
    if (formData.gstin.trim() && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.gstin.trim().toUpperCase())) {
      toast.error("GSTIN format is invalid (expected format: 22AAAAA0000A1Z5)");
      return;
    }
    if (formData.credit_days !== "" && (Number.isNaN(Number(formData.credit_days)) || Number(formData.credit_days) < 0)) {
      toast.error("Credit days must be a non-negative number");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...formData, vendor_code: formData.vendor_code.trim() || undefined, credit_days: Number(formData.credit_days) || 0 };
      if (editingId) {
        await outletVendorAPI.updateVendor(editingId, payload);
        toast.success("Vendor updated");
      } else {
        await outletVendorAPI.createVendor(payload);
        toast.success("Vendor created");
      }
      setShowForm(false);
      fetchVendors();
    } catch (error) { toast.error(error.response?.data?.message || "Save failed"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this vendor?")) return;
    try { await outletVendorAPI.deleteVendor(id); toast.success("Vendor deleted"); fetchVendors(); }
    catch (error) { toast.error(error.response?.data?.message || "Delete failed"); }
  };

  const handleExport = () => {
    const headers = ["Vendor Code", "Vendor Name", "Category", "Phone", "Email", "City", "State", "GSTIN", "Credit Days", "Status"];
    const rows = vendors.map((v) => [
      v.vendor_code || "", v.vendor_name || "", v.category || "", v.phone || "", v.email || "",
      v.city || "", v.state || "", v.gstin || "", v.credit_days ?? 0, Number(v.is_active) === 1 ? "Active" : "Inactive",
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bigbean-outlet-vendors.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Vendors exported");
  };

  const StatCard = ({ title, value, subtitle, icon: Icon, color, bg }) => (
    <div className={`rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:p-5 ${cardCls}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[13px] font-medium ${mutedCls}`}>{title}</p>
          <h3 className={`mt-1.5 text-[22px] font-semibold ${mainCls}`}>{value}</h3>
          <p className={`mt-1 text-[12px] ${mutedCls}`}>{subtitle}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: bg }}>
          <Icon size={20} style={{ color }} />
        </div>
      </div>
    </div>
  );

  const CategoryBadge = ({ category }) => {
    const Icon = CATEGORY_ICONS[category] || Boxes;
    const { color, bg } = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ color, backgroundColor: bg }}>
        <Icon size={12} /> {category}
      </span>
    );
  };

  const CreditBadge = ({ days }) => {
    const n = Number(days) || 0;
    if (n === 0) {
      return <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F2F7] px-2.5 py-1 text-[12px] font-medium text-[#6F6B7D]">Cash / Immediate</span>;
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF4E5] px-2.5 py-1 text-[12px] font-medium text-[#FF9F43]">
        <Clock size={12} /> {n} days
      </span>
    );
  };

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Outlet Vendors</h1>
          <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>Direct outlet vendors for milk, vegetables, chicken, eggs — separate from Warehouse Suppliers</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={fetchVendors} className={`flex h-[42px] items-center justify-center gap-2 rounded-md border px-4 text-[14px] font-medium ${inputCls}`}>
            <RotateCcw size={15} /> Refresh
          </button>
          <button onClick={handleExport} className={`flex h-[42px] items-center justify-center gap-2 rounded-md border px-4 text-[14px] font-medium ${inputCls}`}>
            <Download size={15} /> Export
          </button>
          <button onClick={openCreate} className="flex h-[42px] items-center justify-center gap-2 rounded-md px-4 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90" style={{ backgroundColor: primaryColor }}>
            <Plus size={16} /> Add Vendor
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard title="Total Vendors" value={summary.total} subtitle="All outlet vendors" icon={Store} color={primaryColor} bg={`${primaryColor}18`} />
        <StatCard title="Active" value={summary.active} subtitle="Currently usable" icon={CheckCircle2} color="#28C76F" bg="#E9F9EF" />
        <StatCard title="On Credit Terms" value={summary.withCredit} subtitle="Have credit days set" icon={Clock} color="#FF9F43" bg="#FFF4E5" />
        <StatCard title="GST Registered" value={summary.withGstin} subtitle="GSTIN available" icon={CreditCard} color="#00CFE8" bg="#E6FAFD" />
      </div>

      <div className={`rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${mutedCls}`} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor name…" className={`h-[42px] w-full rounded-md border pl-9 pr-3 text-[14px] outline-none ${inputCls}`} />
          </div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => { setSearch(""); setCategoryFilter(""); }} className={`flex h-[42px] items-center justify-center gap-2 rounded-md border px-4 text-[14px] font-medium ${inputCls}`}>
            <RotateCcw size={15} /> Reset
          </button>
        </div>
      </div>

      <div className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full" style={{ minWidth: "900px" }}>
            <thead>
              <tr>
                {["Vendor", "Category", "Contact", "GSTIN", "Credit Terms", "Status", "Actions"].map((h) => (
                  <th key={h} className={`whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider ${isDark ? "bg-[#25293C] text-[#A5A8B6]" : "bg-[#F8F7FA] text-[#A8AAAE]"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y ${borderCls}`}>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-14 text-center">
                  <Loader2 size={28} className="mx-auto animate-spin" style={{ color: primaryColor }} />
                  <p className={`mt-2 ${mutedCls}`}>Loading vendors…</p>
                </td></tr>
              ) : vendors.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-14 text-center">
                  <Store size={30} className={`mx-auto mb-2 ${mutedCls}`} />
                  <p className={`text-[15px] font-semibold ${mainCls}`}>No vendors found</p>
                  <p className={`mt-1 text-[13px] ${mutedCls}`}>Add a new vendor or adjust your filters.</p>
                </td></tr>
              ) : vendors.map((v) => (
                <tr key={v.id} className={rowHoverCls}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[13px] font-semibold text-white"
                        style={{ background: `linear-gradient(135deg, ${primaryColor}, #9E95F5)` }}
                      >
                        {getInitials(v.vendor_name)}
                      </div>
                      <div className="min-w-0">
                        <p className={`truncate text-[14px] font-medium ${mainCls}`}>{v.vendor_name}</p>
                        {v.vendor_code && <p className={`truncate text-[12px] ${mutedCls}`}>{v.vendor_code}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><CategoryBadge category={v.category} /></td>
                  <td className={`px-4 py-3 text-[13px] ${mutedCls}`}>
                    <div className="space-y-0.5">
                      {v.phone && <span className="flex items-center gap-1"><Phone size={12} /> {v.phone}</span>}
                      {v.email && <span className="flex items-center gap-1"><Mail size={12} /> {v.email}</span>}
                      {!v.phone && !v.email && "-"}
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-[13px] ${mutedCls}`}>{v.gstin || "-"}</td>
                  <td className="px-4 py-3"><CreditBadge days={v.credit_days} /></td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${Number(v.is_active) === 1 ? "bg-[#E9F9EF] text-[#28C76F]" : "bg-[#FCEAEA] text-[#EA5455]"}`}>
                      {Number(v.is_active) === 1 ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                      {Number(v.is_active) === 1 ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(v)} title="Edit" className={`rounded-md p-1.5 transition hover:text-[#00A6B7] ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><Edit2 size={15} /></button>
                      <button onClick={() => handleDelete(v.id)} title="Delete" className={`rounded-md p-1.5 text-[#EA5455] ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className={`w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border p-5 shadow-xl ${cardCls}`} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-semibold">{editingId ? "Edit Vendor" : "Add Vendor"}</h3>
                <p className={`mt-0.5 text-[13px] ${mutedCls}`}>Vendor identity, contact and payment terms.</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className={`flex h-9 w-9 items-center justify-center rounded-md ${isDark ? "bg-[#25293C]" : "bg-[#F3F2F7]"}`}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[13px] font-medium">Vendor Name *</label>
                <input value={formData.vendor_name} onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[13px] font-medium">Vendor Code</label>
                  <input value={formData.vendor_code} onChange={(e) => setFormData({ ...formData, vendor_code: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
                </div>
                <div>
                  <label className="mb-1 block text-[13px] font-medium">Category</label>
                  <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[13px] font-medium">Phone</label>
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
                </div>
                <div>
                  <label className="mb-1 block text-[13px] font-medium">Email</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-medium">Address</label>
                <textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={2} className={`w-full rounded-md border px-3 py-2 text-[14px] outline-none ${inputCls}`} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-[13px] font-medium">City</label>
                  <input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
                </div>
                <div>
                  <label className="mb-1 block text-[13px] font-medium">State</label>
                  <input value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
                </div>
                <div>
                  <label className="mb-1 block text-[13px] font-medium">Pincode</label>
                  <input value={formData.pincode} onChange={(e) => setFormData({ ...formData, pincode: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[13px] font-medium">GSTIN (if registered)</label>
                  <input value={formData.gstin} maxLength={15} onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })} className={`h-10 w-full rounded-md border px-3 text-[14px] uppercase outline-none ${inputCls}`} placeholder="Leave blank if unregistered" />
                </div>
                <div>
                  <label className="mb-1 block text-[13px] font-medium">Credit Days</label>
                  <input type="number" min="0" step="1" value={formData.credit_days} onChange={(e) => setFormData({ ...formData, credit_days: e.target.value })} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`} placeholder="0 = cash/immediate" />
                </div>
              </div>
              <p className={`text-[12px] ${mutedCls}`}>Payment due date = purchase date + credit days. Leave at 0 for cash/immediate-payment vendors.</p>
              {editingId && (
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={formData.is_active === 1} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked ? 1 : 0 })} />
                  Active
                </label>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} disabled={saving} className={`h-10 rounded-md border px-4 text-[14px] font-medium disabled:opacity-50 ${inputCls}`}>Cancel</button>
              <button type="submit" disabled={saving} className="flex h-10 items-center gap-2 rounded-md px-4 text-[14px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: primaryColor }}>
                {saving && <Loader2 size={15} className="animate-spin" />} {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

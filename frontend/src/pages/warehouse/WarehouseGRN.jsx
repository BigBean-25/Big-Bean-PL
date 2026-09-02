import { useEffect, useState, useMemo } from "react";
import { warehouseAPI } from "../../services/api";
import { SectionCard, TableWrapper, LoadingRows, EmptyState } from "../../components/ui";
import { KpiCard, WarehouseStatusBadge, fmtCurrency, fmtQty, num, EmptyRow, fmtDate } from "./WarehouseShared";
import { getInputClass } from "../../components/ui";
import { Search, RotateCcw, Plus, Truck, Eye, X, ClipboardCheck } from "lucide-react";
import toast from "react-hot-toast";
import { amountInWords } from "./invoiceWords";

export default function WarehouseGRN({ locationId, locations, materials, suppliers, isDark }) {
  const [loading, setLoading] = useState(true);
  const [grns, setGrns] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ search: "", status: "", supplier: "" });
  const [print, setPrint] = useState(null);
  const inputClass = getInputClass(isDark);

  const getMaterialGstRate = (rawMaterialId) => {
    const mat = materials.find((m) => String(m.id) === String(rawMaterialId));
    return mat?.gst_rate !== null && mat?.gst_rate !== undefined ? Number(mat.gst_rate) : 0;
  };
  const getItemTax = (it) => {
    const accepted = Math.max(0, num(it.received_qty) - num(it.rejected_qty));
    const taxable = accepted * num(it.rate);
    return (taxable * getMaterialGstRate(it.raw_material_id)) / 100;
  };

  const openPrint = async (id) => {
    try {
      const res = await warehouseAPI.getGRN(id);
      setPrint(res?.data?.data || null);
    } catch { toast.error("Failed to load GRN"); }
  };

  const invoiceCalc = useMemo(() => {
    if (!print) return null;
    const items = print.items || [];
    const rateGroups = {};
    const hsnGroups = {};
    let taxableTotal = 0;
    let taxTotal = 0;
    items.forEach((it) => {
      const totalAmount = num(it.total_amount);
      const tax = num(it.tax_amount);
      const taxable = totalAmount - tax;
      const rate = it.gst_rate !== null && it.gst_rate !== undefined ? Number(it.gst_rate) : 0;
      const half = tax / 2;
      taxableTotal += taxable;
      taxTotal += tax;

      const rKey = rate.toFixed(2);
      if (!rateGroups[rKey]) rateGroups[rKey] = { rate, cgst: 0, sgst: 0 };
      rateGroups[rKey].cgst += half;
      rateGroups[rKey].sgst += half;

      const hKey = it.hsn_code || "—";
      if (!hsnGroups[hKey]) hsnGroups[hKey] = { hsn: hKey, taxable: 0, rate, cgst: 0, sgst: 0 };
      hsnGroups[hKey].taxable += taxable;
      hsnGroups[hKey].cgst += half;
      hsnGroups[hKey].sgst += half;
    });
    const grandTotal = num(print.total_amount);
    const roundedTotal = Math.round(grandTotal);
    const roundOff = roundedTotal - (taxableTotal + taxTotal);
    return {
      taxableTotal, taxTotal, grandTotal, roundedTotal, roundOff,
      rateGroups: Object.values(rateGroups).sort((a, b) => a.rate - b.rate),
      hsnGroups: Object.values(hsnGroups),
    };
  }, [print]);

  const [form, setForm] = useState({
    grn_no: "",
    grn_date: new Date().toISOString().split("T")[0],
    supplier_id: "",
    purchase_reference: "",
    invoice_reference: "",
    remarks: "",
    items: [{ raw_material_id: "", received_qty: "", rejected_qty: "0", rate: "", batch_no: "", expiry_date: "" }],
  });

  const fetchGRNs = async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      const res = await warehouseAPI.getGRNs({ location_id: locationId });
      setGrns(res?.data?.data || []);
    } catch (error) { toast.error("Failed to load GRNs"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchGRNs(); }, [locationId]);

  const addItem = () => setForm({ ...form, items: [...form.items, { raw_material_id: "", received_qty: "", rejected_qty: "0", rate: "", batch_no: "", expiry_date: "" }] });
  const updateItem = (idx, key, value) => {
    const items = [...form.items];
    items[idx][key] = value;
    if (key === "raw_material_id") {
      const mat = materials.find((m) => String(m.id) === value);
      if (mat) items[idx].unit_id = String(mat.unit_id);
    }
    setForm({ ...form, items });
  };
  const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const save = async (post = false) => {
    if (saving) return;
    if (form.items.some((it) => num(it.received_qty) < 0 || num(it.rejected_qty) < 0 || num(it.rate) < 0)) {
      toast.error("Quantities and rate cannot be negative");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        warehouse_location_id: Number(locationId),
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        items: form.items.map((it) => ({
          raw_material_id: Number(it.raw_material_id),
          received_qty: Number(it.received_qty),
          rejected_qty: Number(it.rejected_qty || 0),
          unit_id: Number(it.unit_id),
          rate: Number(it.rate),
          tax_amount: getItemTax(it),
          batch_no: it.batch_no || null,
          expiry_date: it.expiry_date || null,
        })),
      };
      const created = await warehouseAPI.createGRN(payload);
      if (post && created?.data?.data?.id) await warehouseAPI.postGRN(created.data.data.id);
      toast.success(post ? "GRN posted" : "GRN saved");
      setShowCreate(false);
      setForm({ grn_no: "", grn_date: new Date().toISOString().split("T")[0], supplier_id: "", purchase_reference: "", invoice_reference: "", remarks: "", items: [{ raw_material_id: "", received_qty: "", rejected_qty: "0", rate: "", batch_no: "", expiry_date: "" }] });
      fetchGRNs();
    } catch (error) { toast.error(error.response?.data?.message || "GRN failed"); }
    finally { setSaving(false); }
  };

  const filtered = grns.filter((g) => {
    const term = filters.search.toLowerCase();
    return (term === "" || (g.grn_no || "").toLowerCase().includes(term) || (g.purchase_reference || "").toLowerCase().includes(term))
      && (filters.status === "" || g.status === filters.status)
      && (filters.supplier === "" || String(g.supplier_id) === filters.supplier);
  });

  const reset = () => setFilters({ search: "", status: "", supplier: "" });

  if (!locationId) return <EmptyState icon={Truck} title="Select a warehouse" subtitle="Choose a warehouse to view GRNs." isDark={isDark} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={ClipboardCheck} label="Draft GRNs" value={grns.filter((g) => g.status === "Draft").length} isDark={isDark} />
        <KpiCard icon={ClipboardCheck} label="Posted GRNs" value={grns.filter((g) => g.status === "Posted").length} isDark={isDark} />
        <KpiCard icon={Truck} label="Today" value={grns.filter((g) => g.grn_date === new Date().toISOString().split("T")[0]).length} isDark={isDark} />
        <KpiCard icon={ClipboardCheck} label="Receipt Value" value={fmtCurrency(grns.reduce((s, g) => s + num(g.total_amount), 0))} isDark={isDark} />
      </div>

      <SectionCard title="Filters" isDark={isDark}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className={`h-10 w-full rounded-lg border pl-9 pr-3 text-[14px] outline-none ${inputClass}`} placeholder="Search GRN" />
          </div>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">All Status</option>
            <option value="Draft">Draft</option>
            <option value="Posted">Posted</option>
          </select>
          <select value={filters.supplier} onChange={(e) => setFilters({ ...filters, supplier: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">All Suppliers</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
          </select>
          <button onClick={reset} className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#A5A8B6]" : "border-[#EBE9F1] bg-white text-[#6F6B7D]"}`}>
            <RotateCcw size={14} /> Reset
          </button>
          <button onClick={() => setShowCreate(true)} className="flex h-10 items-center gap-2 rounded-lg bg-[#7367F0] px-3 text-[13px] font-semibold text-white hover:bg-[#6354D8]">
            <Plus size={16} /> New GRN
          </button>
        </div>
      </SectionCard>

      <SectionCard isDark={isDark}>
        <TableWrapper isDark={isDark}>
          <table className="w-full border-collapse text-[13px]">
            <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
              <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                <th className="px-3 py-3">GRN No</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Supplier</th>
                <th className="px-3 py-3">Warehouse</th>
                <th className="px-3 py-3 text-right">Items</th>
                <th className="px-3 py-3">Invoice Ref</th>
                <th className="px-3 py-3 text-right">Value</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="sticky right-0 px-3 py-3 text-center" style={{ background: isDark ? "#2F3349" : "white" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRows rows={5} cols={9} isDark={isDark} /> : (
                <>
                  {filtered.map((g) => {
                    const loc = locations.find((l) => String(l.id) === String(g.warehouse_location_id));
                    const sup = suppliers.find((s) => String(s.id) === String(g.supplier_id));
                    return (
                      <tr key={g.id} className={`border-b transition ${isDark ? "border-[#3B405A] hover:bg-[#3B405A]/30" : "border-[#F3F2F7] hover:bg-[#F8F7FA]"}`}>
                        <td className="px-3 py-2.5 font-medium">{g.grn_no}</td>
                        <td className="px-3 py-2.5">{fmtDate(g.grn_date)}</td>
                        <td className="px-3 py-2.5">{sup?.supplier_name || "-"}</td>
                        <td className="px-3 py-2.5">{loc?.location_name || "-"}</td>
                        <td className="px-3 py-2.5 text-right">{g.item_count || g.items || 0}</td>
                        <td className="px-3 py-2.5">{g.purchase_reference || "-"}</td>
                        <td className="px-3 py-2.5 text-right">{fmtCurrency(g.total_amount)}</td>
                        <td className="px-3 py-2.5 text-center"><WarehouseStatusBadge status={g.status} /></td>
                        <td className="sticky right-0 px-3 py-2.5 text-center" style={{ background: isDark ? "#2F3349" : "white" }}>
                          {g.status === "Draft" && <button onClick={() => { toast.promise(warehouseAPI.postGRN(g.id).then(fetchGRNs), { loading: "Posting...", success: "GRN posted", error: "Post failed" }); }} className="rounded-md bg-[#7367F0] px-2 py-1 text-[11px] font-semibold text-white">Post</button>}
                          <button onClick={() => openPrint(g.id)} title="View / Print" className={`ml-1 rounded-md p-1.5 ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><Eye size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && <EmptyRow colSpan={9} isDark={isDark} />}
                </>
              )}
            </tbody>
          </table>
        </TableWrapper>
      </SectionCard>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">Create GRN</h3>
              <button onClick={() => setShowCreate(false)} className="text-2xl leading-none">&times;</button>
            </div>
            <div className="space-y-5 p-4">
              <SectionCard title="GRN Information" isDark={isDark}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <input value={form.grn_no} onChange={(e) => setForm({ ...form, grn_no: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} placeholder="GRN Number" />
                  <input type="date" value={form.grn_date} onChange={(e) => setForm({ ...form, grn_date: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                  <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}><option value="">Supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select>
                  <div className={`flex h-10 items-center rounded-lg border px-3 text-[14px] ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                    {locations.find((l) => String(l.id) === locationId)?.location_name || "Select location"}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="References" isDark={isDark}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <input value={form.purchase_reference} onChange={(e) => setForm({ ...form, purchase_reference: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} placeholder="Purchase Reference" />
                  <input value={form.invoice_reference} onChange={(e) => setForm({ ...form, invoice_reference: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} placeholder="Invoice Reference" />
                  <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} placeholder="Remarks" />
                </div>
              </SectionCard>

              <SectionCard title="Material Items" isDark={isDark}>
                <TableWrapper isDark={isDark}>
                  <table className="w-full border-collapse text-[13px]">
                    <thead className={`${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                      <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                        <th className="px-2 py-2">Material</th>
                        <th className="px-2 py-2 text-right">Received</th>
                        <th className="px-2 py-2 text-right">Rejected</th>
                        <th className="px-2 py-2 text-right">Accepted</th>
                        <th className="px-2 py-2 text-right">Rate</th>
                        <th className="px-2 py-2 text-right">GST</th>
                        <th className="px-2 py-2">Batch</th>
                        <th className="px-2 py-2">Expiry</th>
                        <th className="px-2 py-2 text-right">Line Total</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((it, idx) => {
                        const rec = num(it.received_qty);
                        const rej = num(it.rejected_qty);
                        const rate = num(it.rate);
                        const accepted = Math.max(0, rec - rej);
                        const tax = getItemTax(it);
                        const total = accepted * rate + tax;
                        return (
                          <tr key={idx} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                            <td className="px-2 py-2">
                              <select value={it.raw_material_id} onChange={(e) => updateItem(idx, "raw_material_id", e.target.value)} className={`h-9 w-40 rounded-md border px-2 text-[13px] outline-none ${inputClass}`}><option value="">Select</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.material_name}</option>)}</select>
                            </td>
                            <td className="px-2 py-2"><input type="number" min="0" value={it.received_qty} onChange={(e) => updateItem(idx, "received_qty", e.target.value)} className={`h-9 w-24 rounded-md border px-2 text-right text-[13px] outline-none ${inputClass}`} /></td>
                            <td className="px-2 py-2"><input type="number" min="0" value={it.rejected_qty} onChange={(e) => updateItem(idx, "rejected_qty", e.target.value)} className={`h-9 w-24 rounded-md border px-2 text-right text-[13px] outline-none ${inputClass}`} /></td>
                            <td className="px-2 py-2 text-right text-[13px]">{fmtQty(accepted)}</td>
                            <td className="px-2 py-2"><input type="number" min="0" value={it.rate} onChange={(e) => updateItem(idx, "rate", e.target.value)} className={`h-9 w-24 rounded-md border px-2 text-right text-[13px] outline-none ${inputClass}`} /></td>
                            <td className="px-2 py-2 text-right text-[13px]">{getMaterialGstRate(it.raw_material_id)}%</td>
                            <td className="px-2 py-2"><input value={it.batch_no} onChange={(e) => updateItem(idx, "batch_no", e.target.value)} className={`h-9 w-24 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} /></td>
                            <td className="px-2 py-2"><input type="date" value={it.expiry_date} onChange={(e) => updateItem(idx, "expiry_date", e.target.value)} className={`h-9 w-32 rounded-md border px-2 text-[13px] outline-none ${inputClass}`} /></td>
                            <td className="px-2 py-2 text-right text-[13px]">{fmtCurrency(total)}</td>
                            <td className="px-2 py-2"><button onClick={() => removeItem(idx)} className="text-rose-500" disabled={form.items.length === 1}><X size={16} /></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrapper>
                <button onClick={addItem} className="mt-3 flex h-9 items-center gap-1.5 rounded-lg border border-[#7367F0] px-3 text-[13px] font-medium text-[#7367F0]">
                  <Plus size={14} /> Add Material
                </button>
              </SectionCard>

              <SectionCard title="GRN Summary" isDark={isDark}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniSummary label="Subtotal" value={fmtCurrency(form.items.reduce((s, it) => s + (num(it.received_qty) - num(it.rejected_qty)) * num(it.rate), 0))} isDark={isDark} />
                  <MiniSummary label="Tax" value={fmtCurrency(form.items.reduce((s, it) => s + getItemTax(it), 0))} isDark={isDark} />
                  <MiniSummary label="Total Value" value={fmtCurrency(form.items.reduce((s, it) => s + (num(it.received_qty) - num(it.rejected_qty)) * num(it.rate) + getItemTax(it), 0))} isDark={isDark} />
                  <MiniSummary label="Accepted Items" value={form.items.length} isDark={isDark} />
                </div>
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreate(false)} disabled={saving} className="h-10 rounded-lg border px-4 text-[14px] font-medium disabled:opacity-50">Cancel</button>
                <button onClick={() => save(false)} disabled={saving} className="h-10 rounded-lg border border-[#7367F0] px-4 text-[14px] font-medium text-[#7367F0] disabled:opacity-50">{saving ? "Saving…" : "Save Draft"}</button>
                <button onClick={() => save(true)} disabled={saving} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8] disabled:opacity-50">{saving ? "Posting…" : "Post GRN"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {print && invoiceCalc && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 print:hidden print:bg-white print:p-0">
          <div data-print-root className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border bg-white p-6 text-[12px] text-black shadow-xl print:max-h-none print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
            <p className="mb-3 text-center text-[15px] font-bold underline">Tax Invoice</p>

            <table className="w-full border-collapse border border-black text-[11px]">
              <tbody>
                <tr>
                  <td className="w-1/2 border border-black p-2 align-top">
                    <p className="text-[13px] font-bold">{print.supplier_name}</p>
                    <p className="mt-0.5 whitespace-pre-line">{print.supplier_address || "-"}</p>
                    <p>{[print.supplier_city, print.supplier_state, print.supplier_pincode].filter(Boolean).join(", ") || "-"}</p>
                    {print.supplier_phone && <p>Contact: {print.supplier_phone}</p>}
                    {print.supplier_email && <p>E-Mail: {print.supplier_email}</p>}
                    <p>GSTIN/UIN: {print.gstin || "-"}</p>
                  </td>
                  <td className="w-1/2 border border-black p-2 align-top">
                    <table className="w-full text-[11px]">
                      <tbody>
                        <tr><td className="pb-1 font-semibold">Invoice No.:</td><td className="pb-1 text-right">{print.grn_no}</td></tr>
                        <tr><td className="pb-1 font-semibold">Dated:</td><td className="pb-1 text-right">{fmtDate(print.grn_date)}</td></tr>
                        <tr><td className="font-semibold">Supplier Invoice Ref:</td><td className="text-right">{print.invoice_reference || "-"}</td></tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-black p-2 align-top">
                    <p className="font-semibold">Buyer (Bill to)</p>
                    <p className="text-[13px] font-bold">{print.location_name}</p>
                    <p className="mt-0.5 whitespace-pre-line">{print.location_address || "-"}</p>
                    <p>{[print.location_city, print.location_state, print.location_pincode].filter(Boolean).join(", ") || "-"}</p>
                    <p>GSTIN/UIN: {print.location_gstin || "-"}</p>
                    <p>State Name: {print.location_state || "-"}</p>
                  </td>
                </tr>
              </tbody>
            </table>

            <table className="mt-2 w-full border-collapse border border-black text-[11px]">
              <thead>
                <tr className="text-center">
                  <th className="border border-black p-1">SI No.</th>
                  <th className="border border-black p-1 text-left">Description of Goods</th>
                  <th className="border border-black p-1">HSN/SAC</th>
                  <th className="border border-black p-1">GST Rate</th>
                  <th className="border border-black p-1">Quantity</th>
                  <th className="border border-black p-1">Rate</th>
                  <th className="border border-black p-1">per</th>
                  <th className="border border-black p-1">Amount</th>
                </tr>
              </thead>
              <tbody>
                {print.items.map((it, idx) => {
                  const taxable = num(it.total_amount) - num(it.tax_amount);
                  return (
                    <tr key={it.id}>
                      <td className="border border-black p-1 text-center">{idx + 1}</td>
                      <td className="border border-black p-1">{it.material_name}</td>
                      <td className="border border-black p-1 text-center">{it.hsn_code || "-"}</td>
                      <td className="border border-black p-1 text-center">{it.gst_rate !== null && it.gst_rate !== undefined ? `${Number(it.gst_rate)} %` : "-"}</td>
                      <td className="border border-black p-1 text-right">{fmtQty(it.accepted_qty)} {it.unit_name}</td>
                      <td className="border border-black p-1 text-right">{Number(it.rate).toFixed(2)}</td>
                      <td className="border border-black p-1 text-center">{it.unit_name}</td>
                      <td className="border border-black p-1 text-right">{taxable.toFixed(2)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={7} className="border border-black p-1 text-right font-semibold">Sub Total</td>
                  <td className="border border-black p-1 text-right font-semibold">{invoiceCalc.taxableTotal.toFixed(2)}</td>
                </tr>
                {invoiceCalc.rateGroups.filter((g) => g.rate > 0).flatMap((g) => ([
                  <tr key={`cgst-${g.rate}`}>
                    <td colSpan={7} className="border border-black p-1 text-right">CGST @ {(g.rate / 2).toFixed(2)}%</td>
                    <td className="border border-black p-1 text-right">{g.cgst.toFixed(2)}</td>
                  </tr>,
                  <tr key={`sgst-${g.rate}`}>
                    <td colSpan={7} className="border border-black p-1 text-right">SGST @ {(g.rate / 2).toFixed(2)}%</td>
                    <td className="border border-black p-1 text-right">{g.sgst.toFixed(2)}</td>
                  </tr>,
                ]))}
                <tr>
                  <td colSpan={7} className="border border-black p-1 text-right">Round Off</td>
                  <td className="border border-black p-1 text-right">{invoiceCalc.roundOff >= 0 ? "" : "(-)"}{Math.abs(invoiceCalc.roundOff).toFixed(2)}</td>
                </tr>
                <tr>
                  <td colSpan={7} className="border border-black p-1 text-right font-bold">Total</td>
                  <td className="border border-black p-1 text-right font-bold">₹ {invoiceCalc.roundedTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <p className="mt-2"><span className="font-semibold">Amount Chargeable (in words):</span> {amountInWords(invoiceCalc.roundedTotal)}</p>

            <p className="mt-3 text-center font-semibold">Tax Analysis</p>
            <table className="w-full border-collapse border border-black text-center text-[11px]">
              <thead>
                <tr>
                  <th rowSpan={2} className="border border-black p-1">HSN/SAC</th>
                  <th rowSpan={2} className="border border-black p-1">Taxable Value</th>
                  <th colSpan={2} className="border border-black p-1">CGST</th>
                  <th colSpan={2} className="border border-black p-1">SGST/UTGST</th>
                  <th rowSpan={2} className="border border-black p-1">Total Tax Amount</th>
                </tr>
                <tr>
                  <th className="border border-black p-1">Rate</th>
                  <th className="border border-black p-1">Amount</th>
                  <th className="border border-black p-1">Rate</th>
                  <th className="border border-black p-1">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoiceCalc.hsnGroups.map((g) => (
                  <tr key={g.hsn}>
                    <td className="border border-black p-1">{g.hsn}</td>
                    <td className="border border-black p-1 text-right">{g.taxable.toFixed(2)}</td>
                    <td className="border border-black p-1">{(g.rate / 2).toFixed(2)}%</td>
                    <td className="border border-black p-1 text-right">{g.cgst.toFixed(2)}</td>
                    <td className="border border-black p-1">{(g.rate / 2).toFixed(2)}%</td>
                    <td className="border border-black p-1 text-right">{g.sgst.toFixed(2)}</td>
                    <td className="border border-black p-1 text-right">{(g.cgst + g.sgst).toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="border border-black p-1">Total</td>
                  <td className="border border-black p-1 text-right">{invoiceCalc.taxableTotal.toFixed(2)}</td>
                  <td className="border border-black p-1"></td>
                  <td className="border border-black p-1 text-right">{(invoiceCalc.taxTotal / 2).toFixed(2)}</td>
                  <td className="border border-black p-1"></td>
                  <td className="border border-black p-1 text-right">{(invoiceCalc.taxTotal / 2).toFixed(2)}</td>
                  <td className="border border-black p-1 text-right">{invoiceCalc.taxTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2"><span className="font-semibold">Tax Amount (in words):</span> {amountInWords(invoiceCalc.taxTotal)}</p>

            <div className="mt-3">
              <p className="font-semibold">Declaration</p>
              <p>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</p>
            </div>
            {print.remarks && <p className="mt-2"><span className="font-semibold">Remarks:</span> {print.remarks}</p>}

            <div className="mt-8 flex items-end justify-between">
              <p>Customer's Seal and Signature</p>
              <div className="text-right">
                <p>for {print.supplier_name}</p>
                <p className="mt-8">Authorised Signatory</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 print:hidden">
              <button onClick={() => window.print()} className="rounded bg-gray-800 px-4 py-2 text-white">Print</button>
              <button onClick={() => setPrint(null)} className="rounded border px-4 py-2">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniSummary({ label, value, isDark }) {
  return (
    <div className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-[#F8F7FA]"}`}>
      <p className={`text-[11px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>{label}</p>
      <p className={`mt-1 text-base font-bold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{value}</p>
    </div>
  );
}

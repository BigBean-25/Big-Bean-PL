import { useEffect, useState, useMemo } from "react";
import { warehouseAPI, getStoredPermissions } from "../../services/api";
import { SectionCard, TableWrapper, LoadingRows, EmptyState, PageHeader, FilterBar } from "../../components/ui";
import { KpiCard, WarehouseStatusBadge, fmtCurrency, fmtQty, num, EmptyRow, fmtDate } from "./WarehouseShared";
import { getInputClass } from "../../components/ui";
import {
  Search, RotateCcw, Plus, FileText, Eye, Edit, Send, CheckCircle, XCircle, Lock,
  Package, Download, Printer, ClipboardCheck, Truck, Trash2
} from "lucide-react";
import toast from "react-hot-toast";
import ExcelJS from "exceljs";
import { amountInWords } from "./invoiceWords";

const statusOptions = ['Draft','Submitted','Approved','Sent','Partially Received','Received','Rejected','Closed'];

export default function PurchaseOrders({ locationId, locations, materials, suppliers, units, isDark }) {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [detail, setDetail] = useState(null);
  const [print, setPrint] = useState(null);
  const invoiceCalc = useMemo(() => {
    if (!print) return null;
    const items = print.items || [];
    const rateGroups = {};
    const hsnGroups = {};
    let taxableTotal = 0;
    let taxTotal = 0;
    items.forEach((it) => {
      const lineValue = num(it.line_value);
      const tax = num(it.tax);
      const taxable = lineValue - tax;
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
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const permissions = getStoredPermissions();
  const [filters, setFilters] = useState({ search: "", status: "", supplier_id: "" });
  const [myLocation, setMyLocation] = useState(null);
  const inputClass = getInputClass(isDark);

  const [form, setForm] = useState({
    po_date: new Date().toISOString().split("T")[0],
    supplier_id: "",
    warehouse_location_id: locationId,
    expected_delivery_date: "",
    payment_terms: "",
    reference: "",
    remarks: "",
    items: [{ raw_material_id: "", ordered_qty: "", unit_id: "", rate: "", discount: "0", tax: "0", batch_required: 0, expiry_required: 0, remarks: "" }]
  });

  useEffect(() => { setMyLocation(locations.find(l => String(l.id) === String(locationId))); }, [locationId, locations]);

  useEffect(() => { fetchPOs(); }, [locationId]);

  const fetchPOs = async () => {
    setLoading(true);
    try { const res = await warehouseAPI.getPurchaseOrders({ location_id: locationId }); setPos(res?.data?.data || []); }
    catch (error) { toast.error("Failed to load purchase orders"); }
    finally { setLoading(false); }
  };

  const getSupplier = (id) => suppliers.find(s => String(s.id) === String(id));

  const resetForm = () => {
    setForm({
      po_date: new Date().toISOString().split("T")[0],
      supplier_id: "",
      warehouse_location_id: locationId,
      expected_delivery_date: "",
      payment_terms: "",
      reference: "",
      remarks: "",
      items: [{ raw_material_id: "", ordered_qty: "", unit_id: "", rate: "", discount: "0", tax: "0", batch_required: 0, expiry_required: 0, remarks: "" }]
    });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { raw_material_id: "", ordered_qty: "", unit_id: "", rate: "", discount: "0", tax: "0", batch_required: 0, expiry_required: 0, remarks: "" }] });
  const removeItem = (idx) => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const updateItem = (idx, key, value) => {
    const items = [...form.items];
    items[idx][key] = value;
    if (key === "raw_material_id") {
      const mat = materials.find(m => String(m.id) === value);
      if (mat) {
        items[idx].unit_id = String(mat.unit_id);
        items[idx].batch_required = mat.is_batch_tracked ? 1 : 0;
        items[idx].expiry_required = mat.is_expiry_tracked ? 1 : 0;
      }
    }
    setForm({ ...form, items });
  };

  const totals = useMemo(() => {
    const subtotal = form.items.reduce((s, it) => s + (num(it.ordered_qty) * num(it.rate)), 0);
    const discount = form.items.reduce((s, it) => s + num(it.discount), 0);
    const tax = form.items.reduce((s, it) => s + num(it.tax), 0);
    const total = Math.max(0, subtotal - discount + tax);
    return { subtotal, discount, tax, total };
  }, [form.items]);

  const save = async () => {
    if (saving) return;
    if (!form.supplier_id) { toast.error("Supplier is required"); return; }
    if (form.items.some(it => !it.raw_material_id || !it.ordered_qty || !it.rate)) { toast.error("All item fields are required"); return; }
    if (form.items.some(it => num(it.ordered_qty) < 0 || num(it.rate) < 0 || num(it.discount) < 0 || num(it.tax) < 0)) { toast.error("Quantity, rate, discount and tax cannot be negative"); return; }
    const payload = {
      ...form,
      warehouse_location_id: Number(locationId),
      supplier_id: Number(form.supplier_id),
      items: form.items.map(it => ({
        raw_material_id: Number(it.raw_material_id),
        ordered_qty: Number(it.ordered_qty),
        unit_id: Number(it.unit_id),
        rate: Number(it.rate),
        discount: Number(it.discount || 0),
        tax: Number(it.tax || 0),
        batch_required: it.batch_required ? 1 : 0,
        expiry_required: it.expiry_required ? 1 : 0,
        remarks: it.remarks
      }))
    };
    setSaving(true);
    try {
      if (form.id) await warehouseAPI.updatePurchaseOrder(form.id, payload);
      else await warehouseAPI.createPurchaseOrder(payload);
      toast.success("Purchase order saved");
      setShow(false);
      resetForm();
      fetchPOs();
    } catch (error) { toast.error(error.response?.data?.message || "Save failed"); }
    finally { setSaving(false); }
  };

  const action = async (apiFn, id, msg, body = null) => {
    try { await apiFn(id, body); toast.success(msg); fetchPOs(); if (detail) openDetail(id); }
    catch (error) { toast.error(error.response?.data?.message || `${msg} failed`); }
  };

  const openDetail = async (id) => { try { const res = await warehouseAPI.getPurchaseOrder(id); setDetail(res?.data?.data); } catch {} };
  const openEdit = (po) => { setForm({ ...po, items: po.items.map(i => ({ ...i })) }); setShow(true); };

  const createGRN = async (po) => {
    try { const res = await warehouseAPI.getGRNPrefillFromPO(po.id); const pre = res?.data?.data; if (!pre || !pre.items.length) { toast.error("No remaining quantity to receive"); return; } }
    catch (error) { toast.error("GRN prefill failed"); return; }
    window.open(`/warehouse/grn?po_id=${po.id}`, "_blank");
  };

  const exportToExcel = async () => {
    if (!pos.length) { toast.error("No data to export"); return; }
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Purchase Order Register");
      ws.columns = [
        { header: "PO No", key: "po_no", width: 14 },
        { header: "PO Date", key: "po_date", width: 12 },
        { header: "Supplier", key: "supplier", width: 22 },
        { header: "Warehouse", key: "warehouse", width: 22 },
        { header: "Expected Delivery", key: "expected_delivery", width: 16 },
        { header: "Material", key: "material", width: 22 },
        { header: "Ordered Qty", key: "ordered_qty", width: 14 },
        { header: "UOM", key: "uom", width: 10 },
        { header: "Rate", key: "rate", width: 12 },
        { header: "Discount", key: "discount", width: 12 },
        { header: "Tax", key: "tax", width: 12 },
        { header: "Line Value", key: "line_value", width: 14 },
        { header: "Received Qty", key: "received_qty", width: 14 },
        { header: "Remaining Qty", key: "remaining_qty", width: 14 },
        { header: "Status", key: "status", width: 14 },
        { header: "Created By", key: "created_by", width: 18 },
      ];
      for (const po of pos) {
        const summaryRes = await warehouseAPI.getPurchaseOrderReceiptSummary(po.id);
        const summary = summaryRes?.data?.data?.items || po.items;
        for (const it of summary) {
          ws.addRow({
            po_no: po.po_no,
            po_date: fmtDate(po.po_date),
            supplier: po.supplier_name,
            warehouse: po.location_name,
            expected_delivery: fmtDate(po.expected_delivery_date),
            material: it.material_name,
            ordered_qty: num(it.ordered_qty),
            uom: it.unit_name,
            rate: num(it.rate),
            discount: num(it.discount),
            tax: num(it.tax),
            line_value: num(it.line_value),
            received_qty: num(it.accepted_qty),
            remaining_qty: num(it.remaining_qty),
            status: po.status,
            created_by: po.created_by_name,
          });
        }
      }
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BigBean_Purchase_Orders_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export complete");
    } catch (error) { toast.error("Export failed"); } finally { setExporting(false); }
  };

  const filtered = pos.filter(p => {
    const term = filters.search.toLowerCase();
    return (term === "" || (p.po_no || "").toLowerCase().includes(term) || (p.supplier_name || "").toLowerCase().includes(term) || (p.reference || "").toLowerCase().includes(term))
      && (filters.status === "" || p.status === filters.status)
      && (filters.supplier_id === "" || String(p.supplier_id) === filters.supplier_id);
  });

  const kpis = {
    thisMonth: pos.filter(p => new Date(p.po_date).getMonth() === new Date().getMonth() && new Date(p.po_date).getFullYear() === new Date().getFullYear()).length,
    openValue: pos.filter(p => ['Draft','Submitted','Approved','Sent','Partially Received'].includes(p.status)).reduce((s, p) => s + num(p.total_amount), 0),
    pendingApproval: pos.filter(p => p.status === 'Submitted').length,
    awaitingDelivery: pos.filter(p => ['Approved','Sent','Partially Received'].includes(p.status)).length,
    partiallyReceived: pos.filter(p => p.status === 'Partially Received').length,
    overdue: pos.filter(p => ['Approved','Sent','Partially Received'].includes(p.status) && p.expected_delivery_date && new Date(p.expected_delivery_date) < new Date(new Date().setHours(0,0,0,0))).length,
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <PageHeader
        title="Purchase Orders"
        subtitle="Create, approve and track supplier purchase orders before goods receipt."
        actions={
          <div className="flex flex-wrap gap-2">
            {permissions?.warehouse_purchase_orders?.can_export && (
              <button onClick={exportToExcel} disabled={exporting} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[14px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]"}`}>
                <Download size={16} /> {exporting ? "Exporting..." : "Export"}
              </button>
            )}
            {permissions?.warehouse_purchase_orders?.can_create && (
              <button onClick={() => { resetForm(); setShow(true); }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#7367F0] px-3 text-[14px] font-semibold text-white hover:bg-[#6354D8]">
                <Plus size={16} /> New PO
              </button>
            )}
          </div>
        }
        isDark={isDark}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <KpiCard icon={FileText} label="POs This Month" value={kpis.thisMonth} isDark={isDark} />
        <KpiCard icon={Package} label="Open PO Value" value={`₹${kpis.openValue.toFixed(2)}`} isDark={isDark} />
        <KpiCard icon={ClipboardCheck} label="Pending Approval" value={kpis.pendingApproval} isDark={isDark} />
        <KpiCard icon={Send} label="Awaiting Delivery" value={kpis.awaitingDelivery} isDark={isDark} />
        <KpiCard icon={Truck} label="Partially Received" value={kpis.partiallyReceived} isDark={isDark} />
        <KpiCard icon={XCircle} label="Overdue POs" value={kpis.overdue} isDark={isDark} />
      </div>

      <FilterBar isDark={isDark} title="Filters">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8AAAE]" /><input value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} placeholder="Search PO / supplier" className={`w-full rounded-md py-2 pl-9 pr-3 text-sm ${inputClass}`} /></div>
          <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">All Status</option>{statusOptions.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <select value={filters.supplier_id} onChange={e => setFilters({...filters, supplier_id: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">All Suppliers</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select>
          <button onClick={() => setFilters({ search: "", status: "", supplier_id: "" })} className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]"}`}><RotateCcw size={16} /> Reset</button>
        </div>
      </FilterBar>

      <SectionCard isDark={isDark}>
        <TableWrapper isDark={isDark}>
          <table className="w-full border-collapse text-[13px]">
            <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
              <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                <th className="px-3 py-3">PO No</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Supplier</th>
                <th className="px-3 py-3">Warehouse</th>
                <th className="px-3 py-3">Expected</th>
                <th className="px-3 py-3 text-right">Items</th>
                <th className="px-3 py-3 text-right">Value</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRows rows={5} cols={9} isDark={isDark} /> : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10"><EmptyState isDark={isDark} message="No purchase orders found" subMessage="Create a purchase order to begin procurement" /></td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                  <td className="px-3 py-3 font-medium">{p.po_no}</td>
                  <td className="px-3 py-3">{fmtDate(p.po_date)}</td>
                  <td className="px-3 py-3">{p.supplier_name}</td>
                  <td className="px-3 py-3">{p.location_name}</td>
                  <td className="px-3 py-3">{fmtDate(p.expected_delivery_date)}</td>
                  <td className="px-3 py-3 text-right">{p.items_count || p.items?.length || '-'}</td>
                  <td className="px-3 py-3 text-right">₹{Number(p.total_amount).toFixed(2)}</td>
                  <td className="px-3 py-3 text-center"><WarehouseStatusBadge status={p.status} /></td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => openDetail(p.id)} className={`p-1.5 rounded ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><Eye size={16} /></button>
                      {p.status === 'Draft' && permissions?.warehouse_purchase_orders?.can_edit && <button onClick={() => openEdit(p)} className={`p-1.5 rounded ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><Edit size={16} /></button>}
                      {p.status === 'Draft' && permissions?.warehouse_purchase_orders?.can_submit && <button onClick={() => action(warehouseAPI.submitPurchaseOrder, p.id, "Submitted")} className={`p-1.5 rounded ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><Send size={16} /></button>}
                      {p.status === 'Submitted' && permissions?.warehouse_purchase_orders?.can_approve && <button onClick={() => action(warehouseAPI.approvePurchaseOrder, p.id, "Approved")} className={`p-1.5 rounded text-[#28C76F] ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><CheckCircle size={16} /></button>}
                      {p.status === 'Submitted' && permissions?.warehouse_purchase_orders?.can_reject && <button onClick={() => { const r = prompt("Rejection reason"); if (r) action(warehouseAPI.rejectPurchaseOrder, p.id, "Rejected", { rejection_reason: r }); }} className={`p-1.5 rounded text-[#EA5455] ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><XCircle size={16} /></button>}
                      {p.status === 'Approved' && permissions?.warehouse_purchase_orders?.can_edit && <button onClick={() => action(warehouseAPI.sendPurchaseOrder, p.id, "Sent")} title="Send to Supplier" className={`p-1.5 rounded ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><Send size={16} /></button>}
                      {['Approved','Sent','Partially Received'].includes(p.status) && permissions?.grn?.can_create && <button onClick={() => createGRN(p)} className={`p-1.5 rounded ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`} title="Create GRN"><ClipboardCheck size={16} /></button>}
                      {['Approved','Sent','Partially Received'].includes(p.status) && permissions?.warehouse_purchase_orders?.can_lock && <button onClick={() => { const r = prompt("Close reason"); if (r) action(warehouseAPI.closePurchaseOrder, p.id, "Closed", { close_reason: r }); }} title="Close PO" className={`p-1.5 rounded ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><Lock size={16} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>
      </SectionCard>

      {show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`sticky top-0 z-10 border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{form.id ? "Edit Purchase Order" : "New Purchase Order"}</h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div><label className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>PO Date *</label><input type="date" value={form.po_date} onChange={e => setForm({...form, po_date: e.target.value})} className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${inputClass}`} /></div>
                <div><label className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Supplier *</label><select value={form.supplier_id} onChange={e => setForm({...form, supplier_id: e.target.value})} className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">Select</option>{suppliers.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select></div>
                <div><label className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Expected Delivery</label><input type="date" value={form.expected_delivery_date} onChange={e => setForm({...form, expected_delivery_date: e.target.value})} className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${inputClass}`} /></div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div><label className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Payment Terms</label><input value={form.payment_terms} onChange={e => setForm({...form, payment_terms: e.target.value})} className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${inputClass}`} /></div>
                <div><label className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Reference</label><input value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${inputClass}`} /></div>
                <div><label className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Remarks</label><input value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${inputClass}`} /></div>
              </div>

              <div className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-medium">Items</h4>
                  <button onClick={addItem} className="text-[#7367F0] text-[13px]">+ Add Item</button>
                </div>
                <div className="space-y-2">
                  {form.items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-12 items-end border-b pb-2 last:border-0">
                      <div className="sm:col-span-3"><select value={it.raw_material_id} onChange={e => updateItem(idx, "raw_material_id", e.target.value)} className={`w-full rounded-md px-2 py-1.5 text-sm ${inputClass}`}><option value="">Material</option>{materials.filter(m => m.is_active).map(m => <option key={m.id} value={m.id}>{m.material_name}</option>)}</select></div>
                      <div className="sm:col-span-1"><input type="number" min="0" placeholder="Qty" value={it.ordered_qty} onChange={e => updateItem(idx, "ordered_qty", e.target.value)} className={`w-full rounded-md px-2 py-1.5 text-sm text-right ${inputClass}`} /></div>
                      <div className="sm:col-span-2"><select value={it.unit_id} onChange={e => updateItem(idx, "unit_id", e.target.value)} className={`w-full rounded-md px-2 py-1.5 text-sm ${inputClass}`}><option value="">UOM</option>{units.map(u => <option key={u.id} value={u.id}>{u.unit_name}</option>)}</select></div>
                      <div className="sm:col-span-2"><input type="number" min="0" placeholder="Rate" value={it.rate} onChange={e => updateItem(idx, "rate", e.target.value)} className={`w-full rounded-md px-2 py-1.5 text-sm text-right ${inputClass}`} /></div>
                      <div className="sm:col-span-1"><input type="number" min="0" placeholder="Disc" value={it.discount} onChange={e => updateItem(idx, "discount", e.target.value)} className={`w-full rounded-md px-2 py-1.5 text-sm text-right ${inputClass}`} /></div>
                      <div className="sm:col-span-1"><input type="number" min="0" placeholder="Tax" value={it.tax} onChange={e => updateItem(idx, "tax", e.target.value)} className={`w-full rounded-md px-2 py-1.5 text-sm text-right ${inputClass}`} /></div>
                      <div className="sm:col-span-2 flex items-center gap-2">
                        <label className="flex items-center gap-1 text-[12px] text-[#A5A8B6]"><input type="checkbox" checked={it.batch_required} onChange={e => updateItem(idx, "batch_required", e.target.checked ? 1 : 0)} className="h-3.5 w-3.5" /> Batch</label>
                        <label className="flex items-center gap-1 text-[12px] text-[#A5A8B6]"><input type="checkbox" checked={it.expiry_required} onChange={e => updateItem(idx, "expiry_required", e.target.checked ? 1 : 0)} className="h-3.5 w-3.5" /> Expiry</label>
                        {form.items.length > 1 && <button onClick={() => removeItem(idx)} className="text-[#EA5455] p-1"><Trash2 size={16} /></button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-4 text-[14px]">
                <div>Subtotal: <b>₹{totals.subtotal.toFixed(2)}</b></div>
                <div>Discount: <b>₹{totals.discount.toFixed(2)}</b></div>
                <div>Tax: <b>₹{totals.tax.toFixed(2)}</b></div>
                <div className="text-[#7367F0]">Total: <b>₹{totals.total.toFixed(2)}</b></div>
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setShow(false)} disabled={saving} className="h-10 rounded-lg border px-4 text-[14px] disabled:opacity-50">Cancel</button>
                <button onClick={save} disabled={saving} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8] disabled:opacity-50">{saving ? "Saving…" : "Save Draft"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`sticky top-0 z-10 flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{detail.po_no}</h3>
              <div className="flex gap-2">
                <button onClick={() => setPrint(detail)} className={`p-2 rounded ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`} title="Print"><Printer size={18} /></button>
                <button onClick={() => setDetail(null)} className="text-[#A5A8B6]">✕</button>
              </div>
            </div>
            <div className="p-4 space-y-3 text-[13px]">
              <p className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>
                Supplier: <b>{detail.supplier_name}</b> &bull; Warehouse: <b>{detail.location_name}</b> &bull; PO Date: <b>{fmtDate(detail.po_date)}</b><br/>
                Expected: <b>{fmtDate(detail.expected_delivery_date)}</b> &bull; Status: <WarehouseStatusBadge status={detail.status} /> &bull; Total: <b>₹{Number(detail.total_amount).toFixed(2)}</b>
              </p>
              <div className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                <table className="w-full border-collapse text-[13px]">
                  <thead><tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}><th className="text-left py-2">Material</th><th className="text-right py-2">Ordered</th><th className="text-right py-2">Rate</th><th className="text-right py-2">Value</th></tr></thead>
                  <tbody>
                    {detail.items.map(it => (
                      <tr key={it.id} className={`border-b last:border-0 ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                        <td className="py-2">{it.material_name}</td>
                        <td className="text-right py-2">{fmtQty(it.ordered_qty)} {it.unit_name}</td>
                        <td className="text-right py-2">₹{Number(it.rate).toFixed(2)}</td>
                        <td className="text-right py-2">₹{Number(it.line_value).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {detail.linked_grns?.length > 0 && (
                <div className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                  <h4 className="font-medium mb-2">Linked GRNs</h4>
                  <div className="space-y-1">
                    {detail.linked_grns.map(g => (
                      <div key={g.id} className="flex justify-between"><span>{g.grn_no}</span><span>{g.status} — ₹{Number(g.total_amount).toFixed(2)}</span></div>
                    ))}
                  </div>
                </div>
              )}
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
                        <tr><td className="pb-1 font-semibold">Invoice No.:</td><td className="pb-1 text-right">{print.po_no}</td></tr>
                        <tr><td className="pb-1 font-semibold">Dated:</td><td className="pb-1 text-right">{fmtDate(print.po_date)}</td></tr>
                        <tr><td className="font-semibold">Mode/Terms of Payment:</td><td className="text-right">{print.payment_terms || "-"}</td></tr>
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
                  const taxable = num(it.line_value) - num(it.tax);
                  return (
                    <tr key={it.id}>
                      <td className="border border-black p-1 text-center">{idx + 1}</td>
                      <td className="border border-black p-1">{it.material_name}</td>
                      <td className="border border-black p-1 text-center">{it.hsn_code || "-"}</td>
                      <td className="border border-black p-1 text-center">{it.gst_rate !== null && it.gst_rate !== undefined ? `${Number(it.gst_rate)} %` : "-"}</td>
                      <td className="border border-black p-1 text-right">{fmtQty(it.ordered_qty)} {it.unit_name}</td>
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

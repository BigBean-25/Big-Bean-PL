import { useEffect, useMemo, useState, useRef } from "react";
import { warehouseAPI, masterAPI, getStoredPermissions } from "../../services/api";
import ExcelJS from "exceljs";
import { SectionCard, TableWrapper, LoadingRows, EmptyState, PageHeader, getThemeMode, getInputClass, FilterBar } from "../../components/ui";
import { KpiCard, WarehouseStatusBadge, fmtQty, fmtDate } from "./WarehouseShared";
import { Search, RotateCcw, Plus, Eye, CheckCircle, XCircle, Truck, ClipboardCheck, Lock, DollarSign, Download, FileSpreadsheet, PackageX, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

const statusOptions = ["Draft", "Submitted", "Verified", "Approved", "Rejected", "Posted", "Locked"];
const reasons = ["Damaged Material","Quality Issue","Wrong Material Supplied","Excess Supply","Packaging Damage","Batch Recall","Supplier Rejection","Short Shelf Life","Expired - Supplier Accepted Return","Other"];

export default function PurchaseReturns({ locationId, isDark }) {
  const [loading, setLoading] = useState(true);
  const [returns, setReturns] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [grns, setGRNs] = useState([]);
  const [grnItems, setGRNItems] = useState([]);
  const [filters, setFilters] = useState({ search: "", status: "", supplier_id: "" });
  const [show, setShow] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ return_date: new Date().toISOString().split("T")[0], supplier_id: "", grn_id: "", supplier_credit_note_no: "", supplier_credit_note_date: "", return_reason: "", remarks: "", items: [] });
  const [creditSummary, setCreditSummary] = useState({ pending: 0, received: 0, reconciled: 0 });
  const [exporting, setExporting] = useState(false);
  const inputClass = getInputClass(isDark);
  const permissions = getStoredPermissions();
  const canCreate = Boolean(permissions?.warehouse_purchase_returns?.can_create);
  const canExport = Boolean(permissions?.warehouse_purchase_returns?.can_export);
  const fileInputRef = useRef(null);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const res = await warehouseAPI.getPurchaseReturns({ location_id: locationId, ...filters });
      setReturns(res?.data?.data || []);
    } catch { toast.error("Failed to load purchase returns"); }
    finally { setLoading(false); }
  };

  const fetchSuppliers = async () => {
    try { const res = await masterAPI.getSuppliers(); setSuppliers(res?.data?.data || res?.data || []); } catch {}
  };

  const loadGRNs = async (supplierId) => {
    try { const res = await warehouseAPI.getGRNsForReturn({ supplier_id: supplierId, location_id: locationId }); setGRNs(res?.data?.data || []); } catch {}
  };

  const loadGRNItems = async (grnId) => {
    try { const res = await warehouseAPI.getGRNItemsForReturn(grnId); setGRNItems(res?.data?.data || []); } catch {}
  };

  const fetchCreditSummary = async () => {
    try { const res = await warehouseAPI.getPurchaseReturnCreditsSummary(); setCreditSummary(res?.data?.data || { pending: 0, received: 0, reconciled: 0 }); } catch {}
  };

  useEffect(() => { if (locationId) { fetchReturns(); fetchSuppliers(); fetchCreditSummary(); } }, [locationId, filters]);

  useEffect(() => {
    if (form.supplier_id) loadGRNs(form.supplier_id);
    else setGRNs([]);
  }, [form.supplier_id]);

  useEffect(() => {
    if (form.grn_id) loadGRNItems(form.grn_id);
    else setGRNItems([]);
  }, [form.grn_id]);

  const updateItem = (idx, key, value) => {
    const items = [...form.items];
    items[idx][key] = value;
    setForm({ ...form, items });
  };

  const addItem = (gi) => {
    const exists = form.items.find(i => i.grn_item_id === gi.id);
    if (exists) return toast.error("Item already added");
    setForm({ ...form, items: [...form.items, { grn_item_id: gi.id, raw_material_id: gi.raw_material_id, batch_no: gi.batch_no || "", expiry_date: gi.expiry_date || "", return_qty: "", input_unit_id: gi.unit_id, original_purchase_rate: gi.rate, reason: "" }] });
  };

  const save = async (submit = false) => {
    try {
      const payload = { ...form, warehouse_location_id: locationId, items: form.items.map(i => ({ ...i, return_qty: Number(i.return_qty) })) };
      const created = await warehouseAPI.createPurchaseReturn(payload);
      if (submit) await warehouseAPI.submitPurchaseReturn(created?.data?.data?.id);
      toast.success(submit ? "Submitted" : "Saved");
      setShow(false);
      setForm({ return_date: new Date().toISOString().split("T")[0], supplier_id: "", grn_id: "", supplier_credit_note_no: "", supplier_credit_note_date: "", return_reason: "", remarks: "", items: [] });
      fetchReturns();
    } catch (error) { toast.error(error.response?.data?.message || "Save failed"); }
  };

  const action = async (apiFn, id, msg) => {
    try { await apiFn(id); toast.success(msg); fetchReturns(); if (detail) openDetail(detail); } catch (error) { toast.error(error.response?.data?.message || msg + " failed"); }
  };

  const updateCredit = async (newStatus) => {
    if (!detail?.supplier_credit_id) return;
    try { await warehouseAPI.updatePurchaseReturnCreditStatus(detail.supplier_credit_id, { status: newStatus }); toast.success("Credit status updated"); fetchReturns(); openDetail(detail); } catch (error) { toast.error(error.response?.data?.message || "Update failed"); }
  };

  const openDetail = async (r) => { try { const res = await warehouseAPI.getPurchaseReturn(r.id); setDetail(res?.data?.data); } catch {} };

  const exportToExcel = async () => {
    if (!returns.length) { toast.error("No data to export"); return; }
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Purchase Return Register");
      ws.columns = [
        { header: "Return No", key: "return_no", width: 14 },
        { header: "Return Date", key: "return_date", width: 14 },
        { header: "Supplier", key: "supplier_name", width: 22 },
        { header: "Source GRN", key: "grn_no", width: 16 },
        { header: "Supplier Invoice", key: "supplier_invoice_reference", width: 18 },
        { header: "Warehouse", key: "warehouse_name", width: 18 },
        { header: "Material Code", key: "material_code", width: 16 },
        { header: "Material", key: "material_name", width: 24 },
        { header: "Batch No", key: "batch_no", width: 14 },
        { header: "Expiry Date", key: "expiry_date", width: 14 },
        { header: "Return Qty", key: "return_qty", width: 12 },
        { header: "UOM", key: "uom", width: 10 },
        { header: "Supplier Rate", key: "supplier_rate", width: 14 },
        { header: "Supplier Credit Value", key: "supplier_credit_value", width: 18 },
        { header: "Inventory WAC", key: "inventory_unit_cost", width: 14 },
        { header: "Inventory Value", key: "inventory_value", width: 16 },
        { header: "Return Reason", key: "return_reason", width: 20 },
        { header: "Credit Note No", key: "supplier_credit_note_no", width: 16 },
        { header: "Credit Note Date", key: "supplier_credit_note_date", width: 16 },
        { header: "Credit Status", key: "credit_status", width: 14 },
        { header: "Workflow Status", key: "status", width: 14 },
        { header: "Created By", key: "created_by_name", width: 18 },
        { header: "Posted By", key: "posted_by_name", width: 18 },
        { header: "Posted Date", key: "posted_at", width: 16 },
      ];
      ws.getRow(1).font = { bold: true };
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
      ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
      const rows = [];
      const supplierMap = {};
      for (const r of returns) {
        if (!r.items?.length) {
          rows.push({
            return_no: r.return_no,
            return_date: r.return_date,
            supplier_name: r.supplier_name,
            grn_no: r.grn_no,
            supplier_invoice_reference: r.supplier_invoice_reference || "",
            warehouse_name: r.warehouse_name || "",
            material_code: "",
            material_name: "",
            batch_no: "",
            expiry_date: "",
            return_qty: 0,
            uom: "",
            supplier_rate: 0,
            supplier_credit_value: 0,
            inventory_unit_cost: 0,
            inventory_value: 0,
            return_reason: r.return_reason,
            supplier_credit_note_no: r.supplier_credit_note_no || "",
            supplier_credit_note_date: r.supplier_credit_note_date || "",
            credit_status: r.credit_status || "",
            status: r.status,
            created_by_name: r.created_by_name,
            posted_by_name: r.posted_by_name,
            posted_at: r.posted_at ? r.posted_at.slice(0,10) : "",
          });
          continue;
        }
        for (const it of r.items) {
          rows.push({
            return_no: r.return_no,
            return_date: r.return_date,
            supplier_name: r.supplier_name,
            grn_no: r.grn_no,
            supplier_invoice_reference: r.supplier_invoice_reference || "",
            warehouse_name: r.warehouse_name || "",
            material_code: it.material_code || "",
            material_name: it.material_name || "",
            batch_no: it.batch_no || "",
            expiry_date: it.expiry_date ? it.expiry_date.slice(0,10) : "",
            return_qty: Number(it.return_qty) || 0,
            uom: it.uom_name || "",
            supplier_rate: Number(it.original_purchase_rate) || 0,
            supplier_credit_value: Number(it.supplier_credit_value) || 0,
            inventory_unit_cost: Number(it.inventory_unit_cost) || 0,
            inventory_value: Number(it.inventory_value) || 0,
            return_reason: it.reason || r.return_reason,
            supplier_credit_note_no: r.supplier_credit_note_no || "",
            supplier_credit_note_date: r.supplier_credit_note_date || "",
            credit_status: r.credit_status || "",
            status: r.status,
            created_by_name: r.created_by_name,
            posted_by_name: r.posted_by_name,
            posted_at: r.posted_at ? r.posted_at.slice(0,10) : "",
          });
        }
        supplierMap[r.supplier_name] = (supplierMap[r.supplier_name] || 0) + (Number(r.total_return_value) || 0);
      }
      ws.addRows(rows);
      const numFmt = '"₹"#,##0.00';
      ["G", "N", "O", "P"].forEach(col => { ws.getColumn(col).numFmt = numFmt; });
      ws.getColumn("K").numFmt = "0.00";
      ["E", "S", "X"].forEach(col => { ws.getColumn(col).numFmt = "dd-mm-yyyy"; });

      const sum = wb.addWorksheet("Summary");
      sum.columns = [{ header: "Metric", key: "metric", width: 28 }, { header: "Value", key: "value", width: 24 }];
      sum.getRow(1).font = { bold: true };
      sum.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 2 } };
      sum.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
      const totalCredit = returns.reduce((s, r) => s + (Number(r.total_return_value) || 0), 0);
      const totalInventory = returns.reduce((s, r) => s + (Number(r.total_inventory_value) || 0), 0);
      const summaryRows = [
        { metric: "Total Purchase Returns", value: returns.length },
        { metric: "Total Supplier Credit Value", value: totalCredit },
        { metric: "Total Inventory Return Value", value: totalInventory },
        { metric: "Pending Credits", value: creditSummary.pending },
        { metric: "Received Credits", value: creditSummary.received },
        { metric: "Reconciled Credits", value: creditSummary.reconciled },
      ];
      Object.entries(supplierMap).forEach(([name, val]) => summaryRows.push({ metric: `Supplier: ${name}`, value: val }));
      sum.addRows(summaryRows);
      sum.getColumn("B").numFmt = numFmt;

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BigBean_Purchase_Returns_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  const kpis = useMemo(() => ({
    thisMonth: returns.filter(r => r.return_date?.startsWith(new Date().toISOString().slice(0,7))).length,
    value: returns.reduce((s, r) => s + (Number(r.total_return_value) || 0), 0),
    pendingVerify: returns.filter(r => r.status === "Submitted").length,
    pendingApprove: returns.filter(r => r.status === "Verified").length,
    pendingCredit: creditSummary.pending,
  }), [returns, creditSummary]);

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden pt-1">
      <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>
        <div>
          <h2 className="text-[22px] font-bold leading-tight">Purchase Returns</h2>
          <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Manage supplier material returns, stock reversals and supplier credits.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExport && (
            <button onClick={exportToExcel} disabled={exporting} className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6] hover:bg-[#3B405A]" : "border-[#EBE9F1] bg-white text-[#2F2B3D] hover:bg-[#F3F2F7]"}`}>
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Export Excel
            </button>
          )}
          {canCreate && (
            <button onClick={() => { setShow(true); setDetail(null); }} className="inline-flex items-center gap-2 rounded-md bg-[#7367F0] px-4 py-2 text-sm font-medium text-white hover:bg-[#5E50EE]">
              <Plus size={16} /> New Purchase Return
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={Truck} label="Returns This Month" value={kpis.thisMonth} isDark={isDark} />
        <KpiCard icon={DollarSign} label="Return Value" value={`₹${kpis.value.toFixed(2)}`} isDark={isDark} />
        <KpiCard icon={ClipboardCheck} label="Pending Verification" value={kpis.pendingVerify} isDark={isDark} />
        <KpiCard icon={CheckCircle} label="Pending Approval" value={kpis.pendingApprove} isDark={isDark} />
        <KpiCard icon={Lock} label="Pending Credits" value={kpis.pendingCredit} isDark={isDark} />
      </div>

      <FilterBar isDark={isDark} title="Filters">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8AAAE]" /><input value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} placeholder="Search return / GRN" className={`w-full rounded-md py-2 pl-9 pr-3 text-sm ${inputClass}`} /></div>
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
                <th className="px-3 py-3">Return No</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Supplier</th>
                <th className="px-3 py-3">GRN</th><th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3 text-right">Value</th>
                <th className="px-3 py-3">Credit Note</th><th className="px-3 py-3 text-center">Status</th><th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRows rows={5} cols={9} isDark={isDark} /> : returns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10">
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className={`flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-[#3B405A] text-[#A5A8B6]" : "bg-[#F3F2F7] text-[#6F6B7D]"}`}>
                        <PackageX size={26} />
                      </div>
                      <h4 className={`mt-3 text-[16px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>No purchase returns found</h4>
                      <p className={`mt-1 max-w-xs text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Create a purchase return when material needs to be returned to a supplier.</p>
                      {canCreate && (
                        <button onClick={() => { setShow(true); setDetail(null); }} className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#7367F0] px-4 py-2 text-sm font-medium text-white hover:bg-[#5E50EE]">
                          <Plus size={16} /> New Purchase Return
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                returns.map(r => (
                  <tr key={r.id} className={`border-b transition ${isDark ? "border-[#3B405A] hover:bg-[#3B405A]/30" : "border-[#F3F2F7] hover:bg-[#F8F7FA]"}`}>
                    <td className="px-3 py-2.5 font-medium">{r.return_no}</td>
                    <td className="px-3 py-2.5">{fmtDate(r.return_date)}</td>
                    <td className="px-3 py-2.5">{r.supplier_name}</td>
                    <td className="px-3 py-2.5">{r.grn_no}</td>
                    <td className="px-3 py-2.5 text-right">{fmtQty(r.total_return_qty)}</td>
                    <td className="px-3 py-2.5 text-right">₹{Number(r.total_return_value).toFixed(2)}</td>
                    <td className="px-3 py-2.5">{r.supplier_credit_note_no || "—"}</td>
                    <td className="px-3 py-2.5 text-center"><WarehouseStatusBadge status={r.status} /></td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => openDetail(r)} className={`rounded-md p-1.5 ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><Eye size={16} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrapper>
      </SectionCard>

      {show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">New Purchase Return</h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input type="date" value={form.return_date} onChange={e => setForm({...form, return_date: e.target.value})} className={`rounded-md px-3 py-2 text-sm ${inputClass}`} />
                <select value={form.supplier_id} onChange={e => setForm({...form, supplier_id: e.target.value, grn_id: "", items: []})} className={`rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">Select Supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select>
                <select value={form.grn_id} onChange={e => setForm({...form, grn_id: e.target.value, items: []})} className={`rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">Select GRN</option>{grns.map(g => <option key={g.id} value={g.id}>{g.grn_no}</option>)}</select>
                <select value={form.return_reason} onChange={e => setForm({...form, return_reason: e.target.value})} className={`rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">Select Reason</option>{reasons.map(r => <option key={r} value={r}>{r}</option>)}</select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input value={form.supplier_credit_note_no} onChange={e => setForm({...form, supplier_credit_note_no: e.target.value})} placeholder="Credit Note No" className={`rounded-md px-3 py-2 text-sm ${inputClass}`} />
                <input type="date" value={form.supplier_credit_note_date} onChange={e => setForm({...form, supplier_credit_note_date: e.target.value})} className={`rounded-md px-3 py-2 text-sm ${inputClass}`} />
                <input value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} placeholder="Remarks" className={`rounded-md px-3 py-2 text-sm ${inputClass}`} />
              </div>

              {grnItems.length > 0 && (
                <SectionCard isDark={isDark} title="GRN Items">
                  <TableWrapper isDark={isDark}>
                    <table className="w-full border-collapse text-[13px]">
                      <thead className={`${isDark ? "bg-[#2F3349]" : "bg-white"}`}><tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}><th className="px-2 py-2">Material</th><th className="px-2 py-2 text-right">Accepted</th><th className="px-2 py-2 text-right">Returnable</th><th className="px-2 py-2">Batch</th><th className="px-2 py-2">Add</th></tr></thead>
                      <tbody>{grnItems.map(gi => (
                        <tr key={gi.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                          <td className="px-2 py-2">{gi.material_name}</td>
                          <td className="px-2 py-2 text-right">{fmtQty(gi.accepted_qty)} {gi.unit_name}</td>
                          <td className="px-2 py-2 text-right">{fmtQty(gi.returnable_qty)} {gi.base_unit_name}</td>
                          <td className="px-2 py-2 text-xs font-mono">{gi.batch_no || "—"}</td>
                          <td className="px-2 py-2"><button onClick={() => addItem(gi)} className="rounded-md bg-[#7367F0] px-2 py-1 text-xs text-white">+</button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </TableWrapper>
                </SectionCard>
              )}

              {form.items.length > 0 && (
                <SectionCard isDark={isDark} title="Return Items">
                  <TableWrapper isDark={isDark}>
                    <table className="w-full border-collapse text-[13px]">
                      <thead className={`${isDark ? "bg-[#2F3349]" : "bg-white"}`}><tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}><th className="px-2 py-2">Material</th><th className="px-2 py-2 text-right">Return Qty</th><th className="px-2 py-2">Reason</th><th className="px-2 py-2">Batch</th><th className="px-2 py-2"></th></tr></thead>
                      <tbody>{form.items.map((it, idx) => (
                        <tr key={it.grn_item_id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                          <td className="px-2 py-2">{grnItems.find(g => g.id === it.grn_item_id)?.material_name}</td>
                          <td className="px-2 py-2 text-right"><input type="number" value={it.return_qty} onChange={e => updateItem(idx, "return_qty", e.target.value)} className={`w-24 rounded-md border px-2 py-1 text-right ${inputClass}`} /></td>
                          <td className="px-2 py-2"><select value={it.reason} onChange={e => updateItem(idx, "reason", e.target.value)} className={`w-full rounded-md px-2 py-1 text-sm ${inputClass}`}><option value="">Reason</option>{reasons.map(r => <option key={r} value={r}>{r}</option>)}</select></td>
                          <td className="px-2 py-2 text-xs font-mono">{it.batch_no}</td>
                          <td className="px-2 py-2"><button onClick={() => { const items = form.items.filter((_, i) => i !== idx); setForm({...form, items}); }} className="text-[#EA5455]"><XCircle size={16} /></button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </TableWrapper>
                </SectionCard>
              )}

              <div className="flex justify-end gap-2">
                <button onClick={() => setShow(false)} className="h-10 rounded-lg border px-4 text-[14px]">Cancel</button>
                <button onClick={() => save(false)} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8]">Save Draft</button>
                <button onClick={() => save(true)} className="h-10 rounded-lg bg-[#28C76F] px-4 text-[14px] font-semibold text-white hover:bg-[#24B364]">Save & Submit</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-2xl rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{detail.return_no}</h3>
            </div>
            <div className="p-4 space-y-3">
              <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Supplier: <b>{detail.supplier_name}</b> &bull; GRN: <b>{detail.grn_no}</b> &bull; Date: <b>{fmtDate(detail.return_date)}</b></p>
              <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Status: <WarehouseStatusBadge status={detail.status} /> &bull; Qty: <b>{fmtQty(detail.total_return_qty)}</b> &bull; Inventory Value: <b>₹{Number(detail.total_return_value).toFixed(2)}</b> &bull; Supplier Credit: <b>₹{Number(detail.credit_amount).toFixed(2)}</b></p>
              <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Credit Note: <b>{detail.supplier_credit_note_no || "—"}</b></p>
              {detail.status === "Posted" && (
                <div className={`flex items-center gap-2 text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>
                  <span>Credit Status:</span>
                  <select value={detail.credit_status || "Pending"} onChange={e => updateCredit(e.target.value)} disabled={!permissions?.warehouse_purchase_returns?.can_edit} className={`rounded-md px-2 py-1 text-sm ${inputClass}`}>
                    <option value="Pending">Pending</option>
                    <option value="Received">Received</option>
                    <option value="Reconciled">Reconciled</option>
                  </select>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                {detail.status === "Draft" && <button onClick={() => action(warehouseAPI.submitPurchaseReturn, detail.id, "Submitted")} className="h-10 rounded-lg bg-[#00CFE8] px-4 text-[14px] font-semibold text-white">Submit</button>}
                {detail.status === "Submitted" && <button onClick={() => action(warehouseAPI.verifyPurchaseReturn, detail.id, "Verified")} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white">Verify</button>}
                {detail.status === "Verified" && <button onClick={() => action(warehouseAPI.approvePurchaseReturn, detail.id, "Approved")} className="h-10 rounded-lg bg-[#28C76F] px-4 text-[14px] font-semibold text-white">Approve</button>}
                {detail.status === "Approved" && <button onClick={() => action(warehouseAPI.postPurchaseReturn, detail.id, "Posted")} className="h-10 rounded-lg bg-[#FF9F43] px-4 text-[14px] font-semibold text-white">Post</button>}
                {detail.status === "Posted" && <button onClick={() => action(warehouseAPI.lockPurchaseReturn, detail.id, "Locked")} className="h-10 rounded-lg bg-[#6F6B7D] px-4 text-[14px] font-semibold text-white">Lock</button>}
                <button onClick={() => setDetail(null)} className="h-10 rounded-lg border px-4 text-[14px]">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

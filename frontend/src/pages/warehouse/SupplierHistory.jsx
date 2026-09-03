import { useEffect, useState } from "react";
import { warehouseAPI, getStoredPermissions } from "../../services/api";
import { SectionCard, TableWrapper, LoadingRows, EmptyState, PageHeader, FilterBar } from "../../components/ui";
import { KpiCard, fmtQty, fmtDate } from "./WarehouseShared";
import { getInputClass } from "../../components/ui";
import { Search, RotateCcw, Download, TrendingUp, Eye, Package, FileText, Truck, DollarSign } from "lucide-react";
import toast from "react-hot-toast";
import ExcelJS from "exceljs";

const docTypes = ['All', 'Warehouse Purchase Order', 'Goods Receipt', 'Purchase Return', 'Supplier Credit', 'Supplier Payment'];

const num = v => v === null || v === undefined || v === '' ? 0 : Number(v);

export default function SupplierHistory({ locationId, materials, suppliers, isDark }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('summary');
  const [exporting, setExporting] = useState(false);
  const permissions = getStoredPermissions();
  const inputClass = getInputClass(isDark);
  const [filters, setFilters] = useState({
    search: "", supplier_id: "", material_id: "", from: "", to: "", document_type: "",
  });

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await warehouseAPI.getSupplierHistory({
        location_id: locationId,
        supplier_id: filters.supplier_id || undefined,
        material_id: filters.material_id || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        document_type: filters.document_type === 'All' ? '' : filters.document_type,
        search: filters.search || undefined,
      });
      setData(res?.data?.data || []);
    } catch (error) { toast.error("Failed to load supplier history"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [locationId, filters]);

  const viewDetail = async (s) => {
    try {
      const [det, mats, prices, timeline] = await Promise.all([
        warehouseAPI.getSupplierHistoryDetail(s.id, { location_id: locationId }),
        warehouseAPI.getSupplierHistoryMaterials(s.id, { location_id: locationId }),
        warehouseAPI.getSupplierHistoryPriceMovement(s.id, { location_id: locationId }),
        warehouseAPI.getSupplierHistoryTimeline(s.id, { location_id: locationId }),
      ]);
      setDetail({
        ...s,
        ...det.data.data,
        materials: mats.data.data,
        price_movement: prices.data.data,
        timeline: timeline.data.data,
      });
      setDetailTab('summary');
    } catch (error) { toast.error("Failed to load supplier detail"); }
  };

  const kpi = {
    totalPurchase: data.reduce((s, r) => s + num(r.po_value), 0),
    totalGRN: data.reduce((s, r) => s + num(r.grn_value), 0),
    totalReturns: data.reduce((s, r) => s + num(r.return_credit), 0),
    totalPayments: data.reduce((s, r) => s + num(r.payments), 0),
    totalOutstanding: data.reduce((s, r) => s + num(r.outstanding), 0),
    activeSuppliers: data.length,
  };

  const exportToExcel = async () => {
    if (!data.length) { toast.error("No data to export"); return; }
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const addSheet = (name, headers, rows) => {
        const ws = wb.addWorksheet(name);
        ws.addRow(headers);
        ws.getRow(1).font = { bold: true };
        ws.getRow(1).freeze = true;
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
        rows.forEach(r => ws.addRow(r));
        ws.columns = headers.map((h, i) => ({ width: Math.max(14, (rows[0]?.[i]?.toString().length || 0) + 4) }));
      };

      addSheet("Supplier Summary",
        ["Supplier Code", "Supplier Name", "PO Value", "GRN Value", "Return Credit", "Payments", "Outstanding", "Materials Supplied", "Last Purchase"],
        data.map(d => [d.supplier_code, d.supplier_name, d.po_value, d.grn_value, d.return_credit, d.payments, d.outstanding, d.materials_supplied, fmtDate(d.last_purchase_date)])
      );

      const poRows = [], grnRows = [], returnRows = [];
      for (const s of data) {
        if (!s.detail) {
          const res = await warehouseAPI.getSupplierHistoryDetail(s.id, { location_id: locationId });
          s.detail = res?.data?.data;
        }
        (s.detail?.po_history || []).forEach(p => poRows.push([s.supplier_code, p.po_no, fmtDate(p.po_date), p.status, p.total_amount, p.location_name, p.expected_delivery_date]));
        (s.detail?.grn_history || []).forEach(g => grnRows.push([s.supplier_code, g.grn_no, fmtDate(g.grn_date), g.total_amount, g.purchase_reference, g.invoice_reference, g.location_name]));
        (s.detail?.return_history || []).forEach(r => returnRows.push([s.supplier_code, r.return_no, fmtDate(r.return_date), r.total_amount, r.credit_note_no, r.credit_status]));
      }
      addSheet("PO History", ["Supplier Code", "PO No", "PO Date", "Status", "Total", "Warehouse", "Expected"], poRows);
      addSheet("GRN History", ["Supplier Code", "GRN No", "GRN Date", "Total", "PO Ref", "Invoice", "Warehouse"], grnRows);
      addSheet("Purchase Returns", ["Supplier Code", "Return No", "Date", "Total", "Credit Note", "Credit Status"], returnRows);

      const matRows = [];
      for (const s of data) {
        const res = await warehouseAPI.getSupplierHistoryMaterials(s.id, { location_id: locationId });
        (res?.data?.data || []).forEach(m => matRows.push([s.supplier_code, m.material_code, m.material_name, m.unit_name, fmtDate(m.last_purchase_date), m.last_supplier_rate, m.average_rate, m.lowest_rate, m.highest_rate, m.total_qty_purchased, m.total_purchase_value]));
      }
      addSheet("Material History", ["Supplier Code", "Material Code", "Material", "Unit", "Last Purchase", "Last Rate", "Avg Rate", "Low", "High", "Qty", "Value"], matRows);

      const priceRows = [];
      for (const s of data) {
        const res = await warehouseAPI.getSupplierHistoryPriceMovement(s.id, { location_id: locationId });
        (res?.data?.data || []).forEach(p => priceRows.push([s.supplier_code, fmtDate(p.grn_date), p.grn_no, p.invoice_reference, p.material_name, p.unit_name, p.po_rate, p.actual_rate, p.accepted_qty, p.change, p.change_pct]));
      }
      addSheet("Price Movement", ["Supplier Code", "Date", "GRN", "Invoice", "Material", "Unit", "PO Rate", "Actual Rate", "Qty", "Change", "Change %"], priceRows);

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BigBean_Supplier_Purchase_History_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export complete");
    } catch (error) { toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <PageHeader
        title="Supplier Purchase History"
        subtitle="Review supplier purchases, receipts, returns, payments and material price movement."
        actions={
          <div className="flex flex-wrap gap-2">
            {permissions?.warehouse_supplier_history?.can_export && (
              <button onClick={exportToExcel} disabled={exporting} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[14px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]"}`}>
                <Download size={16} /> {exporting ? "Exporting..." : "Export"}
              </button>
            )}
          </div>
        }
        isDark={isDark}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <KpiCard icon={DollarSign} label="Total PO Value" value={`₹${kpi.totalPurchase.toFixed(2)}`} isDark={isDark} />
        <KpiCard icon={Package} label="Total GRN Value" value={`₹${kpi.totalGRN.toFixed(2)}`} isDark={isDark} />
        <KpiCard icon={Truck} label="Return Credits" value={`₹${kpi.totalReturns.toFixed(2)}`} isDark={isDark} />
        <KpiCard icon={DollarSign} label="Supplier Payments" value={`₹${kpi.totalPayments.toFixed(2)}`} isDark={isDark} />
        <KpiCard icon={TrendingUp} label="Current Outstanding" value={`₹${kpi.totalOutstanding.toFixed(2)}`} isDark={isDark} />
        <KpiCard icon={FileText} label="Active Suppliers" value={kpi.activeSuppliers} isDark={isDark} />
      </div>

      <FilterBar isDark={isDark} title="Filters">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8AAAE]" /><input value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} placeholder="Search supplier" className={`w-full rounded-md py-2 pl-9 pr-3 text-sm ${inputClass}`} /></div>
          <select value={filters.supplier_id} onChange={e => setFilters({...filters, supplier_id: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">All Suppliers</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select>
          <select value={filters.material_id} onChange={e => setFilters({...filters, material_id: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">All Materials</option>{materials.map(m => <option key={m.id} value={m.id}>{m.material_name}</option>)}</select>
          <input type="date" value={filters.from} onChange={e => setFilters({...filters, from: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`} placeholder="From" />
          <input type="date" value={filters.to} onChange={e => setFilters({...filters, to: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`} placeholder="To" />
          <select value={filters.document_type} onChange={e => setFilters({...filters, document_type: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">All Docs</option>{docTypes.map(d => <option key={d} value={d}>{d}</option>)}</select>
        </div>
      </FilterBar>

      <SectionCard isDark={isDark}>
        <TableWrapper isDark={isDark}>
          <table className="w-full border-collapse text-[13px]">
            <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
              <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                <th className="px-3 py-3">Code</th>
                <th className="px-3 py-3">Supplier</th>
                <th className="px-3 py-3 text-right">PO Value</th>
                <th className="px-3 py-3 text-right">GRN Value</th>
                <th className="px-3 py-3 text-right">Return Credit</th>
                <th className="px-3 py-3 text-right">Payments</th>
                <th className="px-3 py-3 text-right">Outstanding</th>
                <th className="px-3 py-3 text-center">Materials</th>
                <th className="px-3 py-3">Last Purchase</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRows rows={5} cols={10} isDark={isDark} /> : data.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-10"><EmptyState isDark={isDark} message="No supplier history found" subMessage="Select filters to view supplier purchase history" /></td></tr>
              ) : data.map(s => (
                <tr key={s.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                  <td className="px-3 py-3">{s.supplier_code}</td>
                  <td className="px-3 py-3 font-medium">{s.supplier_name}</td>
                  <td className="px-3 py-3 text-right">₹{num(s.po_value).toFixed(2)}</td>
                  <td className="px-3 py-3 text-right">₹{num(s.grn_value).toFixed(2)}</td>
                  <td className="px-3 py-3 text-right">₹{num(s.return_credit).toFixed(2)}</td>
                  <td className="px-3 py-3 text-right">₹{num(s.payments).toFixed(2)}</td>
                  <td className="px-3 py-3 text-right">
                    {s.outstanding_unavailable
                      ? <span className="text-amber-500" title="Outstanding balance could not be calculated">— unavailable</span>
                      : `₹${num(s.outstanding).toFixed(2)}`}
                  </td>
                  <td className="px-3 py-3 text-center">{s.materials_supplied}</td>
                  <td className="px-3 py-3">{fmtDate(s.last_purchase_date)}</td>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => viewDetail(s)} className={`p-1.5 rounded ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><Eye size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>
      </SectionCard>

      {detail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`sticky top-0 z-10 flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{detail.supplier_name}</h3>
              <button onClick={() => setDetail(null)} className="text-[#A5A8B6]">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div className={`mb-2 flex gap-1 rounded-lg border p-1 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                {['summary','po','grn','returns','credits','payments','materials','price','timeline'].map(t => (
                  <button key={t} onClick={() => setDetailTab(t)} className={`rounded-md px-3 py-1.5 text-[12px] ${detailTab === t ? 'bg-[#7367F0] text-white' : (isDark ? 'text-[#A5A8B6]' : 'text-[#6F6B7D]')}`}>{t[0].toUpperCase() + t.slice(1)}</button>
                ))}
              </div>

              {detailTab === 'summary' && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-[13px]">
                  <div className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}><div>PO Value</div><div className="font-semibold">₹{num(detail.summary?.po_value).toFixed(2)}</div></div>
                  <div className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}><div>GRN Value</div><div className="font-semibold">₹{num(detail.summary?.grn_value).toFixed(2)}</div></div>
                  <div className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}><div>Return Credit</div><div className="font-semibold">₹{num(detail.summary?.return_credit).toFixed(2)}</div></div>
                  <div className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}><div>Payments</div><div className="font-semibold">₹{num(detail.summary?.payments).toFixed(2)}</div></div>
                  <div className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}><div>Outstanding</div><div className="font-semibold">{detail.summary?.outstanding_unavailable ? <span className="text-amber-500" title="Outstanding balance could not be calculated">— unavailable</span> : `₹${num(detail.summary?.outstanding).toFixed(2)}`}</div></div>
                </div>
              )}

              {['po','grn','returns','credits','payments'].includes(detailTab) && (
                <SectionCard isDark={isDark}>
                  <TableWrapper isDark={isDark}>
                    <table className="w-full border-collapse text-[13px]">
                      <thead><tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                        {detailTab === 'po' && <><th className="text-left py-2">PO No</th><th>Date</th><th>Status</th><th className="text-right">Total</th><th>Warehouse</th></>}
                        {detailTab === 'grn' && <><th className="text-left py-2">GRN No</th><th>Date</th><th className="text-right">Total</th><th>Invoice</th><th>Warehouse</th></>}
                        {detailTab === 'returns' && <><th className="text-left py-2">Return No</th><th>Date</th><th className="text-right">Total</th><th>Credit Note</th><th>Credit Status</th></>}
                        {detailTab === 'credits' && <><th className="text-left py-2">Credit Note</th><th>Return No</th><th className="text-right">Amount</th><th>Status</th></>}
                        {detailTab === 'payments' && <><th className="text-left py-2">Payment No</th><th>Date</th><th className="text-right">Paid</th><th>Mode</th></>}
                      </tr></thead>
                      <tbody>
                        {(detail[detailTab === 'po' ? 'po_history' : detailTab === 'grn' ? 'grn_history' : detailTab === 'returns' ? 'return_history' : detailTab === 'credits' ? 'credit_history' : 'payment_history'] || []).map((r, i) => (
                          <tr key={i} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                            {detailTab === 'po' && <><td className="py-2">{r.po_no}</td><td>{fmtDate(r.po_date)}</td><td>{r.status}</td><td className="text-right">₹{num(r.total_amount).toFixed(2)}</td><td>{r.location_name}</td></>}
                            {detailTab === 'grn' && <><td className="py-2">{r.grn_no}</td><td>{fmtDate(r.grn_date)}</td><td className="text-right">₹{num(r.total_amount).toFixed(2)}</td><td>{r.invoice_reference}</td><td>{r.location_name}</td></>}
                            {detailTab === 'returns' && <><td className="py-2">{r.return_no}</td><td>{fmtDate(r.return_date)}</td><td className="text-right">₹{num(r.total_amount).toFixed(2)}</td><td>{r.credit_note_no}</td><td>{r.credit_status}</td></>}
                            {detailTab === 'credits' && <><td className="py-2">{r.credit_note_no}</td><td>{r.return_no}</td><td className="text-right">₹{num(r.credit_amount).toFixed(2)}</td><td>{r.credit_status}</td></>}
                            {detailTab === 'payments' && <><td className="py-2">{r.payment_no}</td><td>{fmtDate(r.date)}</td><td className="text-right">₹{num(r.paid_amount).toFixed(2)}</td><td>{r.payment_mode}</td></>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrapper>
                </SectionCard>
              )}

              {detailTab === 'materials' && (
                <SectionCard isDark={isDark}>
                  <TableWrapper isDark={isDark}>
                    <table className="w-full border-collapse text-[13px]">
                      <thead><tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}><th className="text-left py-2">Material</th><th>Unit</th><th className="text-right">Last Rate</th><th className="text-right">Avg Rate</th><th className="text-right">Low</th><th className="text-right">High</th><th className="text-right">Total Qty</th><th className="text-right">Value</th></tr></thead>
                      <tbody>
                        {(detail.materials || []).map(m => (
                          <tr key={m.material_id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                            <td className="py-2">{m.material_name}</td>
                            <td>{m.unit_name}</td>
                            <td className="text-right">₹{num(m.last_supplier_rate).toFixed(2)}</td>
                            <td className="text-right">₹{num(m.average_rate).toFixed(2)}</td>
                            <td className="text-right">₹{num(m.lowest_rate).toFixed(2)}</td>
                            <td className="text-right">₹{num(m.highest_rate).toFixed(2)}</td>
                            <td className="text-right">{fmtQty(m.total_qty_purchased)}</td>
                            <td className="text-right">₹{num(m.total_purchase_value).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrapper>
                </SectionCard>
              )}

              {detailTab === 'price' && (
                <SectionCard isDark={isDark}>
                  <TableWrapper isDark={isDark}>
                    <table className="w-full border-collapse text-[13px]">
                      <thead><tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}><th className="text-left py-2">Date</th><th>GRN</th><th>Invoice</th><th>Material</th><th className="text-right">PO Rate</th><th className="text-right">Actual Rate</th><th className="text-right">Qty</th><th className="text-right">Change</th><th className="text-right">%</th></tr></thead>
                      <tbody>
                        {(detail.price_movement || []).map((p, i) => (
                          <tr key={i} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                            <td className="py-2">{fmtDate(p.grn_date)}</td>
                            <td>{p.grn_no}</td>
                            <td>{p.invoice_reference}</td>
                            <td>{p.material_name}</td>
                            <td className="text-right">₹{num(p.po_rate).toFixed(2)}</td>
                            <td className="text-right">₹{num(p.actual_rate).toFixed(2)}</td>
                            <td className="text-right">{fmtQty(p.accepted_qty)}</td>
                            <td className="text-right">{p.change !== null ? `₹${num(p.change).toFixed(2)}` : '-'}</td>
                            <td className="text-right">{p.change_pct !== null ? `${p.change_pct}%` : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrapper>
                </SectionCard>
              )}

              {detailTab === 'timeline' && (
                <SectionCard isDark={isDark}>
                  <div className="space-y-2 text-[13px]">
                    {(detail.timeline || []).map((t, i) => (
                      <div key={i} className={`flex justify-between border-b py-2 ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                        <span>{fmtDate(t.po_date)}</span>
                        <span className="font-medium">{t.event}</span>
                        <span>{t.po_no} ({t.status})</span>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

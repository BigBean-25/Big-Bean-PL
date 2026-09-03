import { useEffect, useState } from "react";
import { warehouseAPI, getStoredPermissions } from "../../services/api";
import { SectionCard, TableWrapper, LoadingRows, EmptyState, PageHeader } from "../../components/ui";
import { KpiCard, fmtQty, fmtDate } from "./WarehouseShared";
import { getInputClass } from "../../components/ui";
import { Package, BookOpen, Truck, SlidersHorizontal, AlertTriangle, Trash2, ArrowRightLeft, ClipboardList, Download, Printer, RotateCcw, BarChart3, Receipt } from "lucide-react";
import toast from "react-hot-toast";
import ExcelJS from "exceljs";

const num = v => v === null || v === undefined || v === '' ? 0 : Number(v);
const fmtCurrency = v => `₹${num(v).toFixed(2)}`;

const groups = [
  {
    label: "Inventory",
    icon: Package,
    reports: [
      { key: "current-stock", label: "Current Stock" },
      { key: "ledger", label: "Stock Ledger" },
      { key: "valuation", label: "Stock Valuation" },
      { key: "ageing", label: "Stock Ageing" },
      { key: "batch", label: "Batch" },
      { key: "expiry", label: "Expiry" },
      { key: "low-stock", label: "Low Stock" },
      { key: "out-of-stock", label: "Out of Stock" },
      { key: "closing", label: "Closing Stock" },
    ],
  },
  {
    label: "Procurement",
    icon: Truck,
    reports: [
      { key: "grn", label: "Goods Receipt" },
      { key: "supplier-receipt", label: "Supplier Receipt" },
      { key: "purchase-return", label: "Purchase Return" },
    ],
  },
  {
    label: "Transfers",
    icon: ArrowRightLeft,
    reports: [
      { key: "requisition", label: "Outlet Purchase Order" },
      { key: "pending-requisition", label: "Pending Outlet Purchase Order" },
      { key: "dispatch", label: "Dispatch" },
      { key: "transit", label: "Transit" },
      { key: "receipt", label: "Receipt" },
      { key: "damage", label: "Damage" },
      { key: "short", label: "Short" },
    ],
  },
  {
    label: "Controls",
    icon: SlidersHorizontal,
    reports: [
      { key: "physical-count", label: "Physical Stock Count" },
      { key: "variance", label: "Stock Variance" },
      { key: "adjustment", label: "Stock Adjustments" },
    ],
  },
  {
    label: "Loss",
    icon: Trash2,
    reports: [
      { key: "wastage", label: "Wastage" },
    ],
  },
  {
    label: "Management",
    icon: BarChart3,
    reports: [
      { key: "movement", label: "Material Movement" },
      { key: "trend", label: "Movement Trend" },
    ],
  },
  {
    label: "Tax / GST",
    icon: Receipt,
    reports: [
      { key: "gstr3b", label: "GSTR-3B (ITC Summary)" },
      { key: "purchase-return-gst", label: "Purchase Return GST" },
    ],
  },
];

const STRUCTURED_REPORTS = ["gstr3b", "purchase-return-gst"];

export default function WarehouseReports({ locationId, materials, suppliers, categories, isDark }) {
  const [summary, setSummary] = useState(null);
  const [active, setActive] = useState("");
  const [data, setData] = useState([]);
  const [structuredData, setStructuredData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [packLoading, setPackLoading] = useState(false);
  const permissions = getStoredPermissions();
  const inputClass = getInputClass(isDark);
  const [filters, setFilters] = useState({
    from_date: "", to_date: "", material_id: "", supplier_id: "", category_id: "", status: "",
  });

  useEffect(() => {
    warehouseAPI.getWarehouseReportSummary(locationId).then(res => setSummary(res?.data?.data));
  }, [locationId]);

  const loadReport = async (key) => {
    if (STRUCTURED_REPORTS.includes(key) && (!filters.from_date || !filters.to_date)) {
      toast.error("Select a From and To date first");
      setActive(key);
      return;
    }
    setActive(key);
    setLoading(true);
    try {
      const res = await warehouseAPI.getWarehouseReport(key, {
        location_id: locationId,
        from_date: filters.from_date || undefined,
        to_date: filters.to_date || undefined,
        material_id: filters.material_id || undefined,
        supplier_id: filters.supplier_id || undefined,
        category_id: filters.category_id || undefined,
        status: filters.status || undefined,
      });
      if (STRUCTURED_REPORTS.includes(key)) {
        setStructuredData(res?.data?.data || null);
        setData([]);
      } else {
        setData(res?.data?.data || []);
        setStructuredData(null);
      }
    } catch (error) { toast.error(error.response?.data?.message || "Failed to load report"); }
    finally { setLoading(false); }
  };

  const exportToExcel = async () => {
    if (!data.length) { toast.error("No data to export"); return; }
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(active);
      if (!data.length) { toast.error("No data"); return; }
      const headers = Object.keys(data[0]);
      ws.addRow(headers);
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).freeze = true;
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
      data.forEach(r => ws.addRow(headers.map(h => r[h])));
      ws.columns = headers.map(h => ({ width: Math.max(12, h.length + 3) }));
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BigBean_${active}_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export complete");
    } catch (error) { toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  const printReport = () => window.print();

  const exportPack = async () => {
    if (!permissions?.warehouse_reports?.can_export) { toast.error("No export permission"); return; }
    setPackLoading(true);
    try {
      const res = await warehouseAPI.getWarehouseReportPack({
        location_id: locationId,
        from_date: filters.from_date || undefined,
        to_date: filters.to_date || undefined,
      });
      const blob = res?.data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BigBean_Warehouse_Report_Pack_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report pack downloaded");
    } catch (error) { toast.error("Report pack export failed"); }
    finally { setPackLoading(false); }
  };

  const showFilters = active && !["current-stock", "low-stock", "out-of-stock"].includes(active);

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <PageHeader
        title="Warehouse Reports"
        subtitle="Analyze inventory, purchases, transfers, ageing, wastage and warehouse movement."
        actions={
          <button
            onClick={exportPack}
            disabled={packLoading}
            className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[14px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]"}`}
          >
            <Download size={16} /> {packLoading ? "Building..." : "Export Pack"}
          </button>
        }
        isDark={isDark}
      />

      {!active && summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard icon={Package} label="Current Stock Value" value={fmtCurrency(summary.current_stock_value)} isDark={isDark} />
          <KpiCard icon={AlertTriangle} label="Low Stock" value={summary.low_stock} isDark={isDark} />
          <KpiCard icon={BookOpen} label="Out of Stock" value={summary.out_of_stock} isDark={isDark} />
          <KpiCard icon={SlidersHorizontal} label="Near Expiry" value={summary.near_expiry} isDark={isDark} />
          <KpiCard icon={Truck} label="Pending Outlet Purchase Orders" value={summary.pending_requisitions} isDark={isDark} />
          <KpiCard icon={ArrowRightLeft} label="In Transit" value={summary.in_transit} isDark={isDark} />
          <KpiCard icon={Trash2} label="Wastage Value" value={fmtCurrency(summary.wastage_value)} isDark={isDark} />
          <KpiCard icon={SlidersHorizontal} label="Adjustment Value" value={fmtCurrency(summary.adjustment_value)} isDark={isDark} />
          <KpiCard icon={Truck} label="Expired" value={summary.expired} isDark={isDark} />
        </div>
      )}

      {!active && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map(g => (
            <SectionCard key={g.label} isDark={isDark}>
              <div className="mb-3 flex items-center gap-2 font-semibold"><g.icon size={18} /> {g.label}</div>
              <div className="grid grid-cols-2 gap-2">
                {g.reports.map(r => (
                  <button key={r.key} onClick={() => loadReport(r.key)} className={`rounded-lg border p-2 text-left text-[13px] hover:bg-[#7367F0]/10 ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {active && (
        <>
          <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className="flex items-center gap-2">
              <button onClick={() => setActive("")} className="text-[#7367F0] text-[14px]">← Reports</button>
              <span className="font-semibold">{active.replace(/-/g, ' ').toUpperCase()}</span>
            </div>
            <div className="flex gap-2">
              {permissions?.warehouse_reports?.can_export && !STRUCTURED_REPORTS.includes(active) && (
                <button onClick={exportToExcel} disabled={exporting} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[14px] ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]"}`}>
                  <Download size={16} /> {exporting ? "Exporting..." : "Export"}
                </button>
              )}
              <button onClick={printReport} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[14px] ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]"}`}>
                <Printer size={16} /> Print
              </button>
            </div>
          </div>

          {showFilters && (
            <div className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <input type="date" value={filters.from_date} onChange={e => setFilters({...filters, from_date: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`} placeholder="From" />
                <input type="date" value={filters.to_date} onChange={e => setFilters({...filters, to_date: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`} placeholder="To" />
                <select value={filters.material_id} onChange={e => setFilters({...filters, material_id: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">All Materials</option>{materials.map(m => <option key={m.id} value={m.id}>{m.material_name}</option>)}</select>
                <select value={filters.supplier_id} onChange={e => setFilters({...filters, supplier_id: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">All Suppliers</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select>
                <select value={filters.category_id} onChange={e => setFilters({...filters, category_id: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">All Categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}</select>
                <div className="flex gap-2">
                  <button onClick={() => loadReport(active)} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8]">Load</button>
                  <button onClick={() => setFilters({ from_date: "", to_date: "", material_id: "", supplier_id: "", category_id: "", status: "" })} className={`h-10 rounded-md border px-3 text-sm ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}><RotateCcw size={16} /></button>
                </div>
              </div>
            </div>
          )}

          {STRUCTURED_REPORTS.includes(active) ? (
            loading ? (
              <SectionCard isDark={isDark}><LoadingRows rows={5} cols={5} isDark={isDark} /></SectionCard>
            ) : active === "gstr3b" ? (
              <GSTR3BView data={structuredData} isDark={isDark} />
            ) : (
              <PurchaseReturnGSTView data={structuredData} isDark={isDark} />
            )
          ) : (
            <SectionCard isDark={isDark}>
              <TableWrapper isDark={isDark}>
                <table className="w-full border-collapse text-[13px]">
                  <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                    <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                      {data.length > 0 ? Object.keys(data[0]).map(k => <th key={k} className="px-3 py-3">{k.replace(/_/g, ' ')}</th>) : <th className="px-3 py-3">No columns</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? <LoadingRows rows={5} cols={data.length ? Object.keys(data[0]).length : 1} isDark={isDark} /> : data.length === 0 ? (
                      <tr><td colSpan={data.length ? Object.keys(data[0]).length : 1} className="px-4 py-10"><EmptyState isDark={isDark} message="No report data" subMessage="Select a report and apply filters" /></td></tr>
                    ) : data.map((r, i) => (
                      <tr key={i} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                        {Object.keys(r).map(k => <td key={k} className="px-3 py-3">{formatCell(r[k])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}

function GSTR3BView({ data, isDark }) {
  const thCls = `border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`;
  const trCls = `border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`;
  if (!data) return <SectionCard isDark={isDark}><EmptyState isDark={isDark} message="No report data" subMessage="Select a date range and click Load" /></SectionCard>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard icon={Package} label="Taxable Purchase Value" value={fmtCurrency(data.total_taxable_value)} isDark={isDark} />
        <KpiCard icon={Receipt} label="Total Eligible ITC" value={fmtCurrency(data.total_eligible_itc)} isDark={isDark} />
        <KpiCard icon={AlertTriangle} label="Unrated Purchases" value={fmtCurrency(data.unrated?.taxable_value)} sub={data.unrated?.row_count > 0 ? `${data.unrated.row_count} rows have no GST rate set` : undefined} isDark={isDark} />
      </div>
      <SectionCard title="Table 4 — Eligible ITC, Rate-wise" isDark={isDark}>
        <TableWrapper isDark={isDark}>
          <table className="w-full border-collapse text-[13px]">
            <thead><tr className={thCls}><th className="px-3 py-2.5">GST Rate</th><th className="px-3 py-2.5">Taxable Value</th><th className="px-3 py-2.5">CGST</th><th className="px-3 py-2.5">SGST</th><th className="px-3 py-2.5">Total ITC</th></tr></thead>
            <tbody>
              {!data.itc_by_rate?.length ? <EmptyRow2 colSpan={5} isDark={isDark} /> : data.itc_by_rate.map((r, i) => (
                <tr key={i} className={trCls}>
                  <td className="px-3 py-2.5">{r.rate.toFixed(2)}%</td>
                  <td className="px-3 py-2.5">{fmtCurrency(r.taxable_value)}</td>
                  <td className="px-3 py-2.5">{fmtCurrency(r.cgst)}</td>
                  <td className="px-3 py-2.5">{fmtCurrency(r.sgst)}</td>
                  <td className="px-3 py-2.5 font-semibold">{fmtCurrency(r.total_tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>
      </SectionCard>
      <SectionCard title="HSN-wise Supporting Detail" isDark={isDark}>
        <TableWrapper isDark={isDark}>
          <table className="w-full border-collapse text-[13px]">
            <thead><tr className={thCls}><th className="px-3 py-2.5">HSN</th><th className="px-3 py-2.5">Material</th><th className="px-3 py-2.5">Rate</th><th className="px-3 py-2.5">Taxable Value</th><th className="px-3 py-2.5">Tax</th></tr></thead>
            <tbody>
              {!data.hsn_summary?.length ? <EmptyRow2 colSpan={5} isDark={isDark} /> : data.hsn_summary.map((r, i) => (
                <tr key={i} className={trCls}>
                  <td className="px-3 py-2.5">{r.hsn_code}</td>
                  <td className="px-3 py-2.5">{r.description}</td>
                  <td className="px-3 py-2.5">{r.rate.toFixed(2)}%</td>
                  <td className="px-3 py-2.5">{fmtCurrency(r.taxable_value)}</td>
                  <td className="px-3 py-2.5">{fmtCurrency(r.tax_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>
      </SectionCard>
    </div>
  );
}

function PurchaseReturnGSTView({ data, isDark }) {
  const thCls = `border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`;
  const trCls = `border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`;
  if (!data) return <SectionCard isDark={isDark}><EmptyState isDark={isDark} message="No report data" subMessage="Select a date range and click Load" /></SectionCard>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard icon={Package} label="Taxable Return Value" value={fmtCurrency(data.total_taxable_value)} isDark={isDark} />
        <KpiCard icon={Receipt} label="Total Tax (CGST+SGST)" value={fmtCurrency(data.total_tax)} isDark={isDark} />
        <KpiCard icon={Truck} label="Total Credit Value" value={fmtCurrency(data.total_credit_value)} isDark={isDark} />
      </div>
      <SectionCard title="Supplier Debit Notes — Rate reconciles against supplier's GSTR-2A/2B" isDark={isDark}>
        <TableWrapper isDark={isDark}>
          <table className="w-full border-collapse text-[13px]">
            <thead><tr className={thCls}><th className="px-3 py-2.5">Supplier</th><th className="px-3 py-2.5">GSTIN</th><th className="px-3 py-2.5">Returns</th><th className="px-3 py-2.5">Taxable Value</th><th className="px-3 py-2.5">CGST</th><th className="px-3 py-2.5">SGST</th><th className="px-3 py-2.5">Credit Value</th></tr></thead>
            <tbody>
              {!data.by_supplier?.length ? <EmptyRow2 colSpan={7} isDark={isDark} /> : data.by_supplier.map((r, i) => (
                <tr key={i} className={trCls}>
                  <td className="px-3 py-2.5 font-medium">{r.supplier_name || "-"}</td>
                  <td className="px-3 py-2.5">{r.gstin || "-"}</td>
                  <td className="px-3 py-2.5">{r.return_count}</td>
                  <td className="px-3 py-2.5">{fmtCurrency(r.taxable_value)}</td>
                  <td className="px-3 py-2.5">{fmtCurrency(r.cgst)}</td>
                  <td className="px-3 py-2.5">{fmtCurrency(r.sgst)}</td>
                  <td className="px-3 py-2.5 font-semibold">{fmtCurrency(r.credit_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>
      </SectionCard>
    </div>
  );
}

function EmptyRow2({ colSpan, isDark }) {
  return <tr><td colSpan={colSpan} className="px-4 py-10"><EmptyState isDark={isDark} message="No data" subMessage="No records in this date range" /></td></tr>;
}

const formatCell = (v) => {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'number') return Number.isInteger(v) ? v : v.toFixed(2);
  if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}/.test(v)) return fmtDate(v);
  return String(v);
};

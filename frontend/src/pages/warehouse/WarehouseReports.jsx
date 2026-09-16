import { useEffect, useState } from "react";
import { warehouseAPI, masterAPI, getStoredPermissions } from "../../services/api";
import { SectionCard, TableWrapper, LoadingRows, EmptyState, PageHeader } from "../../components/ui";
import { KpiCard, fmtQty, fmtDate } from "./WarehouseShared";
import { getInputClass } from "../../components/ui";
import { Package, BookOpen, Truck, SlidersHorizontal, AlertTriangle, Trash2, ArrowRightLeft, ClipboardList, Download, Printer, RotateCcw, BarChart3, Receipt, Scale } from "lucide-react";
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
const RECONCILIATION_KEY = "reconciliation";

const accountingGroup = {
  label: "Accounting",
  icon: Scale,
  reports: [{ key: RECONCILIATION_KEY, label: "Accounting Reconciliation" }],
};

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
  // Accounting Reconciliation needs BOTH warehouse_reports and reports view
  // access - the option stays hidden unless the user holds both.
  const canViewReconciliation = Boolean(permissions?.warehouse_reports?.can_view && permissions?.reports?.can_view);
  const canViewProcurement = Boolean(canViewReconciliation && permissions?.grn?.can_view && permissions?.material_purchase?.can_view);
  const visibleGroups = canViewReconciliation ? [...groups, accountingGroup] : groups;
  const [filters, setFilters] = useState({
    from_date: "", to_date: "", material_id: "", supplier_id: "", category_id: "", status: "",
  });

  useEffect(() => {
    warehouseAPI.getWarehouseReportSummary(locationId).then(res => setSummary(res?.data?.data));
  }, [locationId]);

  const loadReport = async (key) => {
    if (key === RECONCILIATION_KEY) {
      setActive(key);
      setData([]);
      setStructuredData(null);
      return;
    }
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

  const showFilters = active && !["current-stock", "low-stock", "out-of-stock", RECONCILIATION_KEY].includes(active);

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
          {visibleGroups.map(g => (
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
              <span className="font-semibold">{active === RECONCILIATION_KEY ? "ACCOUNTING RECONCILIATION" : active.replace(/-/g, ' ').toUpperCase()}</span>
            </div>
            <div className="flex gap-2">
              {permissions?.warehouse_reports?.can_export && !STRUCTURED_REPORTS.includes(active) && active !== RECONCILIATION_KEY && (
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

          {active === RECONCILIATION_KEY ? (
            <ReconciliationView isDark={isDark} inputClass={inputClass} canViewProcurement={canViewProcurement} />
          ) : STRUCTURED_REPORTS.includes(active) ? (
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

function ReconciliationView({ isDark, inputClass, canViewProcurement }) {
  const [section, setSection] = useState("stock");

  useEffect(() => {
    if (section === "procurement" && !canViewProcurement) setSection("stock");
  }, [canViewProcurement, section]);

  return (
    <div className="space-y-4">
      <div className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
        <button
          type="button"
          onClick={() => setSection("stock")}
          className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[14px] font-medium ${section === "stock" ? "border-[#7367F0] bg-[#7367F0] text-white" : isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]"}`}
        >
          <BookOpen size={16} /> Stock Reconciliation
        </button>
        {canViewProcurement && (
          <button
            type="button"
            onClick={() => setSection("procurement")}
            className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[14px] font-medium ${section === "procurement" ? "border-[#7367F0] bg-[#7367F0] text-white" : isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]"}`}
          >
            <Truck size={16} /> Procurement Sources
          </button>
        )}
      </div>

      {section === "stock" ? (
        <StockReconciliationView isDark={isDark} inputClass={inputClass} />
      ) : (
        <ProcurementSourcesView isDark={isDark} inputClass={inputClass} />
      )}
    </div>
  );
}

function ProcurementSourcesView({ isDark, inputClass }) {
  const [locations, setLocations] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [filters, setFilters] = useState({ location_id: "", outlet_id: "", from_date: "", to_date: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      warehouseAPI.getLocations({ scope: "all" }),
      masterAPI.getOutlets(),
    ])
      .then(([locRes, outletRes]) => {
        if (!alive) return;
        const locRows = (locRes?.data?.data || locRes?.data || []).filter((loc) => loc.location_type === "Central Warehouse" && Number(loc.is_active) === 1);
        setLocations(locRows);
        setOutlets(outletRes?.data?.data || outletRes?.data || []);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const run = async () => {
    if (!filters.location_id) { toast.error("Select a warehouse location"); return; }
    if (!filters.outlet_id) { toast.error("Select an outlet"); return; }
    if (!filters.from_date || !filters.to_date) { toast.error("Select a date range"); return; }
    setLoading(true);
    try {
      const res = await warehouseAPI.getProcurementSources(filters);
      setResult(res?.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load procurement sources");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const warehouse = result?.warehouse_grn || null;
  const purchases = result?.outlet_direct_purchase || null;
  const trend = result?.monthly_trend || [];
  const moneyCell = (v) => (v === null || v === undefined ? "N/A" : fmtCurrency(v));
  const countCell = (v) => (v === null || v === undefined ? "N/A" : v);
  const warehouseHasData = warehouse?.has_data ?? ((warehouse?.grn_count ?? 0) > 0);
  const purchaseHasData = purchases?.has_data ?? ((purchases?.upload_count ?? 0) > 0);

  return (
    <div className="space-y-4">
      <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>
        Read-only view of warehouse GRN receipts and outlet direct purchase uploads. These sources are not transaction-matched.
      </p>

      <div className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <select value={filters.location_id} onChange={(e) => setFilters({ ...filters, location_id: e.target.value })} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}>
            <option value="">Warehouse Location</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.location_name}{loc.location_code ? ` (${loc.location_code})` : ""}</option>
            ))}
          </select>
          <select value={filters.outlet_id} onChange={(e) => setFilters({ ...filters, outlet_id: e.target.value })} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}>
            <option value="">Outlet</option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>{outlet.outlet_name}{outlet.outlet_code ? ` (${outlet.outlet_code})` : ""}</option>
            ))}
          </select>
          <input type="date" value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`} />
          <input type="date" value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`} />
          <button onClick={run} disabled={loading} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8] disabled:opacity-70">
            {loading ? "Generating..." : result ? "Refresh" : "Generate"}
          </button>
        </div>
      </div>

      <div className={`rounded-lg border px-4 py-3 text-[13px] ${isDark ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
        Warehouse GRNs and outlet direct purchases are separate source populations. Values are shown side by side only and must not be interpreted as a purchase variance.
      </div>

      {loading && <SectionCard isDark={isDark}><LoadingRows rows={5} cols={5} isDark={isDark} /></SectionCard>}

      {!loading && result && (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard title="Warehouse GRN" isDark={isDark}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard icon={Package} label="GRN Value" value={moneyCell(warehouse?.value)} isDark={isDark} />
                <KpiCard icon={ClipboardList} label="GRN Count" value={countCell(warehouse?.grn_count)} isDark={isDark} />
                <KpiCard icon={Truck} label="Suppliers" value={countCell(warehouse?.supplier_count)} isDark={isDark} />
                <KpiCard icon={BookOpen} label="Materials" value={countCell(warehouse?.material_count)} isDark={isDark} />
              </div>

              {warehouseHasData ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <p className={`mb-2 text-[13px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Supplier Breakdown</p>
                    <TableWrapper isDark={isDark}>
                      <table className="w-full border-collapse text-[13px]">
                        <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                          <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                            <th className="px-3 py-3">Supplier</th>
                            <th className="px-3 py-3">GRNs</th>
                            <th className="px-3 py-3">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!warehouse?.suppliers?.length ? (
                            <tr><td colSpan={3} className="px-4 py-10"><EmptyState isDark={isDark} title="No data for this source and selected scope." subtitle="Adjust the filters and generate again." /></td></tr>
                          ) : warehouse.suppliers.map((row, i) => (
                            <tr key={i} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                              <td className="px-3 py-3 font-medium">{row.supplier_name || "Unknown supplier"}</td>
                              <td className="px-3 py-3">{row.grn_count}</td>
                              <td className="px-3 py-3">{fmtCurrency(row.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableWrapper>
                  </div>

                  <div>
                    <p className={`mb-2 text-[13px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Material Breakdown</p>
                    <TableWrapper isDark={isDark}>
                      <table className="w-full border-collapse text-[13px]">
                        <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                          <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                            <th className="px-3 py-3">Material</th>
                            <th className="px-3 py-3">Quantity</th>
                            <th className="px-3 py-3">Unit</th>
                            <th className="px-3 py-3">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!warehouse?.materials?.length ? (
                            <tr><td colSpan={4} className="px-4 py-10"><EmptyState isDark={isDark} title="No data for this source and selected scope." subtitle="Adjust the filters and generate again." /></td></tr>
                          ) : warehouse.materials.map((row, i) => (
                            <tr key={i} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                              <td className="px-3 py-3 font-medium">{row.material_name || "Unknown material"}</td>
                              <td className="px-3 py-3">{fmtQty(row.quantity)}</td>
                              <td className="px-3 py-3">{row.unit || "N/A"}</td>
                              <td className="px-3 py-3">{fmtCurrency(row.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableWrapper>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyState isDark={isDark} title="No data for this source and selected scope." subtitle="Adjust the filters and generate again." />
                </div>
              )}
            </SectionCard>

            <SectionCard title="Outlet Direct Purchase" isDark={isDark}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <KpiCard icon={Package} label="Purchase Upload Value" value={moneyCell(purchases?.value)} isDark={isDark} />
                <KpiCard icon={ClipboardList} label="Upload Count" value={countCell(purchases?.upload_count)} isDark={isDark} />
                <KpiCard icon={ClipboardList} label="Item Count" value={countCell(purchases?.item_count)} isDark={isDark} />
                <KpiCard icon={Truck} label="Suppliers" value={countCell(purchases?.supplier_count)} isDark={isDark} />
                <KpiCard icon={BookOpen} label="Materials" value={countCell(purchases?.material_count)} isDark={isDark} />
              </div>

              {purchaseHasData ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <p className={`mb-2 text-[13px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Supplier Breakdown</p>
                    <TableWrapper isDark={isDark}>
                      <table className="w-full border-collapse text-[13px]">
                        <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                          <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                            <th className="px-3 py-3">Supplier</th>
                            <th className="px-3 py-3">Items</th>
                            <th className="px-3 py-3">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!purchases?.suppliers?.length ? (
                            <tr><td colSpan={3} className="px-4 py-10"><EmptyState isDark={isDark} title="No data for this source and selected scope." subtitle="Adjust the filters and generate again." /></td></tr>
                          ) : purchases.suppliers.map((row, i) => (
                            <tr key={i} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                              <td className="px-3 py-3 font-medium">{row.supplier_name || "Unknown supplier"}</td>
                              <td className="px-3 py-3">{row.item_count}</td>
                              <td className="px-3 py-3">{fmtCurrency(row.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableWrapper>
                  </div>

                  <div>
                    <p className={`mb-2 text-[13px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Material Breakdown</p>
                    <TableWrapper isDark={isDark}>
                      <table className="w-full border-collapse text-[13px]">
                        <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                          <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                            <th className="px-3 py-3">Material</th>
                            <th className="px-3 py-3">Quantity</th>
                            <th className="px-3 py-3">Unit</th>
                            <th className="px-3 py-3">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!purchases?.materials?.length ? (
                            <tr><td colSpan={4} className="px-4 py-10"><EmptyState isDark={isDark} title="No data for this source and selected scope." subtitle="Adjust the filters and generate again." /></td></tr>
                          ) : purchases.materials.map((row, i) => (
                            <tr key={i} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                              <td className="px-3 py-3 font-medium">{row.material_name || "Unknown material"}</td>
                              <td className="px-3 py-3">{fmtQty(row.quantity)}</td>
                              <td className="px-3 py-3">{row.unit || "N/A"}</td>
                              <td className="px-3 py-3">{fmtCurrency(row.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableWrapper>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyState isDark={isDark} title="No data for this source and selected scope." subtitle="Adjust the filters and generate again." />
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Monthly Trend" isDark={isDark}>
            <TableWrapper isDark={isDark}>
              <table className="w-full border-collapse text-[13px]">
                <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                  <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                    <th className="px-3 py-3">Month</th>
                    <th className="px-3 py-3">Warehouse GRN Value</th>
                    <th className="px-3 py-3">Outlet Direct Purchase Value</th>
                  </tr>
                </thead>
                <tbody>
                  {!trend.length ? (
                    <tr><td colSpan={3} className="px-4 py-10"><EmptyState isDark={isDark} title="No data for this source and selected scope." subtitle="Adjust the filters and generate again." /></td></tr>
                  ) : trend.map((row) => (
                    <tr key={row.month} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                      <td className="px-3 py-3 font-medium">{row.month}</td>
                      <td className="px-3 py-3">{fmtCurrency(row.warehouse_grn_value)}</td>
                      <td className="px-3 py-3">{fmtCurrency(row.outlet_direct_purchase_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          </SectionCard>
        </>
      )}

      {!loading && !result && (
        <EmptyState isDark={isDark} title="No data" subtitle="Select a warehouse location, outlet and date range, then click Generate." />
      )}
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

const RECON_STATUS_CLS = {
  GREEN: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  AMBER: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  RED: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
};

const RECON_MATERIAL_CLS = {
  MATCH: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  DIFFERENCE: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "N/A": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function StockReconciliationView({ isDark, inputClass }) {
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    masterAPI.getOutlets().then((r) => setOutlets(r?.data?.data || r?.data || [])).catch(() => {});
  }, []);

  const run = async () => {
    if (!outletId) { toast.error("Select an outlet"); return; }
    if (!asOfDate) { toast.error("Select an as-of date"); return; }
    setLoading(true);
    try {
      const res = await warehouseAPI.getReconciliation({ outlet_id: outletId, as_of_date: asOfDate });
      setResult(res?.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load reconciliation");
      setResult(null);
    } finally { setLoading(false); }
  };

  const cov = result?.coverage;
  const materials = result?.materials || [];
  const movements = result?.movements || [];
  const qtyCell = (v) => (v === null || v === undefined ? "N/A" : fmtQty(v));

  return (
    <div className="space-y-4">
      <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>
        Read-only comparison of outlet accounting stock uploads and recorded physical inventory.
      </p>

      <div className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <select value={outletId} onChange={(e) => setOutletId(e.target.value)} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}>
            <option value="">Select Outlet</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.outlet_name}{o.outlet_code ? ` (${o.outlet_code})` : ""}</option>)}
          </select>
          <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`} />
          <button onClick={run} disabled={loading} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8] disabled:opacity-70">
            {loading ? "Generating..." : result ? "Refresh" : "Generate"}
          </button>
        </div>
      </div>

      {loading && <SectionCard isDark={isDark}><LoadingRows rows={5} cols={6} isDark={isDark} /></SectionCard>}

      {!loading && result && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className={`rounded-xl border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
              <p className={`text-[12px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Coverage Status</p>
              <p className="mt-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${RECON_STATUS_CLS[cov?.status] || RECON_STATUS_CLS.RED}`}>{cov?.status || "RED"}</span>
              </p>
              {cov?.physical_location && <p className={`mt-2 text-[11px] ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>{cov.physical_location.location_name}</p>}
            </div>
            <KpiCard icon={Package} label="Accounting Closing Qty" value={qtyCell(result.summary?.accounting_closing_qty_base)} sub={result.summary?.accounting_total_complete === false && result.coverage?.closing_upload_exists ? "Incomplete - some rows not normalized" : undefined} isDark={isDark} />
            <KpiCard icon={BookOpen} label="Physical Ledger Qty" value={qtyCell(result.summary?.physical_closing_qty_base)} isDark={isDark} />
            <KpiCard icon={ClipboardList} label="Comparable Materials" value={result.summary?.comparable_materials ?? 0} isDark={isDark} />
            <KpiCard icon={AlertTriangle} label="Non-comparable Materials" value={result.summary?.non_comparable_materials ?? 0} isDark={isDark} />
          </div>

          {(cov?.notes || []).length > 0 && (
            <div className={`rounded-lg border p-3 text-[13px] ${isDark ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {cov.notes.map((n, i) => <p key={i}>• {n}</p>)}
            </div>
          )}

          {!cov?.physical_location_exists && (
            <EmptyState isDark={isDark} title="No physical outlet location" subtitle="This outlet has no active, inventory-enabled Outlet location mapped." />
          )}
          {cov?.physical_location_exists && !cov?.ledger_activity_exists && (
            <EmptyState isDark={isDark} title="No ledger activity" subtitle="No physical stock movements recorded for this location up to the as-of date." />
          )}
          {cov?.physical_location_exists && !cov?.closing_upload_exists && (
            <EmptyState isDark={isDark} title="No completed closing stock upload" subtitle="No completed accounting closing stock upload exists for this outlet and period." />
          )}

          <SectionCard title="Closing Values" isDark={isDark}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <KpiCard icon={Package} label="Accounting Closing Value" value={result.values?.accounting_closing_value === null ? "N/A" : fmtCurrency(result.values?.accounting_closing_value)} isDark={isDark} />
              <KpiCard icon={BookOpen} label="Physical Ledger Value" value={result.values?.physical_closing_value === null ? "N/A" : fmtCurrency(result.values?.physical_closing_value)} isDark={isDark} />
            </div>
            <p className={`mt-3 rounded-md border px-3 py-2 text-[12px] ${isDark ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {result.values?.cost_basis_warning || "Accounting and physical values use different cost bases."}
            </p>
          </SectionCard>

          {result.opening && (
            <div className={`rounded-lg border p-3 text-[13px] ${isDark ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              <span className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${RECON_STATUS_CLS.AMBER}`}>{result.opening.status}</span>
              Opening stock (diagnostic): accounting upload {result.opening.accounting_upload_exists ? `present (${result.opening.accounting_item_count} items)` : "not present"}, physical OPENING ledger entries: {result.opening.physical_opening_entries}{result.opening.physical_opening_qty_base === null ? "" : ` (net ${fmtQty(result.opening.physical_opening_qty_base)} base)`}.
              <span className="block mt-1">{result.opening.note}</span>
            </div>
          )}

          <SectionCard title="Material Reconciliation" isDark={isDark}>
            <TableWrapper isDark={isDark}>
              <table className="w-full border-collapse text-[13px]">
                <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                  <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                    {["Material", "Base Unit", "Accounting Closing Qty", "Physical Qty", "Qty Difference", "Status / Note"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {materials.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10"><EmptyState isDark={isDark} title="No comparable materials" subtitle="No accounting upload items or physical ledger activity for this outlet and period." /></td></tr>
                  ) : materials.map((m, i) => (
                    <tr key={i} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                      <td className="px-3 py-3 font-medium">{m.material_name}</td>
                      <td className="px-3 py-3">{m.base_unit || "N/A"}</td>
                      <td className="px-3 py-3">{qtyCell(m.accounting_qty_base)}</td>
                      <td className="px-3 py-3">{qtyCell(m.physical_qty_base)}</td>
                      <td className="px-3 py-3">{qtyCell(m.qty_difference)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${RECON_MATERIAL_CLS[m.status] || RECON_MATERIAL_CLS["N/A"]}`}>{m.status}</span>
                        {m.note && <span className={`ml-2 text-[12px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>{m.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          </SectionCard>

          <SectionCard title="Physical Movement Summary" isDark={isDark}>
            <TableWrapper isDark={isDark}>
              <table className="w-full border-collapse text-[13px]">
                <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                  <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                    {["Transaction Type", "Qty In", "Qty Out", "Net Movement"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-10"><EmptyState isDark={isDark} title="No ledger activity" subtitle="No physical stock movements recorded for this location up to the as-of date." /></td></tr>
                  ) : movements.map((m, i) => (
                    <tr key={i} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                      <td className="px-3 py-3 font-medium">{m.transaction_type}</td>
                      <td className="px-3 py-3">{fmtQty(m.qty_in)}</td>
                      <td className="px-3 py-3">{fmtQty(m.qty_out)}</td>
                      <td className="px-3 py-3">{fmtQty(m.net_qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          </SectionCard>
        </>
      )}

      {!loading && !result && (
        <EmptyState isDark={isDark} title="No data" subtitle="Select an outlet and as-of date, then click Generate." />
      )}
    </div>
  );
}

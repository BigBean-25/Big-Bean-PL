import { useState, useEffect } from 'react';
import { Download, Search, Loader2, Receipt, FileText, AlertCircle, AlertTriangle, ShieldCheck, Info } from 'lucide-react';
import { reportAPI, masterAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { exportReportPDF } from '../../utils/pdfReport';

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };
const fmtINR = (n = 0) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);
const formatCount = (value = 0) => Number(value || 0).toLocaleString("en-IN");

const EMPTY_STATE_META = {
  NO_APPROVED_UPLOADS: {
    title: "No approved sales uploads found",
    description: "No approved PetPooja sales uploads were found for the selected outlet and date range.",
  },
  NO_SALES_ROWS: {
    title: "No sales rows found",
    description: "Approved sales uploads exist, but they contain no sales rows for this report.",
  },
  ALL_ITEMS_UNMAPPED: {
    title: "Sales found, but Menu Item mapping is missing",
    description: "Approved sales exist, but the sold item names could not be matched to Menu Items used by the GSTR-1 report.",
  },
  GST_RATE_MISSING: {
    title: "Sales found, but GST rates are missing",
    description: "Approved sales items are mapped to Menu Items, but GST rates are missing for the rows required by this report.",
  },
  NO_GROUPED_OUTPUT: {
    title: "No qualifying GSTR-1 rows",
    description: "Approved sales data exists, but no rows qualify for the current GST rate and HSN summaries.",
  },
};

const CALCULATION_MODE_META = {
  PRECISE_ITEM_TAX: {
    label: "Precise Item Tax",
    support: "Tax components are sourced from the matching Item Wise Tax Report for this exact date range.",
    tone: "positive",
  },
  ESTIMATED_MENU_MASTER: {
    label: "Estimated from Menu Master",
    support: "Exact Item Wise Tax Report coverage was not found for this date range. Current Menu Item GST rate and HSN mappings are being used.",
    warning: "Estimated historical results use the current Menu Item GST rate and HSN mapping. Changes to Menu Item master data can change results for past periods.",
    tone: "warning",
  },
  NO_QUALIFYING_DATA: {
    label: "No Qualifying Data",
    support: "Approved sales data exists, but no rows qualify for the current GST rate and HSN summaries.",
    tone: "neutral",
  },
};

const GSTR1Report = () => {
  const [outlets, setOutlets] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [filters, setFilters] = useState({ outlet_id: 'all', from_date: firstOfMonth(), to_date: today() });

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6]" : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const labelCls = isDark ? "text-[#D0D2D6]" : "text-[#5D596C]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const thCls = isDark ? "bg-[#25293C] text-[#A5A8B6]" : "bg-[#F8F7FA] text-[#A8AAAE]";
  const trHover = isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F8F7FA]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

  useEffect(() => { fetchLookups(); }, []);

  const fetchLookups = async () => {
    try {
      const o = await masterAPI.getOutlets();
      setOutlets(o.data?.data || o.data || []);
    } catch { /* silent */ }
  };

  const handleGenerateReport = async () => {
    if (!filters.from_date || !filters.to_date) { toast.error('Select both dates'); return; }
    setLoading(true);
    try {
      const r = await reportAPI.getGSTR1(filters);
      setReport(r.data?.data || null);
      setHasGenerated(true);
      toast.success('Report generated');
    } catch { toast.error('Failed to generate report'); }
    finally { setLoading(false); }
  };

  const hasData = report && (report.b2c_others?.length > 0 || report.hsn_summary?.length > 0);
  const diagnostics = report?.diagnostics || {};
  const dataState = diagnostics.data_state || (hasData ? "ESTIMATED" : "NO_GROUPED_OUTPUT");
  const calculationMode = diagnostics.calculation_mode || (hasData ? "ESTIMATED_MENU_MASTER" : "NO_QUALIFYING_DATA");
  const modeMeta = CALCULATION_MODE_META[calculationMode] || CALCULATION_MODE_META.NO_QUALIFYING_DATA;
  const stateMeta = EMPTY_STATE_META[dataState] || EMPTY_STATE_META.NO_GROUPED_OUTPUT;
  const diagnosticsWarnings = diagnostics.warnings || [];
  const unmappedRowCount = Number(diagnostics.unmapped_sales_row_count || report?.unmapped?.row_count || 0);
  const coverageMetrics = report
    ? [
        { label: "Approved Uploads", value: formatCount(diagnostics.approved_upload_count) },
        { label: "Sales Rows", value: formatCount(diagnostics.approved_sales_row_count) },
        { label: "Mapped Rows", value: formatCount(diagnostics.mapped_sales_row_count) },
        { label: "Unmapped Rows", value: formatCount(diagnostics.unmapped_sales_row_count) },
        { label: "Missing GST Rate", value: formatCount(diagnostics.missing_gst_rate_row_count) },
        { label: "Calculation Mode", value: modeMeta.label },
      ]
    : [];

  const outletName = (id) => outlets.find((o) => Number(o.id) === Number(id))?.outlet_name || `Outlet #${id}`;
  const preciseIds = report?.tax_data_quality?.precise_outlet_ids || [];
  const estimatedIds = report?.tax_data_quality?.estimated_outlet_ids || [];

  const handleExport = async () => {
    const filterOutletName = filters.outlet_id === 'all' ? 'All Outlets' : outletName(filters.outlet_id);
    const dateRangeLabel = filters.from_date === filters.to_date
      ? format(new Date(filters.from_date), 'dd MMM yyyy')
      : `${format(new Date(filters.from_date), 'dd MMM yyyy')} - ${format(new Date(filters.to_date), 'dd MMM yyyy')}`;
    const summaryLines = [
      `Total Taxable Value: ${fmtINR(report.total_taxable_value)}`,
      `Total Tax (CGST + SGST): ${fmtINR(report.total_tax)}`,
      `Total Invoice Value: ${fmtINR(report.total_invoice_value)}`,
    ];

    if (report.b2c_others?.length > 0) {
      const rows = report.b2c_others.map((r) => [
        `${r.rate.toFixed(2)}%`,
        fmtINR(r.taxable_value),
        fmtINR(r.cgst),
        fmtINR(r.sgst),
        fmtINR(r.total_tax),
      ]);
      await exportReportPDF({
        title: "GSTR-1 — Table 7 (B2C Others, Rate-wise)",
        outletName: filterOutletName,
        dateRangeLabel,
        columns: ["GST Rate", "Taxable Value", "CGST", "SGST", "Total Tax"],
        rows,
        summaryLines,
        fileName: `gstr1-b2c-others-${filters.from_date}-to-${filters.to_date}.pdf`,
      });
    }

    if (report.hsn_summary?.length > 0) {
      const rows = report.hsn_summary.map((r) => [
        r.hsn_code,
        r.description,
        Number(r.quantity).toFixed(2),
        `${r.rate.toFixed(2)}%`,
        fmtINR(r.taxable_value),
        fmtINR(r.tax_amount),
      ]);
      await exportReportPDF({
        title: "GSTR-1 — Table 12 (HSN-wise Summary)",
        outletName: filterOutletName,
        dateRangeLabel,
        columns: ["HSN", "Description", "Qty", "Rate", "Taxable Value", "Tax Amount"],
        rows,
        summaryLines,
        fileName: `gstr1-hsn-summary-${filters.from_date}-to-${filters.to_date}.pdf`,
      });
    }

    toast.success("Report exported");
  };

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>GSTR-1 — Outward Supplies (Sales)</h1>
          <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>Rate-wise and HSN-wise summary of outlet sales from approved PetPooja uploads — a filing aid, not a substitute for your GST portal return</p>
        </div>
        {!loading && report && hasData && (
          <button onClick={handleExport} className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]" style={{ backgroundColor: primaryColor }}>
            <Download size={16} /> Export
          </button>
        )}
      </div>

      <div className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
        <div className={`border-b px-4 py-3 sm:px-6 ${borderCls}`}>
          <span className={`text-[12px] font-semibold uppercase tracking-wider ${mutedCls}`}>Filters</span>
        </div>
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${labelCls}`}>From Date</label>
              <input type="date" value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`} />
            </div>
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${labelCls}`}>To Date</label>
              <input type="date" value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`} />
            </div>
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${labelCls}`}>Outlet</label>
              <select value={filters.outlet_id} onChange={(e) => setFilters({ ...filters, outlet_id: e.target.value })}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`}>
                <option value="all">All Outlets</option>
                {outlets.map(o => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={handleGenerateReport} disabled={loading}
                className="flex h-[42px] w-full items-center justify-center gap-2 rounded-md px-4 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98] disabled:opacity-70"
                style={{ backgroundColor: primaryColor }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {loading ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {report && (
        <div className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
          <div className={`flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6 ${borderCls}`}>
            <div>
              <h3 className={`text-[15px] font-semibold ${mainCls}`}>Report Data Coverage</h3>
              <p className={`mt-1 text-[13px] ${mutedCls}`}>{modeMeta.support}</p>
            </div>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${calculationMode === "PRECISE_ITEM_TAX"
                ? (isDark ? "bg-[#E9F9EF] text-[#28C76F]" : "bg-[#DDF6E8] text-[#28C76F]")
                : calculationMode === "ESTIMATED_MENU_MASTER"
                  ? (isDark ? "bg-[#3A2E1D] text-[#FF9F43]" : "bg-[#FFF4E5] text-[#FF9F43]")
                  : (isDark ? "bg-[#3B405A] text-[#A5A8B6]" : "bg-[#EEF0F6] text-[#6F6B7D]")}`}
            >
              {modeMeta.label}
            </span>
          </div>
          <div className="space-y-4 p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {coverageMetrics.map((metric) => (
                <div key={metric.label} className={`rounded-lg border px-3 py-3 ${isDark ? "border-[#3B405A] bg-[#25293C]" : "border-[#EBE9F1] bg-[#FAFAFC]"}`}>
                  <p className={`text-[11px] font-semibold uppercase tracking-wide ${mutedCls}`}>{metric.label}</p>
                  <p className={`mt-1 text-[15px] font-semibold ${metric.label === "Calculation Mode" ? mainCls : mainCls}`}>{metric.value}</p>
                </div>
              ))}
            </div>
            {diagnosticsWarnings.length > 0 && (
              <div className={`rounded-md border px-4 py-3 text-[13px] ${isDark ? "border-[#FF9F43]/40 bg-[#3A2E1D]/25 text-[#FFD9A8]" : "border-[#FFF0D9] bg-[#FFFCF7] text-[#C88212]"}`}>
                <div className="space-y-1">
                  {diagnosticsWarnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className={`flex items-center justify-center gap-3 rounded-md border py-12 ${cardCls}`}>
          <Loader2 size={22} className="animate-spin" style={{ color: primaryColor }} />
          <span className={`text-[15px] font-medium ${mutedCls}`}>Generating report…</span>
        </div>
      )}

      {!loading && report && hasData && (
        <div className={`animate-fade-up flex flex-col gap-3 rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:flex-row sm:items-center sm:p-5 ${cardCls}`}>
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E7F9FC]">
              <Receipt size={22} className="text-[#00CFE8]" />
            </div>
            <div>
              <p className={`text-[13px] ${mutedCls}`}>Total Tax (CGST + SGST)</p>
              <p className="mt-0.5 text-[22px] font-bold text-[#00CFE8]">{fmtINR(report.total_tax)}</p>
            </div>
          </div>
          <div className={`sm:ml-8 flex items-center gap-6 text-[13px] ${mutedCls}`}>
            <span>Taxable Value: <strong className={mainCls}>{fmtINR(report.total_taxable_value)}</strong></span>
            <span>Invoice Value: <strong className={mainCls}>{fmtINR(report.total_invoice_value)}</strong></span>
          </div>
        </div>
      )}

      {!loading && report && (preciseIds.length > 0 || estimatedIds.length > 0) && (
        <div className={`flex items-start gap-3 rounded-md border p-4 ${isDark ? "border-[#28C76F]/40 bg-[#28C76F]/10" : "border-[#28C76F]/40 bg-[#E9F9EF]"}`}>
          <ShieldCheck size={18} className="mt-0.5 flex-shrink-0 text-[#28C76F]" />
          <div className="space-y-1">
            {preciseIds.length > 0 && (
              <p className={`text-[13px] ${mainCls}`}>
                <strong>Precise tax data</strong> used for: {preciseIds.map(outletName).join(', ')} — real CGST/SGST per item from PetPooja's Item Tax Report, not estimated.
              </p>
            )}
            {estimatedIds.length > 0 && (
              <p className={`flex items-start gap-1.5 text-[13px] ${mutedCls}`}>
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <span><strong className={mainCls}>Estimated</strong> for: {estimatedIds.map(outletName).join(', ')} — 50/50 CGST/SGST split from the combined Tax column, rate matched to Menu Items by name. Upload an Item Tax Report for this exact date range to make these precise too.</span>
              </p>
            )}
          </div>
        </div>
      )}

      {!loading && unmappedRowCount > 0 && (
        <div className={`flex items-start gap-3 rounded-md border p-4 ${isDark ? "border-[#FF9F43]/40 bg-[#FF9F43]/10" : "border-[#FF9F43]/40 bg-[#FFF4E5]"}`}>
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-[#FF9F43]" />
          <div>
            <p className={`text-[14px] font-semibold ${mainCls}`}>Some approved sales items could not be matched to Menu Items</p>
            <p className={`mt-0.5 text-[13px] ${mutedCls}`}>They are excluded from GST rate and HSN summaries because exact item-name mapping failed. ₹{fmtINR(report.unmapped.taxable_value)} taxable value (₹{fmtINR(report.unmapped.tax)} tax) is excluded from the grouped tables below.</p>
          </div>
        </div>
      )}

      {!loading && report && report.b2c_others?.length > 0 && (
        <div className={`animate-fade-up rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
          <div className={`flex items-center gap-3 border-b px-4 py-3 sm:px-6 ${borderCls}`}>
            <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
              <Receipt size={17} />
            </div>
            <h3 className={`text-[15px] font-semibold ${mainCls}`}>Table 7 — B2C (Others), Rate-wise</h3>
          </div>
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="min-w-full" style={{ minWidth: "700px" }}>
              <thead>
                <tr>
                  {["GST Rate", "Taxable Value", "CGST", "SGST", "Total Tax"].map((h) => (
                    <th key={h} className={`whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider ${thCls}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${borderCls}`}>
                {report.b2c_others.map((r, idx) => (
                  <tr key={idx} className={`transition ${trHover}`}>
                    <td className={`px-4 py-3 text-[14px] font-medium ${mainCls}`}>{r.rate.toFixed(2)}%</td>
                    <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{fmtINR(r.taxable_value)}</td>
                    <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{fmtINR(r.cgst)}</td>
                    <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{fmtINR(r.sgst)}</td>
                    <td className={`px-4 py-3 text-[14px] font-semibold tabular-nums text-[#00CFE8]`}>{fmtINR(r.total_tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && report && report.hsn_summary?.length > 0 && (
        <div className={`animate-fade-up rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
          <div className={`flex items-center gap-3 border-b px-4 py-3 sm:px-6 ${borderCls}`}>
            <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
              <FileText size={17} />
            </div>
            <h3 className={`text-[15px] font-semibold ${mainCls}`}>Table 12 — HSN-wise Summary</h3>
          </div>
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="min-w-full" style={{ minWidth: "700px" }}>
              <thead>
                <tr>
                  {["HSN", "Description", "Qty", "Rate", "Taxable Value", "Tax Amount"].map((h) => (
                    <th key={h} className={`whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider ${thCls}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${borderCls}`}>
                {report.hsn_summary.map((r, idx) => (
                  <tr key={idx} className={`transition ${trHover}`}>
                    <td className={`px-4 py-3 text-[14px] font-medium ${mainCls}`}>{r.hsn_code}</td>
                    <td className={`px-4 py-3 text-[14px] ${mutedCls}`}>{r.description}</td>
                    <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{Number(r.quantity).toFixed(2)}</td>
                    <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{r.rate.toFixed(2)}%</td>
                    <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{fmtINR(r.taxable_value)}</td>
                    <td className={`px-4 py-3 text-[14px] font-semibold tabular-nums text-[#00CFE8]`}>{fmtINR(r.tax_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && hasGenerated && !hasData && (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 px-4 text-center ${cardCls}`}>
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-[#3B405A]" : "bg-[#EBE9F1]"}`}>
            {dataState === "NO_APPROVED_UPLOADS" ? (
              <AlertCircle size={26} className={mutedCls} />
            ) : (
              <AlertTriangle size={26} className={mutedCls} />
            )}
          </div>
          <p className={`text-[16px] font-semibold ${mainCls}`}>{stateMeta.title}</p>
          <p className={`mt-1 text-[13px] ${mutedCls}`}>{stateMeta.description}</p>
        </div>
      )}

      {!loading && !hasGenerated && (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 px-4 text-center ${cardCls}`}>
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-[#3B405A]" : "bg-[#EBE9F1]"}`}>
            <FileText size={26} className={mutedCls} />
          </div>
          <p className={`text-[16px] font-semibold ${mainCls}`}>No report generated yet</p>
          <p className={`mt-1 text-[13px] ${mutedCls}`}>Choose a date range then click Generate</p>
        </div>
      )}
    </div>
  );
};

export default GSTR1Report;

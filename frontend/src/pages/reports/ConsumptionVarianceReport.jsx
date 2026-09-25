import { useState, useEffect } from 'react';
import { Download, Search, Loader2, FileText, BarChart2, AlertTriangle } from 'lucide-react';
import { reportAPI, masterAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { useReportOutletSync } from '../../hooks/useSelectedOutlet';
import { exportReportPDF } from '../../utils/pdfReport';

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };
const fmtINR = (n = 0) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n = 0) => Number(n || 0).toFixed(3);
const fmtCount = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-IN"));
const fmtYesNo = (v) => (v === null || v === undefined ? "—" : v ? "Yes" : "No");
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const ConsumptionVarianceReport = () => {
  const [outlets, setOutlets] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagnosticsError, setDiagnosticsError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [filters, setFilters] = useState({
    outlet_id: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

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

  const { outletLocked } = useReportOutletSync({ setFilters, allModeValue: "", clearResult: () => { setReportData([]); setDiagnostics(null); setDiagnosticsError(''); } });
  useEffect(() => { fetchOutlets(); }, []);

  const fetchOutlets = async () => {
    try {
      const r = await masterAPI.getOutlets();
      setOutlets(r.data?.data || r.data || []);
    } catch {
      toast.error('Failed to fetch outlets');
    }
  };

  const handleGenerateReport = async () => {
    if (!filters.outlet_id) { toast.error('Please select an outlet'); return; }
    setLoading(true);
    try {
      const r = await reportAPI.getConsumptionVariance(filters);
      const rows = r.data?.data || r.data || [];
      setReportData(rows);
      setHasGenerated(true);
      setDiagnosticsError('');
      try {
        const diagRes = await reportAPI.getConsumptionVarianceDiagnostics(filters);
        setDiagnostics(diagRes.data?.data || diagRes.data || null);
      } catch (diagError) {
        setDiagnostics(null);
        setDiagnosticsError(diagError.response?.data?.message || 'Failed to generate diagnostics');
      }
      toast.success('Report generated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const criticalCount = reportData.filter((r) => r.status === 'Critical').length;
  const warningCount = reportData.filter((r) => r.status === 'Warning').length;
  const totalVarianceValue = reportData.reduce((sum, r) => sum + Number(r.variance_value || 0), 0);

  const handleExport = async () => {
    const rows = reportData.map((item) => [
      item.material_name,
      `${fmtQty(item.actual_qty)} ${item.unit}`,
      `${fmtQty(item.theoretical_qty)} ${item.unit}`,
      fmtQty(item.variance_qty),
      `${Number(item.variance_percentage).toFixed(1)}%`,
      fmtINR(item.variance_value),
      item.status,
    ]);

    const outletName = outlets.find((o) => String(o.id) === String(filters.outlet_id))?.outlet_name;

    await exportReportPDF({
      title: "Consumption Variance Report",
      outletName,
      dateRangeLabel: `${MONTHS[filters.month - 1]} ${filters.year}`,
      columns: ["Material", "Actual Qty", "Theoretical Qty", "Variance Qty", "Variance %", "Variance Value", "Status"],
      rows,
      summaryLines: [
        `Net Variance Value: ${fmtINR(totalVarianceValue)}`,
        `Warning Materials: ${warningCount}`,
        `Critical Materials: ${criticalCount}`,
      ],
      fileName: `consumption-variance-${filters.month}-${filters.year}.pdf`,
    });
    toast.success("Report exported");
  };

  const summaryCards = diagnostics ? [
    { label: 'Actual Source Complete', value: fmtYesNo(diagnostics.summary?.actual_source_complete) },
    { label: 'Theoretical Sales Present', value: fmtYesNo(diagnostics.summary?.theoretical_sales_present) },
    { label: 'Materials Total', value: fmtCount(diagnostics.summary?.materials_total) },
    { label: 'Comparable Materials', value: fmtCount(diagnostics.summary?.comparable_material_count) },
    { label: 'Non-comparable Materials', value: fmtCount(diagnostics.summary?.non_comparable_material_count) },
    { label: 'Actual-only Materials', value: fmtCount(diagnostics.summary?.actual_only_count) },
    { label: 'Theoretical-only Materials', value: fmtCount(diagnostics.summary?.theoretical_only_count) },
    { label: 'Mapping Missing Count', value: fmtCount(diagnostics.summary?.mapping_missing_count) },
    { label: 'Conversion Missing Count', value: fmtCount(diagnostics.summary?.conversion_missing_count) },
  ] : [];

  const actualSources = diagnostics?.source_coverage?.actual || null;
  const theoreticalSources = diagnostics?.source_coverage?.theoretical || null;
  const physical = diagnostics?.physical_movement_context || null;
  const materialRows = diagnostics?.materials || [];

  const sourceCards = [
    { title: 'Opening Stock', data: actualSources?.opening_stock, note: 'Completed month upload' },
    { title: 'Purchases', data: actualSources?.material_purchase, note: 'Completed purchase upload' },
    { title: 'Closing Stock', data: actualSources?.closing_stock, note: 'Completed month upload' },
    { title: 'Item Sales', data: theoreticalSources?.item_sales, note: 'Completed sales upload' },
    { title: 'Recipes', data: theoreticalSources?.recipes, note: 'Active recipe coverage' },
  ];

  const movementCards = [
    { label: 'GRN', key: 'grn' },
    { label: 'Transfer In', key: 'transfer_in' },
    { label: 'Transfer Out', key: 'transfer_out' },
    { label: 'Wastage', key: 'wastage' },
    { label: 'Production Issue', key: 'production_issue' },
    { label: 'Production Receipt', key: 'production_receipt' },
    { label: 'Physical Adjustment', key: 'physical_adjustment' },
    { label: 'Purchase Return', key: 'purchase_return' },
  ];

  const renderCoverageCard = (card) => {
    const data = card.data;
    const present = card.title === 'Item Sales'
      ? Boolean(data?.completed_item_sales_present)
      : card.title === 'Recipes'
        ? Boolean((data?.menu_items_with_recipe || 0) > 0 || (data?.recipe_ingredient_count || 0) > 0)
        : Boolean(data?.completed_upload_present);
    return (
      <div key={card.title} className={`rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-[14px] font-semibold ${mainCls}`}>{card.title}</p>
            <p className={`mt-1 text-[12px] ${mutedCls}`}>{card.note}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${present ? 'bg-[#DDF6E8] text-[#28C76F]' : 'bg-[#FCE7E7] text-[#EA5455]'}`}>
            {present ? 'Present' : 'Missing'}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-3">
          {card.title === 'Recipes' ? (
            <>
              <div><div className={mutedCls}>With Recipe</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtCount(data?.menu_items_with_recipe)}</div></div>
              <div><div className={mutedCls}>Without Recipe</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtCount(data?.menu_items_without_recipe)}</div></div>
              <div><div className={mutedCls}>Ingredients</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtCount(data?.recipe_ingredient_count)}</div></div>
              <div><div className={mutedCls}>Mapped</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtCount(data?.mapped_recipe_ingredient_count)}</div></div>
              <div><div className={mutedCls}>Unmapped</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtCount(data?.unmapped_recipe_ingredient_count)}</div></div>
              <div><div className={mutedCls}>Units Missing</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtCount(data?.recipe_units_missing)}</div></div>
            </>
          ) : card.title === 'Item Sales' ? (
            <>
              <div><div className={mutedCls}>Uploads</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtCount(data?.upload_count)}</div></div>
              <div><div className={mutedCls}>Items</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtCount(data?.item_count)}</div></div>
              <div><div className={mutedCls}>Menu Items</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtCount(data?.sales_menu_item_count)}</div></div>
              <div><div className={mutedCls}>Sales Qty</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{data?.sales_qty_total === null ? '—' : fmtQty(data.sales_qty_total)}</div></div>
            </>
          ) : (
            <>
              <div><div className={mutedCls}>Uploads</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtCount(data?.upload_count)}</div></div>
              <div><div className={mutedCls}>Items</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtCount(data?.item_count)}</div></div>
              <div><div className={mutedCls}>Mapped</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtCount(data?.mapped_material_count)}</div></div>
              <div><div className={mutedCls}>Unmapped</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtCount(data?.unmapped_material_count)}</div></div>
              <div><div className={mutedCls}>Units</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtCount(data?.unit_count)}</div></div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Consumption Variance Report</h1>
          <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>Actual vs. theoretical raw-material usage per outlet, per month</p>
        </div>
        {!loading && reportData.length > 0 && (
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
              <label className={`mb-1.5 block text-[13px] font-medium ${labelCls}`}>Outlet *</label>
              <select value={filters.outlet_id} disabled={outletLocked} style={outletLocked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined} onChange={(e) => setFilters({ ...filters, outlet_id: e.target.value })}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`}>
                <option value="">Select Outlet</option>
                {outlets.map(o => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
              </select>
            </div>
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${labelCls}`}>Month *</label>
              <select value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`}>
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${labelCls}`}>Year *</label>
              <input type="number" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`} />
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

      {loading && (
        <div className={`flex items-center justify-center gap-3 rounded-md border py-12 ${cardCls}`}>
          <Loader2 size={22} className="animate-spin" style={{ color: primaryColor }} />
          <span className={`text-[15px] font-medium ${mutedCls}`}>Generating report…</span>
        </div>
      )}

      {!loading && reportData.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className={`animate-fade-up rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
              <p className={`text-[13px] ${mutedCls}`}>Net Variance Value</p>
              <p className={`mt-1 text-[20px] font-bold ${totalVarianceValue > 0 ? "text-[#EA5455]" : "text-[#28C76F]"}`}>{fmtINR(totalVarianceValue)}</p>
            </div>
            <div className={`animate-fade-up rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
              <p className={`text-[13px] ${mutedCls}`}>Warning Materials</p>
              <p className="mt-1 text-[20px] font-bold text-[#FF9F43]">{warningCount}</p>
            </div>
            <div className={`animate-fade-up rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
              <p className={`text-[13px] ${mutedCls}`}>Critical Materials</p>
              <p className="mt-1 text-[20px] font-bold text-[#EA5455]">{criticalCount}</p>
            </div>
          </div>

          <div className={`animate-fade-up rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
            <div className={`flex items-center gap-3 border-b px-4 py-3 sm:px-6 ${borderCls}`}>
              <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                <BarChart2 size={17} />
              </div>
              <h3 className={`text-[15px] font-semibold ${mainCls}`}>Variance by Material</h3>
              <span className={`ml-auto hidden text-[12px] ${mutedCls} sm:inline`}>← Scroll to see all columns</span>
            </div>
            <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
              <table className="min-w-full" style={{ minWidth: "800px" }}>
                <thead>
                  <tr>
                    {['Material', 'Actual Qty', 'Theoretical Qty', 'Variance Qty', 'Variance %', 'Variance Value', 'Status'].map((h) => (
                      <th key={h} className={`whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider ${thCls}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${borderCls}`}>
                  {reportData.map((item, idx) => (
                    <tr key={idx} className={`transition ${trHover}`}>
                      <td className={`px-4 py-3 text-[14px] font-medium ${mainCls}`}>{item.material_name}</td>
                      <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{fmtQty(item.actual_qty)} {item.unit}</td>
                      <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{fmtQty(item.theoretical_qty)} {item.unit}</td>
                      <td className={`px-4 py-3 text-[14px] font-semibold tabular-nums ${Number(item.variance_qty) > 0 ? 'text-[#EA5455]' : 'text-[#28C76F]'}`}>{fmtQty(item.variance_qty)}</td>
                      <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{Number(item.variance_percentage).toFixed(1)}%</td>
                      <td className={`px-4 py-3 text-[14px] font-semibold tabular-nums ${Number(item.variance_value) > 0 ? 'text-[#EA5455]' : 'text-[#28C76F]'}`}>{fmtINR(item.variance_value)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${item.status === 'Critical' ? 'bg-[#FCE7E7] text-[#EA5455]' : item.status === 'Warning' ? 'bg-[#FFEAC2] text-[#FF9F43]' : 'bg-[#DDF6E8] text-[#28C76F]'}`}>{item.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && hasGenerated && reportData.length === 0 && (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 px-4 text-center ${cardCls}`}>
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-[#3B405A]" : "bg-[#EBE9F1]"}`}>
            <AlertTriangle size={26} className={mutedCls} />
          </div>
          <p className={`text-[16px] font-semibold ${mainCls}`}>No consumption data for this month</p>
          <p className={`mt-1 text-[13px] ${mutedCls}`}>Needs completed Opening/Closing Stock, Purchase and Item Sales uploads for this outlet and month</p>
        </div>
      )}

      {!loading && hasGenerated && (
        <div className={`animate-fade-up rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
          <div className={`border-b px-4 py-3 sm:px-6 ${borderCls}`}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className={`text-[16px] font-semibold ${mainCls}`}>Coverage &amp; Comparability</h3>
                <p className={`mt-1 text-[13px] ${mutedCls}`}>Diagnostic normalization and source coverage only. Existing variance values remain unchanged.</p>
              </div>
            </div>
          </div>

          {diagnosticsError && (
            <div className="px-4 pt-4 sm:px-6">
              <div className={`rounded-md border px-4 py-3 text-[13px] ${isDark ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                {diagnosticsError}
              </div>
            </div>
          )}

          {diagnostics && (
            <div className="space-y-6 p-4 sm:p-6">
              <section className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                    <FileText size={17} />
                  </div>
                  <h4 className={`text-[15px] font-semibold ${mainCls}`}>Summary</h4>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                  {summaryCards.map((card) => (
                    <div key={card.label} className={`rounded-md border p-4 ${cardCls}`}>
                      <p className={`text-[12px] ${mutedCls}`}>{card.label}</p>
                      <p className={`mt-1 text-[18px] font-bold ${mainCls}`}>{card.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                    <BarChart2 size={17} />
                  </div>
                  <h4 className={`text-[15px] font-semibold ${mainCls}`}>A. Source Coverage</h4>
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div className="space-y-4">
                    <h5 className={`text-[13px] font-semibold uppercase tracking-wider ${mutedCls}`}>Actual Inputs</h5>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      {sourceCards.slice(0, 3).map(renderCoverageCard)}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h5 className={`text-[13px] font-semibold uppercase tracking-wider ${mutedCls}`}>Theoretical Inputs</h5>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {sourceCards.slice(3).map(renderCoverageCard)}
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                    <BarChart2 size={17} />
                  </div>
                  <h4 className={`text-[15px] font-semibold ${mainCls}`}>B. Material Comparability</h4>
                </div>
                <div className={`overflow-x-auto rounded-md border ${borderCls}`}>
                  <table className="min-w-full" style={{ minWidth: "1100px" }}>
                    <thead>
                      <tr>
                        {['Material', 'Actual Qty', 'Actual Unit', 'Theoretical Qty', 'Theoretical Unit', 'Comparable', 'Normalized Actual Qty', 'Normalized Theoretical Qty', 'Normalized Diagnostic Delta', 'Reason'].map((h) => (
                          <th key={h} className={`whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider ${thCls}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${borderCls}`}>
                      {materialRows.map((row) => (
                        <tr key={row.raw_material_id} className={`transition ${trHover}`}>
                          <td className={`px-4 py-3 text-[14px] font-medium ${mainCls}`}>{row.material_name}</td>
                          <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{row.actual.qty === null ? '—' : fmtQty(row.actual.qty)}</td>
                          <td className={`px-4 py-3 text-[14px] ${mutedCls}`}>{row.actual.unit_name || '—'}</td>
                          <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{row.theoretical.qty === null ? '—' : fmtQty(row.theoretical.qty)}</td>
                          <td className={`px-4 py-3 text-[14px] ${mutedCls}`}>{row.theoretical.unit_name || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${row.comparison.comparable ? 'bg-[#DDF6E8] text-[#28C76F]' : 'bg-[#FCE7E7] text-[#EA5455]'}`}>{row.comparison.comparable ? 'Yes' : 'No'}</span>
                          </td>
                          <td className={`px-4 py-3 text-[14px] tabular-nums ${mainCls}`}>{row.comparison.actual_qty_base === null ? '—' : fmtQty(row.comparison.actual_qty_base)}</td>
                          <td className={`px-4 py-3 text-[14px] tabular-nums ${mainCls}`}>{row.comparison.theoretical_qty_base === null ? '—' : fmtQty(row.comparison.theoretical_qty_base)}</td>
                          <td className={`px-4 py-3 text-[14px] font-semibold tabular-nums ${row.comparison.normalized_quantity_delta > 0 ? 'text-[#EA5455]' : 'text-[#28C76F]'}`}>{row.comparison.normalized_quantity_delta === null ? '—' : fmtQty(row.comparison.normalized_quantity_delta)}</td>
                          <td className={`px-4 py-3 text-[13px] ${mutedCls}`}>{row.comparison.non_comparable_reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                    <BarChart2 size={17} />
                  </div>
                  <h4 className={`text-[15px] font-semibold ${mainCls}`}>C. Physical Movement Context</h4>
                </div>
                {physical?.location_state !== 'UNIQUE' ? (
                  <div className={`rounded-md border p-4 text-[13px] ${cardCls}`}>
                    <p className={`font-semibold ${mainCls}`}>Location state: {physical?.location_state || 'NONE'}</p>
                    {physical?.location_state === 'AMBIGUOUS' && physical?.candidates?.length > 0 && (
                      <p className={`mt-1 ${mutedCls}`}>Multiple inventory locations exist for this outlet: {physical.candidates.map((c) => c.location_name).join(', ')}.</p>
                    )}
                    {physical?.location_state === 'NONE' && (
                      <p className={`mt-1 ${mutedCls}`}>No active inventory-enabled outlet location was found for this outlet.</p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className={`rounded-md border p-4 ${cardCls}`}>
                      <p className={`text-[13px] ${mutedCls}`}>Location</p>
                      <p className={`mt-1 text-[15px] font-semibold ${mainCls}`}>{physical.location.location_name}</p>
                      <p className={`mt-1 text-[12px] ${mutedCls}`}>{physical.disclaimer}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {movementCards.map((card) => {
                        const totals = physical.movement_totals?.[card.key] || { qty_in: null, qty_out: null };
                        return (
                          <div key={card.key} className={`rounded-md border p-4 ${cardCls}`}>
                            <p className={`text-[13px] font-semibold ${mainCls}`}>{card.label}</p>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                              <div><div className={mutedCls}>Qty In</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtQty(totals.qty_in)}</div></div>
                              <div><div className={mutedCls}>Qty Out</div><div className={`mt-0.5 font-semibold ${mainCls}`}>{fmtQty(totals.qty_out)}</div></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                    <BarChart2 size={17} />
                  </div>
                  <h4 className={`text-[15px] font-semibold ${mainCls}`}>D. Warning / Disclaimer</h4>
                </div>
                <div className={`rounded-md border px-4 py-3 text-[13px] ${isDark ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                  Existing Consumption Variance remains accounting-vs-theoretical. Diagnostic normalization shown here does not modify the report calculation.
                </div>
                <div className={`rounded-md border px-4 py-3 text-[13px] ${isDark ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                  Physical ledger movements are shown as operational context only and are not treated as material consumption.
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      {!loading && !hasGenerated && (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 px-4 text-center ${cardCls}`}>
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-[#3B405A]" : "bg-[#EBE9F1]"}`}>
            <FileText size={26} className={mutedCls} />
          </div>
          <p className={`text-[16px] font-semibold ${mainCls}`}>No report generated yet</p>
          <p className={`mt-1 text-[13px] ${mutedCls}`}>Select outlet, month and year then click Generate</p>
        </div>
      )}
    </div>
  );
};

export default ConsumptionVarianceReport;

import { useState, useEffect } from 'react';
import { Search, Loader2, Receipt, FileText, AlertCircle } from 'lucide-react';
import { reportAPI, masterAPI } from '../../services/api';
import toast from 'react-hot-toast';

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };
const fmtINR = (n = 0) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);

const PurchaseGSTReport = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [filters, setFilters] = useState({ supplier_id: 'all', from_date: firstOfMonth(), to_date: today() });

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
      const s = await masterAPI.getSuppliers();
      setSuppliers(s.data?.data || s.data || []);
    } catch { /* silent */ }
  };

  const handleGenerateReport = async () => {
    if (!filters.from_date || !filters.to_date) { toast.error('Select both dates'); return; }
    setLoading(true);
    try {
      const r = await reportAPI.getPurchaseGST(filters);
      setReportData(r.data?.data || r.data || []);
      setHasGenerated(true);
      toast.success('Report generated');
    } catch { toast.error('Failed to generate report'); }
    finally { setLoading(false); }
  };

  const totals = reportData.reduce((acc, item) => ({
    taxable: acc.taxable + parseFloat(item.taxable_value || 0),
    tax: acc.tax + parseFloat(item.tax_amount || 0),
    gross: acc.gross + parseFloat(item.gross_value || 0),
  }), { taxable: 0, tax: 0, gross: 0 });

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Purchase GST Report</h1>
        <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>Taxable value and tax paid on posted GRNs, per supplier — a summary, not a GSTR-ready filing export</p>
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
              <label className={`mb-1.5 block text-[13px] font-medium ${labelCls}`}>Supplier</label>
              <select value={filters.supplier_id} onChange={(e) => setFilters({ ...filters, supplier_id: e.target.value })}
                className={`h-[42px] w-full rounded-md border px-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`}>
                <option value="all">All Suppliers</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
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

      {loading && (
        <div className={`flex items-center justify-center gap-3 rounded-md border py-12 ${cardCls}`}>
          <Loader2 size={22} className="animate-spin" style={{ color: primaryColor }} />
          <span className={`text-[15px] font-medium ${mutedCls}`}>Generating report…</span>
        </div>
      )}

      {!loading && reportData.length > 0 && (
        <div className={`animate-fade-up flex flex-col gap-3 rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:flex-row sm:items-center sm:p-5 ${cardCls}`}>
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#FCE7E7]">
              <Receipt size={22} className="text-[#EA5455]" />
            </div>
            <div>
              <p className={`text-[13px] ${mutedCls}`}>Total Tax Paid</p>
              <p className="mt-0.5 text-[22px] font-bold text-[#EA5455]">{fmtINR(totals.tax)}</p>
            </div>
          </div>
          <div className={`sm:ml-8 flex items-center gap-6 text-[13px] ${mutedCls}`}>
            <span>Taxable Value: <strong className={mainCls}>{fmtINR(totals.taxable)}</strong></span>
            <span>Gross Value: <strong className={mainCls}>{fmtINR(totals.gross)}</strong></span>
          </div>
        </div>
      )}

      {!loading && reportData.length > 0 && (
        <div className={`animate-fade-up rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
          <div className={`flex items-center gap-3 border-b px-4 py-3 sm:px-6 ${borderCls}`}>
            <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
              <Receipt size={17} />
            </div>
            <h3 className={`text-[15px] font-semibold ${mainCls}`}>Purchase GST by Supplier</h3>
          </div>
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
            <table className="min-w-full" style={{ minWidth: "760px" }}>
              <thead>
                <tr>
                  {["Supplier", "GSTIN", "GRNs", "Taxable Value", "Tax Amount", "Gross Value"].map((h) => (
                    <th key={h} className={`whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider ${thCls}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${borderCls}`}>
                {reportData.map((item, idx) => (
                  <tr key={idx} className={`transition ${trHover}`}>
                    <td className={`px-4 py-3 text-[14px] font-medium ${mainCls}`}>{item.supplier_name || '-'}</td>
                    <td className={`px-4 py-3 text-[14px] ${mutedCls}`}>{item.gstin || '-'}</td>
                    <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{item.grn_count}</td>
                    <td className={`px-4 py-3 text-[14px] tabular-nums ${mutedCls}`}>{fmtINR(item.taxable_value)}</td>
                    <td className={`px-4 py-3 text-[14px] font-semibold tabular-nums text-[#EA5455]`}>{fmtINR(item.tax_amount)}</td>
                    <td className={`px-4 py-3 text-[14px] font-semibold tabular-nums ${mainCls}`}>{fmtINR(item.gross_value)}</td>
                  </tr>
                ))}
                <tr className={isDark ? "bg-[#25293C]" : "bg-[#F8F7FA]"}>
                  <td colSpan="3" className={`px-4 py-3 text-right text-[13px] font-semibold ${mainCls}`}>Total</td>
                  <td className={`px-4 py-3 text-[14px] font-bold ${mainCls}`}>{fmtINR(totals.taxable)}</td>
                  <td className="px-4 py-3 text-[14px] font-bold text-[#EA5455]">{fmtINR(totals.tax)}</td>
                  <td className={`px-4 py-3 text-[14px] font-bold ${mainCls}`}>{fmtINR(totals.gross)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && hasGenerated && reportData.length === 0 && (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 px-4 text-center ${cardCls}`}>
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-[#3B405A]" : "bg-[#EBE9F1]"}`}>
            <AlertCircle size={26} className={mutedCls} />
          </div>
          <p className={`text-[16px] font-semibold ${mainCls}`}>No posted GRNs found</p>
          <p className={`mt-1 text-[13px] ${mutedCls}`}>No purchases were posted in this date range for the selected supplier</p>
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

export default PurchaseGSTReport;

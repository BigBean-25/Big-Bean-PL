import { useEffect, useRef, useState } from "react";
import { RefreshCw, Trash2, Loader2, MapPin, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { reportAPI } from "../../services/api";
import { useSelectedOutlet } from "../../hooks/useSelectedOutlet";

const getPrimaryColor = () => {
  try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; }
};
const getThemeMode = () => {
  try {
    const mode = localStorage.getItem("bbc_theme_mode") || "light";
    if (mode === "system") return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
    return mode;
  } catch { return "light"; }
};

const fmtINR = (n = 0) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n = 0) => Number(n || 0).toFixed(3);
const todayISO = () => new Date().toISOString().slice(0, 10);
const startOfMonthISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

const WastageByCategory = () => {
  const { selectedOutletId } = useSelectedOutlet();
  const selectedOutletIdValue = String(selectedOutletId || "all");
  const hasNumericOutlet = selectedOutletIdValue !== "all" && Number.isInteger(Number(selectedOutletIdValue)) && Number(selectedOutletIdValue) > 0;
  const outletGuardMessage = "Select a specific outlet to view outlet wastage by category.";
  const [from, setFrom] = useState(startOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(hasNumericOutlet);
  const requestSeqRef = useRef(0);

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

  const fetchData = async () => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;

    if (!hasNumericOutlet) {
      setReport(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await reportAPI.getWastageByCategory({
        outlet_id: Number(selectedOutletIdValue),
        from_date: from,
        to_date: to,
      });
      if (requestSeqRef.current !== requestSeq) return;
      setReport(res?.data?.data || res?.data || null);
    } catch (error) {
      if (requestSeqRef.current !== requestSeq) return;
      toast.error(error.response?.data?.message || "Failed to load wastage by category");
      setReport(null);
    } finally {
      if (requestSeqRef.current === requestSeq) setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [from, to, selectedOutletIdValue]);

  const displayReport = hasNumericOutlet ? report : null;
  const rows = displayReport?.rows || [];
  const totalValue = Number(displayReport?.total_value || 0);
  const locationState = displayReport?.location_state || "NONE";
  const resolvedLocation = displayReport?.resolved_location || null;
  const warnings = displayReport?.warnings || [];
  const locationCandidates = displayReport?.location_candidates || [];
  const dataLimited = locationState !== "UNIQUE";

  return (
    <div className="space-y-5" style={{ fontFamily: '"Public Sans", "Inter", system-ui, sans-serif' }}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${mainCls}`}>Wastage by Category</h1>
          <p className={`mt-1 text-[14px] ${mutedCls}`}>Posted outlet inventory wastage grouped by raw material category.</p>
        </div>
        <button type="button" onClick={fetchData} className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[14px] font-medium ${cardCls}`}>
          <RefreshCw size={18} /> Refresh
        </button>
      </div>

      <div className={`flex flex-wrap items-end gap-3 rounded-md border p-4 ${cardCls}`}>
        <div>
          <label className={`mb-1 block text-[12px] font-medium ${mutedCls}`}>From</label>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`h-10 rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
        </div>
        <div>
          <label className={`mb-1 block text-[12px] font-medium ${mutedCls}`}>To</label>
          <input type="date" value={to} min={from} max={todayISO()} onChange={(e) => setTo(e.target.value)} className={`h-10 rounded-md border px-3 text-[14px] outline-none ${inputCls}`} />
        </div>
        <div className="ml-auto text-right">
          <p className={`text-[12px] ${mutedCls}`}>Total Wastage Value</p>
          <p className={`text-[18px] font-semibold ${mainCls}`}>{fmtINR(totalValue)}</p>
        </div>
      </div>

      <div className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
        <div className={`border-b px-4 py-3 sm:px-6 ${borderCls}`}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className={`text-[16px] font-semibold ${mainCls}`}>Outlet Inventory Context</h3>
              <p className={`mt-1 text-[13px] ${mutedCls}`}>Resolved physical inventory location and range used for this report.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${locationState === "UNIQUE" ? "bg-[#DDF6E8] text-[#28C76F]" : locationState === "AMBIGUOUS" ? "bg-[#FFF4E5] text-[#FF9F43]" : "bg-[#FCE7E7] text-[#EA5455]"}`}>
              {locationState}
            </span>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          {resolvedLocation ? (
            <div className={`rounded-md border p-4 ${cardCls}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                  <MapPin size={18} />
                </div>
                <div>
                  <p className={`text-[14px] font-semibold ${mainCls}`}>Resolved Physical Inventory Location</p>
                  <p className={`mt-1 text-[13px] ${mutedCls}`}>{resolvedLocation.location_name}</p>
                  <p className={`mt-0.5 text-[12px] ${mutedCls}`}>{resolvedLocation.location_code || ""}</p>
                </div>
              </div>
            </div>
          ) : null}

          {warnings.length > 0 && (
            <div className={`rounded-md border px-4 py-3 text-[13px] ${isDark ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div className="space-y-1">
                  {warnings.map((warning) => <p key={warning}>{warning}</p>)}
                  {locationCandidates.length > 0 && (
                    <p>Candidate locations: {locationCandidates.map((candidate) => candidate.location_name).join(', ')}.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
        {!hasNumericOutlet ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center">
            <MapPin size={28} className={mutedCls} />
            <p className={`text-[14px] font-semibold ${mainCls}`}>{outletGuardMessage}</p>
          </div>
        ) : loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 size={28} className="animate-spin" style={{ color: primaryColor }} />
          </div>
        ) : dataLimited ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center">
            <Trash2 size={28} className={mutedCls} />
            <p className={`text-[14px] font-semibold ${mainCls}`}>Report data is limited</p>
            <p className={`max-w-xl text-[13px] ${mutedCls}`}>A single physical inventory location could not be resolved for this outlet, so category wastage values are not shown.</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center">
            <Trash2 size={28} className={mutedCls} />
            <p className={`text-[14px] ${mutedCls}`}>No wastage recorded for this range.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse">
              <thead>
                <tr className={`border-b ${borderCls}`}>
                  <th className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide ${mutedCls}`}>Category</th>
                  <th className={`px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide ${mutedCls}`}>Wastage Entries</th>
                  <th className={`px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide ${mutedCls}`}>Materials</th>
                  <th className={`px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide ${mutedCls}`}>Quantity</th>
                  <th className={`px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide ${mutedCls}`}>Total Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.category_name} className={`border-b last:border-b-0 ${borderCls}`}>
                    <td className={`px-4 py-3 text-[14px] font-medium ${mainCls}`}>{row.category_name}</td>
                    <td className={`px-4 py-3 text-right text-[14px] ${mainCls}`}>{row.wastage_count}</td>
                    <td className={`px-4 py-3 text-right text-[14px] ${mainCls}`}>{row.material_count}</td>
                    <td className={`px-4 py-3 text-right text-[14px] ${mainCls}`}>
                      {row.quantity_state === "COMPARABLE"
                        ? `${fmtQty(row.total_qty)} ${row.unit_name || ''}`.trim()
                        : row.quantity_state === "MIXED_UNITS"
                          ? 'Mixed units'
                          : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right text-[14px] font-semibold ${mainCls}`}>{fmtINR(row.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default WastageByCategory;

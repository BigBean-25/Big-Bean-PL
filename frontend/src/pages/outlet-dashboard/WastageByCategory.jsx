import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Trash2, Loader2, MapPin, AlertTriangle, CalendarDays } from "lucide-react";
import toast from "react-hot-toast";
import { reportAPI } from "../../services/api";
import { useSelectedOutlet } from "../../hooks/useSelectedOutlet";

const getPrimaryColor = () => {
  try {
    return localStorage.getItem("bbc_primary_color") || "#7367F0";
  } catch {
    return "#7367F0";
  }
};

const getThemeMode = () => {
  try {
    const mode = localStorage.getItem("bbc_theme_mode") || "light";
    if (mode === "system") return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
    return mode;
  } catch {
    return "light";
  }
};

const fmtINR = (n = 0) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n = 0) => Number(n || 0).toFixed(3);
const todayISO = () => new Date().toISOString().slice(0, 10);
const startOfMonthISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isRealISODate = (value) => {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

const DateField = ({
  label,
  value,
  min,
  max,
  tone,
  focused,
  primaryColor,
  isDark,
  mutedCls,
  mainCls,
  iconRotation = "",
  onFocus,
  onBlur,
  onChange,
}) => {
  const neutralWrapper = isDark
    ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]"
    : "border-[#DBDADE] bg-white text-[#2F2B3D]";
  const warningWrapper = isDark
    ? "border-[#FF9F43]/35 bg-[#3A2E1D]/35 text-[#D0D2D6]"
    : "border-[#FFF0D9] bg-[#FFFCF7] text-[#2F2B3D]";
  const errorWrapper = isDark
    ? "border-[#EA5455]/45 bg-[#4A1F28]/35 text-[#D0D2D6]"
    : "border-[#FCE7E7] bg-[#FFF7F7] text-[#2F2B3D]";

  const wrapperCls = tone === "error" ? errorWrapper : tone === "warning" ? warningWrapper : neutralWrapper;
  const inputToneCls = tone === "error"
    ? "text-[#EA5455]"
    : tone === "warning"
      ? isDark ? "text-[#FF9F43]" : "text-[#D98A17]"
      : isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  const focusShadow = focused
    ? tone === "error"
      ? "0 0 0 1px rgba(234,84,85,0.55), 0 0 0 5px rgba(234,84,85,0.12)"
      : `0 0 0 1px ${primaryColor}88, 0 0 0 5px ${primaryColor}18`
    : undefined;

  const iconCls = tone === "error"
    ? "text-[#EA5455]"
    : tone === "warning"
      ? isDark ? "text-[#FF9F43]" : "text-[#D98A17]"
      : mutedCls;

  const iconStyle = focused && tone !== "error"
    ? { color: primaryColor }
    : undefined;

  return (
    <div
      className={`group flex-1 rounded-2xl border p-3 transition-all duration-300 hover:-translate-y-[1px] hover:shadow-[0_10px_24px_rgba(47,43,61,0.08)] ${wrapperCls}`}
      style={focusShadow ? { boxShadow: focusShadow } : undefined}
    >
      <label className={`block text-[12px] font-medium ${tone === "error" ? (isDark ? "text-[#F6B0B4]" : "text-[#EA5455]") : tone === "warning" ? (isDark ? "text-[#FFD5A1]" : "text-[#C88212]") : mutedCls}`}>{label}</label>
      <div className="relative mt-2">
        <CalendarDays
          size={18}
          className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transform transition-all duration-300 ${focused ? "scale-110" : "scale-100"} ${iconRotation} ${iconCls}`}
          style={iconStyle}
        />
        <input
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          aria-invalid={tone === "error"}
          className={`h-11 w-full rounded-xl border border-transparent bg-transparent px-10 text-[14px] outline-none transition-all duration-300 ${inputToneCls}`}
        />
      </div>
    </div>
  );
};

const WastageByCategory = () => {
  const { selectedOutletId } = useSelectedOutlet();
  const selectedOutletIdValue = String(selectedOutletId ?? "all").trim() || "all";
  const outletValidation = useMemo(() => {
    const isValid = /^\d+$/.test(selectedOutletIdValue) && Number(selectedOutletIdValue) > 0;

    return {
      normalizedId: selectedOutletIdValue,
      isValid,
      numericId: isValid ? Number(selectedOutletIdValue) : null,
    };
  }, [selectedOutletIdValue]);

  const [from, setFrom] = useState(startOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [focusedDateField, setFocusedDateField] = useState(null);
  const requestSeqRef = useRef(0);

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

  const dateValidation = useMemo(() => {
    const fromValue = String(from ?? "").trim();
    const toValue = String(to ?? "").trim();
    const hasFrom = Boolean(fromValue);
    const hasTo = Boolean(toValue);
    const hasCompleteDates = hasFrom && hasTo;
    const fromIsReal = hasFrom && isRealISODate(fromValue);
    const toIsReal = hasTo && isRealISODate(toValue);
    const datesAreReal = fromIsReal && toIsReal;
    const dateOrderIsValid = datesAreReal && fromValue <= toValue;

    let status = "valid";
    let message = "";
    let tone = "neutral";

    if (!hasCompleteDates) {
      status = "incomplete";
      message = "Complete both dates to refresh the report.";
      tone = "warning";
    } else if (!fromIsReal || !toIsReal) {
      status = "invalid";
      message = "Choose a valid From date and To date.";
      tone = "error";
    } else if (!dateOrderIsValid) {
      status = "range";
      message = "To date must be on or after From date.";
      tone = "error";
    }

    return {
      fromValue,
      toValue,
      hasCompleteDates,
      fromIsReal,
      toIsReal,
      datesAreReal,
      dateOrderIsValid,
      isValid: hasCompleteDates && datesAreReal && dateOrderIsValid,
      status,
      message,
      tone,
    };
  }, [from, to]);

  const hasNumericOutlet = outletValidation.isValid;
  const canFetch = hasNumericOutlet && dateValidation.isValid;
  const displayReport = hasNumericOutlet ? report : null;
  const rows = displayReport?.rows || [];
  const totalValue = Number(displayReport?.total_value || 0);
  const locationState = displayReport?.location_state || "NONE";
  const resolvedLocation = displayReport?.resolved_location || null;
  const warnings = displayReport?.warnings || [];
  const locationCandidates = displayReport?.location_candidates || [];
  const dataLimited = locationState !== "UNIQUE";
  const showDateValidation = hasNumericOutlet && dateValidation.status !== "valid";
  const showValidationPlaceholder = hasNumericOutlet && !displayReport && !dateValidation.isValid;
  const showRefreshing = loading && Boolean(displayReport) && canFetch;

  const fetchData = async () => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;

    if (!canFetch) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const res = await reportAPI.getWastageByCategory({
        outlet_id: outletValidation.numericId,
        from_date: dateValidation.fromValue,
        to_date: dateValidation.toValue,
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

  useEffect(() => {
    fetchData();
  }, [from, to, selectedOutletIdValue]);

  return (
    <div className="space-y-5" style={{ fontFamily: '"Public Sans", "Inter", system-ui, sans-serif' }}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${mainCls}`}>Wastage by Category</h1>
          <p className={`mt-1 text-[14px] ${mutedCls}`}>Posted outlet inventory wastage grouped by raw material category.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showRefreshing ? (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium ${isDark ? "border-[#3B405A] bg-[#25293C] text-[#A5A8B6]" : "border-[#DBDADE] bg-white text-[#6F6B7D]"}`}>
              <Loader2 size={14} className="animate-spin" />
              Refreshing
            </span>
          ) : null}
          <button
            type="button"
            onClick={fetchData}
            disabled={!canFetch || loading}
            className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[14px] font-medium transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${cardCls}`}
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className={`rounded-2xl border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] transition-all duration-300 ${cardCls}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-1 flex-col gap-4 md:flex-row md:items-end">
            <DateField
              label="From"
              value={from}
              max={todayISO()}
              tone={hasNumericOutlet ? (dateValidation.status === "valid" ? "neutral" : dateValidation.tone) : "neutral"}
              focused={focusedDateField === "from"}
              primaryColor={primaryColor}
              isDark={isDark}
              mutedCls={mutedCls}
              mainCls={mainCls}
              iconRotation="-rotate-6"
              onFocus={() => setFocusedDateField("from")}
              onBlur={() => setFocusedDateField(null)}
              onChange={(e) => setFrom(e.target.value)}
            />

            <div className="hidden min-w-[72px] items-center justify-center md:flex">
              <div className="flex flex-col items-center justify-center gap-2">
                <span
                  className={`h-px w-10 rounded-full transition-all duration-300 ${canFetch ? "opacity-100" : "opacity-45"}`}
                  style={{ backgroundColor: canFetch ? primaryColor : (isDark ? "#3B405A" : "#DBDADE") }}
                />
                <span
                  className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${canFetch ? "scale-100 animate-pulse" : "scale-90"}`}
                  style={{ backgroundColor: canFetch ? primaryColor : (isDark ? "#3B405A" : "#DBDADE") }}
                />
                <span
                  className={`h-px w-10 rounded-full transition-all duration-300 ${canFetch ? "opacity-100" : "opacity-45"}`}
                  style={{ backgroundColor: canFetch ? primaryColor : (isDark ? "#3B405A" : "#DBDADE") }}
                />
              </div>
            </div>

            <DateField
              label="To"
              value={to}
              min={from}
              max={todayISO()}
              tone={hasNumericOutlet ? (dateValidation.status === "valid" ? "neutral" : dateValidation.tone) : "neutral"}
              focused={focusedDateField === "to"}
              primaryColor={primaryColor}
              isDark={isDark}
              mutedCls={mutedCls}
              mainCls={mainCls}
              iconRotation="rotate-6"
              onFocus={() => setFocusedDateField("to")}
              onBlur={() => setFocusedDateField(null)}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          <div className="min-w-[180px] text-right">
            <p className={`text-[12px] ${mutedCls}`}>Total Wastage Value</p>
            <p className={`text-[18px] font-semibold ${mainCls}`}>{fmtINR(totalValue)}</p>
            {showRefreshing ? (
              <p className={`mt-1 inline-flex items-center gap-1.5 text-[12px] ${mutedCls}`}>
                <Loader2 size={14} className="animate-spin" />
                Updating report
              </p>
            ) : null}
          </div>
        </div>

        {showDateValidation ? (
          <div className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-[13px] transition-all duration-300 ${dateValidation.tone === "error" ? (isDark ? "border-[#EA5455]/40 bg-[#4A1F28]/35 text-[#F5B7BB]" : "border-[#FCE7E7] bg-[#FFF7F7] text-[#C94D4D]") : isDark ? "border-[#FF9F43]/30 bg-[#3A2E1D]/30 text-[#FFD9A8]" : "border-[#FFF0D9] bg-[#FFFCF7] text-[#C88212]"}`}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p>{dateValidation.message}</p>
              {Boolean(report) ? (
                <p className={`text-[12px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>The previous valid report remains visible while the date range is being edited.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
        {!hasNumericOutlet ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center">
            <MapPin size={28} className={mutedCls} />
            <p className={`text-[14px] font-semibold ${mainCls}`}>Select a specific outlet to view outlet wastage by category.</p>
          </div>
        ) : showValidationPlaceholder ? (
          <div className={`flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center ${dateValidation.tone === "error" ? (isDark ? "bg-[#4A1F28]/20" : "bg-[#FFF7F7]") : (isDark ? "bg-[#3A2E1D]/20" : "bg-[#FFFCF7]")}`}>
            {dateValidation.status === "incomplete" ? (
              <CalendarDays size={28} className={isDark ? "text-[#FF9F43]" : "text-[#D98A17]"} />
            ) : (
              <AlertTriangle size={28} className={isDark ? "text-[#EA5455]" : "text-[#C94D4D]"} />
            )}
            <p className={`text-[14px] font-semibold ${mainCls}`}>{dateValidation.message}</p>
            {Boolean(report) ? (
              <p className={`max-w-xl text-[13px] ${mutedCls}`}>The previous valid report remains visible while the date range is being edited.</p>
            ) : null}
          </div>
        ) : loading && !displayReport ? (
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
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center">
            <Trash2 size={28} className={mutedCls} />
            <p className={`text-[14px] font-semibold ${mainCls}`}>No wastage entries found</p>
            <p className={`max-w-xl text-[13px] ${mutedCls}`}>No posted, approved or locked outlet wastage is available for the selected valid date range.</p>
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
                        ? `${fmtQty(row.total_qty)} ${row.unit_name || ""}`.trim()
                        : row.quantity_state === "MIXED_UNITS"
                          ? "Mixed units"
                          : "—"}
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

import { useEffect, useState } from "react";
import { TrendingUp, Target, RefreshCw, AlertCircle, Loader2, Save } from "lucide-react";
import toast from "react-hot-toast";
import { outletDashboardAPI, getStoredPermissions } from "../../services/api";
import { useSelectedOutlet, OutletScopeBadge } from "../../hooks/useSelectedOutlet";

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

const ChangeBadge = ({ percent }) => {
  if (percent === null || percent === undefined) {
    return <span className="rounded px-2.5 py-1 text-[13px] font-medium text-[#A8AAAE]">N/A</span>;
  }
  const positive = percent >= 0;
  return (
    <span
      className="rounded px-2.5 py-1 text-[13px] font-medium"
      style={{ color: positive ? "#28C76F" : "#EA5455", backgroundColor: positive ? "#E9F9EF" : "#FCEAEA" }}
    >
      {positive ? "+" : ""}{percent.toFixed(1)}%
    </span>
  );
};

const ComparisonCard = ({ title, data, cardCls, mutedCls, mainCls }) => (
  <div className={`rounded-md border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
    <div className="flex items-center justify-between gap-3">
      <p className={`text-[14px] font-semibold ${mainCls}`}>{title}</p>
      <ChangeBadge percent={data?.change_percent} />
    </div>
    <div className="mt-4 grid grid-cols-2 gap-4">
      <div>
        <p className={`text-[12px] ${mutedCls}`}>Current</p>
        <p className={`mt-1 text-[18px] font-semibold ${mainCls}`}>{fmtINR(data?.current?.net_sales)}</p>
      </div>
      <div>
        <p className={`text-[12px] ${mutedCls}`}>Previous</p>
        <p className={`mt-1 text-[18px] font-semibold ${mutedCls}`}>{fmtINR(data?.previous?.net_sales)}</p>
      </div>
    </div>
  </div>
);

const OutletDashboardOverview = () => {
  const { selectedOutletId, selectedOutletLabel } = useSelectedOutlet(() => fetchSummary());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [targetInput, setTargetInput] = useState("");
  const [savingTarget, setSavingTarget] = useState(false);

  const permissions = getStoredPermissions()?.sales_target || {};
  const canEditTarget = Boolean(permissions.can_edit);

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  const hasOutlet = selectedOutletId && selectedOutletId !== "all";

  const fetchSummary = async () => {
    if (!hasOutlet) { setSummary(null); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await outletDashboardAPI.getSummary({ outlet_id: selectedOutletId });
      const data = res?.data?.data || null;
      setSummary(data);
      setTargetInput(data?.target?.target_amount !== null && data?.target?.target_amount !== undefined ? String(data.target.target_amount) : "");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load dashboard summary");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSummary(); }, [selectedOutletId]);

  const handleSaveTarget = async () => {
    if (!hasOutlet) return;
    if (!targetInput || Number(targetInput) < 0) { toast.error("Enter a valid target amount"); return; }
    setSavingTarget(true);
    try {
      const now = new Date();
      await outletDashboardAPI.setTarget({
        outlet_id: selectedOutletId,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        target_amount: Number(targetInput),
      });
      toast.success("Sales target saved");
      await fetchSummary();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save target");
    } finally {
      setSavingTarget(false);
    }
  };

  const target = summary?.target;
  const percentOfTarget = target?.percent_of_target;

  return (
    <div className="space-y-5" style={{ fontFamily: '"Public Sans", "Inter", system-ui, sans-serif' }}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${mainCls}`}>Outlet Sales Overview</h1>
          <p className={`mt-1 text-[14px] ${mutedCls}`}>Gross, net and target sales with period-over-period comparisons.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OutletScopeBadge />
          <button type="button" onClick={fetchSummary} className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[14px] font-medium ${cardCls}`}>
            <RefreshCw size={18} /> Refresh
          </button>
        </div>
      </div>

      {!hasOutlet ? (
        <div className={`flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-md border p-8 text-center ${cardCls}`}>
          <AlertCircle size={32} className={mutedCls} />
          <p className={`text-[15px] font-semibold ${mainCls}`}>Select a specific outlet</p>
          <p className={`text-[13px] ${mutedCls}`}>Choose an outlet from the top bar to view its sales dashboard.</p>
        </div>
      ) : loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <Loader2 size={32} className="animate-spin" style={{ color: primaryColor }} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className={`rounded-md border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-md" style={{ backgroundColor: `${primaryColor}18` }}>
                  <TrendingUp size={22} style={{ color: primaryColor }} />
                </div>
                <div>
                  <p className={`text-[12px] ${mutedCls}`}>Gross Sales (Today)</p>
                  <p className={`text-[20px] font-semibold ${mainCls}`}>{fmtINR(summary?.today_vs_last_week?.current?.gross_sales)}</p>
                </div>
              </div>
            </div>
            <div className={`rounded-md border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E9F9EF] text-[#28C76F]">
                  <TrendingUp size={22} />
                </div>
                <div>
                  <p className={`text-[12px] ${mutedCls}`}>Net Sales (Month to Date)</p>
                  <p className={`text-[20px] font-semibold ${mainCls}`}>{fmtINR(summary?.month_vs_last_month?.current?.net_sales)}</p>
                </div>
              </div>
            </div>
            <div className={`rounded-md border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#FFF4E5] text-[#FF9F43]">
                  <Target size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[12px] ${mutedCls}`}>Target Sales (This Month)</p>
                  {target?.target_amount !== null && target?.target_amount !== undefined ? (
                    <p className={`text-[20px] font-semibold ${mainCls}`}>
                      {fmtINR(target.target_amount)}
                      {percentOfTarget !== null && percentOfTarget !== undefined && (
                        <span className={`ml-2 text-[13px] font-medium ${mutedCls}`}>({percentOfTarget.toFixed(0)}% achieved)</span>
                      )}
                    </p>
                  ) : (
                    <p className={`text-[14px] ${mutedCls}`}>Not set</p>
                  )}
                </div>
              </div>
              {canEditTarget && (
                <div className="mt-4 flex gap-2">
                  <input
                    type="number" min="0" step="0.01" value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    placeholder="Set monthly target"
                    className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}
                  />
                  <button
                    type="button" onClick={handleSaveTarget} disabled={savingTarget}
                    className="flex h-10 items-center justify-center gap-1 rounded-md px-3 text-[13px] font-semibold text-white disabled:opacity-70"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {savingTarget ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ComparisonCard title="Today vs Same Day Last Week" data={summary?.today_vs_last_week} cardCls={cardCls} mutedCls={mutedCls} mainCls={mainCls} />
            <ComparisonCard title="This Week vs Last Week" data={summary?.week_vs_last_week} cardCls={cardCls} mutedCls={mutedCls} mainCls={mainCls} />
            <ComparisonCard title="This Month vs Last Month" data={summary?.month_vs_last_month} cardCls={cardCls} mutedCls={mutedCls} mainCls={mainCls} />
          </div>
        </>
      )}
    </div>
  );
};

export default OutletDashboardOverview;

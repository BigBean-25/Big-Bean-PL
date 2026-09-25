import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  TrendingDown,
  Target,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Save,
  BarChart3,
  Trophy,
  Layers,
  Sparkles,
  Clock,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import toast from "react-hot-toast";
import { outletDashboardAPI, getStoredPermissions } from "../../services/api";
import { salesAPI } from "../../services/salesAPI";
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
const compactINR = (n = 0) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return fmtINR(v);
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const formatDisplayDate = (isoDate) => {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const formatDisplayDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const monthLabel = (isoDate) => {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};
const daysRemainingInMonth = () => {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(lastDay - now.getDate(), 0);
};

const ChangeBadge = ({ percent }) => {
  if (percent === null || percent === undefined) {
    return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold text-[#A8AAAE]">N/A</span>;
  }
  const positive = percent >= 0;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ color: positive ? "#28C76F" : "#EA5455", backgroundColor: positive ? "#E9F9EF" : "#FCEAEA" }}
    >
      {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {positive ? "+" : ""}{percent.toFixed(1)}%
    </span>
  );
};

const StatCard = ({ icon: Icon, iconColor, iconBg, label, value, secondary, isDark, mutedCls, mainCls, children }) => (
  <div className={`rounded-2xl border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
    <div className="flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: iconBg, color: iconColor }}>
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[12px] ${mutedCls}`}>{label}</p>
        <p className={`mt-0.5 text-[20px] font-bold leading-tight ${mainCls}`}>{value}</p>
        {secondary && <div className="mt-1">{secondary}</div>}
      </div>
    </div>
    {children}
  </div>
);

const ComparisonCard = ({ title, data, isDark, cardCls, mutedCls, mainCls }) => (
  <div className={`rounded-2xl border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
    <div className="flex items-center justify-between gap-3">
      <p className={`text-[14px] font-semibold ${mainCls}`}>{title}</p>
      <ChangeBadge percent={data?.change_percent} />
    </div>
    <div className="mt-4 grid grid-cols-2 gap-4">
      <div>
        <p className={`text-[12px] ${mutedCls}`}>Current</p>
        <p className={`mt-1 text-[17px] font-semibold ${mainCls}`}>{fmtINR(data?.current?.net_sales)}</p>
      </div>
      <div>
        <p className={`text-[12px] ${mutedCls}`}>Previous</p>
        <p className={`mt-1 text-[17px] font-semibold ${mutedCls}`}>{fmtINR(data?.previous?.net_sales)}</p>
      </div>
    </div>
  </div>
);

const PanelShell = ({ icon: Icon, title, isDark, cardCls, borderCls, mainCls, color = "#7367F0", children, right }) => (
  <div className={`rounded-2xl border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
    <div className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${borderCls}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${color}18`, color }}>
          <Icon size={16} />
        </div>
        <h3 className={`text-[15px] font-semibold ${mainCls}`}>{title}</h3>
      </div>
      {right}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const PanelEmpty = ({ icon: Icon, text, mutedCls }) => (
  <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 py-4 text-center">
    <Icon size={22} className={mutedCls} />
    <p className={`text-[13px] ${mutedCls}`}>{text}</p>
  </div>
);

const VIEW_DETAILS_LINKS = [
  { label: "Sales Analysis", path: "/outlet-dashboard/sales", module: "sales_target" },
  { label: "Item-wise Sales", path: "/sales/item-sales", module: "item_sales" },
  { label: "Daily Sales Upload", path: "/sales/daily-upload", module: "item_sales_daily" },
  { label: "Monthly Sales Upload", path: "/sales/monthly-upload", module: "item_sales_monthly" },
  { label: "Sales GST", path: "/reports/sales-gst", module: "reports" },
  { label: "Monthly P&L", path: "/reports/monthly-pl", module: "monthly_pl" },
];

const OutletDashboardOverview = () => {
  const navigate = useNavigate();
  const { selectedOutletId } = useSelectedOutlet(() => refreshAll());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [targetInput, setTargetInput] = useState("");
  const [savingTarget, setSavingTarget] = useState(false);

  const [freshness, setFreshness] = useState(null);
  const [freshnessError, setFreshnessError] = useState(false);
  const [trendData, setTrendData] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState(false);
  const [performers, setPerformers] = useState(null);
  const [performersLoading, setPerformersLoading] = useState(false);
  const [performersError, setPerformersError] = useState(false);

  const storedPermissions = useMemo(() => getStoredPermissions() || {}, []);
  const canEditTarget = Boolean(storedPermissions?.sales_target?.can_edit);
  const canViewItemSales = Boolean(storedPermissions?.item_sales?.can_view);

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

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

  // Optional data: freshness, trend and top performers all depend on
  // item_sales.can_view (the reconciliation endpoints check that module, not
  // sales_target). A user with only sales_target must never trigger these
  // calls, so the core KPI/target/comparison panels above stay 403-free.
  const fetchOptionalData = async () => {
    if (!hasOutlet || !canViewItemSales) {
      setFreshness(null);
      setFreshnessError(false);
      setTrendData([]);
      setTrendError(false);
      setPerformers(null);
      setPerformersError(false);
      return;
    }

    setTrendLoading(true);
    setPerformersLoading(true);

    const [allRes, monthlyRes] = await Promise.allSettled([
      salesAPI.getReconciliations({ outlet_id: selectedOutletId }),
      salesAPI.getReconciliations({ outlet_id: selectedOutletId, mode: "monthly" }),
    ]);

    // Freshness + top performers, both derived from the same "all uploads" list.
    if (allRes.status === "fulfilled") {
      const rows = allRes.value?.data?.data || [];
      const approved = rows.filter((row) => row.upload_status === "Approved" && row.date_to);

      if (approved.length) {
        const dataThrough = approved.reduce((max, row) => (!max || row.date_to > max ? row.date_to : max), null);
        const lastUploadRow = approved.reduce((latest, row) => {
          const stamp = row.approved_at || row.created_at;
          if (!latest) return row;
          const latestStamp = latest.approved_at || latest.created_at;
          return stamp && (!latestStamp || new Date(stamp) > new Date(latestStamp)) ? row : latest;
        }, null);
        setFreshness({
          dataThrough,
          lastUpload: lastUploadRow?.approved_at || lastUploadRow?.created_at || null,
        });
        setFreshnessError(false);

        const latestByDate = approved.reduce((latest, row) => (!latest || row.date_to > latest.date_to ? row : latest), null);
        if (latestByDate) {
          try {
            const detailRes = await salesAPI.getReconciliationById(latestByDate.id);
            const items = detailRes?.data?.data?.items || [];
            if (items.length) {
              const topItems = [...items]
                .sort((a, b) => Number(b.net_sales || 0) - Number(a.net_sales || 0))
                .slice(0, 5);

              const categoryTotals = new Map();
              items.forEach((item) => {
                const key = item.category || "Uncategorized";
                categoryTotals.set(key, (categoryTotals.get(key) || 0) + Number(item.net_sales || 0));
              });
              const topCategories = [...categoryTotals.entries()]
                .map(([category, net_sales]) => ({ category, net_sales }))
                .sort((a, b) => b.net_sales - a.net_sales)
                .slice(0, 5);

              setPerformers({
                periodFrom: latestByDate.date_from,
                periodTo: latestByDate.date_to,
                topItems,
                topCategories,
              });
              setPerformersError(false);
            } else {
              setPerformers(null);
            }
          } catch {
            setPerformers(null);
            setPerformersError(true);
          }
        } else {
          setPerformers(null);
        }
      } else {
        setFreshness(null);
        setPerformers(null);
      }
    } else {
      setFreshnessError(true);
      setPerformersError(true);
    }

    // Monthly trend, from the dedicated mode="monthly" reconciliation list.
    if (monthlyRes.status === "fulfilled") {
      const rows = (monthlyRes.value?.data?.data || []).filter((row) => row.upload_status === "Approved" && row.date_from);
      const sorted = [...rows].sort((a, b) => new Date(a.date_from) - new Date(b.date_from));
      const lastSix = sorted.slice(-6);
      setTrendData(lastSix.map((row) => ({
        label: monthLabel(row.date_from),
        net_sales: Number(row.petpooja_net_sales || 0),
      })));
      setTrendError(false);
    } else {
      setTrendError(true);
    }

    setTrendLoading(false);
    setPerformersLoading(false);
  };

  const refreshAll = () => {
    fetchSummary();
    fetchOptionalData();
  };

  useEffect(() => { refreshAll(); }, [selectedOutletId]);

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
  const hasTarget = target?.target_amount !== null && target?.target_amount !== undefined;
  const remainingToTarget = hasTarget
    ? Math.max(Number(target.target_amount) - Number(target.month_to_date_net_sales || 0), 0)
    : null;
  const progressPct = hasTarget && percentOfTarget !== null && percentOfTarget !== undefined
    ? Math.min(Math.max(percentOfTarget, 0), 100)
    : 0;

  const insights = useMemo(() => {
    if (!summary) return [];
    const list = [];

    const mtdChange = summary?.month_vs_last_month?.change_percent;
    if (mtdChange !== null && mtdChange !== undefined) {
      list.push({
        tone: mtdChange >= 0 ? "positive" : "negative",
        text: `Month-to-date net sales are ${mtdChange >= 0 ? "up" : "down"} ${Math.abs(mtdChange).toFixed(1)}% vs the same period last month.`,
      });
    }

    const wtdChange = summary?.week_vs_last_week?.change_percent;
    if (wtdChange !== null && wtdChange !== undefined) {
      list.push({
        tone: wtdChange >= 0 ? "positive" : "negative",
        text: `Week-to-date net sales are ${wtdChange >= 0 ? "up" : "down"} ${Math.abs(wtdChange).toFixed(1)}% vs last week.`,
      });
    }

    if (hasTarget) {
      if (percentOfTarget !== null && percentOfTarget !== undefined) {
        list.push({ tone: "neutral", text: `${percentOfTarget.toFixed(0)}% of the monthly sales target has been achieved.` });
      }
      if (remainingToTarget > 0) {
        list.push({ tone: "neutral", text: `${compactINR(remainingToTarget)} remaining to reach this month's target.` });
      }
    } else {
      list.push({ tone: "warning", text: "No sales target has been set for this month." });
    }

    if (freshness?.dataThrough && freshness.dataThrough < todayISO()) {
      list.push({ tone: "warning", text: `Latest uploaded sales data is through ${formatDisplayDate(freshness.dataThrough)}.` });
    }

    if (performers?.topItems?.length) {
      list.push({ tone: "neutral", text: `Top-selling item for the latest uploaded period: ${performers.topItems[0].item_name}.` });
    } else if (performers?.topCategories?.length) {
      list.push({ tone: "neutral", text: `Top category for the latest uploaded period: ${performers.topCategories[0].category}.` });
    }

    return list.slice(0, 5);
  }, [summary, hasTarget, percentOfTarget, remainingToTarget, freshness, performers]);

  const visibleLinks = VIEW_DETAILS_LINKS.filter((link) => Boolean(storedPermissions?.[link.module]?.can_view));

  const isStaleData = Boolean(freshness?.dataThrough && freshness.dataThrough < todayISO());

  return (
    <div className="space-y-5" style={{ fontFamily: '"Public Sans", "Inter", system-ui, sans-serif' }}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${mainCls}`}>Outlet Sales Overview</h1>
          <p className={`mt-1 text-[14px] ${mutedCls}`}>Sales performance, target progress and latest outlet insights.</p>
          {canViewItemSales && freshness?.dataThrough && (
            <div className={`mt-2 inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] ${mutedCls}`}>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={13} />
                Data through {formatDisplayDate(freshness.dataThrough)}
              </span>
              {freshness.lastUpload && (
                <span>Last upload {formatDisplayDateTime(freshness.lastUpload)}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OutletScopeBadge />
          <button type="button" onClick={refreshAll} className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[14px] font-medium ${cardCls}`}>
            <RefreshCw size={18} /> Refresh
          </button>
        </div>
      </div>

      {!hasOutlet ? (
        <div className={`flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-2xl border p-8 text-center ${cardCls}`}>
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
          {isStaleData && (
            <div className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-[13px] ${isDark ? "border-[#FF9F43]/30 bg-[#3A2E1D]/30 text-[#FFD9A8]" : "border-[#FFF0D9] bg-[#FFFCF7] text-[#C88212]"}`}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>Latest uploaded sales data is through {formatDisplayDate(freshness.dataThrough)}. Today&apos;s figures may not reflect that yet.</span>
            </div>
          )}

          {/* Primary KPI row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={TrendingUp}
              iconColor="#28C76F"
              iconBg="#E9F9EF"
              label="Net Sales (MTD)"
              value={fmtINR(summary?.month_vs_last_month?.current?.net_sales)}
              secondary={<ChangeBadge percent={summary?.month_vs_last_month?.change_percent} />}
              isDark={isDark} mutedCls={mutedCls} mainCls={mainCls}
            />
            <StatCard
              icon={TrendingUp}
              iconColor={primaryColor}
              iconBg={`${primaryColor}18`}
              label="Gross Sales (MTD)"
              value={fmtINR(summary?.month_vs_last_month?.current?.gross_sales)}
              isDark={isDark} mutedCls={mutedCls} mainCls={mainCls}
            />
            <StatCard
              icon={Target}
              iconColor="#FF9F43"
              iconBg="#FFF4E5"
              label="Monthly Target"
              value={hasTarget ? fmtINR(target.target_amount) : "Not set"}
              isDark={isDark} mutedCls={mutedCls} mainCls={mainCls}
            />
            <StatCard
              icon={CheckCircle2}
              iconColor="#00CFE8"
              iconBg="#E6FAFD"
              label="Target Achievement"
              value={hasTarget && percentOfTarget !== null && percentOfTarget !== undefined ? `${percentOfTarget.toFixed(0)}%` : "—"}
              isDark={isDark} mutedCls={mutedCls} mainCls={mainCls}
            />
          </div>

          {/* Target vs Actual */}
          <PanelShell icon={Target} title="Target vs Actual" color="#FF9F43" isDark={isDark} cardCls={cardCls} borderCls={borderCls} mainCls={mainCls}>
            {hasTarget ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className={`text-[12px] ${mutedCls}`}>Monthly Target</p>
                    <p className={`mt-1 text-[16px] font-semibold ${mainCls}`}>{fmtINR(target.target_amount)}</p>
                  </div>
                  <div>
                    <p className={`text-[12px] ${mutedCls}`}>MTD Net Sales</p>
                    <p className={`mt-1 text-[16px] font-semibold ${mainCls}`}>{fmtINR(target.month_to_date_net_sales)}</p>
                  </div>
                  <div>
                    <p className={`text-[12px] ${mutedCls}`}>Remaining</p>
                    <p className={`mt-1 text-[16px] font-semibold ${mainCls}`}>{fmtINR(remainingToTarget)}</p>
                  </div>
                  <div>
                    <p className={`text-[12px] ${mutedCls}`}>Days Remaining</p>
                    <p className={`mt-1 text-[16px] font-semibold ${mainCls}`}>{daysRemainingInMonth()}</p>
                  </div>
                </div>
                <div className={`h-2.5 w-full overflow-hidden rounded-full ${isDark ? "bg-[#3B405A]" : "bg-[#F3F2F7]"}`}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, backgroundColor: primaryColor }} />
                </div>
                <p className={`text-[12px] ${mutedCls}`}>
                  {percentOfTarget !== null && percentOfTarget !== undefined ? `${percentOfTarget.toFixed(1)}% achieved` : "Achievement unavailable"}
                </p>
              </div>
            ) : (
              <PanelEmpty icon={Target} text="No sales target has been set for this month." mutedCls={mutedCls} />
            )}

            {canEditTarget && (
              <div className={`mt-4 flex gap-2 border-t pt-4 ${borderCls}`}>
                <input
                  type="number" min="0" step="0.01" value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  placeholder="Set monthly target"
                  className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}
                />
                <button
                  type="button" onClick={handleSaveTarget} disabled={savingTarget}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-md px-4 text-[13px] font-semibold text-white disabled:opacity-70"
                  style={{ backgroundColor: primaryColor }}
                >
                  {savingTarget ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  Save
                </button>
              </div>
            )}
          </PanelShell>

          {/* Comparisons */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ComparisonCard title="Today vs Same Day Last Week" data={summary?.today_vs_last_week} isDark={isDark} cardCls={cardCls} mutedCls={mutedCls} mainCls={mainCls} />
            <ComparisonCard title="This Week vs Last Week" data={summary?.week_vs_last_week} isDark={isDark} cardCls={cardCls} mutedCls={mutedCls} mainCls={mainCls} />
            <ComparisonCard title="This Month vs Last Month" data={summary?.month_vs_last_month} isDark={isDark} cardCls={cardCls} mutedCls={mutedCls} mainCls={mainCls} />
          </div>

          {canViewItemSales && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {/* Sales Trend */}
              <PanelShell icon={BarChart3} title="Sales Trend (Monthly)" color="#7367F0" isDark={isDark} cardCls={cardCls} borderCls={borderCls} mainCls={mainCls}>
                {trendLoading ? (
                  <div className="flex min-h-[220px] items-center justify-center">
                    <Loader2 size={24} className="animate-spin" style={{ color: primaryColor }} />
                  </div>
                ) : trendError ? (
                  <PanelEmpty icon={BarChart3} text="Sales trend is temporarily unavailable." mutedCls={mutedCls} />
                ) : trendData.length === 0 ? (
                  <PanelEmpty icon={BarChart3} text="No approved monthly sales uploads available yet." mutedCls={mutedCls} />
                ) : (
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={isDark ? "#3B405A" : "#EBE9F1"} />
                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: isDark ? "#A5A8B6" : "#A8AAAE" }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => compactINR(v)} tick={{ fontSize: 11, fill: isDark ? "#A5A8B6" : "#A8AAAE" }} axisLine={false} tickLine={false} width={56} />
                        <Tooltip
                          formatter={(value) => [fmtINR(value), "Net Sales"]}
                          contentStyle={{ backgroundColor: isDark ? "#25293C" : "#FFFFFF", border: `1px solid ${isDark ? "#3B405A" : "#EBE9F1"}`, borderRadius: 8, fontSize: 12 }}
                        />
                        <Bar dataKey="net_sales" fill={primaryColor} radius={[6, 6, 0, 0]} maxBarSize={44} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </PanelShell>

              {/* Top Performers */}
              <PanelShell icon={Trophy} title="Top Performers" color="#FF9F43" isDark={isDark} cardCls={cardCls} borderCls={borderCls} mainCls={mainCls}>
                {performersLoading ? (
                  <div className="flex min-h-[220px] items-center justify-center">
                    <Loader2 size={24} className="animate-spin" style={{ color: primaryColor }} />
                  </div>
                ) : performersError ? (
                  <PanelEmpty icon={Trophy} text="Top performers are temporarily unavailable." mutedCls={mutedCls} />
                ) : !performers ? (
                  <PanelEmpty icon={Trophy} text="No item-wise sales detail available yet." mutedCls={mutedCls} />
                ) : (
                  <div className="space-y-4">
                    <p className={`text-[12px] ${mutedCls}`}>
                      Latest uploaded period: {formatDisplayDate(performers.periodFrom)} – {formatDisplayDate(performers.periodTo)}
                    </p>

                    <div>
                      <p className={`mb-2 text-[11px] font-semibold uppercase tracking-wider ${mutedCls}`}>Top 5 Items</p>
                      <div className="space-y-2">
                        {performers.topItems.map((item, idx) => (
                          <div key={`${item.item_name}-${idx}`} className={`flex items-center justify-between rounded-md px-3 py-2 text-[13px] ${isDark ? "bg-[#25293C]" : "bg-[#F8F7FA]"}`}>
                            <div className="min-w-0 flex-1 truncate">
                              <span className={mainCls}>{item.item_name}</span>
                              <span className={`ml-2 ${mutedCls}`}>× {Number(item.quantity || 0).toFixed(0)}</span>
                            </div>
                            <span className={`shrink-0 font-semibold ${mainCls}`}>{fmtINR(item.net_sales)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className={`mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${mutedCls}`}>
                        <Layers size={13} /> Top Categories
                      </p>
                      <div className="space-y-2">
                        {performers.topCategories.map((cat) => (
                          <div key={cat.category} className={`flex items-center justify-between rounded-md px-3 py-2 text-[13px] ${isDark ? "bg-[#25293C]" : "bg-[#F8F7FA]"}`}>
                            <span className={mainCls}>{cat.category}</span>
                            <span className={`font-semibold ${mainCls}`}>{fmtINR(cat.net_sales)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </PanelShell>
            </div>
          )}

          {/* Performance Insights */}
          {insights.length > 0 && (
            <PanelShell icon={Sparkles} title="Performance Insights" color="#7367F0" isDark={isDark} cardCls={cardCls} borderCls={borderCls} mainCls={mainCls}>
              <div className="space-y-2.5">
                {insights.map((insight, idx) => (
                  <div key={idx} className={`flex items-start gap-2.5 rounded-md px-3 py-2.5 text-[13px] ${isDark ? "bg-[#25293C]" : "bg-[#F8F7FA]"}`}>
                    {insight.tone === "positive" && <TrendingUp size={15} className="mt-0.5 shrink-0 text-[#28C76F]" />}
                    {insight.tone === "negative" && <TrendingDown size={15} className="mt-0.5 shrink-0 text-[#EA5455]" />}
                    {insight.tone === "warning" && <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[#FF9F43]" />}
                    {insight.tone === "neutral" && <Sparkles size={15} className="mt-0.5 shrink-0" style={{ color: primaryColor }} />}
                    <span className={mainCls}>{insight.text}</span>
                  </div>
                ))}
              </div>
            </PanelShell>
          )}

          {/* View Details */}
          {visibleLinks.length > 0 && (
            <div className={`rounded-2xl border p-4 ${cardCls}`}>
              <p className={`mb-3 text-[11px] font-semibold uppercase tracking-wider ${mutedCls}`}>View Details</p>
              <div className="flex flex-wrap gap-2">
                {visibleLinks.map((link) => (
                  <button
                    key={link.path}
                    type="button"
                    onClick={() => navigate(link.path)}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-[13px] font-medium transition ${isDark ? "border-[#3B405A] text-[#D0D2D6] hover:bg-[#3B405A]" : "border-[#EBE9F1] text-[#5D596C] hover:bg-[#F8F7FA]"}`}
                  >
                    {link.label} <ArrowRight size={13} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default OutletDashboardOverview;

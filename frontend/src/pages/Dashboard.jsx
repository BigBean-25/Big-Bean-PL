import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  BookOpen,
  UploadCloud,
  Calendar,
  RefreshCw,
  Download,
  FileText,
  Wallet,
  CheckCircle2,
  Truck,
  AlertTriangle,
  Users,
  ClipboardCheck,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import useAuthStore from "../store/authStore";
import {
  dashboardAPI,
  outletVendorAPI,
  getSelectedOutletId,
  getStoredPermissions,
} from "../services/api";

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
    if (mode === "system") {
      return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
        ? "dark"
        : "light";
    }
    return mode;
  } catch {
    return "light";
  }
};

const fmtK = (n = 0) => {
  const value = Number(n || 0);

  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;

  return `₹${value}`;
};

const quickActions = [
  {
    label: "Daily Cashbook",
    icon: Wallet,
    path: "/daily-accounts/cashbook",
    color: "#7367F0",
    bg: "#F0EEFF",
  },
  {
    label: "Add Expense",
    icon: ShoppingCart,
    path: "/daily-accounts/expenses",
    color: "#FF9F43",
    bg: "#FFF4E5",
  },
  {
    label: "Upload Stock",
    icon: UploadCloud,
    path: "/stock/opening-stock",
    color: "#28C76F",
    bg: "#E9F9EF",
  },
  {
    label: "Sales Upload",
    icon: TrendingUp,
    path: "/sales/item-sales",
    color: "#00CFE8",
    bg: "#E6FAFD",
  },
  {
    label: "Recipes",
    icon: BookOpen,
    path: "/recipes",
    color: "#EA5455",
    bg: "#FCEAEA",
  },
  {
    label: "Monthly P&L",
    icon: FileText,
    path: "/reports/monthly-pl",
    color: "#2F2B3D",
    bg: "#F3F2F7",
  },
];

// Decorative sparkline only - the dashboard API returns no history series, so
// these shapes are kept as pure visual accents and are never labeled as real
// trend data.
const MiniBars = ({ color = "#7367F0" }) => {
  const bars = [34, 24, 16, 30, 38, 26, 40];

  return (
    <div className="flex h-10 max-w-full items-end gap-1.5 overflow-hidden">
      {bars.map((height, index) => (
        <div
          key={index}
          className="w-1.5 shrink-0 rounded-full bg-[#E8E7F0] dark:bg-[#3B405A]"
          style={{ height: `${height}px` }}
        >
          <div
            className="w-full rounded-full"
            style={{
              height: `${Math.max(10, height - 7)}px`,
              backgroundColor: color,
              opacity: 0.85,
            }}
          />
        </div>
      ))}
    </div>
  );
};

const MiniLine = ({ color = "#28C76F" }) => (
  <svg viewBox="0 0 180 44" className="h-10 w-full max-w-full overflow-hidden">
    <path
      d="M0 26 C20 24, 28 34, 50 34 C76 34, 82 10, 110 14 C135 18, 145 28, 180 22"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path
      d="M0 26 C20 24, 28 34, 50 34 C76 34, 82 10, 110 14 C135 18, 145 28, 180 22 L180 44 L0 44 Z"
      fill={color}
      opacity="0.10"
    />
  </svg>
);

const StatCard = ({
  title,
  subtitle,
  value,
  change,
  icon: Icon,
  color,
  bg,
  type = "icon",
  loading = false,
}) => {
  const positive = Number(change) >= 0;

  return (
    <div className="group min-w-0 overflow-hidden rounded-lg border border-[#EBE9F1] bg-white p-4 shadow-[0_2px_12px_rgba(47,43,61,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(47,43,61,0.12)] motion-reduce:transform-none motion-reduce:transition-none dark:border-[#3B405A] dark:bg-[#2F3349] animate-fade-up md:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold uppercase tracking-wider text-[#A8AAAE] dark:text-[#A5A8B6]">
            {title}
          </p>
          {loading ? (
            <div className="skeleton mt-2.5 h-8 w-24 rounded-md dark:bg-[#3B405A]" />
          ) : (
            <h3 className="mt-1.5 min-w-0 truncate text-[24px] font-semibold leading-none text-[#2F2B3D] dark:text-[#D0D2D6] md:text-[28px] animate-fade-in motion-reduce:animate-none">
              {value}
            </h3>
          )}
        </div>

        {Icon && (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none"
            style={{ backgroundColor: bg }}
          >
            <Icon size={19} style={{ color }} />
          </div>
        )}
      </div>

      <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
        {loading ? (
          <div className="skeleton h-4 w-28 rounded dark:bg-[#3B405A]" />
        ) : (
          <>
            <p className="truncate text-[12px] text-[#A8AAAE] dark:text-[#A5A8B6]">
              {subtitle}
            </p>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                color: positive ? "#28C76F" : "#EA5455",
                backgroundColor: positive ? "#E9F9EF" : "#FCEAEA",
              }}
            >
              {positive ? "+" : ""}
              {change}%
            </span>
          </>
        )}
      </div>

      {(loading || type === "bar" || type === "line") && (
        <div className="mt-3 min-w-0">
          {loading ? (
            <div className="skeleton h-10 w-full rounded-md dark:bg-[#3B405A]" />
          ) : (
            <>
              {type === "bar" && <MiniBars color={color} />}
              {type === "line" && <MiniLine color={color} />}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  // 7D4B: vendor payables summary - independent state so a vendor fetch
  // failure can never take down the main dashboard, and vice versa.
  const [vendorSummary, setVendorSummary] = useState(null);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [vendorError, setVendorError] = useState(null);
  const vendorSeq = useRef(0);

  const primaryColor = getPrimaryColor();
  const themeMode = getThemeMode();
  const isDark = themeMode === "dark";

  const roleName = user?.role_name || user?.role || "User";
  const firstName = user?.full_name?.split(" ")?.[0] || "User";
  const permissions = getStoredPermissions();
  const selectedOutletId = getSelectedOutletId();
  const canViewVendors = Boolean(permissions?.outlet_vendors?.can_view);

  const totalSales = Number(summary?.net_sales || 0);
  const totalExpenses = Number(summary?.daily_expenses || 0);
  const totalProfit = Number(summary?.net_profit || 0);

  const fetchSummary = async () => {
    setLoading(true);

    try {
      const response = await dashboardAPI.getSummary();
      setSummary(response.data?.data || {});
      setLastUpdated(new Date());
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load dashboard summary");
    } finally {
      setLoading(false);
    }
  };

  // One canonical summary call per refresh/outlet change - no N+1 requests,
  // no client-side ledger math; the backend returns final figures only.
  const fetchVendorSummary = async () => {
    if (!canViewVendors) return; // never fire a doomed 403 for non-vendor roles
    const seq = ++vendorSeq.current;
    setVendorLoading(true);
    setVendorError(null);
    setVendorSummary(null); // never show outlet A's numbers under outlet B
    try {
      const res = await outletVendorAPI.getDashboardSummary({ outlet_id: getSelectedOutletId() });
      if (seq !== vendorSeq.current) return; // stale response for a previous outlet
      setVendorSummary(res.data?.data || null);
    } catch (e) {
      if (seq !== vendorSeq.current) return;
      setVendorError(e.response?.data?.message || "Vendor payables unavailable");
    } finally {
      if (seq === vendorSeq.current) setVendorLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchVendorSummary();

    const handler = () => { fetchSummary(); fetchVendorSummary(); };
    window.addEventListener("bbc:selected-outlet-change", handler);

    return () => window.removeEventListener("bbc:selected-outlet-change", handler);
  }, []);

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const currentMonthLabel = new Date().toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const handleRefresh = () => {
    fetchSummary();
    fetchVendorSummary();
    toast.success("Dashboard refreshed");
  };

  const handleExport = () => {
    const rows = [
      ["Metric", "Value"],
      ["Total Sales", totalSales],
      ["Total Expenses", totalExpenses],
      ["Total Profit", totalProfit],
      ["Pending Uploads", summary?.pending_uploads || 0],
      ["Stock Alerts", summary?.stock_alerts || 0],
    ];

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "bigbean-dashboard-summary.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Dashboard exported");
  };

  const bgClass = isDark ? "bg-[#25293C]" : "bg-[#F8F7FA]";
  const cardClass = isDark
    ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
    : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const mutedClass = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainTextClass = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  return (
    <div
      className={`min-h-screen w-full max-w-full overflow-x-hidden ${bgClass}`}
      style={{
        fontFamily:
          '"Public Sans", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div className="w-full max-w-full overflow-x-hidden space-y-5">
        <div className="flex w-full max-w-full flex-col justify-between gap-3 animate-fade-up motion-reduce:animate-none xl:flex-row xl:items-center">
          <div className="min-w-0">
            <h1 className={`break-words text-[22px] font-semibold md:text-[24px] ${mainTextClass}`}>
              Good morning, {firstName} 👋
            </h1>

            <p className={`mt-1 break-words text-[13px] md:text-[14px] ${mutedClass}`}>
              {today} · {roleName} ·{" "}
              {selectedOutletId === "all"
                ? "Company overview"
                : "Selected outlet overview"}
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-2.5 sm:w-auto sm:grid-cols-3">
            <div
              className={`flex min-w-0 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-[14px] font-medium ${cardClass}`}
            >
              <Calendar size={16} className={`shrink-0 ${mutedClass}`} />
              <span className="truncate">{currentMonthLabel}</span>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className={`flex min-w-0 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-[14px] font-medium transition-all duration-200 hover:border-[#7367F0]/50 disabled:opacity-60 motion-reduce:transition-none ${cardClass}`}
            >
              <RefreshCw size={16} className={`shrink-0 ${loading ? "animate-spin" : ""}`} />
              <span className="truncate">{loading ? "Refreshing..." : "Refresh"}</span>
            </button>

            <button
              type="button"
              onClick={handleExport}
              className="group flex min-w-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)] transition-all duration-200 hover:shadow-[0_5px_18px_rgba(115,103,240,0.45)] active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none"
              style={{ backgroundColor: primaryColor }}
            >
              <Download size={16} className="shrink-0 transition-transform duration-200 group-hover:translate-y-0.5 motion-reduce:transform-none" />
              <span className="truncate">
                {permissions.isReadOnly ? "Download" : "Export"}
              </span>
            </button>
          </div>
        </div>

        <div className="grid w-full max-w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Gross Sales"
            subtitle="PetPooja sales"
            value={fmtK(summary?.gross_sales)}
            change={0}
            icon={ShoppingCart}
            color={primaryColor}
            bg={`${primaryColor}18`}
            type="bar"
            loading={loading && !summary}
          />

          <StatCard
            title="Net Sales"
            subtitle="Revenue basis"
            value={fmtK(summary?.net_sales)}
            change={0}
            icon={TrendingUp}
            color="#28C76F"
            bg="#E9F9EF"
            type="line"
            loading={loading && !summary}
          />

          <StatCard
            title="Net Profit"
            subtitle="Net sales based"
            value={fmtK(summary?.net_profit)}
            change={0}
            icon={Wallet}
            color="#EA5455"
            bg="#FCEAEA"
            loading={loading && !summary}
          />

          <StatCard
            title="COGS"
            subtitle="Opening + Purchase - Closing"
            value={fmtK(summary?.cogs)}
            change={0}
            icon={DollarSign}
            color="#28C76F"
            bg="#E9F9EF"
            loading={loading && !summary}
          />
        </div>

        {/* 7D4B: canonical outlet-vendor payables - all figures backend-computed */}
        {canViewVendors ? (
          <div className={`min-w-0 overflow-hidden rounded-lg border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.08)] animate-fade-up motion-reduce:animate-none md:p-5 ${cardClass}`}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${primaryColor}18` }}>
                  <Truck size={15} style={{ color: primaryColor }} />
                </span>
                <div className="min-w-0">
                  <h3 className={`truncate text-[16px] font-semibold ${mainTextClass}`}>Vendor Payables</h3>
                  {vendorSummary?.as_of_date ? (
                    <p className={`text-[11px] ${mutedClass}`}>As of {vendorSummary.as_of_date}</p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate("/daily-accounts/vendor-ledger-payments")}
                className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 hover:border-[#7367F0]/50 hover:text-[#7367F0] motion-reduce:transition-none ${cardClass}`}
              >
                View Vendor Ledger
              </button>
            </div>

            {vendorLoading ? (
              <div className="mt-4 space-y-3">
                <div className="grid w-full max-w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-[74px] rounded-lg dark:bg-[#3B405A]" />)}
                </div>
                <div className="skeleton h-4 w-40 rounded dark:bg-[#3B405A]" />
                {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-8 w-full rounded dark:bg-[#3B405A]" />)}
              </div>
            ) : vendorError ? (
              <div className={`mt-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 animate-fade-in motion-reduce:animate-none ${isDark ? "border-[#EA5455]/30 bg-[#EA5455]/10" : "border-[#F0D5D5] bg-[#FCEAEA]/60"}`}>
                <AlertTriangle size={16} className="shrink-0 text-[#EA5455]" />
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] font-medium ${mainTextClass}`}>Vendor payables unavailable</p>
                  <p className={`text-[12px] ${mutedClass}`}>We couldn't load this summary.</p>
                </div>
                <button
                  type="button"
                  onClick={fetchVendorSummary}
                  disabled={vendorLoading}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 hover:border-[#7367F0]/50 hover:text-[#7367F0] disabled:opacity-60 motion-reduce:transition-none ${cardClass}`}
                >
                  <RefreshCw size={13} /> Retry
                </button>
              </div>
            ) : vendorSummary ? (
              <>
                <div className="mt-4 grid w-full max-w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 animate-fade-in motion-reduce:animate-none">
                  <button
                    type="button"
                    onClick={() => navigate("/daily-accounts/vendor-ledger-payments")}
                    className={`rounded-lg border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#7367F0]/50 hover:shadow-[0_4px_14px_rgba(47,43,61,0.10)] motion-reduce:transform-none motion-reduce:transition-none ${cardClass}`}
                  >
                    <p className={`flex items-center gap-1.5 text-[12px] font-medium ${mutedClass}`}><Wallet size={13} /> Total Vendor Outstanding</p>
                    <h4 className={`mt-1.5 text-[20px] font-semibold ${mainTextClass}`}>{fmtK(vendorSummary.total_outstanding)}</h4>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/daily-accounts/vendor-ledger-payments")}
                    className={`rounded-lg border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#7367F0]/50 hover:shadow-[0_4px_14px_rgba(47,43,61,0.10)] motion-reduce:transform-none motion-reduce:transition-none ${cardClass}`}
                  >
                    <p className={`flex items-center gap-1.5 text-[12px] font-medium ${mutedClass}`}><AlertTriangle size={13} /> Overdue Vendor Payables</p>
                    <h4 className="mt-1.5 text-[20px] font-semibold text-[#FF9F43]">{fmtK(vendorSummary.overdue_amount)}</h4>
                    <p className={`mt-1 text-[12px] ${mutedClass}`}>Not Due: {fmtK(vendorSummary.not_due_amount)}</p>
                  </button>
                  <div className={`rounded-lg border p-4 ${cardClass}`}>
                    <p className={`flex items-center gap-1.5 text-[12px] font-medium ${mutedClass}`}><Users size={13} /> Vendors with Outstanding</p>
                    <h4 className={`mt-1.5 text-[20px] font-semibold ${mainTextClass}`}>{vendorSummary.vendors_with_outstanding ?? 0}</h4>
                  </div>
                  {vendorSummary.pending_approvals !== null && vendorSummary.pending_approvals !== undefined ? (
                    <button
                      type="button"
                      onClick={() => navigate("/daily-accounts/vendor-ledger-payments")}
                      className={`rounded-lg border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#7367F0]/50 hover:shadow-[0_4px_14px_rgba(47,43,61,0.10)] motion-reduce:transform-none motion-reduce:transition-none ${cardClass}`}
                    >
                      <p className={`flex items-center gap-1.5 text-[12px] font-medium ${mutedClass}`}><ClipboardCheck size={13} /> Pending Vendor Payment Approvals</p>
                      <h4 className="mt-1.5 text-[20px] font-semibold text-[#7367F0]">{vendorSummary.pending_approvals}</h4>
                      <p className={`mt-1 text-[12px] ${mutedClass}`}>Awaiting verification - not yet financial</p>
                    </button>
                  ) : null}
                </div>

                <div className="mt-4">
                  <p className={`text-[12px] font-semibold uppercase tracking-wider ${mutedClass}`}>Top Outstanding Vendors</p>
                  {(vendorSummary.top_vendors || []).length === 0 ? (
                    <p className={`mt-2 text-[14px] ${mutedClass}`}>No vendor outstanding</p>
                  ) : (
                    <div className="mt-2 overflow-x-auto overscroll-x-contain">
                      <table className="min-w-full" style={{ minWidth: "560px" }}>
                        <thead>
                          <tr>
                            {["Vendor", "Outlet", "Outstanding", "Overdue", "Not Due"].map((h) => (
                              <th key={h} className={`whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider ${mutedClass}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(vendorSummary.top_vendors || []).map((v) => (
                            <tr key={`${v.outlet_id}:${v.vendor_id}`} className="border-t border-[#EBE9F1] transition-colors hover:bg-[#F8F7FA] dark:border-[#3B405A] dark:hover:bg-[#3B405A]/40">
                              <td className={`px-3 py-2 text-[13px] font-medium ${mainTextClass}`}>{v.vendor_name || `#${v.vendor_id}`}</td>
                              <td className={`px-3 py-2 text-[13px] ${mutedClass}`}>{v.outlet_name || `#${v.outlet_id}`}</td>
                              <td className={`px-3 py-2 text-[13px] font-semibold ${mainTextClass}`}>{fmtK(v.outstanding)}</td>
                              <td className="px-3 py-2 text-[13px] font-medium text-[#FF9F43]">{fmtK(v.overdue_amount)}</td>
                              <td className={`px-3 py-2 text-[13px] ${mutedClass}`}>{fmtK(v.not_due_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        <div className={`min-w-0 overflow-hidden rounded-lg border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.08)] animate-fade-up motion-reduce:animate-none md:p-5 ${cardClass}`}>
          <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${primaryColor}18` }}>
                <ClipboardCheck size={15} style={{ color: primaryColor }} />
              </span>
              <div className="min-w-0">
                <h3 className={`truncate text-[16px] font-semibold ${mainTextClass}`}>
                  Quick Actions
                </h3>
                <p className={`break-words text-[12px] ${mutedClass}`}>
                  Frequently used Big Bean Café operations
                </p>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2 rounded-full bg-[#F8F7FA] px-3.5 py-1.5 text-[12px] font-medium text-[#6F6B7D] dark:bg-[#25293C] dark:text-[#A5A8B6]">
              <CheckCircle2 size={14} className="shrink-0 text-[#28C76F]" />
              <span className="truncate">
                Last refreshed{" "}
                {lastUpdated.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>

          <div className="mt-5 grid w-full max-w-full grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {quickActions.map((action, i) => {
              const Icon = action.icon;

              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => navigate(action.path)}
                  className="group flex min-w-0 flex-col items-center gap-2.5 overflow-hidden rounded-lg border border-[#EBE9F1] bg-[#F8F7FA] p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-[#7367F0]/50 hover:bg-white hover:shadow-[0_4px_18px_rgba(47,43,61,0.12)] active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none dark:border-[#3B405A] dark:bg-[#25293C] dark:hover:bg-[#2F3349] animate-fade-up"
                  style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none"
                    style={{ backgroundColor: action.bg }}
                  >
                    <Icon size={20} style={{ color: action.color }} />
                  </div>

                  <span className="flex max-w-full items-center gap-1 text-[13px] font-medium text-[#5D596C] transition-colors duration-200 group-hover:text-[#7367F0] dark:text-[#D0D2D6]">
                    <span className="truncate">{action.label}</span>
                    <ChevronRight size={13} className="shrink-0 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 motion-reduce:transform-none" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
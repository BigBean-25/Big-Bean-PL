import { useEffect, useState } from "react";
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
} from "lucide-react";
import toast from "react-hot-toast";
import useAuthStore from "../store/authStore";
import {
  dashboardAPI,
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

const MiniBars = ({ color = "#7367F0" }) => {
  const bars = [60, 42, 28, 52, 68, 45, 72];

  return (
    <div className="flex h-16 max-w-full items-end gap-2 overflow-hidden sm:gap-3">
      {bars.map((height, index) => (
        <div
          key={index}
          className="w-2 shrink-0 rounded-full bg-[#E8E7F0]"
          style={{ height: `${height}px` }}
        >
          <div
            className="w-full rounded-full"
            style={{
              height: `${Math.max(24, height - 12)}px`,
              backgroundColor: color,
            }}
          />
        </div>
      ))}
    </div>
  );
};

const MiniLine = ({ color = "#28C76F" }) => (
  <svg viewBox="0 0 180 70" className="h-16 w-full max-w-full overflow-hidden">
    <path
      d="M0 40 C20 38, 28 52, 50 52 C76 52, 82 15, 110 22 C135 28, 145 44, 180 35"
      fill="none"
      stroke={color}
      strokeWidth="4"
      strokeLinecap="round"
    />
    <path
      d="M0 40 C20 38, 28 52, 50 52 C76 52, 82 15, 110 22 C135 28, 145 44, 180 35 L180 70 L0 70 Z"
      fill={color}
      opacity="0.11"
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
}) => {
  const positive = Number(change) >= 0;

  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-[#EBE9F1] bg-white p-4 shadow-[0_2px_12px_rgba(47,43,61,0.08)] dark:border-[#3B405A] dark:bg-[#2F3349] md:p-6">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[18px] font-semibold text-[#2F2B3D] dark:text-[#D0D2D6] md:text-[20px]">
            {title}
          </p>
          <p className="mt-1 truncate text-[14px] text-[#A8AAAE] md:text-[15px]">
            {subtitle}
          </p>
        </div>

        {type === "icon" && Icon && (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: bg }}
          >
            <Icon size={24} style={{ color }} />
          </div>
        )}
      </div>

      <div className="mt-6 min-w-0">
        {type === "bar" && <MiniBars color={color} />}
        {type === "line" && <MiniLine color={color} />}

        <div className="mt-5 flex min-w-0 items-end justify-between gap-3">
          <h3 className="min-w-0 truncate text-[24px] font-semibold leading-none text-[#2F2B3D] dark:text-[#D0D2D6] md:text-[30px]">
            {value}
          </h3>

          <span
            className="shrink-0 rounded px-2.5 py-1 text-[13px] font-medium md:text-[14px]"
            style={{
              color: positive ? "#28C76F" : "#EA5455",
              backgroundColor: positive ? "#E9F9EF" : "#FCEAEA",
            }}
          >
            {positive ? "+" : ""}
            {change}%
          </span>
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const primaryColor = getPrimaryColor();
  const themeMode = getThemeMode();
  const isDark = themeMode === "dark";

  const roleName = user?.role_name || user?.role || "User";
  const firstName = user?.full_name?.split(" ")?.[0] || "User";
  const permissions = getStoredPermissions();
  const selectedOutletId = getSelectedOutletId();

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

  useEffect(() => {
    fetchSummary();

    const handler = () => fetchSummary();
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
      <div className="w-full max-w-full overflow-x-hidden space-y-4 md:space-y-6">
        <div className="flex w-full max-w-full flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div className="min-w-0">
            <h1 className={`break-words text-[22px] font-semibold md:text-[24px] ${mainTextClass}`}>
              Good morning, {firstName} 👋
            </h1>

            <p className={`mt-1 break-words text-[14px] md:text-[15px] ${mutedClass}`}>
              {today} · {roleName} ·{" "}
              {selectedOutletId === "all"
                ? "Company overview"
                : "Selected outlet overview"}
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-3">
            <button
              type="button"
              className={`flex min-w-0 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
            >
              <Calendar size={18} className="shrink-0" />
              <span className="truncate">{currentMonthLabel}</span>
            </button>

            <button
              type="button"
              onClick={handleRefresh}
              className={`flex min-w-0 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
            >
              <RefreshCw size={18} className="shrink-0" />
              <span className="truncate">Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleExport}
              className="flex min-w-0 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)]"
              style={{ backgroundColor: primaryColor }}
            >
              <Download size={18} className="shrink-0" />
              <span className="truncate">
                {permissions.isReadOnly ? "Download" : "Export"}
              </span>
            </button>
          </div>
        </div>

        <div className="grid w-full max-w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 xl:gap-6">
          <StatCard
            title="Gross Sales"
            subtitle={loading ? "Loading..." : "PetPooja sales"}
            value={fmtK(summary?.gross_sales)}
            change={0}
            icon={ShoppingCart}
            color={primaryColor}
            bg={`${primaryColor}18`}
            type="bar"
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
          />

          <StatCard
            title="Net Profit"
            subtitle="Net sales based"
            value={fmtK(summary?.net_profit)}
            change={0}
            icon={Wallet}
            color="#EA5455"
            bg="#FCEAEA"
          />

          <StatCard
            title="COGS"
            subtitle="Opening + Purchase - Closing"
            value={fmtK(summary?.cogs)}
            change={0}
            icon={DollarSign}
            color="#28C76F"
            bg="#E9F9EF"
          />
        </div>

        <div className={`min-w-0 overflow-hidden rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.08)] md:p-6 ${cardClass}`}>
          <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <h3 className={`truncate text-[20px] font-semibold md:text-[22px] ${mainTextClass}`}>
                Quick Actions
              </h3>
              <p className={`mt-1 break-words text-[14px] md:text-[15px] ${mutedClass}`}>
                Frequently used Big Bean Café operations
              </p>
            </div>

            <div className="flex min-w-0 items-center gap-2 rounded-md bg-[#F8F7FA] px-4 py-2 text-[13px] font-medium text-[#6F6B7D] dark:bg-[#25293C] dark:text-[#A5A8B6]">
              <CheckCircle2 size={16} className="shrink-0 text-[#28C76F]" />
              <span className="truncate">
                Last refreshed{" "}
                {lastUpdated.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>

          <div className="mt-6 grid w-full max-w-full grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => navigate(action.path)}
                  className="group flex min-w-0 flex-col items-center gap-3 overflow-hidden rounded-md border border-[#EBE9F1] bg-[#F8F7FA] p-5 text-center transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_4px_18px_rgba(47,43,61,0.12)] dark:border-[#3B405A] dark:bg-[#25293C] dark:hover:bg-[#2F3349]"
                >
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: action.bg }}
                  >
                    <Icon size={22} style={{ color: action.color }} />
                  </div>

                  <span className="max-w-full truncate text-[14px] font-medium text-[#5D596C] dark:text-[#D0D2D6]">
                    {action.label}
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
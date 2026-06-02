import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  AlertCircle,
  Package,
  Users,
  BookOpen,
  UploadCloud,
  Search,
  ChevronUp,
  ChevronDown,
  ArrowUpRight,
  Calendar,
  RefreshCw,
  Download,
  Filter,
  Coffee,
  ClipboardList,
  FileText,
  Wallet,
  CheckCircle2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import toast from "react-hot-toast";
import useAuthStore from "../store/authStore";
import { dashboardAPI, getSelectedOutletId, getStoredPermissions } from "../services/api";

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

const fmt = (n = 0) =>
  "₹" +
  Number(n || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });

const fmtK = (n = 0) => {
  const value = Number(n || 0);

  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;

  return `₹${value}`;
};

const outletData = [
  { outlet: "RR Nagar", sales: 45000, expenses: 32000, profit: 13000 },
  { outlet: "Koramangala", sales: 52000, expenses: 38000, profit: 14000 },
  { outlet: "HSR Layout", sales: 48000, expenses: 35000, profit: 13000 },
  { outlet: "M5 E-City", sales: 41000, expenses: 30000, profit: 11000 },
  { outlet: "Jayanagar", sales: 43800, expenses: 31800, profit: 12000 },
  { outlet: "Indiranagar", sales: 49600, expenses: 36200, profit: 13400 },
];

const trendData = [
  { day: "Mon", sales: 12400, expenses: 8200 },
  { day: "Tue", sales: 14800, expenses: 9100 },
  { day: "Wed", sales: 11200, expenses: 7800 },
  { day: "Thu", sales: 16500, expenses: 10200 },
  { day: "Fri", sales: 18900, expenses: 11500 },
  { day: "Sat", sales: 22100, expenses: 13800 },
  { day: "Sun", sales: 15240, expenses: 9600 },
];

const earningData = [
  { month: "Jan", orders: 28000, sales: 36000, profit: 12000, income: 42000 },
  { month: "Feb", orders: 10000, sales: 31000, profit: 15000, income: 38000 },
  { month: "Mar", orders: 46000, sales: 50000, profit: 22000, income: 57000 },
  { month: "Apr", orders: 38000, sales: 43000, profit: 18000, income: 48000 },
  { month: "May", orders: 30000, sales: 45200, profit: 12700, income: 51000 },
  { month: "Jun", orders: 35000, sales: 48000, profit: 16000, income: 53000 },
];

const salesMix = [
  { name: "RR Nagar", value: 45000, color: "#7367F0" },
  { name: "Koramangala", value: 52000, color: "#00CFE8" },
  { name: "HSR Layout", value: 48000, color: "#28C76F" },
  { name: "M5 E-City", value: 41000, color: "#FF9F43" },
  { name: "Jayanagar", value: 43800, color: "#EA5455" },
];

const recentTransactions = [
  {
    id: "#TXN-4821",
    outlet: "Koramangala",
    item: "Cappuccino × 12",
    amount: 2880,
    time: "2 min ago",
    status: "success",
  },
  {
    id: "#TXN-4820",
    outlet: "HSR Layout",
    item: "Burger Combo × 5",
    amount: 1750,
    time: "15 min ago",
    status: "success",
  },
  {
    id: "#TXN-4819",
    outlet: "RR Nagar",
    item: "Pasta Bowl × 8",
    amount: 3200,
    time: "28 min ago",
    status: "pending",
  },
  {
    id: "#TXN-4818",
    outlet: "M5 E-City",
    item: "Cold Coffee × 6",
    amount: 1440,
    time: "45 min ago",
    status: "success",
  },
  {
    id: "#TXN-4817",
    outlet: "Jayanagar",
    item: "Sandwich × 10",
    amount: 2100,
    time: "1 hr ago",
    status: "failed",
  },
];

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

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-[#3B405A] bg-[#2F3349] px-4 py-3 text-xs shadow-2xl">
      <p className="mb-2 font-semibold text-[#A5A8B6]">{label}</p>

      <div className="space-y-1">
        {payload.map((item) => (
          <p key={item.name} style={{ color: item.color }}>
            {item.name}:{" "}
            <span className="font-semibold text-white">{fmt(item.value)}</span>
          </p>
        ))}
      </div>
    </div>
  );
};

const MiniBars = ({ color = "#7367F0" }) => {
  const bars = [60, 42, 28, 52, 68, 45, 72];

  return (
    <div className="flex h-16 items-end gap-3">
      {bars.map((height, index) => (
        <div
          key={index}
          className="w-2 rounded-full bg-[#E8E7F0]"
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
  <svg viewBox="0 0 180 70" className="h-16 w-full">
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
    <div className="rounded-md border border-[#EBE9F1] bg-white p-4 shadow-[0_2px_12px_rgba(47,43,61,0.08)] dark:border-[#3B405A] dark:bg-[#2F3349] md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[18px] font-semibold text-[#2F2B3D] dark:text-[#D0D2D6] md:text-[20px]">{title}</p>
          <p className="mt-1 text-[14px] text-[#A8AAAE] md:text-[15px]">{subtitle}</p>
        </div>

        {type === "icon" && (
          <div
            className="flex h-12 w-12 items-center justify-center rounded-md"
            style={{ backgroundColor: bg }}
          >
            <Icon size={24} style={{ color }} />
          </div>
        )}
      </div>

      <div className="mt-6">
        {type === "bar" && <MiniBars color={color} />}
        {type === "line" && <MiniLine color={color} />}

        <div className="mt-5 flex items-end justify-between gap-3">
          <h3 className="text-[26px] font-semibold leading-none text-[#2F2B3D] dark:text-[#D0D2D6] md:text-[30px]">
            {value}
          </h3>

          <span
            className="rounded px-2.5 py-1 text-[14px] font-medium"
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

const StatusBadge = ({ status }) => {
  const styles = {
    success: "bg-[#E9F9EF] text-[#28C76F]",
    pending: "bg-[#FFF4E5] text-[#FF9F43]",
    failed: "bg-[#FCEAEA] text-[#EA5455]",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${
        styles[status] || styles.pending
      }`}
    >
      {status}
    </span>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState("orders");
  const [period, setPeriod] = useState("week");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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

  const isAdmin =
    roleName === "Super Admin" ||
    roleName === "Admin" ||
    roleName === "Developer";

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

  const filteredTransactions = useMemo(() => {
    return recentTransactions.filter((tx) => {
      const searchMatch =
        tx.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.item.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.outlet.toLowerCase().includes(searchTerm.toLowerCase());

      const statusMatch = statusFilter === "all" || tx.status === statusFilter;

      return searchMatch && statusMatch;
    });
  }, [searchTerm, statusFilter]);

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "short",
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
      className={`min-h-screen ${bgClass}`}
      style={{
        fontFamily:
          '"Public Sans", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div className="max-w-full space-y-4 md:space-y-6">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <h1 className={`text-[24px] font-semibold ${mainTextClass}`}>
              Good morning, {firstName} 👋
            </h1>

            <p className={`mt-1 text-[15px] ${mutedClass}`}>
              {today} · {roleName} · {selectedOutletId === "all" ? "Company overview" : "Selected outlet overview"}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
            >
              <Calendar size={18} />
              May 2026
            </button>

            <button
              type="button"
              onClick={handleRefresh}
              className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
            >
              <RefreshCw size={18} />
              Refresh
            </button>

            <button
              type="button"
              onClick={handleExport}
              className="flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)] sm:w-auto"
              style={{ backgroundColor: primaryColor }}
            >
              <Download size={18} />
              {permissions.isReadOnly ? "Download" : "Export"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
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

          <div className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className={`text-[20px] font-semibold ${mainTextClass}`}>
                  Revenue Growth
                </h3>
                <p className={`mt-1 text-[15px] ${mutedClass}`}>
                  Weekly Report
                </p>
              </div>

              <button
                type="button"
                className="rounded-md p-2 text-white"
                style={{ backgroundColor: primaryColor }}
              >
                <Coffee size={20} />
              </button>
            </div>

            <div className="mt-7 flex items-end justify-between gap-5">
              <div>
                <p className={`text-[28px] font-semibold md:text-[34px] ${mainTextClass}`}>
                  ₹4,673
                </p>
                <span className="mt-3 inline-flex rounded px-2.5 py-1 text-[14px] font-medium text-[#28C76F] bg-[#E9F9EF]">
                  +15.2%
                </span>
              </div>

              <div className="flex h-[120px] items-end gap-3">
                {[42, 58, 72, 90, 110, 92, 72].map((height, index) => (
                  <div
                    key={index}
                    className="w-4 rounded-full bg-[#DDF5E8]"
                    style={{ height }}
                  >
                    <div
                      className="w-full rounded-full bg-[#28C76F]"
                      style={{
                        height: index === 4 ? height : 0,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {[
              {
                icon: AlertCircle,
                title: "12 pending approvals",
                sub: "Daily expenses waiting for verification",
                color: "#FF9F43",
                bg: "#FFF4E5",
              },
              {
                icon: AlertCircle,
                title: "8 missing recipes",
                sub: "Menu items without BOM configured",
                color: "#EA5455",
                bg: "#FCEAEA",
              },
              {
                icon: RefreshCw,
                title: "Sync due for M5 E-City",
                sub: "Last synced 3 hours ago",
                color: "#00CFE8",
                bg: "#E6FAFD",
              },
            ].map((alert) => {
              const Icon = alert.icon;

              return (
                <button
                  key={alert.title}
                  type="button"
                  className="flex items-center gap-4 rounded-md border border-[#EBE9F1] bg-white p-4 text-left shadow-[0_2px_12px_rgba(47,43,61,0.06)] transition hover:-translate-y-0.5 dark:border-[#3B405A] dark:bg-[#2F3349]"
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
                    style={{ color: alert.color, backgroundColor: alert.bg }}
                  >
                    <Icon size={21} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-[#2F2B3D] dark:text-[#D0D2D6]">
                      {alert.title}
                    </p>
                    <p className="mt-0.5 text-[13px] text-[#6F6B7D] dark:text-[#A5A8B6]">
                      {alert.sub}
                    </p>
                  </div>

                  <ArrowUpRight size={17} style={{ color: alert.color }} />
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_460px]">
          <div className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                  Earning Reports
                </h3>
                <p className={`mt-1 text-[15px] ${mutedClass}`}>
                  Yearly Earnings Overview
                </p>
              </div>

              <button className={`text-[28px] ${mutedClass}`}>⋮</button>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
              {[
                { key: "orders", label: "Orders", icon: ShoppingCart },
                { key: "sales", label: "Sales", icon: TrendingUp },
                { key: "profit", label: "Profit", icon: DollarSign },
                { key: "income", label: "Income", icon: Wallet },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex h-[115px] flex-col items-center justify-center rounded-md border border-dashed text-center transition ${isDark ? "border-[#3B405A]" : ""}`}
                    style={{
                      borderColor: active ? primaryColor : "#DBDADE",
                      backgroundColor: active ? `${primaryColor}08` : "transparent",
                      color: active ? primaryColor : undefined,
                    }}
                  >
                    <div
                      className="mb-3 flex h-11 w-11 items-center justify-center rounded-md"
                      style={{
                        backgroundColor: active ? `${primaryColor}18` : isDark ? "#25293C" : "#F3F2F7",
                      }}
                    >
                      <Icon size={23} />
                    </div>
                    <span className="text-[16px] font-medium">{tab.label}</span>
                  </button>
                );
              })}

              <button
                type="button"
                className="flex h-[115px] flex-col items-center justify-center rounded-md border border-dashed border-[#DBDADE] text-center text-[#A8AAAE] dark:border-[#3B405A]"
              >
                <span className="text-[34px] leading-none">+</span>
              </button>
            </div>

            <div className="mt-8 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={earningData} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#EBE9F1" vertical={false} />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#A8AAAE", fontSize: 13 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={fmtK}
                    tick={{ fill: "#A8AAAE", fontSize: 13 }}
                    width={55}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "#F8F7FA" }} />
                  <Bar
                    dataKey={activeTab}
                    fill={primaryColor}
                    radius={[8, 8, 0, 0]}
                    maxBarSize={34}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                  Sales
                </h3>
                <p className={`mt-1 text-[15px] ${mutedClass}`}>
                  Last 6 Months
                </p>
              </div>

              <button className={`text-[28px] ${mutedClass}`}>⋮</button>
            </div>

            <div className="mt-8 h-[245px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={salesMix}
                    cx="50%"
                    cy="50%"
                    innerRadius={66}
                    outerRadius={98}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {salesMix.map((item) => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => fmt(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 space-y-3">
              {salesMix.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className={`truncate text-[14px] ${mutedClass}`}>
                      {item.name}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`text-[14px] font-semibold ${mainTextClass}`}>
                      {fmtK(item.value)}
                    </span>
                    <span className={`text-[13px] ${mutedClass}`}>
                      {Math.round((item.value / totalSales) * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_430px]">
          <div className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                  Sales vs Expenses
                </h3>
                <p className={`mt-1 text-[15px] ${mutedClass}`}>
                  Weekly operational performance
                </p>
              </div>

              <div className="flex rounded-md border border-[#DBDADE] p-1 dark:border-[#3B405A]">
                {["week", "month", "year"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPeriod(item)}
                    className="rounded px-4 py-2 text-[13px] font-semibold capitalize"
                    style={
                      period === item
                        ? { backgroundColor: primaryColor, color: "#fff" }
                        : { color: "#6F6B7D" }
                    }
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={primaryColor} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF9F43" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#FF9F43" stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="#EBE9F1" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#A8AAAE" }} />
                  <YAxis
                    tickFormatter={fmtK}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#A8AAAE" }}
                    width={55}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    name="Sales"
                    stroke={primaryColor}
                    strokeWidth={3}
                    fill="url(#salesGradient)"
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stroke="#FF9F43"
                    strokeWidth={3}
                    fill="url(#expenseGradient)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                  Recent Transactions
                </h3>
                <p className={`mt-1 text-[15px] ${mutedClass}`}>All outlets</p>
              </div>

              <button className={`text-[28px] ${mutedClass}`}>⋮</button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px] xl:grid-cols-1">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]"
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search transactions..."
                  className="h-11 w-full rounded-md border border-[#DBDADE] bg-white pl-11 pr-4 text-[14px] text-[#2F2B3D] outline-none focus:border-[#7367F0] dark:border-[#3B405A] dark:bg-[#25293C] dark:text-[#D0D2D6]"
                />
              </div>

              <div className="relative">
                <Filter
                  size={17}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-11 w-full appearance-none rounded-md border border-[#DBDADE] bg-white pl-11 pr-4 text-[14px] text-[#2F2B3D] outline-none focus:border-[#7367F0] dark:border-[#3B405A] dark:bg-[#25293C] dark:text-[#D0D2D6]"
                >
                  <option value="all">All</option>
                  <option value="success">Success</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {filteredTransactions.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#DBDADE] p-8 text-center">
                  <Search size={26} className="mx-auto text-[#A8AAAE]" />
                  <p className={`mt-3 text-[15px] font-semibold ${mainTextClass}`}>
                    No transactions found
                  </p>
                  <p className={`mt-1 text-[13px] ${mutedClass}`}>
                    Try different search or filter.
                  </p>
                </div>
              ) : (
                filteredTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-3 rounded-md p-3 transition hover:bg-[#F8F7FA] dark:hover:bg-[#25293C]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
                        style={{
                          backgroundColor:
                            tx.status === "success"
                              ? "#E9F9EF"
                              : tx.status === "pending"
                              ? "#FFF4E5"
                              : "#FCEAEA",
                          color:
                            tx.status === "success"
                              ? "#28C76F"
                              : tx.status === "pending"
                              ? "#FF9F43"
                              : "#EA5455",
                        }}
                      >
                        <DollarSign size={18} />
                      </div>

                      <div className="min-w-0">
                        <p className={`truncate text-[14px] font-semibold ${mainTextClass}`}>
                          {tx.item}
                        </p>
                        <p className={`mt-0.5 truncate text-[12px] ${mutedClass}`}>
                          {tx.outlet} · {tx.time}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className={`text-[14px] font-semibold ${mainTextClass}`}>
                        {fmt(tx.amount)}
                      </p>
                      <div className="mt-1">
                        <StatusBadge status={tx.status} />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate("/sales/item-sales")}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-md border border-[#DBDADE] px-4 py-3 text-[15px] font-medium text-[#6F6B7D] hover:bg-[#F8F7FA] dark:border-[#3B405A] dark:text-[#A5A8B6] dark:hover:bg-[#25293C]"
            >
              View All Transactions
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>

        <div className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                Quick Actions
              </h3>
              <p className={`mt-1 text-[15px] ${mutedClass}`}>
                Frequently used Big Bean Café operations
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-md bg-[#F8F7FA] px-4 py-2 text-[13px] font-medium text-[#6F6B7D] dark:bg-[#25293C] dark:text-[#A5A8B6]">
              <CheckCircle2 size={16} className="text-[#28C76F]" />
              Last refreshed{" "}
              {lastUpdated.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => navigate(action.path)}
                  className="group flex flex-col items-center gap-3 rounded-md border border-[#EBE9F1] bg-[#F8F7FA] p-5 text-center transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_4px_18px_rgba(47,43,61,0.12)] dark:border-[#3B405A] dark:bg-[#25293C] dark:hover:bg-[#2F3349]"
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-md"
                    style={{ backgroundColor: action.bg }}
                  >
                    <Icon size={22} style={{ color: action.color }} />
                  </div>

                  <span className="text-[14px] font-medium text-[#5D596C] dark:text-[#D0D2D6]">
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
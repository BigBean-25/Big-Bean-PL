import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Star, Receipt, Wallet, TrendingUp, Scale, FileText, BarChart3,
} from "lucide-react";

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };

const REPORTS = [
  { title: "Monthly Outlet P&L", path: "/reports/monthly-pl", favourite: true },
  { title: "Outlet Comparison Report", path: "/reports/outlet-comparison" },
  { title: "Expense Report", path: "/reports/expense-report" },
  { title: "Supplier Outstanding Report", path: "/reports/supplier-pending" },
  { title: "Purchase GST Report", path: "/reports/purchase-gst", favourite: true },
  { title: "Sales GST Report", path: "/reports/sales-gst", favourite: true },
  { title: "GSTR-1 (Outward Supplies)", path: "/reports/gstr1", favourite: true },
  { title: "Daily Cashbook Report", path: "/reports/daily-cashbook", favourite: true },
  { title: "Actual Consumption Report", path: "/reports/actual-consumption" },
  { title: "Theoretical Consumption Report", path: "/reports/theoretical-consumption" },
  { title: "Consumption Variance Report", path: "/reports/consumption-variance" },
];

const CATEGORIES = [
  { key: "favourite", label: "Favourites", icon: Star, iconColor: "#FF9F43", reports: REPORTS.filter((r) => r.favourite) },
  { key: "gst", label: "GST", icon: Receipt, iconColor: "#EA5455", reports: REPORTS.filter((r) => r.path.includes("gst")) },
  { key: "financial", label: "Financial", icon: Wallet, iconColor: "#28C76F", reports: REPORTS.filter((r) => ["/reports/monthly-pl", "/reports/outlet-comparison", "/reports/expense-report", "/reports/supplier-pending"].includes(r.path)) },
  { key: "operational", label: "Operational", icon: BarChart3, iconColor: "#00CFE8", reports: REPORTS.filter((r) => ["/reports/daily-cashbook", "/reports/actual-consumption", "/reports/theoretical-consumption", "/reports/consumption-variance"].includes(r.path)) },
];

const ReportsHub = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6]" : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const rowHover = isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F8F7FA]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

  const term = search.trim().toLowerCase();
  const categories = useMemo(() => {
    if (!term) return CATEGORIES;
    return CATEGORIES.map((cat) => ({
      ...cat,
      reports: cat.reports.filter((r) => r.title.toLowerCase().includes(term)),
    })).filter((cat) => cat.reports.length > 0);
  }, [term]);

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Reports</h1>
          <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>Every report, organized by what it's for.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${mutedCls}`} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a report"
            className={`h-10 w-full rounded-md border pl-9 pr-3 text-[14px] outline-none ${inputCls}`}
          />
        </div>
      </div>

      {categories.length === 0 ? (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 text-center ${cardCls}`}>
          <FileText size={26} className={mutedCls} />
          <p className={`mt-3 text-[15px] font-semibold ${mainCls}`}>No report matches "{search}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {categories.map((cat) => {
            const CatIcon = cat.icon;
            return (
              <div key={cat.key} className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
                <div className={`flex items-center gap-2 border-b px-4 py-3 ${borderCls}`}>
                  <CatIcon size={16} style={{ color: cat.iconColor }} />
                  <span className={`text-[13px] font-semibold uppercase tracking-wider ${mainCls}`}>{cat.label}</span>
                </div>
                <div className="p-2">
                  {cat.reports.map((r) => (
                    <button
                      key={r.path}
                      type="button"
                      onClick={() => navigate(r.path)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-[14px] transition ${mainCls} ${rowHover}`}
                    >
                      {r.title}
                      {r.favourite && <Star size={13} style={{ color: "#FF9F43" }} fill="#FF9F43" />}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReportsHub;

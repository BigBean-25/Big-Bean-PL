import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getStoredPermissions } from "../../services/api";
import {
  Search, Star, Receipt, Wallet, FileText, BarChart3,
  ChevronRight, X, LayoutGrid,
} from "lucide-react";

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };

// `cat` places each report in exactly one category; the existing
// Favourites/GST/Financial/Operational bucketing is preserved verbatim -
// reports appear under their real category only, with favourites surfaced
// separately as a compact quick-access row.
const REPORTS = [
  { title: "Monthly Outlet P&L", path: "/reports/monthly-pl", module: "monthly_pl", favourite: true, cat: "financial", desc: "Profit & loss across outlets by month" },
  { title: "Outlet Comparison Report", path: "/reports/outlet-comparison", module: "monthly_pl", needsAllOutlets: true, cat: "financial", desc: "Side-by-side outlet performance" },
  { title: "Expense Report", path: "/reports/expense-report", module: "reports", cat: "financial", desc: "Outlet expenses by category and period" },
  { title: "Supplier Outstanding Report", path: "/reports/supplier-pending", module: "reports", cat: "financial", desc: "Unpaid balances owed to suppliers" },
  { title: "Purchase GST Report", path: "/reports/purchase-gst", module: "reports", favourite: true, needsAllOutlets: true, cat: "gst", desc: "GST input credit on purchases" },
  { title: "Sales GST Report", path: "/reports/sales-gst", module: "reports", favourite: true, cat: "gst", desc: "GST collected on outlet sales" },
  { title: "GSTR-1 (Outward Supplies)", path: "/reports/gstr1", module: "reports", favourite: true, cat: "gst", desc: "Outward supply details for filing" },
  { title: "Daily Cashbook Report", path: "/reports/daily-cashbook", module: "reports", favourite: true, cat: "operational", desc: "Daily cash in/out across outlets" },
  { title: "Actual Consumption Report", path: "/reports/actual-consumption", module: "reports", cat: "operational", desc: "Materials consumed from the ledger" },
  { title: "Theoretical Consumption Report", path: "/reports/theoretical-consumption", module: "reports", cat: "operational", desc: "Expected consumption from sales mix" },
  { title: "Consumption Variance Report", path: "/reports/consumption-variance", module: "reports", cat: "operational", desc: "Actual vs theoretical consumption gap" },
  { title: "Closing Reconciliation", path: "/reports/closing-reconciliation", module: "reports", cat: "operational", desc: "Closing stock vs expected balance" },
  { title: "Hybrid COGS Reconciliation", path: "/reports/hybrid-cogs", module: "reports", cat: "operational", desc: "COGS across costing methods" },
  { title: "Physical vs Theoretical Consumption", path: "/reports/consumption-reconciliation", module: "reports", cat: "operational", desc: "Counted stock against recipe usage" },
  // Phase 7A (Req 13): already routed and already in the Reports sidebar, but was
  // missing from this hub. Gated on its own `controlled_exceptions` module - NOT
  // on `reports` - so it stays invisible to roles that only hold `reports`.
  // "/reports/exceptions" is bucketed as Financial because controlled exceptions
  // reverse financial records (supplier payments, purchase returns, accounting
  // effects).
  { title: "Exceptions & Reversals", path: "/reports/exceptions", module: "controlled_exceptions", cat: "financial", desc: "Controlled reversals and exceptions" },
];

const CATEGORIES = [
  { key: "gst", label: "GST", icon: Receipt, iconColor: "#EA5455" },
  { key: "financial", label: "Financial", icon: Wallet, iconColor: "#28C76F" },
  { key: "operational", label: "Operational", icon: BarChart3, iconColor: "#00CFE8" },
];
const CATEGORY_META = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

const MetaChip = ({ children, isDark }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#A5A8B6]" : "border-[#EBE9F1] bg-white text-[#6F6B7D]"}`}>
    {children}
  </span>
);

const ReportsHub = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const permissions = getStoredPermissions();
  const canView = (moduleKey) => Boolean(permissions?.[moduleKey]?.can_view);
  const canAccessAllOutlets = Boolean(permissions?.canAccessAllOutlets);

  const visibleReports = useMemo(
    () => REPORTS.filter((r) => canView(r.module) && (!r.needsAllOutlets || canAccessAllOutlets)),
    [permissions]
  );

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6]" : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  const term = search.trim().toLowerCase();
  // Search ∩ category - both filters stack client-side.
  const filteredReports = useMemo(
    () => visibleReports.filter((r) =>
      (category === "all" || r.cat === category) &&
      (!term || r.title.toLowerCase().includes(term))
    ),
    [visibleReports, category, term]
  );

  const favourites = visibleReports.filter((r) => r.favourite);
  const showFavStrip = category === "all" && !term && favourites.length > 0;

  const tabs = useMemo(() => [
    { key: "all", label: "All Reports", count: visibleReports.length },
    ...CATEGORIES
      .map((c) => ({ ...c, count: visibleReports.filter((r) => r.cat === c.key).length }))
      .filter((c) => c.count > 0),
  ], [visibleReports]);

  return (
    <div className="page-enter space-y-4">
      {/* Compact header: title + meta inline, search beside it */}
      <div className="animate-fade-up flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Reports</h1>
          <p className={`mt-0.5 text-[13px] sm:text-[14px] ${mutedCls}`}>Monitor performance, finance, inventory and operations from one place.</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <MetaChip isDark={isDark}><LayoutGrid size={12} /> {visibleReports.length} report{visibleReports.length === 1 ? "" : "s"} available</MetaChip>
            {favourites.length > 0 && <MetaChip isDark={isDark}><Star size={12} style={{ color: "#FF9F43" }} fill="#FF9F43" /> {favourites.length} favourite{favourites.length === 1 ? "" : "s"}</MetaChip>}
          </div>
        </div>
        <div className="relative w-full sm:w-72 sm:shrink-0">
          <Search size={16} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${mutedCls}`} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports..."
            aria-label="Search reports"
            className={`h-10 w-full rounded-md border pl-9 pr-8 text-base md:text-[14px] outline-none transition-all duration-200 focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] motion-reduce:transition-none ${inputCls}`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 transition-colors ${mutedCls} hover:text-[#7367F0]`}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Favourites quick access - compact shortcut row, not a full column */}
      {showFavStrip && (
        <div className="animate-fade-up motion-reduce:animate-none">
          <div className={`mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider ${mutedCls}`}>
            <Star size={12} style={{ color: "#FF9F43" }} fill="#FF9F43" /> Favourite Reports
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {favourites.map((r) => (
              <button
                key={r.path}
                type="button"
                onClick={() => navigate(r.path)}
                className={`group flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#7367F0]/50 hover:shadow-[0_4px_14px_rgba(47,43,61,0.10)] active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none ${cardCls}`}
              >
                <Star size={13} style={{ color: "#FF9F43" }} fill="#FF9F43" className="shrink-0" />
                <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${mainCls}`}>{r.title}</span>
                <ChevronRight size={14} className={`shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none ${mutedCls}`} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category tabs - horizontally scrollable on mobile */}
      <div className="animate-fade-up -mx-1 overflow-x-auto overscroll-x-contain px-1 pb-0.5 motion-reduce:animate-none">
        <div className="flex w-max min-w-full items-center gap-1.5">
          {tabs.map((t) => {
            const active = category === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(t.key)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200 motion-reduce:transition-none ${
                  active
                    ? "border-[#7367F0] bg-[#7367F0]/10 text-[#7367F0]"
                    : isDark
                      ? "border-[#3B405A] bg-[#2F3349] text-[#A5A8B6] hover:border-[#7367F0]/40 hover:text-[#D0D2D6]"
                      : "border-[#EBE9F1] bg-white text-[#6F6B7D] hover:border-[#7367F0]/40 hover:text-[#2F2B3D]"
                }`}
              >
                {t.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${active ? "bg-[#7367F0] text-white" : isDark ? "bg-[#3B405A] text-[#A5A8B6]" : "bg-[#F3F2F7] text-[#A8AAAE]"}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Flat report grid - one card per report, natural height */}
      {filteredReports.length === 0 ? (
        <div className={`flex flex-col items-center justify-center rounded-md border py-12 text-center animate-fade-in motion-reduce:animate-none ${cardCls}`}>
          <FileText size={26} className={mutedCls} />
          <p className={`mt-3 text-[15px] font-semibold ${mainCls}`}>No reports found</p>
          <p className={`mt-1 text-[13px] ${mutedCls}`}>Try another search or category.</p>
          {term && (
            <button type="button" onClick={() => setSearch("")} className="mt-3 text-[13px] font-medium text-[#7367F0] transition-colors hover:text-[#6354D8]">
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div key={category} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 animate-fade-in motion-reduce:animate-none">
          {filteredReports.map((r) => {
            const meta = CATEGORY_META[r.cat] || {};
            const CatIcon = meta.icon || FileText;
            const color = meta.iconColor || "#7367F0";
            return (
              <button
                key={r.path}
                type="button"
                onClick={() => navigate(r.path)}
                className={`group flex min-h-[108px] items-start gap-3 rounded-lg border p-4 text-left shadow-[0_2px_12px_rgba(47,43,61,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#7367F0]/50 hover:shadow-[0_6px_18px_rgba(47,43,61,0.12)] active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none ${cardCls}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 group-hover:bg-[#7367F0]/15" style={{ backgroundColor: `${color}1f` }}>
                  <CatIcon size={16} style={{ color }} className="transition-colors duration-200 group-hover:text-[#7367F0]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className={`line-clamp-2 text-[14px] font-semibold leading-snug ${mainCls}`}>{r.title}</span>
                    {r.favourite && <Star size={13} style={{ color: "#FF9F43" }} fill="#FF9F43" className="mt-0.5 shrink-0" />}
                  </span>
                  {r.desc && <span className={`mt-1 line-clamp-2 block text-[12px] leading-snug ${mutedCls}`}>{r.desc}</span>}
                  <span className={`mt-2 flex items-center justify-between`}>
                    <span className={`text-[11px] font-medium uppercase tracking-wide`} style={{ color }}>{meta.label || "Report"}</span>
                    <ChevronRight size={15} className={`shrink-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[#7367F0] motion-reduce:transform-none ${mutedCls}`} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReportsHub;

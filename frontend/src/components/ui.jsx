/**
 * Big Bean Café — Shared UI Components
 * Usage: import { StatusBadge, PageHeader, SectionCard, EmptyState, LoadingRows, TableWrapper, FilterBar } from '../components/ui'
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";

/* ──────────────────────────────────────────────────────────── *
 * Theme helpers (read from localStorage — same as all pages)
 * ──────────────────────────────────────────────────────────── */
export const getPrimaryColor = () => {
  try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; }
};

export const getThemeMode = () => {
  try {
    const mode = localStorage.getItem("bbc_theme_mode") || "light";
    if (mode === "system") return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
    return mode;
  } catch { return "light"; }
};

export const getCardClass = (isDark) =>
  isDark
    ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
    : "border-[#EBE9F1] bg-white text-[#2F2B3D]";

export const getInputClass = (isDark) =>
  isDark
    ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6] focus:border-[#7367F0]"
    : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE] focus:border-[#7367F0]";

/* ──────────────────────────────────────────────────────────── *
 * StatusBadge
 * Usage: <StatusBadge status="Approved" />
 * ──────────────────────────────────────────────────────────── */
const STATUS_STYLES = {
  approved:   "bg-[#E9F9EF] text-[#28C76F]",
  verified:   "bg-[#E9F9EF] text-[#28C76F]",
  active:     "bg-[#E9F9EF] text-[#28C76F]",
  completed:  "bg-[#E9F9EF] text-[#28C76F]",
  success:    "bg-[#E9F9EF] text-[#28C76F]",
  received:   "bg-[#E9F9EF] text-[#28C76F]",
  posted:     "bg-[#E9F9EF] text-[#28C76F]",
  reconciled: "bg-[#E9F9EF] text-[#28C76F]",
  in_stock:   "bg-[#E9F9EF] text-[#28C76F]",
  fulfilled:  "bg-[#E9F9EF] text-[#28C76F]",
  submitted:  "bg-[#E6FAFD] text-[#00CFE8]",
  processing: "bg-[#E6FAFD] text-[#00CFE8]",
  dispatched: "bg-[#E6FAFD] text-[#00CFE8]",
  in_transit: "bg-[#E6FAFD] text-[#00CFE8]",
  near_expiry: "bg-[#E6FAFD] text-[#00CFE8]",
  sent:       "bg-[#E6FAFD] text-[#00CFE8]",
  reviewed:   "bg-[#E6FAFD] text-[#00CFE8]",
  in_production: "bg-[#E6FAFD] text-[#00CFE8]",
  pending:    "bg-[#FFF4E5] text-[#FF9F43]",
  draft:      "bg-[#FFF4E5] text-[#FF9F43]",
  low_stock:  "bg-[#FFF4E5] text-[#FF9F43]",
  partially_approved: "bg-[#FFF4E5] text-[#FF9F43]",
  partially_received: "bg-[#FFF4E5] text-[#FF9F43]",
  partially_fulfilled: "bg-[#FFF4E5] text-[#FF9F43]",
  locked:     "bg-[#EFECFF] text-[#7367F0]",
  expired:    "bg-[#EFECFF] text-[#7367F0]",
  rejected:   "bg-[#FCEAEA] text-[#EA5455]",
  failed:     "bg-[#FCEAEA] text-[#EA5455]",
  out_of_stock: "bg-[#FCEAEA] text-[#EA5455]",
  inactive:   "bg-[#F3F2F7] text-[#A8AAAE]",
  closed:     "bg-[#F3F2F7] text-[#A8AAAE]",
};

export const StatusBadge = ({ status = "" }) => {
  const key = String(status).toLowerCase().replace(/\s+/g, "_");
  const cls = STATUS_STYLES[key] || "bg-[#F3F2F7] text-[#6F6B7D]";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
};

/* ──────────────────────────────────────────────────────────── *
 * PageHeader
 * Usage:
 *   <PageHeader
 *     title="Daily Cashbook"
 *     subtitle="Manage daily cash entries per outlet"
 *     actions={<button>+ New Entry</button>}
 *     isDark={isDark}
 *   />
 * ──────────────────────────────────────────────────────────── */
export const PageHeader = ({ title, subtitle, actions, isDark = false }) => (
  <div className="animate-fade-up flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
    <div className="min-w-0 flex-1">
      <h1 className={`text-xl font-bold leading-tight sm:text-2xl ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>
        {title}
      </h1>
      {subtitle && (
        <p className={`mt-1 text-[13px] sm:text-[14px] ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>
          {subtitle}
        </p>
      )}
    </div>
    {actions && (
      <div className="flex flex-wrap items-center gap-2 shrink-0 min-w-0">
        {actions}
      </div>
    )}
  </div>
);

/* ──────────────────────────────────────────────────────────── *
 * SectionCard
 * Usage: <SectionCard title="Filters" isDark={isDark}>{children}</SectionCard>
 * ──────────────────────────────────────────────────────────── */
export const SectionCard = ({ title, children, isDark = false, className = "" }) => {
  const cardCls = isDark
    ? "border-[#3B405A] bg-[#2F3349]"
    : "border-[#EBE9F1] bg-white";

  return (
    <div className={`w-full min-w-0 max-w-full rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls} ${className}`}>
      {title && (
        <div className={`border-b px-4 py-3 sm:px-6 sm:py-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
          <h3 className={`text-[15px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{title}</h3>
        </div>
      )}
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────── *
 * TableWrapper — horizontal scroll with touch support
 * Usage: <TableWrapper><table>…</table></TableWrapper>
 * ──────────────────────────────────────────────────────────── */
export const TableWrapper = ({ children, isDark = false, className = "" }) => {
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";
  return (
    <div
      className={`w-full min-w-0 max-w-full overflow-x-auto rounded-md border ${borderCls} ${className}`}
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {children}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────── *
 * EmptyState
 * Usage:
 *   <EmptyState
 *     icon={Store}
 *     title="No outlets found"
 *     subtitle="Add your first outlet"
 *     action={<button>Add Outlet</button>}
 *     isDark={isDark}
 *   />
 * ──────────────────────────────────────────────────────────── */
export const EmptyState = ({ icon: Icon, title, subtitle, action, isDark = false }) => (
  <div className={`flex flex-col items-center justify-center rounded-md border py-12 px-4 text-center ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-[#F8F7FA]"}`}>
    {Icon && (
      <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${isDark ? "bg-[#3B405A] text-[#A5A8B6]" : "bg-[#EBE9F1] text-[#A8AAAE]"}`}>
        <Icon size={26} />
      </div>
    )}
    <p className={`text-[16px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{title}</p>
    {subtitle && (
      <p className={`mt-1 text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>{subtitle}</p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

/* ──────────────────────────────────────────────────────────── *
 * LoadingRows — skeleton rows inside a <tbody>
 * Usage: <LoadingRows rows={5} cols={4} isDark={isDark} />
 * ──────────────────────────────────────────────────────────── */
export const LoadingRows = ({ rows = 5, cols = 4, isDark = false }) => (
  <>
    {Array.from({ length: rows }).map((_, ri) => (
      <tr key={ri} className={isDark ? "border-b border-[#3B405A]" : "border-b border-[#F3F2F7]"}>
        {Array.from({ length: cols }).map((_, ci) => (
          <td key={ci} className="px-4 py-3">
            <div className={`h-4 rounded ${isDark ? "bg-[#3B405A]" : "bg-[#EBE9F1]"} skeleton`} style={{ width: ci === 0 ? "60%" : ci === cols - 1 ? "40%" : "80%" }} />
          </td>
        ))}
      </tr>
    ))}
  </>
);

/* ──────────────────────────────────────────────────────────── *
 * LoadingSpinner — inline spinner
 * ──────────────────────────────────────────────────────────── */
export const LoadingSpinner = ({ size = 18, className = "" }) => (
  <Loader2 size={size} className={`animate-spin ${className}`} />
);

/* ──────────────────────────────────────────────────────────── *
 * FilterBar — responsive filter section with optional collapse on mobile
 * Usage:
 *   <FilterBar isDark={isDark} title="Filters">
 *     <div>filter inputs…</div>
 *   </FilterBar>
 * ──────────────────────────────────────────────────────────── */
export const FilterBar = ({ children, isDark = false, title = "Filters", className = "" }) => {
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white";
  return (
    <div className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls} ${className}`}>
      <div className={`border-b px-4 py-3 sm:px-6 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
        <span className={`text-[13px] font-semibold uppercase tracking-wider ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>{title}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────── *
 * Pagination — prev/next + page-number controls for a server-paginated list
 * Usage:
 *   <Pagination
 *     page={page} pages={pagination.pages} total={pagination.total} limit={limit}
 *     onPageChange={setPage} isDark={isDark}
 *   />
 * Renders nothing when there's only one page (or no rows yet).
 * ──────────────────────────────────────────────────────────── */
export const Pagination = ({ page = 1, pages = 1, total = 0, limit = 25, onPageChange, isDark = false }) => {
  if (!pages || pages <= 1) return null;

  const cardCls = isDark
    ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
    : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const primaryColor = getPrimaryColor();

  const pageNumbers = () => {
    const windowSize = 5;
    let start = Math.max(1, page - Math.floor(windowSize / 2));
    const end = Math.min(pages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    const nums = [];
    for (let i = start; i <= end; i++) nums.push(i);
    return nums;
  };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className={`flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
      <p className={`text-[13px] ${mutedCls}`}>
        Showing {from}-{to} of {total}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className={`h-9 rounded-md border px-3 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${cardCls}`}
        >
          Prev
        </button>
        {pageNumbers().map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPageChange(n)}
            className="h-9 min-w-[36px] rounded-md px-3 text-[13px] font-semibold"
            style={
              n === page
                ? { backgroundColor: primaryColor, color: "#fff" }
                : { backgroundColor: isDark ? "#2F3349" : "#F3F2F7", color: isDark ? "#D0D2D6" : "#5D596C" }
            }
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(pages, page + 1))}
          disabled={page >= pages}
          className={`h-9 rounded-md border px-3 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${cardCls}`}
        >
          Next
        </button>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────────── *
 * MobileActionMenu — ⋮ kebab menu for table row actions on mobile
 * Usage:
 *   <MobileActionMenu actions={[{ label: "Edit", icon: Edit2, onClick: fn }, ...]} isDark={isDark} />
 * ──────────────────────────────────────────────────────────── */
export const MobileActionMenu = ({ actions = [], isDark = false }) => {
  const [open, setOpen] = useState(false);
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white";

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`flex h-8 w-8 items-center justify-center rounded-md transition ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}
        aria-label="More actions"
      >
        <span className="block text-[18px] leading-none font-bold">⋮</span>
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className={`dropdown-enter absolute right-0 z-20 mt-1 min-w-[160px] overflow-hidden rounded-md border shadow-xl ${cardCls}`}>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => { action.onClick?.(); setOpen(false); }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] transition ${
                    action.danger
                      ? "text-[#EA5455] hover:bg-[#FCEAEA]"
                      : isDark ? "text-[#D0D2D6] hover:bg-[#3B405A]" : "text-[#5D596C] hover:bg-[#F8F7FA]"
                  }`}
                >
                  {Icon && <Icon size={15} />}
                  {action.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

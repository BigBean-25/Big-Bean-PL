import { LoadingSpinner } from "../../components/ui";

export const num = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v));

export const fmtCurrency = (v) =>
  `₹${num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtQty = (v, u = "") => {
  const n = num(v);
  const s = n % 1 === 0 ? n.toString() : n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return u ? `${s} ${u}` : s;
};

export const fmtDate = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const statusMap = {
  // Stock
  "in_stock": { bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", label: "In Stock" },
  "low_stock": { bg: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", label: "Low Stock" },
  "out_of_stock": { bg: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400", label: "Out of Stock" },
  "near_expiry": { bg: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400", label: "Near Expiry" },
  "expired": { bg: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", label: "Expired" },
  // Requisition
  "draft": { bg: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", label: "Draft" },
  "submitted": { bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", label: "Submitted" },
  "approved": { bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", label: "Approved" },
  "partially_approved": { bg: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", label: "Partially Approved" },
  "rejected": { bg: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400", label: "Rejected" },
  "dispatched": { bg: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400", label: "Dispatched" },
  "partially_received": { bg: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", label: "Partially Received" },
  "received": { bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", label: "Received" },
  // Transfer
  "in_transit": { bg: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400", label: "In Transit" },
  // GRN
  "posted": { bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", label: "Posted" },
  "pending": { bg: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", label: "Pending" },
  // Ledger
  "opening": { bg: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", label: "Opening" },
  "purchase_grn": { bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", label: "Purchase GRN" },
  "transfer_in": { bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", label: "Transfer In" },
  "transfer_out": { bg: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400", label: "Transfer Out" },
  "transit_damage": { bg: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", label: "Transit Damage" },
  "transit_short": { bg: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400", label: "Transit Short" },
  "wastage": { bg: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", label: "Wastage" },
  "adjustment_positive": { bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", label: "Adjustment +" },
  "adjustment_negative": { bg: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400", label: "Adjustment -" },
  "physical_adjustment": { bg: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400", label: "Physical Adj" },
  "production_receipt": { bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", label: "Production Receipt" },
  "production_issue": { bg: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", label: "Production Issue" },
  "purchase_return": { bg: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400", label: "Purchase Return" },
};

export const WarehouseStatusBadge = ({ status = "" }) => {
  const key = String(status).toLowerCase().replace(/\s+/g, "_");
  const style = statusMap[key];
  const cls = style?.bg || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  const label = style?.label || status;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${cls}`}>
      {label}
    </span>
  );
};

export const KpiCard = ({ icon: Icon, label, value, sub, isDark }) => (
  <div className={`rounded-xl border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] transition hover:shadow-md ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className={`text-[12px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>{label}</p>
        <p className={`mt-1 text-xl font-bold tracking-tight ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{value}</p>
        {sub && <p className={`mt-0.5 text-[11px] ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>{sub}</p>}
      </div>
      {Icon && <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isDark ? "bg-[#3B405A] text-[#A5A8B6]" : "bg-[#F3F2F7] text-[#6F6B7D]"}`}><Icon size={18} /></div>}
    </div>
  </div>
);

export const MiniKpi = ({ label, value, isDark }) => (
  <div className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
    <p className={`text-[11px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>{label}</p>
    <p className={`mt-1 text-lg font-bold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{value}</p>
  </div>
);

export const EmptyRow = ({ colSpan, message = "No records found.", isDark }) => (
  <tr>
    <td colSpan={colSpan} className={`px-4 py-8 text-center text-sm ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>{message}</td>
  </tr>
);

export const InlineSpinner = () => <LoadingSpinner size={18} className="text-[#7367F0]" />;

export const TransactionLabel = (type = "") => {
  const key = String(type).toLowerCase().replace(/\s+/g, "_");
  return statusMap[key]?.label || type;
};

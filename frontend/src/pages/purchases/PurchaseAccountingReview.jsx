import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Loader2, Link2, Unlink, CheckCircle2, AlertTriangle } from "lucide-react";
import { accountingEffectsAPI, getStoredPermissions } from "../../services/api";
import useAuthStore from "../../store/authStore";
import toast from "react-hot-toast";
import { getThemeMode, getPrimaryColor, getCardClass, getInputClass, TableWrapper, EmptyState, PageHeader } from "../../components/ui";

const formatINR = (value = 0) =>
  "₹" + Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "-");

const BRIDGE_LABELS = {
  DRAFT_EFFECT: "Physical GRN — awaiting accounting review",
  CLAIMED_DRAFT_EFFECT: "Claimed — awaiting accounting review",
  POSTED_EFFECT: "Posted — financially effective",
  CLAIMED_POSTED_EFFECT: "Posted (claimed) — financially effective",
};

const PurchaseAccountingReview = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Draft");
  const [acting, setActing] = useState(null);

  const { user } = useAuthStore();
  const permissions = useMemo(() => getStoredPermissions()?.material_purchase || {}, []);
  const canVerify = Boolean(permissions.can_verify);

  const isDark = getThemeMode() === "dark";
  const primaryColor = getPrimaryColor();
  const cardClass = getCardClass(isDark);
  const inputClass = getInputClass(isDark);
  const mutedClass = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";

  const fetchRows = async () => {
    setLoading(true);
    try {
      const params = statusFilter && statusFilter !== "all" ? { status: statusFilter } : {};
      const res = await accountingEffectsAPI.listPurchases(params);
      const data = res?.data?.data || [];
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load accounting effects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRows(); }, [statusFilter]);

  const act = async (fn, id, successMsg) => {
    setActing(id);
    try {
      await fn(id);
      toast.success(successMsg);
      await fetchRows();
    } catch (error) {
      toast.error(error.response?.data?.message || "Action failed");
    } finally {
      setActing(null);
    }
  };

  const handleClaim = (row) => {
    const input = window.prompt(
      `Enter the Material Purchase Item ID to explicitly claim for GRN ${row.grn_no} (invoice ${row.invoice_reference || "-"}).\n` +
      `The claim is validated server-side: supplier, outlet, material and normalized invoice must all match.`,
      ""
    );
    if (input === null) return;
    const itemId = Number(input);
    if (!itemId) { toast.error("A numeric upload item id is required"); return; }
    act((id) => accountingEffectsAPI.claim(id, itemId), row.id, "Effect claimed");
  };

  const isOwn = (row) => Number(row.created_by) === Number(user?.id);

  return (
    <div className="space-y-4">
      <PageHeader
        title="GRN Accounting Review"
        subtitle="Physical GRN → accounting purchase bridge. Draft effects are NOT financial postings — they become effective purchases only after Verify & Post."
      />

      <div className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${cardClass}`}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`rounded-md border px-3 py-2 text-sm ${inputClass}`}>
          <option value="Draft">Awaiting review (Draft)</option>
          <option value="Posted">Posted</option>
          <option value="all">All</option>
        </select>
        <button onClick={fetchRows} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${inputClass}`}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <TableWrapper>
        <table className="min-w-full text-sm">
          <thead>
            <tr className={mutedClass}>
              {["GRN", "Date", "Supplier", "Invoice", "Location", "Acct Outlet", "Material", "Qty", "Base", "Tax", "Total", "Bridge Status", "Dup Risk", "Claim", "By", "Actions"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={16} className="px-3 py-8 text-center"><Loader2 className="inline animate-spin" size={18} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={16} className="px-3 py-8"><EmptyState title="No GRN purchase effects in this state" /></td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className={isDark ? "border-t border-[#3B405A]" : "border-t border-[#EBE9F1]"}>
                <td className="px-3 py-2 whitespace-nowrap">{r.grn_no || `#${r.source_id}`}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.grn_date || r.effective_date)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.supplier_name || "-"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.invoice_reference || "-"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.location_name || r.location_id}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.outlet_id ? `Outlet ${r.outlet_id}` : <span className="text-[#FF9F43]">Accounting owner unresolved</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{r.material_name || r.raw_material_id}</td>
                <td className="px-3 py-2 text-right">{Number(r.quantity)} {r.unit_name || ""}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatINR(r.base_amount)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatINR(r.tax_amount)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatINR(r.total_amount)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={r.status === "Posted" ? "text-[#28C76F]" : "text-[#FF9F43]"}>
                    {BRIDGE_LABELS[r.bridge_state] || r.status}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.duplicate_risk ? <span className="flex items-center gap-1 text-[#EA5455]"><AlertTriangle size={14} /> {r.duplicate_candidate_count}</span> : "-"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{r.claim_upload_item_id ? `item #${r.claim_upload_item_id}` : "-"}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs">
                  {r.created_by_name || "-"}
                  {r.posted_by_name ? ` / ${r.posted_by_name}` : ""}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.status === "Draft" && r.outlet_id && canVerify && !isOwn(r) ? (
                    <div className="flex gap-2">
                      {!r.claim_upload_item_id && (
                        <button disabled={acting === r.id} onClick={() => handleClaim(r)} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs" style={{ borderColor: primaryColor, color: primaryColor }}>
                          <Link2 size={12} /> Claim
                        </button>
                      )}
                      {r.claim_upload_item_id && (
                        <button disabled={acting === r.id} onClick={() => act(accountingEffectsAPI.unclaim, r.id, "Claim removed")} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs" style={{ borderColor: "#A8AAAE", color: "#A8AAAE" }}>
                          <Unlink size={12} /> Unclaim
                        </button>
                      )}
                      <button disabled={acting === r.id} onClick={() => act(accountingEffectsAPI.verifyPost, r.id, "Effect posted — financially effective")} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white" style={{ backgroundColor: primaryColor }}>
                        <CheckCircle2 size={12} /> Verify & Post
                      </button>
                    </div>
                  ) : (
                    <span className={mutedClass}>{r.status === "Draft" ? (isOwn(r) ? "Awaiting another checker" : "-") : "-"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrapper>
    </div>
  );
};

export default PurchaseAccountingReview;

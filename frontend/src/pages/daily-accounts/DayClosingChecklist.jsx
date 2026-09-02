import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckSquare,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { dailyAccountsAPI, masterAPI, getStoredPermissions } from "../../services/api";
import useAuthStore from "../../store/authStore";
import { useSelectedOutlet } from "../../hooks/useSelectedOutlet";
import toast from "react-hot-toast";
import {
  EmptyState,
  LoadingSpinner,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "../../components/ui";

const todayISO = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().split("T")[0];
};

const formatDateLocal = (value) => {
  if (!value) return "-";
  const d = new Date(String(value).replace(" ", "T"));
  if (isNaN(d.getTime())) return String(value).split(" ")[0];
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatINR = (v = 0) =>
  "₹" + Number(v || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const SECTION_TITLES = {
  sales_billing: "Sales & Billing",
  cash_closing: "Cash & Closing",
  expenses: "Expenses",
  bank_deposit: "Bank Deposit",
  purchase_stock: "Purchase / Stock",
  outlet_operations: "Outlet Operations",
};

const STATUS_BANNERS = {
  Open: {
    text: "Complete the operational checklist and submit for verification.",
    cls: "bg-[#FFF4E5] text-[#FF9F43] border-[#FF9F43]",
  },
  Submitted: {
    text: "Submitted for verification. Editing is disabled.",
    cls: "bg-[#E6FAFD] text-[#00A6B7] border-[#00CFE8]",
  },
  Rejected: {
    text: "Rejected. Review the reason, update the checklist and resubmit.",
    cls: "bg-[#FCEAEA] text-[#EA5455] border-[#EA5455]",
  },
  Verified: {
    text: "Verified. Daily operational checklist is complete.",
    cls: "bg-[#E9F9EF] text-[#28C76F] border-[#28C76F]",
  },
};

const DayClosingChecklist = () => {
  const [outlets, setOutlets] = useState([]);
  const [outletFilter, setOutletFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(todayISO());
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [checklist, setChecklist] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [managerRemarks, setManagerRemarks] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const { selectedOutletId } = useSelectedOutlet();
  const { user } = useAuthStore();
  const permissions = useMemo(() => getStoredPermissions()?.daily_checklist || {}, []);
  const isAdmin = ["Super Admin", "Admin", "Developer"].includes(user?.role_name);
  const isOutletAdmin = user?.role_name === "Outlet Admin";
  const isMaker = useMemo(
    () => isOutletAdmin && user?.id && checklist?.entered_by && String(checklist.entered_by) === String(user.id),
    [checklist, user, isOutletAdmin]
  );
  const isSubmitter = useMemo(
    () => user?.id && checklist?.submitted_by && String(checklist.submitted_by) === String(user.id),
    [checklist, user]
  );

  const isDark = useMemo(() => {
    const mode = document.documentElement.classList.contains("dark");
    return mode;
  }, []);

  const primaryColor = useMemo(() => {
    const root = getComputedStyle(document.documentElement);
    return root.getPropertyValue("--color-primary").trim() || "#7367F0";
  }, []);

  useEffect(() => {
    if (selectedOutletId && !isAdmin) {
      setOutletFilter(String(selectedOutletId));
    } else if (selectedOutletId) {
      setOutletFilter(String(selectedOutletId));
    }
  }, [selectedOutletId, isAdmin]);

  useEffect(() => {
    fetchOutlets();
  }, []);

  useEffect(() => {
    if (outlets.length > 0 || selectedOutletId) {
      loadData();
    }
  }, [outletFilter, dateFilter, selectedOutletId, outlets.length]);

  const fetchOutlets = async () => {
    try {
      const res = await masterAPI.getOutlets();
      const rows = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setOutlets(rows);
    } catch {
      toast.error("Failed to load outlets");
    }
  };

  const effectiveOutlet = () => {
    if (outletFilter && outletFilter !== "all") return outletFilter;
    return selectedOutletId || null;
  };

  const loadData = async () => {
    const effective = effectiveOutlet();
    if (!effective || effective === "all" || !dateFilter) return;

    setLoading(true);
    setSummaryLoading(true);
    try {
      const [listRes, summaryRes] = await Promise.all([
        dailyAccountsAPI.getDailyChecklists({ outlet_id: effective, date: dateFilter }),
        dailyAccountsAPI.getDailyChecklistSummary({ outlet_id: effective, date: dateFilter }),
      ]);

      const rows = listRes.data?.data || [];
      setHistory(rows);

      const current = rows[0] || null;
      if (current) {
        const detailRes = await dailyAccountsAPI.getDailyChecklist(current.id);
        setChecklist(detailRes.data?.data || current);
        setManagerRemarks(detailRes.data?.data?.manager_remarks || "");
      } else {
        setChecklist(null);
        setManagerRemarks("");
      }

      setSummary(summaryRes.data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load checklist");
      setChecklist(null);
      setSummary(null);
    } finally {
      setLoading(false);
      setSummaryLoading(false);
    }
  };

  const handleCreate = async () => {
    const effective = effectiveOutlet();
    if (!effective || effective === "all" || !dateFilter) {
      toast.error("Select an outlet and date");
      return;
    }
    const scrollY = window.scrollY || 0;
    setSaving(true);
    try {
      await dailyAccountsAPI.createDailyChecklist({
        date: dateFilter,
        outlet_id: effective,
      });
      toast.success("Daily checklist started");
      await loadData();
      window.scrollTo({ top: scrollY, behavior: "auto" });
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error("Checklist already exists for this outlet and date. Loading it now.");
        await loadData();
        window.scrollTo({ top: scrollY, behavior: "auto" });
      } else {
        toast.error(err.response?.data?.message || "Failed to start checklist");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!checklist || !isMaker || !["Open", "Rejected"].includes(checklist.status)) {
      toast.error("Checklist cannot be edited");
      return;
    }
    setSaving(true);
    try {
      const responses = checklist.responses.map((r) => ({
        id: r.id,
        is_checked: r.is_checked,
        note: r.note,
      }));
      await dailyAccountsAPI.updateDailyChecklist(checklist.id, {
        responses,
        manager_remarks: managerRemarks,
      });
      toast.success("Checklist saved");
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save checklist");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!checklist) return;
    setSaving(true);
    try {
      await dailyAccountsAPI.submitDailyChecklist(checklist.id);
      toast.success("Checklist submitted");
      loadData();
    } catch (err) {
      const missing = err.response?.data?.missing;
      if (Array.isArray(missing)) {
        toast.error(`Missing: ${missing.join(", ")}`);
      } else {
        toast.error(err.response?.data?.message || "Failed to submit");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    if (!checklist) return;
    setSaving(true);
    try {
      await dailyAccountsAPI.verifyDailyChecklist(checklist.id);
      toast.success("Checklist verified");
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to verify");
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!checklist || !rejectReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    setSaving(true);
    try {
      await dailyAccountsAPI.rejectDailyChecklist(checklist.id, {
        rejection_reason: rejectReason,
      });
      setShowReject(false);
      setRejectReason("");
      toast.success("Checklist rejected");
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to reject");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!checklist || !["Open", "Rejected"].includes(checklist.status)) return;
    if (!window.confirm("Delete this checklist?")) return;
    setSaving(true);
    try {
      await dailyAccountsAPI.deleteDailyChecklist(checklist.id);
      toast.success("Checklist deleted");
      setChecklist(null);
      setManagerRemarks("");
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  const toggleResponse = (id) => {
    if (!checklist || !isMaker || !["Open", "Rejected"].includes(checklist.status)) return;
    setChecklist((prev) => ({
      ...prev,
      responses: prev.responses.map((r) =>
        r.id === id ? { ...r, is_checked: !r.is_checked } : r
      ),
    }));
  };

  const updateNote = (id, note) => {
    if (!checklist || !isMaker || !["Open", "Rejected"].includes(checklist.status)) return;
    setChecklist((prev) => ({
      ...prev,
      responses: prev.responses.map((r) =>
        r.id === id ? { ...r, note } : r
      ),
    }));
  };

  const groupedResponses = useMemo(() => {
    if (!checklist?.responses) return {};
    return checklist.responses.reduce((acc, r) => {
      if (!acc[r.section_key]) acc[r.section_key] = [];
      acc[r.section_key].push(r);
      return acc;
    }, {});
  }, [checklist]);

  const sections = useMemo(() => Object.keys(SECTION_TITLES), []);

  const selectedOutlet = useMemo(
    () =>
      outlets.find((o) => String(o.id) === String(outletFilter)) ||
      { outlet_name: "-" },
    [outlets, outletFilter]
  );

  const cardClass = isDark ? "bg-[#2F3349]" : "bg-white";
  const inputClass = `h-11 w-full rounded-md border px-4 text-[14px] outline-none ${
    isDark
      ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
      : "border-[#DBDADE] bg-white text-[#2F2B3D]"
  }`;

  const renderActions = () => {
    if (!checklist) return null;
    const common =
      "h-10 rounded-md px-4 text-[14px] font-medium transition hover:opacity-90 disabled:opacity-50";
    const outline = `${common} ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]"}`;
    return (
      <div className="flex flex-wrap items-center gap-2">
        {["Open", "Rejected"].includes(checklist.status) && isMaker && permissions.can_submit && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className={`${common} text-white`}
            style={{ backgroundColor: primaryColor }}
          >
            <Send size={16} className="mr-2 inline" /> {checklist.status === "Rejected" ? "Resubmit" : "Submit"}
          </button>
        )}
        {["Open", "Rejected"].includes(checklist.status) && isMaker && permissions.can_edit && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={outline}
          >
            Save
          </button>
        )}
        {checklist.status === "Submitted" && permissions.can_verify && !isSubmitter && (
          <button
            type="button"
            onClick={handleVerify}
            disabled={saving}
            className={`${common} bg-[#28C76F] text-white`}
          >
            <Check size={16} className="mr-2 inline" /> Verify
          </button>
        )}
        {checklist.status === "Submitted" && permissions.can_reject && !isSubmitter && (
          <button
            type="button"
            onClick={() => setShowReject(true)}
            disabled={saving}
            className={`${common} bg-[#EA5455] text-white`}
          >
            <X size={16} className="mr-2 inline" /> Reject
          </button>
        )}
        {["Open", "Rejected"].includes(checklist.status) && permissions.can_delete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className={`${common} bg-[#FCEAEA] text-[#EA5455]`}
          >
            <Trash2 size={16} className="mr-2 inline" /> Delete
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      className={`w-full min-w-0 max-w-full space-y-6 overflow-x-hidden p-4 sm:p-6 ${
        isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"
      }`}
    >
      <PageHeader
        title="Daily Checklist"
        subtitle="Complete and verify daily outlet operational checks before final Day Closing."
        isDark={isDark}
      />

      <SectionCard title="Outlet & Date" isDark={isDark} className="animate-fade-up">
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className={`mb-2 block text-[13px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#2F2B3D]"}`}>
              Outlet
            </label>
            <select
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              disabled={!isAdmin && !!selectedOutletId}
              className={inputClass}
            >
              {!isAdmin && selectedOutletId ? (
                <option value={outletFilter}>
                  {selectedOutlet.outlet_name}
                </option>
              ) : (
                <>
                  <option value="all">All Outlets</option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.outlet_name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
          <div>
            <label className={`mb-2 block text-[13px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#2F2B3D]"}`}>
              Date
            </label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className={inputClass}
            />
          </div>
          {!isAdmin && selectedOutletId && outletFilter === "all" && (
            <p className="text-[13px] text-[#EA5455]">
              Please select an assigned outlet.
            </p>
          )}
        </div>
      </SectionCard>

      {summaryLoading ? (
        <LoadingSpinner size={24} />
      ) : summary ? (
        <SectionCard title="System Readiness Summary" isDark={isDark}>
          <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className={`rounded-md border p-4 ${cardClass}`}>
              <p className="text-[13px] text-[#A8AAAE]">Cashbook</p>
              <p className="font-semibold">
                {summary.cashbook?.cashbook_status || "Missing"}
              </p>
              <p className="text-[12px]">
                Expected: {formatINR(summary.cashbook?.expected_closing_cash)} · Actual: {formatINR(summary.cashbook?.actual_cash_in_hand)} · Diff: {formatINR(summary.cashbook?.difference)}
              </p>
            </div>
            <div className={`rounded-md border p-4 ${cardClass}`}>
              <p className="text-[13px] text-[#A8AAAE]">Sales</p>
              <p className="font-semibold">
                {summary.sales?.ready ? "Ready" : "Missing / Warning"}
              </p>
              <p className="text-[12px]">Amount: {formatINR(summary.sales?.amount)}</p>
            </div>
            <div className={`rounded-md border p-4 ${cardClass}`}>
              <p className="text-[13px] text-[#A8AAAE]">Expenses</p>
              <p className="font-semibold">
                Approved: {formatINR(summary.expenses?.approved_amount)}
              </p>
              <p className="text-[12px]">
                Draft {summary.expenses?.draft_count} · Submitted {summary.expenses?.submitted_count} · Rejected {summary.expenses?.rejected_count}
              </p>
            </div>
            <div className={`rounded-md border p-4 ${cardClass}`}>
              <p className="text-[13px] text-[#A8AAAE]">Bank Deposits</p>
              <p className="font-semibold">
                {summary.bank_deposits?.verified_amount === summary.bank_deposits?.cashbook_amount
                  ? "Matched"
                  : "Warning"}
              </p>
              <p className="text-[12px]">
                Cashbook: {formatINR(summary.bank_deposits?.cashbook_amount)} · Verified: {formatINR(summary.bank_deposits?.verified_amount)} · Diff: {formatINR(summary.bank_deposits?.difference)}
              </p>
            </div>
            <div className={`rounded-md border p-4 ${cardClass}`}>
              <p className="text-[13px] text-[#A8AAAE]">Day Closing</p>
              <p className="font-semibold">
                {summary.day_closing?.status || "Missing"}
              </p>
            </div>
            <div className={`rounded-md border p-4 ${cardClass}`}>
              <p className="text-[13px] text-[#A8AAAE]">Checklist</p>
              <p className="font-semibold">
                {summary.checklist_status || "Not Started"}
              </p>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {loading ? (
        <LoadingSpinner size={32} />
      ) : !checklist ? (
        <SectionCard title="Operational Checklist" isDark={isDark}>
          <EmptyState
            title="No checklist started for this date"
            subtitle="Start the daily operational checklist for this outlet."
            isDark={isDark}
            action={
              permissions.can_create && effectiveOutlet() && effectiveOutlet() !== "all" && dateFilter ? (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving}
                  className="h-10 rounded-md px-5 text-[14px] font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Send size={16} className="mr-2 inline" />
                  {saving ? "Starting..." : "Start Daily Checklist"}
                </button>
              ) : null
            }
          />
        </SectionCard>
      ) : (
        <>
          {checklist.status && STATUS_BANNERS[checklist.status] && (
            <div
              className={`rounded-md border px-4 py-3 text-[14px] ${STATUS_BANNERS[checklist.status].cls}`}
            >
              {STATUS_BANNERS[checklist.status].text}
              {checklist.status === 'Rejected' && checklist.rejection_reason && (
                <p className="mt-1 text-[13px] font-medium">
                  Rejection reason: {checklist.rejection_reason}
                </p>
              )}
            </div>
          )}

          {renderActions()}

          {sections.map((section) => (
            <SectionCard key={section} title={SECTION_TITLES[section]} isDark={isDark}>
              <div className="space-y-3">
                {(groupedResponses[section] || []).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-start gap-3 rounded-md border p-3"
                  >
                    <button
                      type="button"
                      onClick={() => toggleResponse(r.id)}
                      disabled={!isMaker || !["Open", "Rejected"].includes(checklist.status)}
                      className="mt-0.5 shrink-0"
                    >
                      {r.is_checked ? (
                        <CheckSquare size={20} style={{ color: primaryColor }} />
                      ) : (
                        <Square size={20} className="text-[#A8AAAE]" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium">
                        {r.item_label}
                        {r.is_required && (
                          <span className="ml-1 text-[#EA5455]">*</span>
                        )}
                      </p>
                      {r.description && (
                        <p className="text-[13px] text-[#A8AAAE]">
                          {r.description}
                        </p>
                      )}
                      {r.is_checked && (
                        <input
                          type="text"
                          value={r.note || ""}
                          onChange={(e) => updateNote(r.id, e.target.value)}
                          disabled={!isMaker || !["Open", "Rejected"].includes(checklist.status)}
                          placeholder="Note (optional)"
                          className={`mt-2 w-full rounded-md border px-3 py-2 text-[13px] outline-none ${
                            isDark
                              ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
                              : "border-[#DBDADE] bg-white text-[#2F2B3D]"
                          }`}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}

          <SectionCard title="Manager Remarks" isDark={isDark}>
            <textarea
              value={managerRemarks}
              onChange={(e) => setManagerRemarks(e.target.value)}
              disabled={!isMaker || !["Open", "Rejected"].includes(checklist.status)}
              rows={3}
              className={`w-full rounded-md border p-3 text-[14px] outline-none ${
                isDark
                  ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
                  : "border-[#DBDADE] bg-white text-[#2F2B3D]"
              }`}
              placeholder="Operational issues, handover notes, cash variance explanation, pending action..."
            />
          </SectionCard>

          {renderActions()}
        </>
      )}

      {history.length > 0 && (
        <SectionCard title="History" isDark={isDark}>
          <div className="w-full min-w-0 max-w-full overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="text-left text-[12px] font-semibold uppercase tracking-wider text-[#A8AAAE]">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Outlet</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Cashbook</th>
                  <th className="px-4 py-3">Day Closing</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Submitted By</th>
                  <th className="px-4 py-3">Reviewer</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t">
                    <td className="px-4 py-3">{formatDateLocal(h.date)}</td>
                    <td className="px-4 py-3">{h.outlet_name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={h.status} />
                    </td>
                    <td className="px-4 py-3">{h.cashbook_status || "-"}</td>
                    <td className="px-4 py-3">{h.day_closing_status || "-"}</td>
                    <td className="px-4 py-3">{h.status}</td>
                    <td className="px-4 py-3">{h.submitted_by_name || "-"}</td>
                    <td className="px-4 py-3">{h.reviewer_name || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {showReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-md rounded-md p-5 shadow-2xl ${cardClass}`}>
            <h3 className={`text-[18px] font-semibold`}>Reject Daily Checklist</h3>
            <div className="mt-3">
              <label className="mb-2 block text-[13px] font-medium">Rejection Reason *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className={`w-full rounded-md border p-3 text-[14px] outline-none ${
                  isDark
                    ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
                    : "border-[#DBDADE] bg-white text-[#2F2B3D]"
                }`}
                placeholder="Reason for rejection..."
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReject(false)}
                className={`h-10 rounded-md border px-4 text-[14px] font-medium transition ${
                  isDark
                    ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
                    : "border-[#DBDADE] bg-white text-[#2F2B3D]"
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={saving}
                className="h-10 rounded-md bg-[#EA5455] px-4 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DayClosingChecklist;

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Store,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  getStoredPermissions,
  dailyAccountsAPI,
  masterAPI,
} from "../../services/api";
import useAuthStore from "../../store/authStore";
import { useSelectedOutlet } from "../../hooks/useSelectedOutlet";
import exportToExcel from "../../utils/exportToExcel";
import toast from "react-hot-toast";
import {
  EmptyState,
  FilterBar,
  LoadingRows,
  LoadingSpinner,
  MobileActionMenu,
  PageHeader,
  SectionCard,
  StatusBadge,
  TableWrapper,
  getCardClass,
  getInputClass,
  getPrimaryColor,
  getThemeMode,
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
  "₹" + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_BANNERS = {
  Open: {
    text: "Day Closing is open. Review all source data and confirmations before submitting.",
    cls: "bg-[#E6FAFD] text-[#00A6B7] border-[#00CFE8]",
  },
  Submitted: {
    text: "Submitted for verification. Editing is disabled.",
    cls: "bg-[#E6FAFD] text-[#00A6B7] border-[#00CFE8]",
  },
  Rejected: {
    text: "Rejected. Review the rejection reason, correct the closing and resubmit.",
    cls: "bg-[#FCEAEA] text-[#EA5455] border-[#EA5455]",
  },
  Verified: {
    text: "Verified. Awaiting final lock.",
    cls: "bg-[#E9F9EF] text-[#28C76F] border-[#28C76F]",
  },
  Locked: {
    text: "Locked. Day Closing is final and cannot be modified.",
    cls: "bg-[#EFECFF] text-[#7367F0] border-[#7367F0]",
  },
};

const initialForm = () => ({
  date: todayISO(),
  outlet_id: "",
  sales_confirmed: 0,
  expenses_confirmed: 0,
  purchases_confirmed: 0,
  proofs_uploaded: 0,
  manager_remarks: "",
});

const DayClosing = () => {
  const [closings, setClosings] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [formData, setFormData] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [selectedClosing, setSelectedClosing] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [lockReason, setLockReason] = useState("");

  const [outletFilter, setOutletFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [actionId, setActionId] = useState(null);

  const { selectedOutletId } = useSelectedOutlet();
  const { user } = useAuthStore();
  const permissions = getStoredPermissions()?.day_closing || {};
  const isAdmin = ["Super Admin", "Admin", "Developer"].includes(user?.role_name);
  const savedScrollRef = useRef(0);

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardClass = getCardClass(isDark);
  const inputClass = getInputClass(isDark);

  useEffect(() => {
    if (selectedOutletId && !isAdmin) {
      setOutletFilter(String(selectedOutletId));
    }
    if (selectedOutletId && isAdmin) {
      setOutletFilter(String(selectedOutletId));
    }
  }, [selectedOutletId, isAdmin]);

  useEffect(() => {
    fetchOutlets();
  }, []);

  useEffect(() => {
    if (outlets.length > 0 || selectedOutletId) {
      fetchClosings();
      fetchSummary();
    }
  }, [outletFilter, statusFilter, dateFilter, selectedOutletId, outlets.length]);

  const fetchOutlets = async () => {
    try {
      const res = await masterAPI.getOutlets();
      const rows = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setOutlets(rows);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load outlets");
    }
  };

  const fetchClosings = async () => {
    setLoading(true);
    try {
      const params = {};
      const effective = isAdmin ? (outletFilter !== "all" ? outletFilter : undefined) : (selectedOutletId || outletFilter);
      if (effective && effective !== "all") params.outlet_id = effective;
      if (dateFilter) params.date = dateFilter;
      if (statusFilter && statusFilter !== "all") params.status = statusFilter;
      const res = await dailyAccountsAPI.getDayClosings(params);
      const rows = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setClosings(rows);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load day closings");
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    const effective = isAdmin ? (outletFilter !== "all" ? outletFilter : undefined) : (selectedOutletId || outletFilter);
    const date = dateFilter || todayISO();
    if (!effective || effective === "all" || !date) return;
    setSummaryLoading(true);
    try {
      const res = await dailyAccountsAPI.getDayClosingSummary({ outlet_id: effective, date });
      setSummary(res.data?.data || null);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  const selectedOutlet = useMemo(
    () => outlets.find((o) => String(o.id) === String(outletFilter)) || { outlet_name: "-" },
    [outlets, outletFilter]
  );

  const kpi = useMemo(() => {
    return {
      total: closings.length,
      open: closings.filter((c) => c.status === "Open").length,
      submitted: closings.filter((c) => c.status === "Submitted").length,
      verified: closings.filter((c) => c.status === "Verified").length,
      locked: closings.filter((c) => c.status === "Locked").length,
      alerts: closings.filter((c) => Number(c.difference) !== 0).length,
    };
  }, [closings]);

  const filteredClosings = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return closings.filter((c) => {
      const text = `${c.date || ""} ${c.outlet_name || ""} ${c.status || ""} ${c.manager_remarks || ""}`.toLowerCase();
      return text.includes(term);
    });
  }, [closings, searchTerm]);

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const openCreate = () => {
    const base = initialForm();
    if (!isAdmin && selectedOutletId) {
      base.outlet_id = String(selectedOutletId);
    }
    setFormData(base);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (closing) => {
    setFormData({
      date: String(closing.date).slice(0, 10),
      outlet_id: closing.outlet_id,
      sales_confirmed: closing.sales_confirmed || 0,
      expenses_confirmed: closing.expenses_confirmed || 0,
      purchases_confirmed: closing.purchases_confirmed || 0,
      proofs_uploaded: closing.proofs_uploaded || 0,
      manager_remarks: closing.manager_remarks || "",
    });
    setEditingId(closing.id);
    setShowForm(true);
  };

  const openDetail = (closing) => {
    setSelectedClosing(closing);
    setShowDetail(true);
  };

  const handleSave = async () => {
    if (!formData.outlet_id) {
      toast.error("Please select outlet");
      return;
    }
    if (!formData.date) {
      toast.error("Please select date");
      return;
    }
    savedScrollRef.current = window.scrollY;
    setSaving(true);
    try {
      const payload = {
        outlet_id: formData.outlet_id,
        date: formData.date,
        sales_confirmed: Number(formData.sales_confirmed),
        expenses_confirmed: Number(formData.expenses_confirmed),
        purchases_confirmed: Number(formData.purchases_confirmed),
        proofs_uploaded: Number(formData.proofs_uploaded),
        manager_remarks: formData.manager_remarks || "",
      };
      if (editingId) {
        await dailyAccountsAPI.updateDayClosing(editingId, payload);
        toast.success("Day closing updated");
      } else {
        await dailyAccountsAPI.createDayClosing(payload);
        toast.success("Day closing created");
      }
      setShowForm(false);
      setEditingId(null);
      setFormData(initialForm());
      await fetchClosings();
      await fetchSummary();
      window.scrollTo(0, savedScrollRef.current);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save day closing");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this day closing?")) return;
    savedScrollRef.current = window.scrollY;
    setActionId(`${id}-delete`);
    try {
      await dailyAccountsAPI.deleteDayClosing(id);
      toast.success("Day closing deleted");
      await fetchClosings();
      await fetchSummary();
      window.scrollTo(0, savedScrollRef.current);
    } catch (err) {
      toast.error(err.response?.data?.message || "Delete failed");
    } finally {
      setActionId(null);
    }
  };

  const handleSubmitAction = async (id) => {
    savedScrollRef.current = window.scrollY;
    setActionId(`${id}-submit`);
    try {
      await dailyAccountsAPI.submitDayClosing(id);
      toast.success("Day closing submitted");
      await fetchClosings();
      await fetchSummary();
      window.scrollTo(0, savedScrollRef.current);
    } catch (err) {
      toast.error(err.response?.data?.message || "Submit failed");
    } finally {
      setActionId(null);
    }
  };

  const promptSubmit = (id) => {
    setActionId(id);
    setShowSubmitConfirm(true);
  };

  const promptVerify = (id) => {
    setActionId(id);
    setShowVerifyModal(true);
  };

  const handleVerify = async () => {
    savedScrollRef.current = window.scrollY;
    setSaving(true);
    try {
      await dailyAccountsAPI.verifyDayClosing(actionId);
      toast.success("Day closing verified");
      setShowVerifyModal(false);
      await fetchClosings();
      await fetchSummary();
      window.scrollTo(0, savedScrollRef.current);
    } catch (err) {
      toast.error(err.response?.data?.message || "Verify failed");
    } finally {
      setSaving(false);
      setActionId(null);
    }
  };

  const promptReject = (id) => {
    setActionId(id);
    setRejectReason("");
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    savedScrollRef.current = window.scrollY;
    setSaving(true);
    try {
      await dailyAccountsAPI.rejectDayClosing(actionId, { rejection_reason: rejectReason });
      toast.success("Day closing rejected");
      setShowRejectModal(false);
      await fetchClosings();
      await fetchSummary();
      window.scrollTo(0, savedScrollRef.current);
    } catch (err) {
      toast.error(err.response?.data?.message || "Reject failed");
    } finally {
      setSaving(false);
      setActionId(null);
      setRejectReason("");
    }
  };

  const promptLock = (id) => {
    setActionId(id);
    setLockReason("");
    setShowLockModal(true);
  };

  const handleLock = async () => {
    savedScrollRef.current = window.scrollY;
    setSaving(true);
    try {
      await dailyAccountsAPI.lockDayClosing(actionId, { lock_reason: lockReason });
      toast.success("Day closing locked");
      setShowLockModal(false);
      await fetchClosings();
      await fetchSummary();
      window.scrollTo(0, savedScrollRef.current);
    } catch (err) {
      toast.error(err.response?.data?.message || "Lock failed");
    } finally {
      setSaving(false);
      setActionId(null);
      setLockReason("");
    }
  };

  const handleExport = async () => {
    if (!filteredClosings.length) {
      toast.error("No data available to export.");
      return;
    }

    const columns = [
      { label: "Date", type: "date", width: 14 },
      { label: "Outlet", type: "text", width: 28 },
      { label: "Cashbook Status", type: "text", width: 18 },
      { label: "Sales Status", type: "text", width: 18 },
      { label: "Expense Status", type: "text", width: 18 },
      { label: "Bank Deposit Status", type: "text", width: 18 },
      { label: "Expected Closing Cash", type: "currency", width: 18 },
      { label: "Actual Cash In Hand", type: "currency", width: 18 },
      { label: "Difference", type: "currency", width: 16 },
      { label: "Sales Confirmed", type: "boolean", width: 16 },
      { label: "Expenses Confirmed", type: "boolean", width: 16 },
      { label: "Purchases Confirmed", type: "boolean", width: 16 },
      { label: "Proofs Uploaded", type: "boolean", width: 16 },
      { label: "Status", type: "text", width: 14 },
      { label: "Submitted By", type: "text", width: 22 },
      { label: "Submitted At", type: "datetime", width: 22 },
      { label: "Reviewer", type: "text", width: 22 },
      { label: "Reviewed / Verified At", type: "datetime", width: 22 },
      { label: "Locked By", type: "text", width: 22 },
      { label: "Locked At", type: "datetime", width: 22 },
      { label: "Manager Remarks", type: "text", width: 40, wrap: true },
      { label: "Rejection Reason", type: "text", width: 35, wrap: true },
    ];

    const rows = filteredClosings.map((c) => [
      c.date,
      c.outlet_name || "",
      c.cashbook_status || "",
      c.sales_status || "",
      c.expense_status || "",
      c.bank_deposit_status || "",
      c.closing_cash_system,
      c.actual_cash_in_hand,
      c.difference,
      c.sales_confirmed,
      c.expenses_confirmed,
      c.purchases_confirmed,
      c.proofs_uploaded,
      c.status,
      c.submitted_by_name,
      c.submitted_at,
      c.verified_by_name,
      c.verified_at,
      c.locked_by_name,
      c.locked_at,
      c.manager_remarks,
      c.rejection_reason,
    ]);

    const datePart = dateFilter ? formatDateLocal(dateFilter).replace(/\s/g, "-") : "All";
    const outletPart =
      outletFilter === "all"
        ? "All-Outlets"
        : (selectedOutlet?.outlet_name || "Outlet").replace(/\s/g, "-");
    const filename = `Day_Closing_${outletPart}_${datePart}.xlsx`;

    await exportToExcel({
      filename,
      reportTitle: "DAY CLOSING REPORT",
      sheetName: "Day Closing",
      outletLabel: selectedOutlet?.outlet_name,
      periodLabel: dateFilter ? formatDateLocal(dateFilter) : "All Dates",
      columns,
      rows,
    });

    toast.success("Day Closing exported");
  };

  const isReady = (summary) => {
    if (!summary?.cashbook) return false;
    return ["Submitted", "Verified", "Locked"].includes(summary.cashbook.cashbook_status);
  };

  const renderKpi = (icon, label, value, color, bg) => (
    <div className={`h-full w-full rounded-md border p-4 ${cardClass}`}>
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-md text-white"
          style={{ backgroundColor: color }}
        >
          {icon}
        </div>
        <div>
          <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>{label}</p>
          <p className={`text-[20px] font-bold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{value}</p>
        </div>
      </div>
    </div>
  );

  const renderSourceCards = () => {
    if (summaryLoading) return <LoadingSpinner size={24} className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"} />;
    if (!summary) return <p className={`text-[14px] ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>Select a date and outlet to view source readiness.</p>;
    const { cashbook, sales, expenses, bank_deposits, warnings } = summary;
    const ready = isReady(summary);
    return (
      <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2 min-[1600px]:grid-cols-4">
        <div className={`h-full w-full rounded-md border p-4 ${cardClass} ${ready ? "border-l-4 border-l-[#28C76F]" : "border-l-4 border-l-[#FF9F43]"}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className={`text-[13px] font-semibold ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>Daily Cashbook</span>
            {cashbook ? <StatusBadge status={cashbook.cashbook_status} /> : <StatusBadge status="Missing" />}
          </div>
          {cashbook ? (
            <div className="space-y-1 text-[13px]">
              <div className="flex justify-between"><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Total Sales</span><span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{formatINR(cashbook.total_sales)}</span></div>
              <div className="flex justify-between"><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Approved Expenses</span><span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{formatINR(cashbook.approved_cash_expenses)}</span></div>
              <div className="flex justify-between"><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Cashbook Bank Deposit</span><span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{formatINR(cashbook.bank_deposit)}</span></div>
              <div className="flex justify-between"><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Expected Closing</span><span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{formatINR(cashbook.closing_cash)}</span></div>
              <div className="flex justify-between"><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Actual in Hand</span><span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{formatINR(cashbook.actual_cash_in_hand)}</span></div>
              <div className="flex justify-between"><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Difference</span><span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{formatINR(cashbook.cash_difference)}</span></div>
            </div>
          ) : (
            <p className="text-[13px] text-[#FF9F43]">No Cashbook for this date.</p>
          )}
          <div className="mt-auto pt-3">
            <StatusBadge status={ready ? "Ready" : "Not Ready"} />
          </div>
        </div>

        <div className={`h-full w-full rounded-md border p-4 ${cardClass} border-l-4 ${sales?.sales_ready ? "border-l-[#28C76F]" : "border-l-[#FF9F43]"}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className={`text-[13px] font-semibold ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>Daily Sales</span>
            <StatusBadge status={sales?.daily_sales_status || "Missing"} />
          </div>
          <div className={`text-[22px] font-bold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{formatINR(sales?.daily_sales_amount)}</div>
          <div className="mt-auto pt-3">
            <StatusBadge status={sales?.sales_ready ? "Ready" : "Warning"} />
          </div>
        </div>

        <div className={`h-full w-full rounded-md border p-4 ${cardClass} border-l-4 ${expenses?.draft_expense_count === 0 && expenses?.submitted_expense_count === 0 && expenses?.rejected_expense_count === 0 ? "border-l-[#28C76F]" : "border-l-[#FF9F43]"}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className={`text-[13px] font-semibold ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>Cash Expenses</span>
            <span className={`text-[15px] font-bold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{formatINR(expenses?.approved_cash_expenses)}</span>
          </div>
          <div className="space-y-1 text-[13px]">
            <div className="flex justify-between"><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Draft</span><span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{expenses?.draft_expense_count}</span></div>
            <div className="flex justify-between"><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Submitted</span><span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{expenses?.submitted_expense_count}</span></div>
            <div className="flex justify-between"><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Rejected</span><span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{expenses?.rejected_expense_count}</span></div>
          </div>
          <div className="mt-auto pt-3">
            <StatusBadge status={expenses?.draft_expense_count === 0 && expenses?.submitted_expense_count === 0 ? "Ready" : "Pending"} />
          </div>
        </div>

        <div className={`h-full w-full rounded-md border p-4 ${cardClass} border-l-4 ${bank_deposits?.bank_deposit_difference === 0 ? "border-l-[#28C76F]" : "border-l-[#FF9F43]"}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className={`text-[13px] font-semibold ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>Bank Deposits</span>
            <span className={`text-[15px] font-bold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{formatINR(bank_deposits?.verified_bank_deposits)}</span>
          </div>
          <div className="space-y-1 text-[13px]">
            <div className="flex justify-between"><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Verified count</span><span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{bank_deposits?.verified_deposit_count}</span></div>
            <div className="flex justify-between"><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Pending count</span><span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{bank_deposits?.pending_deposit_count}</span></div>
            <div className="flex justify-between"><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Cashbook deposit</span><span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{formatINR(bank_deposits?.cashbook_bank_deposit)}</span></div>
            <div className="flex justify-between"><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Difference</span><span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{formatINR(bank_deposits?.bank_deposit_difference)}</span></div>
          </div>
          <div className="mt-auto pt-3">
            <StatusBadge status={bank_deposits?.bank_deposit_difference === 0 ? "Matched" : "Warning"} />
          </div>
          {warnings?.length > 0 && (
            <p className="mt-2 text-[12px] text-[#FF9F43]">{warnings[0]}</p>
          )}
        </div>
      </div>
    );
  };

  const renderWorkflow = (status) => {
    const steps = ["Open", "Submitted", "Verified", "Locked"];
    const idx = steps.indexOf(status);
    return (
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {steps.map((s, i) => {
          const active = i <= idx;
          const current = s === status;
          return (
            <div key={s} className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 font-medium ${
                  current
                    ? "bg-[#7367F0] text-white"
                    : active
                    ? isDark
                      ? "bg-[#3B405A] text-[#D0D2D6]"
                      : "bg-[#F3F2F7] text-[#2F2B3D]"
                    : isDark
                    ? "text-[#A5A8B6]"
                    : "text-[#A8AAAE]"
                }`}
              >
                {s}
              </span>
              {i < steps.length - 1 && <ChevronRight size={14} className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"} />}
            </div>
          );
        })}
      </div>
    );
  };

  const renderActions = (closing) => {
    const common = "flex h-10 w-10 items-center justify-center rounded-md transition hover:opacity-80 disabled:opacity-50";
    const items = [];
    const isSelf = closing.submitted_by === user?.id;
    const canVerify = (permissions.can_verify || isAdmin) && !isSelf;
    const canReject = (permissions.can_reject || isAdmin) && !isSelf;
    const canDelete = permissions.can_delete || isAdmin;
    const canEdit = permissions.can_edit || isAdmin;
    const canSubmit = permissions.can_submit || isAdmin;

    items.push({ icon: Eye, onClick: () => openDetail(closing), label: "View", cls: isDark ? "bg-[#3B405A] text-[#D0D2D6]" : "bg-[#F3F2F7] text-[#2F2B3D]" });

    if (closing.status === "Open") {
      if (canEdit) items.push({ icon: Pencil, onClick: () => openEdit(closing), label: "Edit", cls: "bg-[#E6FAFD] text-[#00A6B7]" });
      if (canSubmit) items.push({ icon: Send, onClick: () => promptSubmit(closing.id), label: "Submit", cls: "bg-[#FFF4E5] text-[#FF9F43]", loading: `${closing.id}-submit` });
    } else if (closing.status === "Rejected") {
      if (isAdmin) {
        if (canDelete) items.push({ icon: Trash2, onClick: () => handleDelete(closing.id), label: "Delete", cls: "bg-[#FCEAEA] text-[#EA5455]", loading: `${closing.id}-delete`, danger: true });
      } else {
        if (canEdit) items.push({ icon: Pencil, onClick: () => openEdit(closing), label: "Edit", cls: "bg-[#E6FAFD] text-[#00A6B7]" });
        if (canSubmit) items.push({ icon: Send, onClick: () => promptSubmit(closing.id), label: "Resubmit", cls: "bg-[#FFF4E5] text-[#FF9F43]", loading: `${closing.id}-submit` });
      }
    } else if (closing.status === "Submitted" && (canVerify || canReject)) {
      if (canVerify) items.push({ icon: Check, onClick: () => promptVerify(closing.id), label: "Verify", cls: "bg-[#E9F9EF] text-[#28C76F]", loading: `${closing.id}-verify` });
      if (canReject) items.push({ icon: X, onClick: () => promptReject(closing.id), label: "Reject", cls: "bg-[#FCEAEA] text-[#EA5455]", loading: `${closing.id}-reject` });
    } else if (closing.status === "Verified" && (permissions.can_lock || isAdmin)) {
      items.push({ icon: Lock, onClick: () => promptLock(closing.id), label: "Lock", cls: "text-white", style: { backgroundColor: primaryColor }, loading: `${closing.id}-lock` });
    }

    return (
      <div className="flex items-center gap-2">
        {items.map((a) => (
          <button
            key={a.label}
            type="button"
            disabled={a.loading && actionId === a.loading}
            onClick={a.onClick}
            title={a.label}
            className={`${common} ${a.cls}`}
            style={a.style || {}}
          >
            {a.loading && actionId === a.loading ? (
              <LoadingSpinner size={18} />
            ) : (
              <a.icon size={18} />
            )}
          </button>
        ))}
      </div>
    );
  };

  const banner = selectedClosing ? STATUS_BANNERS[selectedClosing.status] : summary ? STATUS_BANNERS[selectedClosing?.status || "Open"] : null;

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden p-4 sm:p-6">
      <PageHeader
        title="Day Closing"
        subtitle="Review daily outlet operations, reconcile financial sources and complete final sign-off."
        isDark={isDark}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => { fetchClosings(); fetchSummary(); }} className={`flex h-10 items-center gap-2 rounded-md border px-4 text-[14px] font-medium transition ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6] hover:bg-[#3B405A]" : "border-[#DBDADE] bg-white text-[#2F2B3D] hover:bg-[#F8F7FA]"}`}>
              <RefreshCw size={17} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button onClick={handleExport} className={`flex h-10 items-center gap-2 rounded-md border px-4 text-[14px] font-medium transition ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6] hover:bg-[#3B405A]" : "border-[#DBDADE] bg-white text-[#2F2B3D] hover:bg-[#F8F7FA]"}`}>
              <FileSpreadsheet size={17} />
              <span className="hidden sm:inline">Export Excel</span>
            </button>
            <button onClick={openCreate} disabled={!permissions.can_create && !isAdmin} className="flex h-10 items-center gap-2 rounded-md px-4 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: primaryColor }}>
              <Plus size={17} />
              <span className="hidden sm:inline">Start Day Closing</span>
            </button>
          </div>
        }
      />

      <p className={`text-[14px] ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>
        Showing data for: <span className="font-semibold" style={{ color: primaryColor }}>{selectedOutlet?.outlet_name || "Big Bean Cafe"}</span>
      </p>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 min-[1900px]:grid-cols-6">
        {renderKpi(<Store size={20} />, "Total Closings", kpi.total, primaryColor, "#F0EEFF")}
        {renderKpi(<Clock size={20} />, "Open", kpi.open, "#FF9F43", "#FFF4E5")}
        {renderKpi(<Send size={20} />, "Submitted", kpi.submitted, "#00CFE8", "#E6FAFD")}
        {renderKpi(<CheckCircle2 size={20} />, "Verified", kpi.verified, "#28C76F", "#E9F9EF")}
        {renderKpi(<Lock size={20} />, "Locked", kpi.locked, "#7367F0", "#F0EEFF")}
        {renderKpi(<AlertTriangle size={20} />, "Cash Alerts", kpi.alerts, "#EA5455", "#FCEAEA")}
      </div>

      <SectionCard title="Outlet & Date" isDark={isDark} className="animate-fade-up">
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className={`mb-2 block text-[13px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#2F2B3D]"}`}>Outlet</label>
            <select
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              disabled={!isAdmin && !!selectedOutletId}
              className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
            >
              {!isAdmin && selectedOutletId ? (
                <option value={outletFilter}>{outlets.find((o) => String(o.id) === String(outletFilter))?.outlet_name || "Assigned Outlet"}</option>
              ) : (
                <>
                  <option value="all">All Outlets</option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>{o.outlet_name}</option>
                  ))}
                </>
              )}
            </select>
          </div>
          <div>
            <label className={`mb-2 block text-[13px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#2F2B3D]"}`}>Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => { updateField("date", e.target.value); setDateFilter(e.target.value); }}
              className={`h-11 w-full rounded-md border pl-10 pr-4 text-[14px] outline-none ${inputClass}`}
            />
          </div>
          <div>
            <label className={`mb-2 block text-[13px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#2F2B3D]"}`}>Status Filter</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}>
              <option value="all">All</option>
              <option value="Open">Open</option>
              <option value="Submitted">Submitted</option>
              <option value="Verified">Verified</option>
              <option value="Rejected">Rejected</option>
              <option value="Locked">Locked</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Readiness Panel" isDark={isDark} className="animate-fade-up">
        {renderSourceCards()}
        {summary && (
          <div className={`rounded-md border p-4 ${cardClass}`}>
            <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold">
              <ShieldCheck size={17} style={{ color: primaryColor }} />
              <span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>Readiness Check</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Daily Cashbook</span>
                <StatusBadge status={isReady(summary) ? "Ready" : "Not Ready"} />
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Sales</span>
                <StatusBadge status={summary.sales?.sales_ready ? "Ready" : "Warning"} />
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Cash Expenses</span>
                <StatusBadge status={summary.expenses?.draft_expense_count === 0 && summary.expenses?.submitted_expense_count === 0 ? "Ready" : "Pending"} />
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Bank Deposits</span>
                <StatusBadge status={summary.bank_deposits?.bank_deposit_difference === 0 ? "Matched" : "Warning"} />
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Proofs</span>
                <StatusBadge status={formData.proofs_uploaded ? "Confirmed" : "Not Confirmed"} />
              </div>
            </div>
            {!isReady(summary) && (
              <p className="mt-3 text-[12px] text-[#FF9F43]">Submit is blocked until the Daily Cashbook is in Submitted, Verified or Locked status.</p>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Cash Snapshot" isDark={isDark} className="animate-fade-up">
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
          <div className={`h-full w-full rounded-md border p-4 ${cardClass}`}>
            <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>Expected Closing Cash</p>
            <p className={`text-[22px] font-bold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{formatINR(summary?.cashbook?.closing_cash)}</p>
          </div>
          <div className={`h-full w-full rounded-md border p-4 ${cardClass}`}>
            <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>Actual Cash in Hand</p>
            <p className={`text-[22px] font-bold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{formatINR(summary?.cashbook?.actual_cash_in_hand)}</p>
          </div>
          <div className={`h-full w-full rounded-md border p-4 ${cardClass}`}>
            <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>Difference</p>
            <p className={`text-[22px] font-bold ${
              !summary?.cashbook?.cash_difference ? "text-[#28C76F]" : Number(summary?.cashbook?.cash_difference) > 0 ? "text-[#FF9F43]" : "text-[#EA5455]"
            }`}>
              {formatINR(summary?.cashbook?.cash_difference)}
            </p>
            <p className="mt-1 text-[12px]">
              {!summary?.cashbook?.cash_difference ? "Balanced" : Number(summary?.cashbook?.cash_difference) > 0 ? "Cash Excess" : "Cash Shortage"}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Day Closing History" isDark={isDark} className="animate-fade-up">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <Search size={17} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className={`h-10 w-full rounded-md border pl-10 pr-4 text-[14px] outline-none sm:w-64 ${inputClass}`}
            />
          </div>
          <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>{filteredClosings.length} records</p>
        </div>

        {loading ? (
          <TableWrapper isDark={isDark}>
            <table className="w-full">
              <tbody><LoadingRows rows={5} cols={10} isDark={isDark} /></tbody>
            </table>
          </TableWrapper>
        ) : filteredClosings.length === 0 ? (
          <EmptyState icon={FileText} title="No day closings found" subtitle="Start a new day closing for the selected outlet and date." isDark={isDark} />
        ) : (
          <TableWrapper isDark={isDark}>
            <table className="w-full" style={{ minWidth: 1150 }}>
              <thead className={`sticky top-0 text-left text-[12px] font-semibold uppercase tracking-wider ${isDark ? "bg-[#2F3349] text-[#A5A8B6]" : "bg-[#F8F7FA] text-[#A8AAAE]"}`}>
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 align-middle" style={{ width: 110, minWidth: 110 }}>Date</th>
                  <th className="whitespace-nowrap px-4 py-3 align-middle" style={{ width: 210, minWidth: 210 }}>Outlet</th>
                  <th className="whitespace-nowrap px-4 py-3 align-middle" style={{ width: 115, minWidth: 115 }}>Expected</th>
                  <th className="whitespace-nowrap px-4 py-3 align-middle" style={{ width: 115, minWidth: 115 }}>Actual</th>
                  <th className="whitespace-nowrap px-4 py-3 align-middle" style={{ width: 90, minWidth: 90 }}>Diff</th>
                  <th className="whitespace-nowrap px-4 py-3 align-middle" style={{ width: 120, minWidth: 120 }}>Status</th>
                  <th className="whitespace-nowrap px-4 py-3 align-middle" style={{ width: 170, minWidth: 170 }}>Submitted By</th>
                  <th className="whitespace-nowrap px-4 py-3 align-middle" style={{ width: 150, minWidth: 150 }}>Reviewer</th>
                  <th className="whitespace-nowrap px-4 py-3 align-middle" style={{ width: 170, minWidth: 170 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClosings.map((closing) => (
                  <tr key={closing.id} className={`transition ${isDark ? "border-b border-[#3B405A]" : "border-b border-[#EBE9F1]"}`}>
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-[14px]" style={{ width: 110, minWidth: 110 }}>{formatDateLocal(closing.date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-[14px]" style={{ width: 210, minWidth: 210 }}>{closing.outlet_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-[14px]" style={{ width: 115, minWidth: 115 }}>{formatINR(closing.closing_cash_system)}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-[14px]" style={{ width: 115, minWidth: 115 }}>{formatINR(closing.actual_cash_in_hand)}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-[14px]" style={{ width: 90, minWidth: 90 }}>{formatINR(closing.difference)}</td>
                    <td className="px-4 py-3 align-middle" style={{ width: 120, minWidth: 120 }}><StatusBadge status={closing.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-[13px]" style={{ width: 170, minWidth: 170 }}>{closing.submitted_by_name || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle text-[13px]" style={{ width: 150, minWidth: 150 }}>{closing.verified_by_name || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle" style={{ width: 170, minWidth: 170 }}>{renderActions(closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </SectionCard>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className={`w-full max-w-2xl rounded-md shadow-2xl ${cardClass} max-h-[90vh] overflow-y-auto`}>
            <div className={`flex items-center justify-between border-b px-5 py-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className={`text-[18px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{editingId ? "Edit Day Closing" : "Start Day Closing"}</h3>
              <button onClick={() => setShowForm(false)} className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}><X size={20} /></button>
            </div>
            <div className="space-y-5 p-5">
              {banner && (
                <div className={`rounded-md border px-4 py-3 text-[13px] ${banner.cls}`}>{banner.text}</div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#2F2B3D]"}`}>Outlet</label>
                  <select value={formData.outlet_id} onChange={(e) => updateField("outlet_id", e.target.value)} disabled={!isAdmin && !!selectedOutletId} className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}>
                    {!isAdmin && selectedOutletId ? (
                      <option value={formData.outlet_id}>{outlets.find((o) => String(o.id) === String(formData.outlet_id))?.outlet_name || "Assigned Outlet"}</option>
                    ) : (
                      <>
                        <option value="">Select outlet</option>
                        {outlets.map((o) => (
                          <option key={o.id} value={o.id}>{o.outlet_name}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#2F2B3D]"}`}>Date</label>
                  <input type="date" value={formData.date} onChange={(e) => updateField("date", e.target.value)} className={`h-11 w-full rounded-md border pl-10 pr-4 text-[14px] outline-none ${inputClass}`} />
                </div>
              </div>

              <div className={`rounded-md border p-4 ${cardClass}`}>
                <h4 className={`mb-3 text-[15px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Operational Confirmations</h4>
                {[
                  { field: "sales_confirmed", label: "Sales data reviewed" },
                  { field: "expenses_confirmed", label: "Cash expenses reviewed" },
                  { field: "purchases_confirmed", label: "Purchases reviewed" },
                  { field: "proofs_uploaded", label: "Required proofs / documents available" },
                ].map((item) => (
                  <label key={item.field} className="mb-2 flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={!!Number(formData[item.field])}
                      onChange={(e) => updateField(item.field, e.target.checked ? 1 : 0)}
                      className="h-4 w-4 rounded border-gray-300 text-[#7367F0] focus:ring-[#7367F0]"
                    />
                    <span className={`text-[14px] ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{item.label}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className={`mb-2 block text-[13px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#2F2B3D]"}`}>Manager Remarks</label>
                <textarea
                  value={formData.manager_remarks}
                  onChange={(e) => updateField("manager_remarks", e.target.value)}
                  rows={3}
                  placeholder="Operational notes, variance or deposit mismatch explanation, handover comments..."
                  className={`w-full rounded-md border p-3 text-[14px] outline-none ${inputClass}`}
                />
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className={`h-10 rounded-md border px-4 text-[14px] font-medium transition ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]"}`}>Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex h-10 items-center gap-2 rounded-md px-4 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: primaryColor }}>
                  {saving && <LoadingSpinner size={16} />}
                  {editingId ? "Update" : "Create"} Day Closing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDetail && selectedClosing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className={`w-full max-w-2xl rounded-md shadow-2xl ${cardClass} max-h-[90vh] overflow-y-auto`}>
            <div className={`flex items-center justify-between border-b px-5 py-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className={`text-[18px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Day Closing Details</h3>
              <button onClick={() => setShowDetail(false)} className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}><X size={20} /></button>
            </div>
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-4 text-[14px]">
                <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Outlet:</span> <span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{selectedClosing.outlet_name}</span></div>
                <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Date:</span> <span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{formatDateLocal(selectedClosing.date)}</span></div>
                <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Status:</span> <StatusBadge status={selectedClosing.status} /></div>
                <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Workflow:</span> {renderWorkflow(selectedClosing.status)}</div>
              </div>

              <div className={`rounded-md border p-4 ${cardClass}`}>
                <h4 className={`mb-2 text-[15px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Cash Snapshot</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div><p className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Expected</p><p className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{formatINR(selectedClosing.closing_cash_system)}</p></div>
                  <div><p className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Actual</p><p className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{formatINR(selectedClosing.actual_cash_in_hand)}</p></div>
                  <div><p className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Difference</p><p className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{formatINR(selectedClosing.difference)}</p></div>
                </div>
              </div>

              {selectedClosing.rejection_reason && (
                <div className="rounded-md border border-[#EA5455] bg-[#FCEAEA] p-3 text-[13px] text-[#EA5455]">
                  <strong>Rejected By:</strong> {selectedClosing.verified_by_name || "-"}<br />
                  <strong>Reason:</strong> {selectedClosing.rejection_reason}
                </div>
              )}

              {selectedClosing.lock_reason && (
                <div className="rounded-md border border-[#7367F0] bg-[#EFECFF] p-3 text-[13px] text-[#7367F0]">
                  <strong>Locked By:</strong> {selectedClosing.locked_by_name || "-"}<br />
                  <strong>At:</strong> {selectedClosing.locked_at ? new Date(selectedClosing.locked_at).toLocaleString("en-IN") : "-"}<br />
                  <strong>Reason:</strong> {selectedClosing.lock_reason}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
                <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Submitted By:</span> <span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{selectedClosing.submitted_by_name || "-"}</span></div>
                <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Submitted At:</span> <span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{selectedClosing.submitted_at ? new Date(selectedClosing.submitted_at).toLocaleString("en-IN") : "-"}</span></div>
                <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>Verified/Rejected By:</span> <span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{selectedClosing.verified_by_name || "-"}</span></div>
                <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}>At:</span> <span className={isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}>{selectedClosing.verified_at ? new Date(selectedClosing.verified_at).toLocaleString("en-IN") : "-"}</span></div>
              </div>

              {selectedClosing.manager_remarks && (
                <div>
                  <h4 className={`mb-1 text-[14px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Manager Remarks</h4>
                  <p className={`whitespace-pre-wrap text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#5D596C]"}`}>{selectedClosing.manager_remarks}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-md rounded-md p-5 shadow-2xl ${cardClass}`}>
            <h3 className={`text-[18px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Submit Day Closing?</h3>
            <p className={`mt-2 text-[14px] ${isDark ? "text-[#A5A8B6]" : "text-[#5D596C]"}`}>
              After submission, the outlet cannot edit it until it is rejected back for correction.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowSubmitConfirm(false)} className={`h-10 rounded-md border px-4 text-[14px] font-medium transition ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]"}`}>Cancel</button>
              <button onClick={() => { setShowSubmitConfirm(false); handleSubmitAction(actionId); }} disabled={saving} className="h-10 rounded-md px-4 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: primaryColor }}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-md rounded-md p-5 shadow-2xl ${cardClass}`}>
            <h3 className={`text-[18px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Reject Day Closing</h3>
            <div className="mt-3">
              <label className={`mb-2 block text-[13px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#2F2B3D]"}`}>Rejection Reason *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className={`w-full rounded-md border p-3 text-[14px] outline-none ${inputClass}`}
                placeholder="Reason for rejection..."
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowRejectModal(false)} className={`h-10 rounded-md border px-4 text-[14px] font-medium transition ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]"}`}>Cancel</button>
              <button onClick={handleReject} disabled={saving} className="h-10 rounded-md bg-[#EA5455] px-4 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      )}

      {showVerifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-md rounded-md p-5 shadow-2xl ${cardClass}`}>
            <h3 className={`text-[18px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Verify Day Closing?</h3>
            <p className={`mt-2 text-[14px] ${isDark ? "text-[#A5A8B6]" : "text-[#5D596C]"}`}>
              Confirm that the cashbook, sales, expenses and supporting information have been reviewed.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowVerifyModal(false)} className={`h-10 rounded-md border px-4 text-[14px] font-medium transition ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]"}`}>Cancel</button>
              <button onClick={handleVerify} disabled={saving} className="h-10 rounded-md bg-[#28C76F] px-4 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-50">Verify</button>
            </div>
          </div>
        </div>
      )}

      {showLockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-md rounded-md p-5 shadow-2xl ${cardClass}`}>
            <h3 className={`text-[18px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Lock Day Closing?</h3>
            <p className={`mt-2 text-[14px] ${isDark ? "text-[#A5A8B6]" : "text-[#5D596C]"}`}>Locked Day Closings are final and cannot be modified.</p>
            <div className="mt-3">
              <label className={`mb-2 block text-[13px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#2F2B3D]"}`}>Lock Reason</label>
              <input value={lockReason} onChange={(e) => setLockReason(e.target.value)} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowLockModal(false)} className={`h-10 rounded-md border px-4 text-[14px] font-medium transition ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#DBDADE] bg-white text-[#2F2B3D]"}`}>Cancel</button>
              <button onClick={handleLock} disabled={saving} className="h-10 rounded-md px-4 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: primaryColor }}>Lock</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DayClosing;

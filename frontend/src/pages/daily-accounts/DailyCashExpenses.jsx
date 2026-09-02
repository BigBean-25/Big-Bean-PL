import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileText,
  Filter,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Store,
  Trash2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { dailyAccountsAPI, masterAPI, getStoredPermissions } from "../../services/api";
import useAuthStore from "../../store/authStore";
import { useSelectedOutlet, OutletScopeBadge } from "../../hooks/useSelectedOutlet";
import exportToExcel from "../../utils/exportToExcel";
import {
  EmptyState,
  FilterBar,
  LoadingRows,
  MobileActionMenu,
  SectionCard,
  StatusBadge,
  TableWrapper,
} from "../../components/ui";
import toast from "react-hot-toast";

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

const todayISO = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const num = (value) => Number(value || 0);

const formatINR = (value = 0) =>
  "₹" +
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatCompactINR = (value = 0) => {
  const n = Number(value || 0);
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n}`;
};

const formatDate = (value) => {
  if (!value) return "-";
  try {
    const parts = String(value).split("-");
    if (parts.length === 3) {
      const [y, m, d] = parts;
      const dt = new Date(Number(y), Number(m) - 1, Number(d));
      return dt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
    return value;
  } catch {
    return value;
  }
};

const statusStyle = (status) => {
  if (status === "Approved") return { text: "text-[#28C76F]", bg: "bg-[#E9F9EF]", border: "border-[#28C76F]" };
  if (status === "Rejected") return { text: "text-[#EA5455]", bg: "bg-[#FCEAEA]", border: "border-[#EA5455]" };
  if (status === "Submitted") return { text: "text-[#00A6B7]", bg: "bg-[#E6FAFD]", border: "border-[#00A6B7]" };
  return { text: "text-[#FF9F43]", bg: "bg-[#FFF4E5]", border: "border-[#FF9F43]" };
};

const initialForm = () => ({
  outlet_id: "",
  date: todayISO(),
  expense_head_id: "",
  amount: "",
  payment_mode_id: "",
  paid_to: "",
  description: "",
  proof_file: null,
});

const DailyCashExpenses = () => {
  const { user } = useAuthStore();
  const [expenses, setExpenses] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [expenseHeads, setExpenseHeads] = useState([]);
  const [paymentModes, setPaymentModes] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [proofPreview, setProofPreview] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [outletFilter, setOutletFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [headFilter, setHeadFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  const [confirmModal, setConfirmModal] = useState(null);
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, reason: "" });

  const permissions = useMemo(() => getStoredPermissions()?.daily_expenses || {}, []);
  const can = (action) => Boolean(permissions[action]);

  const isAdmin = ["Super Admin", "Admin", "Developer"].includes(user?.role_name);
  const userOutletIds = useMemo(() => (user?.outlets || []).map((o) => String(o.id || o.outlet_id)), [user]);
  const visibleOutlets = useMemo(
    () => (isAdmin ? outlets : outlets.filter((o) => userOutletIds.includes(String(o.id)))),
    [outlets, userOutletIds, isAdmin]
  );

  const { selectedOutletId, selectedOutletLabel } = useSelectedOutlet((nextId) => {
    if (editingId || !showForm) return;
    if (nextId && nextId !== "all") {
      setFormData((prev) => ({ ...prev, outlet_id: nextId }));
    }
  });

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";

  const cardClass = isDark
    ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
    : "border-[#EBE9F1] bg-white text-[#2F2B3D]";

  const inputClass = isDark
    ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6] focus:border-[#7367F0]"
    : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE] focus:border-[#7367F0]";

  const mutedClass = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainTextClass = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  useEffect(() => {
    fetchInitialData();
    return () => { if (proofPreview) URL.revokeObjectURL(proofPreview); };
  }, [selectedOutletId]);

  const fetchInitialData = async () => {
    setLoading(true);
    await Promise.all([fetchMasters(), fetchExpenses()]);
    setLoading(false);
  };

  const fetchExpenses = async () => {
    try {
      const params = {};
      if (selectedOutletId && selectedOutletId !== "all") params.outlet_id = selectedOutletId;
      const response = await dailyAccountsAPI.getExpenses(params);
      setExpenses(response?.data?.data || response?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch expenses");
    }
  };

  const fetchMasters = async () => {
    try {
      const [outletsRes, headsRes, modesRes] = await Promise.all([
        masterAPI.getOutlets(),
        masterAPI.getExpenseHeads({ is_active: 1 }),
        masterAPI.getPaymentModes({ is_active: 1 }),
      ]);
      const o = Array.isArray(outletsRes?.data?.data) ? outletsRes.data.data : (outletsRes?.data || []);
      setOutlets(o);

      const selected = selectedOutletId || (isAdmin ? "all" : userOutletIds[0]);
      setOutletFilter(selected);

      if (selected && selected !== "all" && !editingId) {
        setFormData((prev) => ({ ...prev, outlet_id: selected }));
      } else if (!editingId && !isAdmin && userOutletIds.length === 1) {
        setFormData((prev) => ({ ...prev, outlet_id: userOutletIds[0] }));
      }

      setExpenseHeads(Array.isArray(headsRes?.data?.data) ? headsRes.data.data : (headsRes?.data || []));
      setPaymentModes(Array.isArray(modesRes?.data?.data) ? modesRes.data.data : (modesRes?.data || []));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch master data");
    }
  };

  const updateField = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  const resetForm = () => {
    setEditingId(null);
    setFormData(initialForm);
    const defaultOutlet = selectedOutletId && selectedOutletId !== "all" ? selectedOutletId : (isAdmin ? "" : userOutletIds[0] || "");
    if (defaultOutlet) setFormData((prev) => ({ ...prev, outlet_id: defaultOutlet }));
    if (proofPreview) {
      URL.revokeObjectURL(proofPreview);
      setProofPreview(null);
    }
  };

  const handleProofChange = (event) => {
    const file = event.target.files?.[0] || null;
    updateField("proof_file", file);
    if (proofPreview) { URL.revokeObjectURL(proofPreview); setProofPreview(null); }
    if (file && file.type?.startsWith("image/")) setProofPreview(URL.createObjectURL(file));
  };

  const validate = () => {
    if (!formData.outlet_id) { toast.error("Please select outlet"); return false; }
    if (!formData.date) { toast.error("Please select expense date"); return false; }
    if (!formData.expense_head_id) { toast.error("Please select expense head"); return false; }
    if (!formData.amount || num(formData.amount) <= 0) { toast.error("Amount must be greater than zero"); return false; }
    if (!formData.payment_mode_id) { toast.error("Please select payment mode"); return false; }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const submitData = new FormData();
      submitData.append("outlet_id", formData.outlet_id);
      submitData.append("date", formData.date);
      submitData.append("expense_head_id", formData.expense_head_id);
      submitData.append("amount", num(formData.amount));
      submitData.append("payment_mode_id", formData.payment_mode_id);
      submitData.append("paid_to", formData.paid_to || "");
      submitData.append("description", formData.description || "");
      if (formData.proof_file) submitData.append("proof", formData.proof_file);

      if (editingId) {
        await dailyAccountsAPI.updateExpense(editingId, submitData);
        toast.success("Expense updated successfully");
      } else {
        await dailyAccountsAPI.createExpense(submitData);
        toast.success("Expense saved as draft");
      }
      setShowForm(false);
      resetForm();
      await fetchExpenses();
    } catch (error) {
      toast.error(error.response?.data?.message || `Failed to ${editingId ? "update" : "save"} expense`);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (expense) => {
    setEditingId(expense.id);
    setFormData({
      outlet_id: String(expense.outlet_id),
      date: String(expense.date).slice(0, 10),
      expense_head_id: String(expense.expense_head_id),
      amount: String(expense.amount),
      payment_mode_id: String(expense.payment_mode_id),
      paid_to: expense.paid_to || "",
      description: expense.description || "",
      proof_attachment: expense.proof_attachment || null,
      proof_file: null,
    });
    setProofPreview(null);
    setShowForm(true);
  };

  const handleSubmitExpense = async (id) => {
    setActionLoadingId(id);
    try {
      await dailyAccountsAPI.submitExpense(id);
      toast.success("Expense submitted successfully");
      await fetchExpenses();
    } catch (error) {
      toast.error(error.response?.data?.message || "Submit failed");
    } finally { setActionLoadingId(null); }
  };

  const handleApprove = async (id) => {
    setActionLoadingId(id);
    try {
      await dailyAccountsAPI.approveExpense(id, {});
      toast.success("Expense approved successfully");
      await fetchExpenses();
    } catch (error) {
      toast.error(error.response?.data?.message || "Approve failed");
    } finally { setActionLoadingId(null); }
  };

  const handleReject = async (id, admin_remarks) => {
    if (!String(admin_remarks).trim()) { toast.error("Rejection reason is required"); return; }
    setActionLoadingId(id);
    try {
      await dailyAccountsAPI.rejectExpense(id, { admin_remarks });
      toast.success("Expense rejected successfully");
      setRejectModal({ open: false, id: null, reason: "" });
      await fetchExpenses();
    } catch (error) {
      toast.error(error.response?.data?.message || "Reject failed");
    } finally { setActionLoadingId(null); }
  };

  const handleDelete = async (id) => {
    setActionLoadingId(id);
    try {
      await dailyAccountsAPI.deleteExpense(id);
      toast.success("Expense deleted successfully");
      await fetchExpenses();
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    } finally { setActionLoadingId(null); }
  };

  const getProofUrl = (attachment) => {
    if (!attachment) return null;
    const normalized = String(attachment).replace(/\\/g, "/");
    if (normalized.startsWith("http")) return normalized;
    const apiBase = import.meta.env.VITE_API_URL || "http://localhost:5001/api";
    const serverOrigin = apiBase.replace(/\/api\/?$/, "");
    const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
    return `${serverOrigin}${path}`;
  };

  const handleExport = () => {
    if (!filteredExpenses.length) {
      toast.error("No data available to export.");
      return;
    }
    const columns = [
      { label: "Date", type: "date", width: 14 },
      { label: "Outlet", type: "text", width: 25 },
      { label: "Expense Head", type: "text", width: 22 },
      { label: "Paid To", type: "text", width: 22 },
      { label: "Amount", type: "currency", width: 14 },
      { label: "Payment Mode", type: "text", width: 16 },
      { label: "Status", type: "text", width: 14 },
      { label: "Description", type: "text", width: 40, wrap: true },
    ];
    const rows = filteredExpenses.map((expense) => [
      expense.date,
      expense.outlet_name || "",
      expense.expense_name || "",
      expense.paid_to || "",
      expense.amount || 0,
      expense.mode_name || "",
      expense.status || "",
      expense.description || "",
    ]);
    const datePart = dateFilter ? formatDate(dateFilter).replace(/\s/g, "-") : "All";
    exportToExcel({
      filename: `Daily_Cash_Expenses_${datePart}.xlsx`,
      reportTitle: "Daily Cash Expenses Report",
      outletLabel: selectedOutletLabel,
      periodLabel: dateFilter ? formatDate(dateFilter) : "All Dates",
      columns,
      rows,
    });
    toast.success("Expenses exported");
  };

  const filteredExpenses = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return expenses.filter((expense) => {
      const text = `${expense.outlet_name || ""} ${expense.expense_name || ""} ${expense.paid_to || ""} ${expense.mode_name || ""} ${expense.description || ""} ${expense.status || ""}`.toLowerCase();
      const searchMatch = text.includes(search);
      const outletMatch = selectedOutletId === "all" || String(expense.outlet_id) === String(selectedOutletId);
      const statusMatch = statusFilter === "all" || expense.status === statusFilter;
      const headMatch = headFilter === "all" || String(expense.expense_head_id) === String(headFilter);
      const dateMatch = !dateFilter || String(expense.date) === String(dateFilter);
      return searchMatch && outletMatch && statusMatch && headMatch && dateMatch;
    });
  }, [expenses, searchTerm, selectedOutletId, statusFilter, headFilter, dateFilter]);

  const summary = useMemo(() => {
    const totalAmount = filteredExpenses.reduce((sum, row) => sum + num(row.amount), 0);
    const approvedAmount = filteredExpenses.filter((row) => row.status === "Approved").reduce((sum, row) => sum + num(row.amount), 0);
    const pendingCount = filteredExpenses.filter((row) => row.status === "Submitted" || row.status === "Draft").length;
    const rejectedCount = filteredExpenses.filter((row) => row.status === "Rejected").length;
    const proofMissing = filteredExpenses.filter((row) => !row.proof_attachment).length;
    return { totalAmount, approvedAmount, pendingCount, rejectedCount, proofMissing };
  }, [filteredExpenses]);

  const statusBanner = (status) => {
    const banners = {
      Draft: { text: "Draft saved. Review and submit when ready.", cls: statusStyle("Draft").bg },
      Submitted: { text: "Submitted for approval. Editing is disabled.", cls: statusStyle("Submitted").bg },
      Rejected: { text: "Rejected. Review the remarks, correct the expense and resubmit.", cls: statusStyle("Rejected").bg },
      Approved: { text: "Approved. This expense is final and is included in Cashbook and P&L.", cls: statusStyle("Approved").bg },
    };
    const b = banners[status] || banners.Draft;
    return (
      <div className={`rounded-md border px-4 py-3 text-[13px] font-medium ${b.cls} ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
        {b.text}
      </div>
    );
  };

  const workflowIndicator = (status) => {
    const steps = ["Draft", "Submitted", "Approved"];
    const rejected = status === "Rejected";
    const current = status || "Draft";
    return (
      <div className="flex items-center gap-1 text-[11px] font-medium">
        {steps.map((s, i) => {
          const active = s === current || (s === "Submitted" && current === "Rejected") || (s === "Draft" && current === "Rejected");
          const past = steps.indexOf(current) > i || (current === "Approved");
          const cls = active ? `rounded-full px-2 py-0.5 ${statusStyle(s).bg} ${statusStyle(s).text}` : past ? mutedClass : `text-[#A8AAAE] ${mutedClass}`;
          return (
            <span key={s} className="inline-flex items-center gap-1">
              <span className={cls}>{s}</span>
              {i < steps.length - 1 && <span className={past ? mainTextClass : `text-[#A8AAAE] ${mutedClass}`}>→</span>}
            </span>
          );
        })}
        {rejected && (
          <span className="ml-2 inline-flex items-center gap-1">
            <span className={`rounded-full px-2 py-0.5 ${statusStyle("Rejected").bg} ${statusStyle("Rejected").text}`}>Rejected</span>
            <span className={`text-[#A8AAAE] ${mutedClass}`}>→ Correct & Resubmit</span>
          </span>
        )}
      </div>
    );
  };

  const renderActions = (expense) => {
    const id = expense.id;
    const loading = actionLoadingId === id;
    const actions = [];
    const btnBase = "flex h-9 w-9 items-center justify-center rounded-md transition hover:opacity-80 disabled:opacity-50";

    if (expense.status === "Draft") {
      if (can("can_edit")) actions.push({ icon: Pencil, onClick: () => startEdit(expense), title: "Edit", cls: "bg-[#E6FAFD] text-[#00A6B7]" });
      if (can("can_submit")) actions.push({ icon: Send, onClick: () => handleSubmitExpense(id), title: "Submit", cls: "bg-[#E9F9EF] text-[#28C76F]" });
      if (can("can_delete")) actions.push({ icon: Trash2, onClick: () => setConfirmModal({ type: "delete", id, title: "Delete this Daily Cash Expense draft?", message: "This action cannot be undone." }), title: "Delete", cls: "bg-[#FCEAEA] text-[#EA5455]" });
    } else if (expense.status === "Rejected") {
      if (can("can_edit")) actions.push({ icon: Pencil, onClick: () => startEdit(expense), title: "Edit", cls: "bg-[#E6FAFD] text-[#00A6B7]" });
      if (can("can_submit")) actions.push({ icon: RefreshCw, onClick: () => handleSubmitExpense(id), title: "Resubmit", cls: "bg-[#FFF4E5] text-[#FF9F43]" });
      if (can("can_delete")) actions.push({ icon: Trash2, onClick: () => setConfirmModal({ type: "delete", id, title: "Delete this Daily Cash Expense draft?", message: "This action cannot be undone." }), title: "Delete", cls: "bg-[#FCEAEA] text-[#EA5455]" });
    } else if (expense.status === "Submitted") {
      if (can("can_approve")) actions.push({ icon: Check, onClick: () => setConfirmModal({ type: "approve", id, title: "Approve this Daily Cash Expense?", message: "Approved expenses are included in Daily Cashbook reconciliation and P&L." }), title: "Approve", cls: "bg-[#E9F9EF] text-[#28C76F]" });
      if (can("can_reject")) actions.push({ icon: X, onClick: () => setRejectModal({ open: true, id, reason: "" }), title: "Reject", cls: "bg-[#FCEAEA] text-[#EA5455]" });
    }

    return (
      <div className="flex items-center gap-2">
        {actions.slice(0, 3).map((a) => (
          <button key={a.title} type="button" disabled={loading} onClick={a.onClick} className={`${btnBase} ${a.cls}`} title={a.title}>
            {loading ? <Loader2 size={17} className="animate-spin" /> : <a.icon size={17} />}
          </button>
        ))}
        <div className="md:hidden">
          <MobileActionMenu
            isDark={isDark}
            actions={actions.map((a) => ({ ...a, label: a.title, danger: a.title === "Delete" }))}
          />
        </div>
      </div>
    );
  };

  const cardData = [
    { title: "Total Expenses", value: formatCompactINR(summary.totalAmount), sub: "Filtered expense amount", icon: Wallet, color: primaryColor, bg: `${primaryColor}18` },
    { title: "Approved", value: formatCompactINR(summary.approvedAmount), sub: "Verified by admin", icon: CheckCircle2, color: "#28C76F", bg: "#E9F9EF" },
    { title: "Pending", value: summary.pendingCount, sub: "Draft + Submitted", icon: Clock, color: "#FF9F43", bg: "#FFF4E5" },
    { title: "Rejected", value: summary.rejectedCount, sub: "Need correction", icon: X, color: "#EA5455", bg: "#FCEAEA" },
    { title: "Proof Missing", value: summary.proofMissing, sub: "Attachment required", icon: Upload, color: "#00CFE8", bg: "#E6FAFD" },
  ];

  const canCreate = can("can_create");
  const record = editingId ? expenses.find((e) => e.id === editingId) : null;

  return (
    <div className="space-y-5" style={{ fontFamily: '"Public Sans", "Inter", system-ui, sans-serif' }}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${mainTextClass}`}>Daily Cash Expenses</h1>
          <p className={`mt-1 text-[14px] ${mutedClass}`}>Manage outlet-wise daily cash expenses, proof attachments and approvals.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OutletScopeBadge className="mr-1" />
          <button type="button" onClick={fetchInitialData} className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[14px] font-medium ${cardClass}`}>
            <RefreshCw size={18} /> Refresh
          </button>
          <button type="button" onClick={handleExport} className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[14px] font-medium ${cardClass}`}>
            <Download size={18} /> Export
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={() => { setShowForm((p) => !p); if (showForm) { setEditingId(null); resetForm(); } }}
              className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)]"
              style={{ backgroundColor: primaryColor }}
            >
              {showForm ? <X size={18} /> : <Plus size={18} />}
              {showForm ? "Close" : "Add Expense"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {cardData.map((c) => (
          <div key={c.title} className={`rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardClass}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-[13px] font-medium ${mutedClass}`}>{c.title}</p>
                <h3 className="mt-1 text-xl font-bold" style={{ color: c.color }}>{c.value}</h3>
                <p className={`mt-0.5 text-[12px] ${mutedClass}`}>{c.sub}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-md" style={{ backgroundColor: c.bg }}>
                <c.icon size={20} style={{ color: c.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <SectionCard title={editingId ? "Edit Expense" : "New Expense Entry"} isDark={isDark}>
          <div className="mb-4">
            {editingId && record && workflowIndicator(record.status)}
            {editingId && record && statusBanner(record.status)}
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h4 className={`mb-3 text-[14px] font-semibold uppercase tracking-wider ${mutedClass}`}>Expense Details</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${mainTextClass}`}>Outlet *</label>
                  <select
                    value={formData.outlet_id}
                    onChange={(e) => updateField("outlet_id", e.target.value)}
                    className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`}
                    required
                    disabled={!isAdmin && userOutletIds.length === 1}
                  >
                    <option value="">Select Outlet</option>
                    {visibleOutlets.map((o) => (
                      <option key={o.id} value={o.id}>{o.outlet_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${mainTextClass}`}>Expense Date *</label>
                  <div className="relative">
                    <Calendar size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8AAAE]" />
                    <input type="date" value={formData.date} onChange={(e) => updateField("date", e.target.value)} className={`h-11 w-full rounded-md border pl-10 pr-3 text-[14px] outline-none ${inputClass}`} required />
                  </div>
                </div>
                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${mainTextClass}`}>Expense Head *</label>
                  <select value={formData.expense_head_id} onChange={(e) => updateField("expense_head_id", e.target.value)} className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`} required>
                    <option value="">Select Expense Head</option>
                    {expenseHeads.map((h) => (
                      <option key={h.id} value={h.id}>{h.expense_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${mainTextClass}`}>Amount *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#A8AAAE]">₹</span>
                    <input type="number" step="0.01" min="0.01" value={formData.amount} onChange={(e) => updateField("amount", e.target.value)} placeholder="0.00" className={`h-11 w-full rounded-md border pl-8 pr-3 text-[14px] outline-none ${inputClass}`} required />
                  </div>
                </div>
                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${mainTextClass}`}>Payment Mode *</label>
                  <select value={formData.payment_mode_id} onChange={(e) => updateField("payment_mode_id", e.target.value)} className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`} required>
                    <option value="">Select Payment Mode</option>
                    {paymentModes.map((m) => (
                      <option key={m.id} value={m.id}>{m.mode_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${mainTextClass}`}>Paid To</label>
                  <input type="text" value={formData.paid_to} onChange={(e) => updateField("paid_to", e.target.value)} placeholder="Vendor / recipient name" className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`} />
                </div>
              </div>
            </div>

            <div>
              <h4 className={`mb-3 text-[14px] font-semibold uppercase tracking-wider ${mutedClass}`}>Proof & Description</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="sm:col-span-2 xl:col-span-2">
                  <label className={`mb-2 block text-[13px] font-medium ${mainTextClass}`}>Proof Attachment</label>
                  <div className="flex items-center gap-2">
                    <label className={`flex h-11 flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 text-[14px] transition hover:opacity-80 ${inputClass}`}>
                      <Upload size={17} className="text-[#A8AAAE]" />
                      <span className="truncate">
                        {formData.proof_file?.name || formData.proof_attachment?.split("/").pop() || "Choose File (JPG, PNG, WEBP, PDF up to 10 MB)"}
                      </span>
                      <input type="file" accept=".jpg,.jpeg,.png,.pdf,.webp" onChange={handleProofChange} className="hidden" />
                    </label>
                    {editingId && formData.proof_attachment && (
                      <a href={getProofUrl(formData.proof_attachment)} target="_blank" rel="noopener noreferrer" className={`flex h-11 items-center gap-2 rounded-md border px-3 text-[13px] font-medium cursor-pointer ${cardClass}`}>
                        <Eye size={16} /> View
                      </a>
                    )}
                  </div>
                  {proofPreview && (
                    <img src={proofPreview} alt="Proof preview" className="mt-3 h-24 w-40 rounded-md border object-cover" />
                  )}
                </div>
                <div className="sm:col-span-2 xl:col-span-3">
                  <label className={`mb-2 block text-[13px] font-medium ${mainTextClass}`}>Description</label>
                  <textarea value={formData.description} onChange={(e) => updateField("description", e.target.value)} placeholder="Enter expense reason, bill number, vendor name, manager remarks..." className={`min-h-[80px] w-full rounded-md border px-3 py-2 text-[14px] outline-none ${inputClass}`} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-70" style={{ backgroundColor: primaryColor }}>
                {saving ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
                {saving ? "Saving..." : editingId ? "Save Changes" : "Save Draft"}
              </button>
              {editingId && record && record.status !== "Approved" && record.status !== "Submitted" && can("can_submit") && (
                <button type="button" onClick={() => handleSubmitExpense(record.id)} disabled={saving || actionLoadingId === record.id} className="flex items-center gap-2 rounded-md bg-[#E9F9EF] px-5 py-2.5 text-[14px] font-semibold text-[#28C76F]">
                  <Send size={17} /> {record.status === "Rejected" ? "Resubmit" : "Submit"}
                </button>
              )}
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className={`rounded-md border px-5 py-2.5 text-[14px] font-medium ${cardClass}`}>
                Cancel
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      <FilterBar isDark={isDark} title="History Filters">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8AAAE]" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search..." className={`h-10 w-full rounded-md border pl-10 pr-3 text-[14px] outline-none ${inputClass}`} />
          </div>
          {!isAdmin && userOutletIds.length === 1 ? (
            <input type="text" readOnly value={visibleOutlets[0]?.outlet_name || "Outlet"} className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass} bg-opacity-50`} />
          ) : (
            <select value={outletFilter} onChange={(e) => setOutletFilter(e.target.value)} className={`h-10 rounded-md border px-3 text-[14px] outline-none ${inputClass}`}>
              <option value="all">All Outlets</option>
              {visibleOutlets.map((o) => (
                <option key={o.id} value={o.id}>{o.outlet_name}</option>
              ))}
            </select>
          )}
          <select value={headFilter} onChange={(e) => setHeadFilter(e.target.value)} className={`h-10 rounded-md border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="all">All Heads</option>
            {expenseHeads.map((h) => (
              <option key={h.id} value={h.id}>{h.expense_name}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`h-10 rounded-md border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="all">All Status</option>
            <option value="Draft">Draft</option>
            <option value="Submitted">Submitted</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
          <div className="relative">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8AAAE]" />
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={`h-10 w-full rounded-md border pl-10 pr-3 text-[14px] outline-none ${inputClass}`} />
          </div>
        </div>
      </FilterBar>

      <SectionCard title="Expense History" isDark={isDark} className="p-0">
        {loading ? (
          <div className="p-4">
            <TableWrapper isDark={isDark}>
              <table className="w-full min-w-[1100px] border-collapse">
                <thead>
                  <tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                    {["Date", "Outlet", "Expense Head", "Paid To", "Payment Mode", "Amount", "Proof", "Status", "Entered By", "Reviewer", "Actions"].map((h) => (
                      <th key={h} className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide ${mutedClass}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <LoadingRows rows={5} cols={11} isDark={isDark} />
                </tbody>
              </table>
            </TableWrapper>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No cash expenses found"
            subtitle="Create a Daily Cash Expense entry for this outlet to begin expense tracking."
            isDark={isDark}
            action={canCreate && (
              <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-semibold text-white" style={{ backgroundColor: primaryColor }}>
                <Plus size={18} /> Add Expense
              </button>
            )}
          />
        ) : (
          <TableWrapper isDark={isDark} className="rounded-none border-0">
            <table className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                  {["Date", "Outlet", "Expense Head", "Paid To", "Payment Mode", "Amount", "Proof", "Status", "Entered By", "Reviewer", "Actions"].map((h) => (
                    <th key={h} className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide ${mutedClass}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((expense) => (
                  <tr key={expense.id} className={`transition hover:bg-[#F8F7FA] ${isDark ? "border-b border-[#3B405A]" : "border-b border-[#EBE9F1]"}`}>
                    <td className={`px-4 py-3 text-[13px] ${mainTextClass}`}>{formatDate(expense.date)}</td>
                    <td className={`px-4 py-3 text-[13px] ${mainTextClass}`}>{expense.outlet_name || "-"}</td>
                    <td className={`px-4 py-3 text-[13px] ${mainTextClass}`}>{expense.expense_name || "-"}</td>
                    <td className={`px-4 py-3 text-[13px] ${mainTextClass}`}>{expense.paid_to || "-"}</td>
                    <td className="px-4 py-3 text-[13px] text-[#6F6B7D]">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F8F7FA] px-2 py-1 text-[12px] dark:bg-[#3B405A]">
                        <CreditCard size={13} /> {expense.mode_name || "-"}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-[14px] font-semibold ${mainTextClass}`}>{formatINR(expense.amount)}</td>
                    <td className="px-4 py-3">
                      {expense.proof_attachment ? (
                        <a href={getProofUrl(expense.proof_attachment)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-[#E6FAFD] px-2.5 py-1 text-[12px] font-semibold text-[#00A6B7] cursor-pointer">
                          <Eye size={13} /> View
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF4E5] px-2.5 py-1 text-[12px] font-semibold text-[#FF9F43]">
                          <AlertCircle size={13} /> Missing
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={expense.status} /></td>
                    <td className={`px-4 py-3 text-[13px] ${mainTextClass}`}>{expense.entered_by_name || "-"}</td>
                    <td className={`px-4 py-3 text-[13px] ${mainTextClass}`}>{expense.verified_by_name || "-"}</td>
                    <td className="px-4 py-3">{renderActions(expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </SectionCard>

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-md rounded-md border p-5 shadow-xl ${cardClass}`}>
            <h3 className={`text-lg font-semibold ${mainTextClass}`}>{confirmModal.title}</h3>
            <p className={`mt-1 text-[14px] ${mutedClass}`}>{confirmModal.message}</p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmModal(null)} className={`rounded-md border px-4 py-2 text-[14px] font-medium ${cardClass}`}>Cancel</button>
              <button
                type="button"
                onClick={() => {
                  if (confirmModal.type === "approve") handleApprove(confirmModal.id);
                  else handleDelete(confirmModal.id);
                  setConfirmModal(null);
                }}
                className={`rounded-md px-4 py-2 text-[14px] font-semibold text-white ${confirmModal.type === "approve" ? "bg-[#28C76F]" : "bg-[#EA5455]"}`}
              >
                {confirmModal.type === "approve" ? "Approve" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-md rounded-md border p-5 shadow-xl ${cardClass}`}>
            <h3 className={`text-lg font-semibold ${mainTextClass}`}>Reject Daily Cash Expense</h3>
            <p className={`mt-1 text-[14px] ${mutedClass}`}>A reason is required for rejection.</p>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Enter rejection reason"
              className={`mt-3 min-h-[100px] w-full rounded-md border px-3 py-2 text-[14px] outline-none ${inputClass}`}
            />
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setRejectModal({ open: false, id: null, reason: "" })} className={`rounded-md border px-4 py-2 text-[14px] font-medium ${cardClass}`}>Cancel</button>
              <button type="button" onClick={() => handleReject(rejectModal.id, rejectModal.reason)} className="rounded-md bg-[#EA5455] px-4 py-2 text-[14px] font-semibold text-white">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyCashExpenses;

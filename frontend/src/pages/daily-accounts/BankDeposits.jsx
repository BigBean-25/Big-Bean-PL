import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  Edit2,
  Eye,
  FileText,
  Landmark,
  Loader2,
  MoreVertical,
  Paperclip,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  EmptyState,
  FilterBar,
  LoadingRows,
  LoadingSpinner,
  PageHeader,
  SectionCard,
  StatusBadge,
  TableWrapper,
  getCardClass,
  getInputClass,
  getPrimaryColor,
  getThemeMode,
} from "../../components/ui";
import { dailyAccountsAPI, masterAPI, getStoredPermissions } from "../../services/api";
import useAuthStore from "../../store/authStore";
import { useSelectedOutlet, OutletScopeBadge } from "../../hooks/useSelectedOutlet";
import toast from "react-hot-toast";

const num = (value) => Number(value || 0);

const formatINR = (value = 0) =>
  "₹" +
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const compactINR = (value = 0) => {
  const n = Number(value || 0);
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return formatINR(n);
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDate = (value) => {
  if (!value) return "-";
  try {
    const parts = String(value).split("-");
    if (parts.length === 3) {
      const [y, m, d] = parts.map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    }
    return value;
  } catch {
    return value;
  }
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

const STATUS_BANNERS = {
  Draft: { text: "Draft saved. Review and submit when ready.", color: "text-[#FF9F43]", bg: "bg-[#FFF4E5]" },
  Submitted: { text: "Submitted for verification. Editing is disabled.", color: "text-[#00A6B7]", bg: "bg-[#E6FAFD]" },
  Rejected: { text: "Rejected. Correct the deposit details and resubmit.", color: "text-[#EA5455]", bg: "bg-[#FCEAEA]" },
  Verified: { text: "Verified. This bank deposit is final.", color: "text-[#28C76F]", bg: "bg-[#E9F9EF]" },
};

const emptyForm = () => ({
  date: todayISO(),
  outlet_id: "",
  deposit_amount: "",
  bank_name: "",
  reference_no: "",
  deposited_by: "",
  remarks: "",
  proofFile: null,
});

const WorkflowIndicator = ({ status }) => {
  const steps = ["Draft", "Submitted", "Verified"];
  const isRejected = status === "Rejected";

  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-[#6F6B7D]">
      {steps.map((step, index) => {
        const isActive =
          step === status ||
          (status === "Rejected" && step === "Submitted") ||
          (status === "Verified" && ["Draft", "Submitted"].includes(step));
        const isCurrent = step === status;
        return (
          <div key={step} className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 ${
                isActive
                  ? isCurrent
                    ? "bg-[#7367F0] text-white"
                    : "bg-[#7367F0]/10 text-[#7367F0]"
                  : "bg-[#F3F2F7] text-[#A8AAAE]"
              }`}
            >
              {step}
            </span>
            {index < steps.length - 1 && <span className="text-[#A8AAAE]">→</span>}
          </div>
        );
      })}
      {isRejected && (
        <div className="flex items-center gap-2">
          <span className="text-[#A8AAAE]">→</span>
          <span className="rounded-full bg-[#EA5455] px-3 py-1 text-white">Rejected</span>
          <span className="text-[#A8AAAE]">→</span>
          <span className="rounded-full bg-[#FFF4E5] px-3 py-1 text-[#FF9F43]">Correct &amp; Resubmit</span>
        </div>
      )}
    </div>
  );
};

const StatusBanner = ({ status, reviewer, reason }) => {
  const style = STATUS_BANNERS[status] || STATUS_BANNERS.Draft;
  if (!style) return null;
  let text = style.text;
  if (status === "Rejected" && reviewer) {
    text = `Rejected by: ${reviewer}`;
    if (reason) text += `\nReason: ${reason}`;
  }
  return (
    <div className={`flex items-start gap-2 rounded-md border px-4 py-3 text-[14px] font-medium ${style.bg} border-current border-opacity-20 ${style.color}`}>
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <span className="whitespace-pre-line">{text}</span>
    </div>
  );
};

const BankDeposits = () => {
  const { user } = useAuthStore();
  const { selectedOutletId, selectedOutletLabel } = useSelectedOutlet();

  const [deposits, setDeposits] = useState([]);
  const [outlets, setOutlets] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedDeposit, setSelectedDeposit] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);

  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [verifyId, setVerifyId] = useState(null);

  const [loading, setLoading] = useState(true);

  const theme = getThemeMode();
  const isDark = theme === "dark";
  const primaryColor = getPrimaryColor();

  const cardClass = getCardClass(isDark);
  const inputClass = getInputClass(isDark);
  const mainText = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const mutedText = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";

  const permissions = useMemo(() => getStoredPermissions()?.bank_deposits || {}, []);
  const can = (action) => Boolean(permissions[action]);
  const isOutletRole = ["Outlet Admin", "Outlet Staff"].includes(user?.role_name);

  const isAdmin = ["Super Admin", "Admin", "Developer"].includes(user?.role_name);
  const userOutlets = useMemo(() => (user?.outlets || []).map((o) => String(o.id || o.outlet_id)), [user]);
  const visibleOutlets = useMemo(
    () => (isAdmin ? outlets : outlets.filter((o) => userOutlets.includes(String(o.id)))),
    [outlets, userOutlets, isAdmin]
  );

  useEffect(() => {
    load();
  }, [selectedOutletId]);

  const load = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchDeposits(), fetchOutlets()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeposits = async () => {
    try {
      const params = {};
      if (selectedOutletId && selectedOutletId !== "all") params.outlet_id = selectedOutletId;
      const res = await dailyAccountsAPI.getBankDeposits(params);
      const rows = res?.data?.data || [];
      setDeposits(rows);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to fetch bank deposits");
    }
  };

  const fetchOutlets = async () => {
    try {
      const res = await masterAPI.getOutlets();
      const rows = Array.isArray(res?.data?.data) ? res.data.data : res?.data || [];
      setOutlets(rows);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to fetch outlets");
    }
  };

  const getOutletName = (deposit) => {
    if (deposit?.outlet_name) return deposit.outlet_name;
    const outlet = outlets.find((o) => String(o.id) === String(deposit?.outlet_id));
    return outlet?.outlet_name || "-";
  };

  const defaultOutletId = useMemo(() => {
    if (selectedOutletId && selectedOutletId !== "all") return selectedOutletId;
    if (!isAdmin && userOutlets.length === 1) return userOutlets[0];
    return "";
  }, [selectedOutletId, isAdmin, userOutlets]);

  const resetForm = () => {
    setFormData({ ...emptyForm(), outlet_id: defaultOutletId });
    setEditingId(null);
    setSelectedDeposit(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
    setSelectedDeposit(null);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const openEdit = (deposit) => {
    setEditingId(deposit.id);
    setSelectedDeposit(null);
    setFormData({
      date: deposit.date ? String(deposit.date).slice(0, 10) : todayISO(),
      outlet_id: deposit.outlet_id || defaultOutletId,
      deposit_amount: deposit.deposit_amount || "",
      bank_name: deposit.bank_name || "",
      reference_no: deposit.reference_no || "",
      deposited_by: deposit.deposited_by || "",
      remarks: deposit.remarks || "",
      proofFile: null,
    });
    setShowForm(true);
  };

  const buildFormData = (payload) => {
    const fd = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (key === "proofFile") {
        if (value) fd.append("proof", value);
        return;
      }
      if (value !== null && value !== undefined) fd.append(key, value);
    });
    return fd;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.outlet_id) return toast.error("Please select an outlet");
    if (!formData.deposit_amount || num(formData.deposit_amount) <= 0) return toast.error("Deposit amount must be greater than zero");

    setSaving(true);
    try {
      const fd = buildFormData({
        date: formData.date,
        outlet_id: formData.outlet_id,
        deposit_amount: num(formData.deposit_amount),
        bank_name: formData.bank_name || "",
        reference_no: formData.reference_no || "",
        deposited_by: formData.deposited_by || "",
        remarks: formData.remarks || "",
        proofFile: formData.proofFile,
      });

      if (editingId) {
        await dailyAccountsAPI.updateBankDeposit(editingId, fd);
        toast.success("Bank deposit updated");
      } else {
        await dailyAccountsAPI.createBankDeposit(fd);
        toast.success("Bank deposit saved as Draft");
      }
      closeForm();
      await fetchDeposits();
    } catch (err) {
      toast.error(err.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (id, action, data = {}) => {
    setActionLoading(`${action}-${id}`);
    try {
      if (action === "submit") await dailyAccountsAPI.submitBankDeposit(id);
      if (action === "verify") await dailyAccountsAPI.verifyBankDeposit(id);
      if (action === "reject") await dailyAccountsAPI.rejectBankDeposit(id, data);
      if (action === "delete") await dailyAccountsAPI.deleteBankDeposit(id);
      toast.success(`Bank deposit ${action}ed`);
      setSelectedDeposit(null);
      await fetchDeposits();
    } catch (err) {
      toast.error(err.response?.data?.message || `${action} failed`);
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = useMemo(() => {
    return deposits.filter((d) => {
      const text = `${getOutletName(d)} ${d.bank_name || ""} ${d.reference_no || ""} ${d.deposited_by || ""} ${d.remarks || ""} ${d.status || ""}`.toLowerCase();
      const searchMatch = text.includes(searchTerm.toLowerCase());
      const outletMatch = !selectedOutletId || selectedOutletId === "all" || String(d.outlet_id) === String(selectedOutletId);
      const statusMatch = statusFilter === "all" || String(d.status || "").toLowerCase() === statusFilter.toLowerCase();
      return searchMatch && outletMatch && statusMatch;
    });
  }, [deposits, outlets, searchTerm, statusFilter, selectedOutletId]);

  const visible = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize]);

  const kpi = useMemo(() => {
    const total = filtered.reduce((s, d) => s + num(d.deposit_amount), 0);
    const verified = filtered.filter((d) => d.status === "Verified").reduce((s, d) => s + num(d.deposit_amount), 0);
    const pending = filtered.filter((d) => ["Draft", "Submitted"].includes(d.status)).reduce((s, d) => s + num(d.deposit_amount), 0);
    const rejected = filtered.filter((d) => d.status === "Rejected").reduce((s, d) => s + num(d.deposit_amount), 0);
    const missing = filtered.filter((d) => !d.proof_attachment).length;
    return { total, verified, pending, rejected, missing };
  }, [filtered]);

  const renderProof = (deposit) => {
    if (!deposit.proof_attachment) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF4E5] px-2.5 py-1 text-[12px] font-semibold text-[#FF9F43]">
          <AlertCircle size={13} /> Missing
        </span>
      );
    }
    return (
      <a
        href={getProofUrl(deposit.proof_attachment)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full bg-[#E6FAFD] px-2.5 py-1 text-[12px] font-semibold text-[#00A6B7]"
      >
        <Eye size={13} /> View
      </a>
    );
  };

  const actionMenu = (deposit) => {
    const items = [];
    items.push({ icon: Eye, label: "View", onClick: () => setSelectedDeposit(deposit) });
    if (["Draft", "Rejected"].includes(deposit.status) && can("can_edit")) {
      items.push({ icon: Edit2, label: "Edit", onClick: () => openEdit(deposit) });
    }
    if (["Draft", "Rejected"].includes(deposit.status) && can("can_submit")) {
      items.push({
        icon: Send,
        label: deposit.status === "Rejected" ? "Resubmit" : "Submit",
        onClick: () => runAction(deposit.id, "submit"),
      });
    }
    if (deposit.status === "Submitted" && !isOutletRole && can("can_verify")) {
      items.push({ icon: CheckCircle2, label: "Verify", onClick: () => setVerifyId(deposit.id) });
    }
    if (deposit.status === "Submitted" && !isOutletRole && can("can_reject")) {
      items.push({ icon: X, label: "Reject", onClick: () => setRejectId(deposit.id), danger: true });
    }
    if (["Draft", "Rejected"].includes(deposit.status) && !isOutletRole && can("can_delete")) {
      items.push({ icon: Trash2, label: "Delete", onClick: () => runAction(deposit.id, "delete"), danger: true });
    }
    return items;
  };

  const renderDesktopActions = (deposit) => {
    const id = deposit.id;
    const loading = (k) => actionLoading === `${k}-${id}`;
    const common = "flex h-9 w-9 items-center justify-center rounded-md transition hover:opacity-80 disabled:opacity-50";

    return (
      <div className="flex items-center gap-2">
        <button onClick={() => setSelectedDeposit(deposit)} className={`${common} ${isDark ? "bg-[#3B405A] text-[#A5A8B6]" : "bg-[#F3F2F7] text-[#6F6B7D]"}`} title="View">
          <Eye size={17} />
        </button>

        {["Draft", "Rejected"].includes(deposit.status) && can("can_edit") && (
          <button onClick={() => openEdit(deposit)} className={`${common} ${isDark ? "bg-[#3B405A] text-[#00CFE8]" : "bg-[#E6FAFD] text-[#00A6B7]"}`} title="Edit">
            <Edit2 size={17} />
          </button>
        )}

        {["Draft", "Rejected"].includes(deposit.status) && can("can_submit") && (
          <button disabled={loading("submit")} onClick={() => runAction(id, "submit")} className={`${common} ${isDark ? "bg-[#2F3349] text-[#28C76F]" : "bg-[#E9F9EF] text-[#28C76F]"}`} title={deposit.status === "Rejected" ? "Resubmit" : "Submit"}>
            {loading("submit") ? <LoadingSpinner size={17} /> : <Send size={17} />}
          </button>
        )}

        {deposit.status === "Submitted" && !isOutletRole && can("can_verify") && (
          <button disabled={loading("verify")} onClick={() => setVerifyId(id)} className={`${common} ${isDark ? "bg-[#2F3349] text-[#28C76F]" : "bg-[#E9F9EF] text-[#28C76F]"}`} title="Verify">
            {loading("verify") ? <LoadingSpinner size={17} /> : <CheckCircle2 size={17} />}
          </button>
        )}

        {deposit.status === "Submitted" && !isOutletRole && can("can_reject") && (
          <button onClick={() => setRejectId(id)} className={`${common} ${isDark ? "bg-[#3B405A] text-[#EA5455]" : "bg-[#FCEAEA] text-[#EA5455]"}`} title="Reject">
            <X size={17} />
          </button>
        )}

        {["Draft", "Rejected"].includes(deposit.status) && !isOutletRole && can("can_delete") && (
          <button disabled={loading("delete")} onClick={() => runAction(id, "delete")} className={`${common} ${isDark ? "bg-[#3B405A] text-[#EA5455]" : "bg-[#FCEAEA] text-[#EA5455]"}`} title="Delete">
            {loading("delete") ? <LoadingSpinner size={17} /> : <Trash2 size={17} />}
          </button>
        )}
      </div>
    );
  };

  const KpiCard = ({ title, value, count, subtitle, color, icon: Icon, bg }) => (
    <div className={`rounded-md border p-4 sm:p-5 ${cardClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[13px] font-medium ${mutedText}`}>{title}</p>
          <h3 className={`mt-1 text-[22px] font-bold ${mainText}`}>{value}</h3>
          {count !== undefined && <p className={`mt-1 text-[13px] ${mutedText}`}>{count} records</p>}
          {subtitle && <p className={`mt-1 text-[13px] ${mutedText}`}>{subtitle}</p>}
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: bg, color }}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );

  const currentDeposit = useMemo(() => {
    if (selectedDeposit) return selectedDeposit;
    if (editingId) return deposits.find((d) => d.id === editingId);
    return null;
  }, [selectedDeposit, editingId, deposits]);

  const currentStatus = currentDeposit?.status || null;

  const handleExport = () => {
    const headers = ["Date", "Outlet", "Deposit Amount", "Bank Name", "Reference No", "Deposited By", "Status", "Remarks"];
    const rows = filtered.map((d) => [d.date, getOutletName(d), d.deposit_amount, d.bank_name || "", d.reference_no || "", d.deposited_by || "", d.status || "", d.remarks || ""]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bigbean-bank-deposits.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Bank deposits exported");
  };

  return (
    <div className="space-y-5" style={{ fontFamily: '"Public Sans", "Inter", system-ui, sans-serif' }}>
      <PageHeader
        title="Bank Deposits"
        subtitle="Track outlet cash deposits, proof and verification."
        isDark={isDark}
        actions={
          <>
            <OutletScopeBadge />
            <button onClick={load} className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[14px] font-medium ${cardClass}`}>
              <RefreshCw size={17} /> Refresh
            </button>
            {can("can_export") && (
              <button onClick={handleExport} className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[14px] font-medium ${cardClass}`}>
                <Download size={17} /> Export
              </button>
            )}
            {can("can_create") && (
              <button onClick={openCreate} className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-semibold text-white" style={{ backgroundColor: primaryColor }}>
                <Plus size={17} /> Add Bank Deposit
              </button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard title="Total Deposited" value={formatINR(kpi.total)} count={filtered.length} color={primaryColor} icon={Landmark} bg={`${primaryColor}18`} />
        <KpiCard title="Verified" value={formatINR(kpi.verified)} count={filtered.filter((d) => d.status === "Verified").length} color="#28C76F" icon={CheckCircle2} bg="#E9F9EF" />
        <KpiCard title="Pending" value={formatINR(kpi.pending)} count={filtered.filter((d) => ["Draft", "Submitted"].includes(d.status)).length} color="#FF9F43" icon={Loader2} bg="#FFF4E5" />
        <KpiCard title="Rejected" value={formatINR(kpi.rejected)} count={filtered.filter((d) => d.status === "Rejected").length} color="#EA5455" icon={X} bg="#FCEAEA" />
        <KpiCard title="Proof Missing" value={kpi.missing} count={kpi.missing} color="#00CFE8" icon={AlertCircle} bg="#E6FAFD" />
      </div>

      {currentStatus && (
        <StatusBanner
          status={currentStatus}
          reviewer={currentDeposit?.reviewer_name}
          reason={currentDeposit?.rejection_reason}
        />
      )}

      {showForm && (
        <SectionCard isDark={isDark} title={editingId ? "Edit Bank Deposit" : "New Bank Deposit"} className="animate-fade-up">
          <div className="mb-4 pb-4">
            <WorkflowIndicator status={editingId ? currentStatus : "Draft"} />
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div className="border-b pb-5">
              <h4 className={`mb-4 text-[14px] font-semibold uppercase tracking-wider ${mutedText}`}>Deposit Details</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${mainText}`}>Outlet *</label>
                  <select
                    value={formData.outlet_id}
                    onChange={(e) => setFormData({ ...formData, outlet_id: e.target.value })}
                    required
                    disabled={!isAdmin && userOutlets.length === 1}
                    className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`}
                  >
                    <option value="">Select outlet</option>
                    {visibleOutlets.map((o) => (
                      <option key={o.id} value={o.id}>{o.outlet_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${mainText}`}>Deposit Date *</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                    className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`}
                  />
                </div>

                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${mainText}`}>Deposit Amount *</label>
                  <div className="relative">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-semibold ${mutedText}`}>₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={formData.deposit_amount}
                      onChange={(e) => setFormData({ ...formData, deposit_amount: e.target.value })}
                      required
                      className={`h-11 w-full rounded-md border pl-8 pr-3 text-[14px] outline-none ${inputClass}`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${mainText}`}>Bank Name</label>
                  <input
                    type="text"
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`}
                  />
                </div>

                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${mainText}`}>Reference Number</label>
                  <input
                    type="text"
                    value={formData.reference_no}
                    onChange={(e) => setFormData({ ...formData, reference_no: e.target.value })}
                    className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`}
                  />
                </div>

                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${mainText}`}>Deposited By</label>
                  <input
                    type="text"
                    value={formData.deposited_by}
                    onChange={(e) => setFormData({ ...formData, deposited_by: e.target.value })}
                    className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`}
                  />
                </div>
              </div>
            </div>

            <div>
              <h4 className={`mb-4 text-[14px] font-semibold uppercase tracking-wider ${mutedText}`}>Proof &amp; Remarks</h4>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${mainText}`}>Proof Attachment</label>
                  <div className="flex items-center gap-2">
                    <label className={`flex h-11 flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 text-[14px] transition hover:opacity-80 ${inputClass}`}>
                      <Paperclip size={17} className="text-[#A8AAAE]" />
                      <span className="truncate">
                        {formData.proofFile?.name || (editingId && selectedDeposit?.proof_attachment?.split("/").pop()) || "Choose file (JPG, PNG, WEBP, PDF up to 10 MB)"}
                      </span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        onChange={(e) => setFormData({ ...formData, proofFile: e.target.files?.[0] || null })}
                        className="hidden"
                      />
                    </label>
                    {editingId && selectedDeposit?.proof_attachment && (
                      <a
                        href={getProofUrl(selectedDeposit.proof_attachment)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex h-11 items-center gap-2 rounded-md border px-3 text-[13px] font-medium ${cardClass}`}
                      >
                        <Eye size={16} /> View
                      </a>
                    )}
                  </div>
                </div>

                <div>
                  <label className={`mb-2 block text-[13px] font-medium ${mainText}`}>Remarks</label>
                  <textarea
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    className={`min-h-[80px] w-full rounded-md border px-3 py-2 text-[14px] outline-none ${inputClass}`}
                    placeholder="Any additional notes..."
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-md px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-70"
                style={{ backgroundColor: primaryColor }}
              >
                {saving ? <LoadingSpinner size={17} /> : <Save size={17} />}
                {saving ? "Saving..." : editingId ? "Save Changes" : "Save Draft"}
              </button>
              <button type="button" onClick={closeForm} className={`rounded-md border px-5 py-2.5 text-[14px] font-medium ${cardClass}`}>
                <X size={17} className="mr-1 inline" /> Cancel
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      {selectedDeposit && !showForm && (
        <SectionCard isDark={isDark} title="Bank Deposit Details" className="animate-fade-up">
          <div className="mb-4 pb-4 border-b">
            <WorkflowIndicator status={selectedDeposit.status} />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className={`rounded-md p-4 ${isDark ? "bg-[#3B405A]" : "bg-[#F8F7FA]"}`}>
              <Detail label="Record ID" value={selectedDeposit.id} />
              <Detail label="Outlet" value={getOutletName(selectedDeposit)} />
              <Detail label="Date" value={formatDate(selectedDeposit.date)} />
              <Detail label="Status" value={<StatusBadge status={selectedDeposit.status} />} />
              <Detail label="Proof" value={renderProof(selectedDeposit)} />
            </div>
            <div className={`rounded-md p-4 ${isDark ? "bg-[#3B405A]" : "bg-[#F8F7FA]"}`}>
              <Detail label="Deposit Amount" value={formatINR(selectedDeposit.deposit_amount)} />
              <Detail label="Bank Name" value={selectedDeposit.bank_name} />
              <Detail label="Reference No" value={selectedDeposit.reference_no} />
              <Detail label="Deposited By" value={selectedDeposit.deposited_by} />
            </div>
            <div className={`rounded-md p-4 ${isDark ? "bg-[#3B405A]" : "bg-[#F8F7FA]"}`}>
              <Detail label="Entered By" value={selectedDeposit.entered_by_name} />
              <Detail label="Reviewer" value={selectedDeposit.reviewer_name} />
              <Detail label="Remarks" value={selectedDeposit.remarks} />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {["Draft", "Rejected"].includes(selectedDeposit.status) && can("can_edit") && (
              <button onClick={() => openEdit(selectedDeposit)} className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-semibold text-white" style={{ backgroundColor: primaryColor }}>
                <Edit2 size={17} /> Edit
              </button>
            )}
            {selectedDeposit.status === "Submitted" && !isOutletRole && can("can_verify") && (
              <button onClick={() => setVerifyId(selectedDeposit.id)} className="flex items-center gap-2 rounded-md bg-[#28C76F] px-4 py-2.5 text-[14px] font-semibold text-white">
                <CheckCircle2 size={17} /> Verify
              </button>
            )}
            {selectedDeposit.status === "Submitted" && !isOutletRole && can("can_reject") && (
              <button onClick={() => setRejectId(selectedDeposit.id)} className="flex items-center gap-2 rounded-md bg-[#EA5455] px-4 py-2.5 text-[14px] font-semibold text-white">
                <X size={17} /> Reject
              </button>
            )}
            {["Draft", "Rejected"].includes(selectedDeposit.status) && can("can_submit") && (
              <button onClick={() => runAction(selectedDeposit.id, "submit")} disabled={actionLoading === `submit-${selectedDeposit.id}`} className="flex items-center gap-2 rounded-md bg-[#00CFE8] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-70">
                {actionLoading === `submit-${selectedDeposit.id}` ? <LoadingSpinner size={17} /> : <Send size={17} />}
                {selectedDeposit.status === "Rejected" ? "Resubmit" : "Submit"}
              </button>
            )}
            {["Draft", "Rejected"].includes(selectedDeposit.status) && can("can_delete") && (
              <button onClick={() => runAction(selectedDeposit.id, "delete")} disabled={actionLoading === `delete-${selectedDeposit.id}`} className="flex items-center gap-2 rounded-md bg-[#EA5455] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-70">
                {actionLoading === `delete-${selectedDeposit.id}` ? <LoadingSpinner size={17} /> : <Trash2 size={17} />}
                Delete
              </button>
            )}
          </div>
        </SectionCard>
      )}

      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`w-full max-w-md rounded-md border p-5 shadow-lg ${cardClass}`}>
            <h3 className={`text-lg font-semibold ${mainText}`}>Reject Bank Deposit</h3>
            <p className={`mt-1 text-[13px] ${mutedText}`}>A reason is required for rejection.</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className={`mt-3 min-h-[90px] w-full rounded-md border px-3 py-2 text-[14px] outline-none ${inputClass}`}
              placeholder="Enter rejection reason"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => { setRejectId(null); setRejectReason(""); }} className={`rounded-md border px-4 py-2 text-[14px] font-medium ${cardClass}`}>Cancel</button>
              <button
                disabled={!rejectReason.trim()}
                onClick={() => { runAction(rejectId, "reject", { rejection_reason: rejectReason }); setRejectId(null); setRejectReason(""); }}
                className="rounded-md bg-[#EA5455] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {verifyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`w-full max-w-md rounded-md border p-5 shadow-lg ${cardClass}`}>
            <h3 className={`text-lg font-semibold ${mainText}`}>Verify Bank Deposit?</h3>
            <p className={`mt-1 text-[13px] ${mutedText}`}>Confirm that the bank amount, reference number and proof are correct.</p>
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setVerifyId(null)} className={`rounded-md border px-4 py-2 text-[14px] font-medium ${cardClass}`}>Cancel</button>
              <button
                onClick={() => { runAction(verifyId, "verify"); setVerifyId(null); }}
                className="rounded-md bg-[#28C76F] px-4 py-2 text-[14px] font-semibold text-white"
              >
                Verify
              </button>
            </div>
          </div>
        </div>
      )}

      <FilterBar isDark={isDark} title="Filters">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <select
            value={selectedOutletId || "all"}
            onChange={() => {}}
            disabled
            className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`}
          >
            <option value="all">{isAdmin ? "All Outlets" : "Outlet"}</option>
            {visibleOutlets.map((o) => (
              <option key={o.id} value={o.id}>{o.outlet_name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`h-11 w-full rounded-md border px-3 text-[14px] outline-none ${inputClass}`}
          >
            <option value="all">All Status</option>
            <option value="Draft">Draft</option>
            <option value="Submitted">Submitted</option>
            <option value="Verified">Verified</option>
            <option value="Rejected">Rejected</option>
          </select>

          <div className="relative md:col-span-2">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8AAAE]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search deposits..."
              className={`h-11 w-full rounded-md border pl-10 pr-3 text-[14px] outline-none ${inputClass}`}
            />
          </div>
        </div>
      </FilterBar>

      <SectionCard isDark={isDark} className="p-0" title={
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <span>Bank Deposit History</span>
          <div className="flex items-center gap-2">
            <span className={`text-[13px] ${mutedText}`}>Show</span>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className={`h-9 rounded-md border px-2 text-[13px] outline-none ${inputClass}`}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      }>
        {loading ? (
          <TableWrapper isDark={isDark}>
            <table className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr className={`border-b text-left text-[13px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#2F2B3D]"}`}>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Outlet</th>
                  <th className="px-4 py-3">Deposit Amount</th>
                  <th className="px-4 py-3">Bank Name</th>
                  <th className="px-4 py-3">Reference No</th>
                  <th className="px-4 py-3">Deposited By</th>
                  <th className="px-4 py-3">Proof</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Entered By</th>
                  <th className="px-4 py-3">Reviewer</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                <LoadingRows rows={5} cols={11} isDark={isDark} />
              </tbody>
            </table>
          </TableWrapper>
        ) : visible.length === 0 ? (
          <EmptyState
            isDark={isDark}
            icon={Landmark}
            title="No bank deposits found"
            subtitle="Add a new deposit or change filters."
            action={can("can_create") ? (
              <button onClick={openCreate} className="rounded-md px-4 py-2.5 text-[14px] font-semibold text-white" style={{ backgroundColor: primaryColor }}>
                <Plus size={17} className="mr-1 inline" /> Add Bank Deposit
              </button>
            ) : null}
          />
        ) : (
          <TableWrapper isDark={isDark}>
            <table className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr className={`border-b text-left text-[13px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#2F2B3D]"}`}>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Outlet</th>
                  <th className="px-4 py-3">Deposit Amount</th>
                  <th className="px-4 py-3">Bank Name</th>
                  <th className="px-4 py-3">Reference No</th>
                  <th className="px-4 py-3">Deposited By</th>
                  <th className="px-4 py-3">Proof</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Entered By</th>
                  <th className="px-4 py-3">Reviewer</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <tr key={d.id} className={`border-b transition hover:bg-opacity-50 ${isDark ? "border-[#3B405A] hover:bg-[#3B405A]" : "border-[#EBE9F1] hover:bg-[#F8F7FA]"}`}>
                    <td className={`px-4 py-3 text-[13px] font-semibold ${mainText}`}>{formatDate(d.date)}</td>
                    <td className={`px-4 py-3 text-[13px] ${mutedText}`}>{getOutletName(d)}</td>
                    <td className={`px-4 py-3 text-[14px] font-bold ${mainText}`}>{formatINR(d.deposit_amount)}</td>
                    <td className={`px-4 py-3 text-[13px] ${mutedText}`}>{d.bank_name || "-"}</td>
                    <td className={`px-4 py-3 text-[13px] ${mutedText}`}>{d.reference_no || "-"}</td>
                    <td className={`px-4 py-3 text-[13px] ${mutedText}`}>{d.deposited_by || "-"}</td>
                    <td className="px-4 py-3">{renderProof(d)}</td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                    <td className={`px-4 py-3 text-[13px] ${mutedText}`}>{d.entered_by_name || "-"}</td>
                    <td className={`px-4 py-3 text-[13px] ${mutedText}`}>{d.reviewer_name || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="hidden md:block">{renderDesktopActions(d)}</div>
                      <div className="md:hidden">
                        {/* Mobile action menu placeholder */}
                        <button className={`flex h-9 w-9 items-center justify-center rounded-md ${isDark ? "bg-[#3B405A] text-[#A5A8B6]" : "bg-[#F3F2F7] text-[#6F6B7D]"}`}>
                          <MoreVertical size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
        {!loading && filtered.length > pageSize && (
          <div className={`border-t px-4 py-3 text-[13px] ${mutedText} ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
            Showing first {pageSize} of {filtered.length} bank deposits.
          </div>
        )}
      </SectionCard>
    </div>
  );
};

const Detail = ({ label, value }) => (
  <div className="flex items-start gap-2 py-1.5">
    <span className="min-w-[120px] text-[13px] font-semibold text-[#A8AAAE] dark:text-[#A5A8B6]">{label}</span>
    <span className="break-words text-[13px] text-[#2F2B3D] dark:text-[#D0D2D6]">{value || "-"}</span>
  </div>
);

export default BankDeposits;

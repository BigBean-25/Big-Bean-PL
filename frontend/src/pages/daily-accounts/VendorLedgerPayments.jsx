import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Loader2,
  Wallet,
  RotateCcw,
  IndianRupee,
  CheckCircle2,
  Calendar,
  Building2,
  Truck,
  AlertTriangle,
  Pencil,
  Send,
  XCircle,
  Undo2,
} from "lucide-react";
import useAuthStore from "../../store/authStore";
import { outletVendorAPI, masterAPI, exceptionAPI, getStoredPermissions } from "../../services/api";
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
    const m = localStorage.getItem("bbc_theme_mode") || "light";
    return m === "system"
      ? window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
        ? "dark"
        : "light"
      : m;
  } catch {
    return "light";
  }
};

const fmtINR = (n = 0) =>
  "₹" +
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const today = () => new Date().toISOString().slice(0, 10);

const formatDisplayDate = (value) => {
  if (!value) return "-";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  if (!y || !m || !d) return String(value).slice(0, 10);
  return `${d}-${m}-${y}`;
};

const toTs = (value) => {
  const n = new Date(value).getTime();
  return Number.isNaN(n) ? 0 : n;
};

const previousDay = (dateStr) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const statusBadge = (outstanding) => {
  if (outstanding > 0.005) {
    return { text: "Outstanding", color: "text-[#FF9F43]", bg: "bg-[#FFF4E5]" };
  }
  if (outstanding < -0.005) {
    return { text: "Credit / Overpaid", color: "text-[#00CFE8]", bg: "bg-[#E6FAFD]" };
  }
  return { text: "Settled", color: "text-[#28C76F]", bg: "bg-[#E9F9EF]" };
};

// Workflow status badges for payment rows (Phase 7D2A3)
const PAYMENT_STATUS_BADGE = {
  Draft: { color: "text-[#5D596C]", bg: "bg-[#EBE9F1]" },
  Submitted: { color: "text-[#FF9F43]", bg: "bg-[#FFF4E5]" },
  Verified: { color: "text-[#28C76F]", bg: "bg-[#E9F9EF]" },
  Rejected: { color: "text-[#EA5455]", bg: "bg-[#FCE7E7]" },
};

export default function VendorLedgerPayments() {
  const { user } = useAuthStore();
  const outletContext = useOutletContext() || {};
  const { selectedOutletId = "all", availableOutlets = [] } = outletContext;

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark
    ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
    : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark
    ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]"
    : "border-[#DBDADE] bg-white text-[#2F2B3D]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

  const isAdmin = ["Super Admin", "Admin", "Developer"].includes(user?.role_name);
  const userOutletIds = useMemo(
    () => (user?.outlets || []).map((o) => String(o.id || o.outlet_id)),
    [user]
  );
  const outletContextId = selectedOutletId && selectedOutletId !== "all" ? String(selectedOutletId) : "";

  const [outlets, setOutlets] = useState(availableOutlets);
  const [vendors, setVendors] = useState([]);
  const [paymentModes, setPaymentModes] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [payments, setPayments] = useState([]);
  const [currentLedger, setCurrentLedger] = useState(null);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);

  const [filters, setFilters] = useState({
    outlet_id: outletContextId,
    vendor_id: "",
    from_date: "",
    to_date: "",
  });

  const [payAmount, setPayAmount] = useState("");
  const [payModeId, setPayModeId] = useState("");
  const [payRef, setPayRef] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionLoading, setActionLoading] = useState(null);
  const [verifyTarget, setVerifyTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [reversalTarget, setReversalTarget] = useState(null);
  const [reversalReason, setReversalReason] = useState("");
  const requestSeq = useRef(0);

  // Workflow permissions live on the outlet_vendors module key
  const permissions = useMemo(() => getStoredPermissions()?.outlet_vendors || {}, []);
  const can = (action) => Boolean(permissions[action]);
  // Reversal requests go through the generic controlled_exceptions module
  const excPermissions = useMemo(() => getStoredPermissions()?.controlled_exceptions || {}, []);
  const canRequestReversal = (p) =>
    p && p.type === "Payment" && p.status === "Verified" &&
    Number(p.is_reversal || 0) === 0 && !p.reversal_of_payment_id &&
    Boolean(excPermissions.can_create);
  // Self-check mirror: backend remains authoritative; this only hides the
  // checker buttons when the current user is the maker/submitter.
  const isOwnPayment = (p) =>
    p && (Number(p.created_by) === Number(user?.id) || Number(p.submitted_by) === Number(user?.id));

  const visibleOutlets = useMemo(
    () => (isAdmin ? outlets : outlets.filter((o) => userOutletIds.includes(String(o.id)))),
    [outlets, userOutletIds, isAdmin]
  );

  const clearLedgerState = useCallback(() => {
    requestSeq.current += 1;
    setLoading(false);
    setPurchases([]);
    setPayments([]);
    setCurrentLedger(null);
    setOpeningBalance(0);
  }, []);

  useEffect(() => {
    setOutlets(availableOutlets);
  }, [availableOutlets]);

  useEffect(() => {
    setFilters((f) => ({ ...f, outlet_id: outletContextId, vendor_id: "" }));
    clearLedgerState();
    setPayAmount("");
    setPayModeId("");
    setPayRef("");
  }, [outletContextId, clearLedgerState]);

  const fetchLookups = useCallback(async () => {
    try {
      const [v, pm] = await Promise.all([
        outletVendorAPI.getVendors({ is_active: 1 }),
        masterAPI.getPaymentModes(),
      ]);
      setVendors(v?.data?.data || []);
      setPaymentModes(Array.isArray(pm?.data?.data) ? pm.data.data : (pm?.data || []));
    } catch {
      toast.error("Failed to load lookups");
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!filters.outlet_id || filters.outlet_id === "all" || !filters.vendor_id) {
      clearLedgerState();
      return;
    }
    if (filters.from_date && filters.to_date && filters.from_date > filters.to_date) {
      clearLedgerState();
      return;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const calls = [
        outletVendorAPI.getPurchases({
          outlet_id: filters.outlet_id,
          vendor_id: filters.vendor_id,
          from_date: filters.from_date || undefined,
          to_date: filters.to_date || undefined,
          limit: 1000,
        }),
        outletVendorAPI.getPayments({
          outlet_id: filters.outlet_id,
          vendor_id: filters.vendor_id,
          from_date: filters.from_date || undefined,
          to_date: filters.to_date || undefined,
          limit: 1000,
        }),
        outletVendorAPI.getLedger({
          outlet_id: filters.outlet_id,
          vendor_id: filters.vendor_id,
          date: today(),
        }),
      ];
      if (filters.from_date) {
        calls.push(
          outletVendorAPI.getLedger({
            outlet_id: filters.outlet_id,
            vendor_id: filters.vendor_id,
            date: previousDay(filters.from_date),
          })
        );
      }
      const [pRes, pmRes, curRes, openRes] = await Promise.all(calls);
      if (seq !== requestSeq.current) return;
      setPurchases(pRes?.data?.data || []);
      setPayments(pmRes?.data?.data || []);
      setCurrentLedger(curRes?.data?.data || null);
      setOpeningBalance(openRes?.data?.data?.current_outstanding || 0);
    } catch {
      if (seq !== requestSeq.current) return;
      toast.error("Failed to load ledger");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filters, clearLedgerState]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { timeline, totalPayable, totalPayments, outstanding } = useMemo(() => {
    const purchaseRows = (purchases || []).map((p) => ({
      id: `p-${p.id}`,
      type: "Purchase",
      date: p.purchase_date,
      created_at: p.created_at,
      reference: p.purchase_no,
      description: p.description,
      debit: p.paid_by === "Outlet" ? 0 : Number(p.amount || 0),
      credit: 0,
      notes: [
        p.paid_by === "Outlet" ? "Paid by outlet at purchase" : "",
        Number(p.is_emergency) === 1 ? "Emergency" : "",
        p.remarks,
      ]
        .filter(Boolean)
        .join(" • "),
    }));

    const paymentRows = (payments || []).map((p) => ({
      id: `pay-${p.id}`,
      paymentId: p.id,
      type: "Payment",
      date: p.date,
      created_at: p.created_at,
      reference: p.reference_no || `PAY-${p.id}`,
      description: "Payment to vendor",
      debit: 0,
      // Only Verified payments reduce outstanding - the same rule
      // outletVendorLedgerService.getCumulativePayments applies. All rows
      // still display; Draft/Submitted/Rejected contribute 0 to the running
      // balance.
      credit: p.status === "Verified" ? Number(p.paid_amount || 0) : 0,
      status: p.status || "Verified", // legacy rows are Verified
      is_reversal: Number(p.is_reversal || 0),
      reversal_of_payment_id: p.reversal_of_payment_id ?? null,
      reversal_exception_id: p.reversal_exception_id ?? null,
      created_by: p.created_by,
      submitted_by: p.submitted_by,
      submitted_at: p.submitted_at,
      verified_at: p.verified_at,
      rejection_reason: p.rejection_reason,
      payment_mode_name: p.mode_name || null,
      paid_amount: Number(p.paid_amount || 0),
      payment_mode_id: p.payment_mode_id,
      reference_no: p.reference_no,
      remarks: p.remarks,
      notes: p.remarks || "",
    }));

    const rows = [...purchaseRows, ...paymentRows].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const aTs = toTs(a.created_at);
      const bTs = toTs(b.created_at);
      if (aTs !== bTs) return aTs - bTs;
      if (a.type === "Purchase" && b.type === "Payment") return -1;
      if (a.type === "Payment" && b.type === "Purchase") return 1;
      return String(a.id).localeCompare(String(b.id));
    });

    // Financial calculation always uses the COMPLETE ledger population.
    // The status filter is display-only and is applied after balances are
    // computed, so hiding Verified/Submitted rows can never inflate the
    // running balance or outstanding (7D2A3 blocker fix).
    let balance = openingBalance;
    const timeline = rows.map((r) => {
      balance += r.debit - r.credit;
      return { ...r, balance };
    });

    const totalPayable = purchaseRows.reduce((s, r) => s + r.debit, 0);
    const totalPayments = paymentRows.reduce((s, r) => s + r.credit, 0);
    const outstanding = openingBalance + totalPayable - totalPayments;

    return { timeline, totalPayable, totalPayments, outstanding };
  }, [purchases, payments, openingBalance]);

  // Display-only status filter - applied AFTER running balances are computed
  // from the full ledger, so a filtered row keeps its true ledger balance.
  const visibleTimeline = useMemo(
    () =>
      timeline.filter(
        (r) => r.type !== "Payment" || statusFilter === "all" || r.status === statusFilter
      ),
    [timeline, statusFilter]
  );

  const status = useMemo(() => statusBadge(outstanding), [outstanding]);
  const selectedVendor = vendors.find((v) => String(v.id) === String(filters.vendor_id));
  const canPay = currentLedger && currentLedger.current_outstanding > 0.005;

  const handleRecordPayment = async () => {
    if (paying || !canPay) return;
    if (!filters.outlet_id || filters.outlet_id === "all" || !filters.vendor_id) return;
    if (!payAmount || Number(payAmount) <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    if (Number(payAmount) > currentLedger.current_outstanding + 0.005) {
      toast.error(`Payment cannot exceed current outstanding of ${fmtINR(currentLedger.current_outstanding)}`);
      return;
    }
    setPaying(true);
    try {
      await outletVendorAPI.createPayment({
        outlet_id: filters.outlet_id,
        vendor_id: filters.vendor_id,
        date: today(),
        paid_amount: Number(payAmount),
        payment_mode_id: payModeId || null,
        reference_no: payRef || null,
      });
      toast.success("Payment submitted for verification");
      setPayAmount("");
      setPayModeId("");
      setPayRef("");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to record payment");
    } finally {
      setPaying(false);
    }
  };

  // Workflow actions (7D2A3) - backend maker-checker is authoritative; these
  // handlers just surface its business errors verbatim.
  const runAction = async (key, fn, okMsg) => {
    if (actionLoading) return;
    setActionLoading(key);
    try {
      await fn();
      toast.success(okMsg);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.message || "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmitPayment = (p) =>
    runAction(`sub-${p.paymentId}`, () => outletVendorAPI.submitPayment(p.paymentId), "Payment submitted for verification");

  const handleVerifyPayment = () =>
    runAction(`ver-${verifyTarget?.paymentId}`, async () => {
      await outletVendorAPI.verifyPayment(verifyTarget.paymentId);
      setVerifyTarget(null);
    }, "Payment verified successfully");

  const handleRejectPayment = () => {
    const reason = rejectReason.trim();
    if (!reason) return;
    runAction(`rej-${rejectTarget?.paymentId}`, async () => {
      await outletVendorAPI.rejectPayment(rejectTarget.paymentId, { rejection_reason: reason });
      setRejectTarget(null);
      setRejectReason("");
    }, "Payment rejected");
  };

  const openEdit = (p) => {
    setEditTarget(p);
    setEditForm({
      date: String(p.date).slice(0, 10),
      paid_amount: p.paid_amount,
      payment_mode_id: p.payment_mode_id || "",
      reference_no: p.reference_no || "",
      remarks: p.remarks || "",
    });
  };

  const handleEditSave = () => {
    const amount = Number(editForm.paid_amount);
    if (!editForm.date || Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid date and amount");
      return;
    }
    runAction(`edit-${editTarget?.paymentId}`, async () => {
      await outletVendorAPI.updatePayment(editTarget.paymentId, {
        date: editForm.date,
        paid_amount: amount,
        payment_mode_id: editForm.payment_mode_id || null,
        reference_no: editForm.reference_no || null,
        remarks: editForm.remarks || null,
      });
      setEditTarget(null);
    }, "Vendor payment updated");
  };

  // Controlled reversal request (7D2B2) - creates a Requested exception via
  // the generic framework. Submit/approve/execute stay in Controlled
  // Exceptions; this page only requests + displays reversal state.
  const handleRequestReversal = () => {
    const reason = reversalReason.trim();
    if (!reason) return;
    runAction(`rev-${reversalTarget?.paymentId}`, async () => {
      await exceptionAPI.create({
        source_module: "outlet_vendor_payments",
        source_id: reversalTarget.paymentId,
        exception_type: "FINANCIAL_REVERSAL",
        reason,
        business_impact: null,
      });
      setReversalTarget(null);
      setReversalReason("");
    }, "Reversal request created");
  };

  const handleOutletChange = (value) => {
    setFilters((f) => ({
      ...f,
      outlet_id: value,
      vendor_id: "",
    }));
    clearLedgerState();
    setPayAmount("");
    setPayModeId("");
    setPayRef("");
  };

  const handleVendorChange = (value) => {
    setFilters((f) => ({ ...f, vendor_id: value }));
    clearLedgerState();
    setPayAmount("");
    setPayModeId("");
    setPayRef("");
  };

  const resetFilters = () => {
    setFilters({
      outlet_id: outletContextId,
      vendor_id: "",
      from_date: "",
      to_date: "",
    });
    clearLedgerState();
    setPayAmount("");
    setPayModeId("");
    setPayRef("");
  };

  const StatCard = ({ title, value, subtitle, icon: Icon, color, bg }) => (
    <div className={`rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:p-5 ${cardCls}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[13px] font-medium ${mutedCls}`}>{title}</p>
          <h3 className={`mt-1.5 text-[20px] font-semibold ${mainCls}`}>{value}</h3>
          <p className={`mt-1 text-[12px] ${mutedCls}`}>{subtitle}</p>
        </div>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: bg }}
        >
          <Icon size={20} style={{ color }} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Vendor Ledger &amp; Payments</h1>
        <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>
          Track purchases and payments for each outlet vendor, and record settlements.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {filters.from_date && (
          <StatCard title="Opening Balance" value={fmtINR(openingBalance)} subtitle={`As of ${formatDisplayDate(previousDay(filters.from_date))}`} icon={Calendar} color={primaryColor} bg={`${primaryColor}18`} />
        )}
        <StatCard title="Payable Purchases" value={fmtINR(totalPayable)} subtitle="Amount owed on purchases" icon={Truck} color={primaryColor} bg={`${primaryColor}18`} />
        <StatCard title="Total Payments" value={fmtINR(totalPayments)} subtitle="Settlements recorded" icon={Wallet} color="#28C76F" bg="#E9F9EF" />
        <StatCard title="Outstanding" value={fmtINR(outstanding)} subtitle="Current balance" icon={IndianRupee} color="#FF9F43" bg="#FFF4E5" />
        <StatCard title="Status" value={status.text} subtitle="Overall vendor position" icon={CheckCircle2} color={status.color.replace("text-", "")} bg={status.bg} />
      </div>

      <div className={`rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:p-5 ${cardCls}`}>
        <div className="mb-3 flex items-center gap-2">
          <Calendar size={16} style={{ color: primaryColor }} />
          <span className={`text-[12px] font-semibold uppercase tracking-wider ${mutedCls}`}>Filters</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <select
            value={filters.outlet_id}
            onChange={(e) => handleOutletChange(e.target.value)}
            className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}
          >
            <option value="">Select outlet</option>
            {visibleOutlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.outlet_name}
              </option>
            ))}
          </select>
          <div>
            <select
              value={filters.vendor_id}
              onChange={(e) => handleVendorChange(e.target.value)}
              disabled={!filters.outlet_id || filters.outlet_id === "all"}
              className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}
            >
              <option value="">Select vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vendor_name} ({v.category})
                </option>
              ))}
            </select>
            {!filters.outlet_id || filters.outlet_id === "all" ? (
              <p className={`mt-1 text-[12px] ${mutedCls}`}>Select an outlet first</p>
            ) : null}
          </div>
          <input
            type="date"
            value={filters.from_date}
            onChange={(e) => setFilters({ ...filters, from_date: e.target.value })}
            className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}
          />
          <input
            type="date"
            value={filters.to_date}
            onChange={(e) => setFilters({ ...filters, to_date: e.target.value })}
            className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            title="Payment status filter"
            className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}
          >
            <option value="all">All statuses</option>
            <option value="Draft">Draft</option>
            <option value="Submitted">Submitted</option>
            <option value="Verified">Verified</option>
            <option value="Rejected">Rejected</option>
          </select>
          <button
            onClick={resetFilters}
            className={`flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-[13px] font-medium ${inputCls}`}
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {filters.outlet_id && filters.vendor_id && (
        <>
          <div className={`rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:p-5 ${cardCls}`}>
            <div className="mb-3 flex items-center gap-2">
              <Wallet size={16} style={{ color: primaryColor }} />
              <span className={`text-[12px] font-semibold uppercase tracking-wider ${mutedCls}`}>Record Payment</span>
            </div>

            {!canPay ? (
              <div className={`flex items-center gap-2 text-[13px] ${outstanding <= 0.005 ? "text-[#28C76F]" : mutedCls}`}>
                <CheckCircle2 size={15} />
                {outstanding <= 0.005
                  ? "Fully settled — no outstanding balance."
                  : "Loading ledger…"}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max={currentLedger.current_outstanding}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="Payment amount"
                  className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}
                />
                <select
                  value={payModeId}
                  onChange={(e) => setPayModeId(e.target.value)}
                  className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}
                >
                  <option value="">Payment mode</option>
                  {paymentModes.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.mode_name}
                    </option>
                  ))}
                </select>
                <input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="Reference no. (optional)"
                  className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}
                />
                <button
                  onClick={handleRecordPayment}
                  disabled={paying}
                  className="col-span-1 flex h-10 items-center justify-center gap-2 rounded-md px-4 text-[14px] font-semibold text-white disabled:opacity-70 sm:col-span-2"
                  style={{ backgroundColor: primaryColor }}
                >
                  {paying ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  {paying ? "Saving…" : "Record Payment"}
                </button>
              </div>
            )}
          </div>

          <div className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
            <div className={`border-b px-4 py-3 sm:px-6 ${borderCls}`}>
              <span className={`text-[12px] font-semibold uppercase tracking-wider ${mutedCls}`}>Ledger</span>
            </div>
            <div className="overflow-x-auto p-4 sm:p-5">
              <table className="min-w-full" style={{ minWidth: "900px" }}>
                <thead>
                  <tr>
                    {["Date", "Reference", "Entry Type", "Status", "Debit", "Credit", "Running Balance", "Notes", "Actions"].map((h) => (
                      <th
                        key={h}
                        className={`whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider ${
                          isDark ? "bg-[#25293C] text-[#A5A8B6]" : "bg-[#F8F7FA] text-[#A8AAAE]"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${borderCls}`}>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center">
                        <Loader2 size={24} className="mx-auto animate-spin" style={{ color: primaryColor }} />
                      </td>
                    </tr>
                  ) : visibleTimeline.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center">
                        <span className={mutedCls}>No ledger entries for the selected filters</span>
                      </td>
                    </tr>
                  ) : (
                    visibleTimeline.map((r) => (
                      <tr key={r.id} className={isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F8F7FA]"}>
                        <td className={`px-3 py-2.5 text-[13px] ${mutedCls}`}>{formatDisplayDate(r.date)}</td>
                        <td className={`px-3 py-2.5 text-[13px] ${mainCls}`}>{r.reference}</td>
                        <td className={`px-3 py-2.5 text-[13px] ${mainCls}`}>{r.type}</td>
                        <td className="px-3 py-2.5 text-[13px]">
                          {r.type === "Payment" ? (
                            <span className="inline-flex items-center gap-1">
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  PAYMENT_STATUS_BADGE[r.status]?.color || mutedCls
                                } ${PAYMENT_STATUS_BADGE[r.status]?.bg || ""}`}
                              >
                                {r.status}
                              </span>
                              {r.is_reversal === 1 ? (
                                <span className="inline-block rounded-full bg-[#E6FAFD] px-2 py-0.5 text-[11px] font-semibold text-[#00CFE8]" title="Compensating reversal entry">
                                  Reversal
                                </span>
                              ) : r.reversal_of_payment_id ? (
                                <span className="inline-block rounded-full bg-[#F3F0FF] px-2 py-0.5 text-[11px] font-semibold text-[#7367F0]" title="This payment was reversed by a compensating entry">
                                  Reversed
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className={mutedCls}>-</span>
                          )}
                        </td>
                        <td className={`px-3 py-2.5 text-[13px] font-semibold ${r.debit > 0 ? mainCls : mutedCls}`}>
                          {r.debit > 0 ? fmtINR(r.debit) : "-"}
                        </td>
                        <td className={`px-3 py-2.5 text-[13px] font-semibold ${r.credit !== 0 ? mainCls : mutedCls}`}>
                          {r.credit !== 0 ? fmtINR(r.credit) : "-"}
                        </td>
                        <td className={`px-3 py-2.5 text-[13px] font-semibold ${mainCls}`}>{fmtINR(r.balance)}</td>
                        <td className={`px-3 py-2.5 text-[13px] ${mutedCls}`}>
                          {r.notes}
                          {r.type === "Payment" && r.status === "Rejected" && r.rejection_reason ? (
                            <div className="mt-0.5 text-[12px] text-[#EA5455]">Rejected: {r.rejection_reason}</div>
                          ) : null}
                          {r.type === "Payment" && r.submitted_at ? (
                            <div className="mt-0.5 text-[11px]">Submitted {formatDisplayDate(r.submitted_at)}</div>
                          ) : null}
                          {r.type === "Payment" && r.verified_at ? (
                            <div className="mt-0.5 text-[11px]">Verified {formatDisplayDate(r.verified_at)}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-[13px]">
                          {r.type === "Payment" ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {["Draft", "Rejected"].includes(r.status) && can("can_create") && (
                                <button
                                  onClick={() => openEdit(r)}
                                  disabled={Boolean(actionLoading)}
                                  className="flex items-center gap-1 rounded border border-[#DBDADE] px-2 py-1 text-[12px] font-medium hover:opacity-80 disabled:opacity-50"
                                  title="Edit payment"
                                >
                                  <Pencil size={12} /> Edit
                                </button>
                              )}
                              {["Draft", "Rejected"].includes(r.status) && can("can_submit") && (
                                <button
                                  onClick={() => handleSubmitPayment(r)}
                                  disabled={Boolean(actionLoading)}
                                  className="flex items-center gap-1 rounded px-2 py-1 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                                  style={{ backgroundColor: primaryColor }}
                                  title={r.status === "Rejected" ? "Re-submit for verification" : "Submit for verification"}
                                >
                                  {actionLoading === `sub-${r.paymentId}` ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                  {r.status === "Rejected" ? "Re-submit" : "Submit"}
                                </button>
                              )}
                              {r.status === "Submitted" && can("can_verify") && !isOwnPayment(r) && (
                                <button
                                  onClick={() => setVerifyTarget(r)}
                                  disabled={Boolean(actionLoading)}
                                  className="flex items-center gap-1 rounded bg-[#28C76F] px-2 py-1 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                                  title="Verify payment"
                                >
                                  <CheckCircle2 size={12} /> Verify
                                </button>
                              )}
                              {r.status === "Submitted" && can("can_reject") && !isOwnPayment(r) && (
                                <button
                                  onClick={() => { setRejectTarget(r); setRejectReason(""); }}
                                  disabled={Boolean(actionLoading)}
                                  className="flex items-center gap-1 rounded bg-[#EA5455] px-2 py-1 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                                  title="Reject payment"
                                >
                                  <XCircle size={12} /> Reject
                                </button>
                              )}
                              {canRequestReversal(r) && (
                                <button
                                  onClick={() => { setReversalTarget(r); setReversalReason(""); }}
                                  disabled={Boolean(actionLoading)}
                                  className="flex items-center gap-1 rounded border border-[#7367F0]/50 px-2 py-1 text-[12px] font-semibold text-[#7367F0] hover:opacity-80 disabled:opacity-50"
                                  title="Request a controlled reversal via exception approval"
                                >
                                  <Undo2 size={12} /> Request Reversal
                                </button>
                              )}
                              {!(["Draft", "Rejected"].includes(r.status) && (can("can_create") || can("can_submit"))) &&
                                !(r.status === "Submitted" && (can("can_verify") || can("can_reject")) && !isOwnPayment(r)) &&
                                !canRequestReversal(r) && (
                                <span className={mutedCls}>-</span>
                              )}
                            </div>
                          ) : (
                            <span className={mutedCls}>-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!filters.outlet_id || !filters.vendor_id ? (
        <div className={`rounded-md border p-6 text-center ${cardCls}`}>
          <Building2 size={28} className={`mx-auto ${mutedCls}`} />
          <p className={`mt-3 text-[14px] font-medium ${mainCls}`}>Select an outlet and a vendor to view the ledger</p>
        </div>
      ) : null}

      {/* Verify confirmation modal */}
      {verifyTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`w-full max-w-md rounded-lg border p-5 ${cardCls}`}>
            <h3 className={`text-[15px] font-semibold ${mainCls}`}>Verify Payment</h3>
            <div className={`mt-3 space-y-1.5 text-[13px] ${mutedCls}`}>
              <p><span className={mainCls}>Vendor:</span> {selectedVendor?.vendor_name || `#${filters.vendor_id}`}</p>
              <p><span className={mainCls}>Date:</span> {formatDisplayDate(verifyTarget.date)}</p>
              <p><span className={mainCls}>Amount:</span> {fmtINR(verifyTarget.paid_amount)}</p>
              <p><span className={mainCls}>Reference:</span> {verifyTarget.reference}</p>
              {verifyTarget.payment_mode_name ? <p><span className={mainCls}>Mode:</span> {verifyTarget.payment_mode_name}</p> : null}
            </div>
            <p className="mt-3 rounded-md border border-[#FF9F43]/40 bg-[#FFF4E5] p-2.5 text-[12px] text-[#FF9F43]">
              Verification will make this payment financially effective and reduce vendor outstanding.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setVerifyTarget(null)}
                disabled={Boolean(actionLoading)}
                className={`rounded-md border px-4 py-2 text-[13px] ${inputCls}`}
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyPayment}
                disabled={Boolean(actionLoading)}
                className="flex items-center gap-1.5 rounded-md bg-[#28C76F] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {actionLoading === `ver-${verifyTarget.paymentId}` ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Confirm Verify
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Reject modal */}
      {rejectTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`w-full max-w-md rounded-lg border p-5 ${cardCls}`}>
            <h3 className={`text-[15px] font-semibold ${mainCls}`}>Reject Payment</h3>
            <div className={`mt-3 space-y-1.5 text-[13px] ${mutedCls}`}>
              <p><span className={mainCls}>Vendor:</span> {selectedVendor?.vendor_name || `#${filters.vendor_id}`}</p>
              <p><span className={mainCls}>Date:</span> {formatDisplayDate(rejectTarget.date)}</p>
              <p><span className={mainCls}>Amount:</span> {fmtINR(rejectTarget.paid_amount)}</p>
            </div>
            <label className={`mt-3 block text-[12px] font-medium ${mutedCls}`}>
              Rejection reason <span className="text-[#EA5455]">*</span>
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Why is this payment being rejected?"
              className={`mt-1 w-full rounded-md border px-3 py-2 text-[13px] outline-none ${inputCls}`}
            />
            <p className={`mt-2 text-[12px] ${mutedCls}`}>
              A rejected payment stays financially inactive; the maker can edit and re-submit it.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setRejectTarget(null); setRejectReason(""); }}
                disabled={Boolean(actionLoading)}
                className={`rounded-md border px-4 py-2 text-[13px] ${inputCls}`}
              >
                Cancel
              </button>
              <button
                onClick={handleRejectPayment}
                disabled={Boolean(actionLoading) || !rejectReason.trim()}
                className="flex items-center gap-1.5 rounded-md bg-[#EA5455] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {actionLoading === `rej-${rejectTarget.paymentId}` ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Request Reversal modal - creates a controlled exception (Requested) */}
      {reversalTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`w-full max-w-md rounded-lg border p-5 ${cardCls}`}>
            <h3 className={`text-[15px] font-semibold ${mainCls}`}>Request Payment Reversal</h3>
            <div className={`mt-3 space-y-1.5 text-[13px] ${mutedCls}`}>
              <p><span className={mainCls}>Vendor:</span> {selectedVendor?.vendor_name || `#${filters.vendor_id}`}</p>
              <p><span className={mainCls}>Payment date:</span> {formatDisplayDate(reversalTarget.date)}</p>
              <p><span className={mainCls}>Amount:</span> {fmtINR(reversalTarget.paid_amount)}</p>
              <p><span className={mainCls}>Reference:</span> {reversalTarget.reference}</p>
              {reversalTarget.payment_mode_name ? <p><span className={mainCls}>Mode:</span> {reversalTarget.payment_mode_name}</p> : null}
            </div>
            <div className={`mt-3 rounded-md border border-[#7367F0]/40 bg-[#F3F0FF] p-2.5 text-[12px] text-[#7367F0]`}>
              The original payment stays in history. If the reversal is approved and executed,
              a compensating reversal entry is created prospectively - the original payment date
              is not rewritten. Full payment amount is reversed.
            </div>
            <label className={`mt-3 block text-[12px] font-medium ${mutedCls}`}>
              Reversal reason <span className="text-[#EA5455]">*</span>
            </label>
            <textarea
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              rows={3}
              placeholder="Why does this payment need to be reversed?"
              className={`mt-1 w-full rounded-md border px-3 py-2 text-[13px] outline-none ${inputCls}`}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setReversalTarget(null); setReversalReason(""); }}
                disabled={Boolean(actionLoading)}
                className={`rounded-md border px-4 py-2 text-[13px] ${inputCls}`}
              >
                Cancel
              </button>
              <button
                onClick={handleRequestReversal}
                disabled={Boolean(actionLoading) || !reversalReason.trim()}
                className="flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {actionLoading === `rev-${reversalTarget.paymentId}` ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
                Submit Request
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit modal - Draft/Rejected only */}
      {editTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`w-full max-w-md rounded-lg border p-5 ${cardCls}`}>
            <h3 className={`text-[15px] font-semibold ${mainCls}`}>Edit Payment</h3>
            {editTarget.status === "Rejected" && editTarget.rejection_reason ? (
              <p className="mt-3 rounded-md border border-[#EA5455]/40 bg-[#FCE7E7] p-2.5 text-[12px] text-[#EA5455]">
                Rejection reason: {editTarget.rejection_reason}
              </p>
            ) : null}
            <div className="mt-3 space-y-3">
              <div>
                <label className={`text-[12px] font-medium ${mutedCls}`}>Date</label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm((p) => ({ ...p, date: e.target.value }))}
                  className={`mt-1 h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}
                />
              </div>
              <div>
                <label className={`text-[12px] font-medium ${mutedCls}`}>Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.paid_amount}
                  onChange={(e) => setEditForm((p) => ({ ...p, paid_amount: e.target.value }))}
                  className={`mt-1 h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}
                />
              </div>
              <div>
                <label className={`text-[12px] font-medium ${mutedCls}`}>Payment mode</label>
                <select
                  value={editForm.payment_mode_id}
                  onChange={(e) => setEditForm((p) => ({ ...p, payment_mode_id: e.target.value }))}
                  className={`mt-1 h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}
                >
                  <option value="">Select mode</option>
                  {paymentModes.map((m) => (
                    <option key={m.id} value={m.id}>{m.mode_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`text-[12px] font-medium ${mutedCls}`}>Reference no.</label>
                <input
                  value={editForm.reference_no}
                  onChange={(e) => setEditForm((p) => ({ ...p, reference_no: e.target.value }))}
                  className={`mt-1 h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}
                />
              </div>
              <div>
                <label className={`text-[12px] font-medium ${mutedCls}`}>Remarks</label>
                <input
                  value={editForm.remarks}
                  onChange={(e) => setEditForm((p) => ({ ...p, remarks: e.target.value }))}
                  className={`mt-1 h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditTarget(null)}
                disabled={Boolean(actionLoading)}
                className={`rounded-md border px-4 py-2 text-[13px] ${inputCls}`}
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={Boolean(actionLoading)}
                className="flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {actionLoading === `edit-${editTarget.paymentId}` ? <Loader2 size={14} className="animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

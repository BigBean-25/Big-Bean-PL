import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Plus,
  Edit2,
  X,
  Eye,
  Search,
  Download,
  Loader2,
  RefreshCw,
  Calendar,
  Truck,
  Wallet,
  AlertCircle,
  FileText,
} from "lucide-react";
import api, { masterAPI } from "../../services/api";
import toast from "react-hot-toast";

const getRows = (response) => {
  const data = response?.data?.data || response?.data || [];
  return Array.isArray(data) ? data : [];
};

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

const formatDisplayDate = (value) => {
  if (!value) return "-";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  if (!y || !m || !d) return String(value).slice(0, 10);
  return `${d}-${m}-${y}`;
};

const todayInputValue = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

const getPrimaryColor = () => {
  try {
    return localStorage.getItem("bbc_primary_color") || "#7367F0";
  } catch {
    return "#7367F0";
  }
};

const emptyForm = () => ({
  date: todayInputValue(),
  outlet_id: "",
  supplier_id: "",
  paid_amount: "",
  payment_mode_id: "",
  reference_no: "",
  remarks: "",
});

const calculateBalance = (data) =>
  num(data.opening_pending) + num(data.purchase_value) - num(data.paid_amount);

const SupplierPayments = () => {
  const outletContext = useOutletContext() || {};
  const { selectedOutletId = "all", availableOutlets = [] } = outletContext;

  const [payments, setPayments] = useState([]);
  const [outlets, setOutlets] = useState(availableOutlets);
  const [suppliers, setSuppliers] = useState([]);
  const [paymentModes, setPaymentModes] = useState([]);
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);

  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [outletFilter, setOutletFilter] = useState(selectedOutletId || "all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);

  const isDark = getThemeMode() === "dark";
  const primaryColor = getPrimaryColor();

  const cardClass = isDark
    ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
    : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputClass = isDark
    ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6]"
    : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE]";
  const mutedClass = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainTextClass = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    setOutlets(availableOutlets);
  }, [availableOutlets]);

  useEffect(() => {
    setOutletFilter(selectedOutletId || "all");
  }, [selectedOutletId]);

  useEffect(() => {
    if (selectedOutletId && selectedOutletId !== "all" && !editingId) {
      setFormData((prev) => ({ ...prev, outlet_id: selectedOutletId }));
    }
  }, [selectedOutletId, editingId]);

  useEffect(() => {
    const load = async () => {
      if (
        !formData.outlet_id ||
        formData.outlet_id === "all" ||
        !formData.supplier_id ||
        !formData.date
      ) {
        setLedger(null);
        return;
      }
      setLedgerLoading(true);
      try {
        const params = {
          outlet_id: formData.outlet_id,
          supplier_id: formData.supplier_id,
          date: formData.date,
        };
        if (editingId) {
          params.exclude_id = editingId;
        }
        const response = await api.get(`/supplier-payments/ledger-summary`, {
          params,
        });
        setLedger(response.data?.data || null);
      } catch (error) {
        toast.error(error.response?.data?.message || "Failed to load supplier ledger");
      } finally {
        setLedgerLoading(false);
      }
    };
    load();
  }, [formData.outlet_id, formData.supplier_id, formData.date, editingId]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchPayments(),
        fetchSuppliers(),
        fetchPaymentModes(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async () => {
    try {
      const response = await api.get(`/supplier-payments`);
      setPayments(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch supplier payments");
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await masterAPI.getSuppliers();
      setSuppliers(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch suppliers");
    }
  };

  const fetchPaymentModes = async () => {
    try {
      const response = await masterAPI.getPaymentModes();
      setPaymentModes(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch payment modes");
    }
  };

  const getOutletName = (payment) => {
    if (payment?.outlet_name) return payment.outlet_name;
    const outlet = outlets.find((item) => Number(item.id) === Number(payment?.outlet_id));
    return outlet?.outlet_name || "-";
  };

  const getSupplierName = (payment) => {
    if (payment?.supplier_name) return payment.supplier_name;
    const supplier = suppliers.find((item) => Number(item.id) === Number(payment?.supplier_id));
    return supplier?.supplier_name || "-";
  };


  const resetForm = () => {
    setFormData(emptyForm());
    setEditingId(null);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const openCreateForm = () => {
    resetForm();
    setSelectedPayment(null);
    setShowForm(true);
  };

  const handleEdit = (payment) => {
    setEditingId(payment.id);
    setSelectedPayment(null);
    setFormData({
      date: payment.date ? String(payment.date).slice(0, 10) : todayInputValue(),
      outlet_id: payment.outlet_id || "",
      supplier_id: payment.supplier_id || "",
      paid_amount: payment.paid_amount || "",
      payment_mode_id: payment.payment_mode_id || "",
      reference_no: payment.reference_no || "",
      remarks: payment.remarks || "",
    });
    setShowForm(true);
  };

  const handleView = (payment) => {
    setSelectedPayment(payment);
    setShowForm(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.outlet_id || formData.outlet_id === "all" || !formData.supplier_id) {
      toast.error("Please select a specific outlet and supplier");
      return;
    }

    if (num(formData.paid_amount) <= 0) {
      toast.error("Paid amount must be greater than 0");
      return;
    }

    if (ledger && num(formData.paid_amount) > num(ledger.current_outstanding)) {
      toast.error(
        `Payment amount cannot exceed current outstanding of ${formatINR(ledger.current_outstanding)}`
      );
      return;
    }

    setSaving(true);

    try {
      const payload = {
        date: formData.date,
        outlet_id: formData.outlet_id,
        supplier_id: formData.supplier_id,
        paid_amount: num(formData.paid_amount),
        payment_mode_id: formData.payment_mode_id || null,
        reference_no: formData.reference_no || "",
        remarks: formData.remarks || "",
      };

      if (editingId) {
        await api.put(`/supplier-payments/${editingId}`, payload);
        toast.success("Supplier payment updated successfully");
      } else {
        await api.post(`/supplier-payments`, payload);
        toast.success("Supplier payment created successfully");
      }

      closeForm();
      await fetchPayments();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const text = `${getOutletName(payment)} ${getSupplierName(payment)} ${
        payment.reference_no || ""
      } ${payment.remarks || ""}`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());
      const outletMatch =
        outletFilter === "all" || String(payment.outlet_id) === String(outletFilter);
      const supplierMatch =
        supplierFilter === "all" || String(payment.supplier_id) === String(supplierFilter);

      return searchMatch && outletMatch && supplierMatch;
    });
  }, [payments, outlets, suppliers, searchTerm, outletFilter, supplierFilter]);

  const visiblePayments = useMemo(
    () => filteredPayments.slice(0, Number(pageSize)),
    [filteredPayments, pageSize]
  );

  const summary = useMemo(() => {
    const purchaseValue = filteredPayments.reduce((sum, item) => sum + num(item.purchase_value), 0);
    const paidAmount = filteredPayments.reduce((sum, item) => sum + num(item.paid_amount), 0);
    const latestByKey = {};
    filteredPayments.forEach((item) => {
      const key = `${item.outlet_id}-${item.supplier_id}`;
      const current = latestByKey[key];
      if (
        !current ||
        item.date > current.date ||
        (item.date === current.date && item.id > current.id)
      ) {
        latestByKey[key] = item;
      }
    });
    const balancePending = Object.values(latestByKey).reduce(
      (sum, item) => sum + (num(item.balance_pending) || calculateBalance(item)),
      0
    );

    return {
      entries: filteredPayments.length,
      purchaseValue,
      paidAmount,
      balancePending,
    };
  }, [filteredPayments]);

  const handleExport = () => {
    const headers = [
      "Date",
      "Outlet",
      "Supplier",
      "Paid Amount",
      "Payment Mode",
      "Reference No",
      "Outstanding After Payment",
      "Remarks",
    ];

    const rows = filteredPayments.map((payment) => [
      formatDisplayDate(payment.date),
      getOutletName(payment),
      getSupplierName(payment),
      payment.paid_amount || 0,
      payment.mode_name || "-",
      payment.reference_no || "",
      payment.balance_pending || calculateBalance(payment),
      payment.remarks || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bigbean-supplier-payments.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Supplier payments exported");
  };

  const StatCard = ({ title, value, subtitle, icon: Icon, color, bg }) => (
    <div className={`min-w-0 rounded-md border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-[14px] font-medium ${mutedClass}`}>{title}</p>
          <h3 className={`mt-2 text-[24px] font-semibold ${mainTextClass}`}>{value}</h3>
          <p className={`mt-1 text-[13px] ${mutedClass}`}>{subtitle}</p>
        </div>
        <div
          className="flex h-12 w-12 items-center justify-center rounded-md"
          style={{ backgroundColor: bg }}
        >
          <Icon size={24} style={{ color }} />
        </div>
      </div>
    </div>
  );

  const DetailItem = ({ label, value }) => (
    <div className="flex items-start gap-2 py-1.5">
      <span className={`min-w-[165px] text-[14px] font-semibold ${mainTextClass}`}>{label}</span>
      <span className={`text-[14px] ${mutedClass}`}>{value || "-"}</span>
    </div>
  );

  const paidAmount = num(formData.paid_amount);
  const currentOutstanding = num(ledger?.current_outstanding);
  const isZeroOutstanding = ledger !== null && currentOutstanding <= 0;
  const isOverpayment = ledger !== null && paidAmount > currentOutstanding;
  const isInvalidPaidAmount =
    ledger !== null &&
    (isZeroOutstanding || paidAmount <= 0 || isOverpayment);
  const isEmptyPaidAmount = String(formData.paid_amount).trim() === "";
  const balanceAfterPayment = Math.max(
    0,
    (ledger?.current_outstanding || 0) - paidAmount
  );

  const paidAmountError = (() => {
    if (isZeroOutstanding) return "Supplier has no outstanding balance.";
    if (!isEmptyPaidAmount && isOverpayment)
      return `Paid amount cannot exceed current outstanding of ${formatINR(currentOutstanding)}.`;
    if (!isEmptyPaidAmount && paidAmount < 0) return "Paid amount cannot be negative.";
    if (!isEmptyPaidAmount && paidAmount === 0)
      return "Paid amount must be greater than ₹0.00.";
    return "";
  })();

  const balanceCardClass = isZeroOutstanding
    ? isDark
      ? "border-[#28C76F] bg-[#1F3328]"
      : "border-[#28C76F] bg-[#E5F8ED]"
    : isInvalidPaidAmount
    ? isDark
      ? "border-[#EA5455] bg-[#3C2A2B]"
      : "border-[#EA5455] bg-[#FCEAEA]"
    : cardClass;
  const balanceTextClass = isZeroOutstanding
    ? "text-[#28C76F]"
    : isInvalidPaidAmount
    ? "text-[#EA5455]"
    : mainTextClass;
  const balanceIconColor = isZeroOutstanding
    ? "#28C76F"
    : isInvalidPaidAmount
    ? "#EA5455"
    : primaryColor;

  return (
    <div
      className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden"
      style={{
        fontFamily:
          '"Public Sans", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div className="flex min-w-0 flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div className="min-w-0">
          <h1 className={`text-[24px] font-semibold ${mainTextClass}`}>Supplier Payments</h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Track outlet-wise vendor ledger payments. This is a vendor ledger only — it does
            not affect P&amp;L, purchases/consumption already flow through the P&amp;L separately.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
          <button
            type="button"
            onClick={fetchInitialData}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium transition hover:-translate-y-px ${cardClass}`}
          >
            <RefreshCw size={18} />
            Refresh
          </button>

          <button
            type="button"
            onClick={handleExport}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium transition hover:-translate-y-px ${cardClass}`}
          >
            <Download size={18} />
            Export
          </button>

          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)] transition hover:-translate-y-px"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus size={18} />
            Add Payment
          </button>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Entries"
          value={summary.entries}
          subtitle="Filtered payment rows"
          icon={FileText}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />
        <StatCard
          title="Purchase Value"
          value={compactINR(summary.purchaseValue)}
          subtitle="Total purchase value"
          icon={Truck}
          color="#00CFE8"
          bg="#E6FAFD"
        />
        <StatCard
          title="Paid Amount"
          value={compactINR(summary.paidAmount)}
          subtitle="Total paid to suppliers"
          icon={Wallet}
          color="#28C76F"
          bg="#E9F9EF"
        />
        <StatCard
          title="Balance Pending"
          value={compactINR(summary.balancePending)}
          subtitle="Current outstanding balance"
          icon={AlertCircle}
          color="#EA5455"
          bg="#FCEAEA"
        />
      </div>

      {showForm && (
        <div className={`min-w-0 rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                {editingId ? "Edit Supplier Payment" : "New Supplier Payment"}
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Ledger values are read-only. Paid amount cannot exceed Current Outstanding.
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
              aria-label="Close form"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Date *
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(event) => setFormData({ ...formData, date: event.target.value })}
                  className={`h-11 w-full min-w-0 rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Outlet *
                </label>
                <select
                  value={formData.outlet_id}
                  onChange={(event) => setFormData({ ...formData, outlet_id: event.target.value })}
                  className={`h-11 w-full min-w-0 rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                  disabled={!!editingId}
                >
                  <option value="">{selectedOutletId === "all" ? "Select Outlet" : "Select Outlet"}</option>
                  {outlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.outlet_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Supplier *
                </label>
                <select
                  value={formData.supplier_id}
                  onChange={(event) =>
                    setFormData({ ...formData, supplier_id: event.target.value })
                  }
                  className={`h-11 w-full min-w-0 rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                  disabled={!!editingId}
                >
                  <option value="">Select Supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.supplier_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className={`min-w-0 rounded-md border p-5 ${
                isDark ? "border-[#3B405A] bg-[#25293C]" : "border-[#EBE9F1] bg-[#FBFAFC]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
                  style={{ color: primaryColor, backgroundColor: `${primaryColor}18` }}
                >
                  <Wallet size={20} />
                </div>
                <div className="min-w-0">
                  <h4 className={`text-[18px] font-semibold ${mainTextClass}`}>Supplier Ledger Summary</h4>
                  <p className={`mt-0.5 text-[13px] ${mutedClass}`}>
                    Values are automatically derived from Material Purchase and previous payments.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className={`rounded-md border p-4 ${cardClass}`}>
                  <p className={`text-[13px] ${mutedClass}`}>Opening Pending</p>
                  <p className={`mt-1 text-[18px] font-semibold ${mainTextClass}`}>
                    {ledgerLoading ? "..." : ledger ? formatINR(ledger.opening_outstanding) : "—"}
                  </p>
                </div>
                <div className={`rounded-md border p-4 ${cardClass}`}>
                  <p className={`text-[13px] ${mutedClass}`}>Purchases</p>
                  <p className={`mt-1 text-[18px] font-semibold ${mainTextClass}`}>
                    {ledgerLoading ? "..." : ledger ? formatINR(ledger.purchase_value) : "—"}
                  </p>
                </div>
                <div className={`rounded-md border p-4 ${cardClass}`}>
                  <p className={`text-[13px] ${mutedClass}`}>Purchase Return Credits</p>
                  <p className={`mt-1 text-[18px] font-semibold ${mainTextClass}`}>
                    {ledgerLoading ? "..." : ledger ? formatINR(ledger.purchase_return_credits) : "—"}
                  </p>
                </div>
                <div className={`rounded-md border p-4 ${cardClass}`}>
                  <p className={`text-[13px] ${mutedClass}`}>Payments</p>
                  <p className={`mt-1 text-[18px] font-semibold ${mainTextClass}`}>
                    {ledgerLoading ? "..." : ledger ? formatINR(ledger.previous_paid_amount) : "—"}
                  </p>
                </div>
                <div className={`rounded-md border p-4 ${cardClass}`}>
                  <p className={`text-[13px] ${mutedClass}`}>Closing Outstanding</p>
                  <p className={`mt-1 text-[18px] font-semibold ${mainTextClass}`}>
                    {ledgerLoading ? "..." : ledger ? formatINR(ledger.current_outstanding) : "—"}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                    Paid Amount *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={currentOutstanding > 0 ? currentOutstanding : undefined}
                    value={formData.paid_amount}
                    onChange={(event) =>
                      setFormData({ ...formData, paid_amount: event.target.value })
                    }
                    disabled={isZeroOutstanding || ledgerLoading || !ledger}
                    className={`h-11 w-full min-w-0 rounded-md border px-4 text-[14px] outline-none disabled:cursor-not-allowed disabled:opacity-60 ${inputClass} ${
                      paidAmountError ? "border-[#EA5455]" : ""
                    }`}
                    required
                  />
                  {paidAmountError && (
                    <p className="mt-1 text-[12px] text-[#EA5455]">{paidAmountError}</p>
                  )}
                </div>
                <div className="flex items-end">
                  <div
                    className={`flex min-w-0 flex-1 items-center justify-between gap-4 rounded-md border p-4 ${balanceCardClass}`}
                  >
                    <div>
                      <p className={`text-[13px] font-medium ${balanceTextClass}`}>
                        Balance After Payment
                      </p>
                      <p className={`mt-1 text-[20px] font-semibold ${balanceTextClass}`}>
                        {formatINR(balanceAfterPayment)}
                      </p>
                    </div>
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/70"
                      style={{ color: balanceIconColor }}
                    >
                      <AlertCircle size={20} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Payment Mode
                </label>
                <select
                  value={formData.payment_mode_id}
                  onChange={(event) =>
                    setFormData({ ...formData, payment_mode_id: event.target.value })
                  }
                  className={`h-11 w-full min-w-0 rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                >
                  <option value="">Select Payment Mode</option>
                  {paymentModes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.mode_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Reference No
                </label>
                <input
                  type="text"
                  value={formData.reference_no}
                  onChange={(event) =>
                    setFormData({ ...formData, reference_no: event.target.value })
                  }
                  className={`h-11 w-full min-w-0 rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                />
              </div>
            </div>

            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                Remarks
              </label>
              <textarea
                value={formData.remarks}
                onChange={(event) => setFormData({ ...formData, remarks: event.target.value })}
                className={`min-h-[90px] w-full min-w-0 rounded-md border px-4 py-3 text-[14px] outline-none ${inputClass}`}
                placeholder="Any additional notes..."
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="submit"
                disabled={
                  saving ||
                  ledgerLoading ||
                  !formData.outlet_id ||
                  formData.outlet_id === "all" ||
                  !formData.supplier_id ||
                  !formData.date ||
                  !ledger ||
                  isInvalidPaidAmount
                }
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
                style={{ backgroundColor: primaryColor }}
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Wallet size={18} />
                    {editingId ? "Update Payment" : "Create Payment"}
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={closeForm}
                className={`rounded-md border px-5 py-3 text-[15px] font-medium ${cardClass}`}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedPayment && (
        <div className={`min-w-0 rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                Supplier Payment Details
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                {getSupplierName(selectedPayment)} - {getOutletName(selectedPayment)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPayment(null)}
              className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
              aria-label="Close payment details"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem label="Record ID:" value={selectedPayment.id} />
              <DetailItem
                label="Date:"
                value={formatDisplayDate(selectedPayment.date)}
              />
              <DetailItem label="Outlet:" value={getOutletName(selectedPayment)} />
              <DetailItem label="Supplier:" value={getSupplierName(selectedPayment)} />
            </div>

            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem
                label="Outstanding Before Payment:"
                value={formatINR(
                  num(selectedPayment.opening_pending) + num(selectedPayment.purchase_value)
                )}
              />
              <DetailItem label="Paid Amount:" value={formatINR(selectedPayment.paid_amount)} />
              <DetailItem
                label="Outstanding After Payment:"
                value={formatINR(
                  selectedPayment.balance_pending || calculateBalance(selectedPayment)
                )}
              />
            </div>

            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem label="Reference No:" value={selectedPayment.reference_no} />
              <DetailItem label="Payment Mode:" value={selectedPayment.mode_name} />
              <DetailItem label="Remarks:" value={selectedPayment.remarks} />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => handleEdit(selectedPayment)}
              className="flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[15px] font-semibold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              <Edit2 size={17} />
              Edit
            </button>
          </div>
        </div>
      )}

      <div className={`min-w-0 max-w-full rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
        <div className="border-b border-[#EBE9F1] p-6">
          <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>Filters</h3>

          <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <select
              value={outletFilter}
              onChange={(event) => setOutletFilter(event.target.value)}
              className={`h-12 w-full min-w-0 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Outlet</option>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.outlet_name}
                </option>
              ))}
            </select>

            <select
              value={supplierFilter}
              onChange={(event) => setSupplierFilter(event.target.value)}
              className={`h-12 w-full min-w-0 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.supplier_name}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search Payments"
                className={`h-12 w-full rounded-md border pl-11 pr-4 text-[15px] outline-none ${inputClass}`}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 border-b border-[#EBE9F1] p-6 md:flex-row md:items-center">
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className={`h-12 w-[95px] rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={handleExport}
              className="flex h-12 items-center justify-center gap-2 rounded-md bg-[#F3F2F7] px-5 text-[15px] font-semibold text-[#6F6B7D]"
            >
              <Download size={17} />
              Export
            </button>

            <button
              type="button"
              onClick={openCreateForm}
              className="flex h-12 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-semibold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus size={18} />
              Add Payment
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Loader2 size={36} className="mx-auto animate-spin" style={{ color: primaryColor }} />
              <p className={`mt-3 text-[14px] ${mutedClass}`}>Loading supplier payments...</p>
            </div>
          </div>
        ) : visiblePayments.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Truck size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No supplier payments found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add a new payment or change filters.
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full min-w-0 max-w-full overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse xl:min-w-full">
              <thead>
                <tr className="border-b border-[#EBE9F1]">
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Date
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Outlet
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Supplier
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Paid Amount
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Payment Mode
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Reference No
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Outstanding After Payment
                  </th>
                  <th
                    className={`sticky right-0 z-10 px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D] ${
                      isDark ? "bg-[#2F3349]" : "bg-white"
                    }`}
                  >
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {visiblePayments.map((payment) => {
                  const balance = num(payment.balance_pending) || calculateBalance(payment);

                  return (
                    <tr
                      key={payment.id}
                      className="border-b border-[#EBE9F1] transition hover:bg-[#F8F7FA]"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-10 w-10 items-center justify-center rounded-md text-white"
                            style={{ backgroundColor: primaryColor }}
                          >
                            <Calendar size={18} />
                          </div>
                          <p className="text-[14px] font-semibold text-[#2F2B3D]">
                            {formatDisplayDate(payment.date)}
                          </p>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                        {getOutletName(payment)}
                      </td>
                      <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                        {getSupplierName(payment)}
                      </td>
                      <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                        {formatINR(payment.paid_amount)}
                      </td>
                      <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                        {payment.mode_name || "-"}
                      </td>
                      <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                        {payment.reference_no || "-"}
                      </td>
                      <td className="px-6 py-4 text-[14px] font-semibold text-[#EA5455]">
                        {formatINR(balance)}
                      </td>
                      <td
                        className={`sticky right-0 z-10 px-6 py-4 ${
                          isDark ? "bg-[#2F3349]" : "bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-[#6F6B7D]">
                          <button
                            type="button"
                            onClick={() => handleView(payment)}
                            className="flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[#F0EEFF] hover:text-[#7367F0]"
                            title="View Details"
                          >
                            <Eye size={18} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleEdit(payment)}
                            className="flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[#E6FAFD] hover:text-[#00A6B7]"
                            title="Edit"
                          >
                            <Edit2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredPayments.length > pageSize && (
              <div className="border-t border-[#EBE9F1] px-6 py-4 text-[14px] text-[#6F6B7D]">
                Showing first {pageSize} of {filteredPayments.length} supplier payments.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SupplierPayments;

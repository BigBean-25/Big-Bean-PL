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
  Plus,
  RefreshCw,
  Search,
  Store,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { dailyAccountsAPI, masterAPI } from "../../services/api";
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

const todayISO = () => new Date().toISOString().split("T")[0];

const initialForm = () => ({
  outlet_id: "",
  expense_date: todayISO(),
  expense_head_id: "",
  amount: "",
  payment_mode_id: "",
  description: "",
  proof_file: null,
});

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
    return new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
};

const getRows = (response) => {
  const data = response?.data?.data || response?.data || [];
  return Array.isArray(data) ? data : [];
};

const getStatusClass = (status) => {
  if (status === "Approved") return "bg-[#E9F9EF] text-[#28C76F]";
  if (status === "Rejected") return "bg-[#FCEAEA] text-[#EA5455]";
  if (status === "Submitted") return "bg-[#E6FAFD] text-[#00A6B7]";
  if (status === "Verified") return "bg-[#E9F9EF] text-[#28C76F]";
  return "bg-[#FFF4E5] text-[#FF9F43]";
};

const DailyCashExpenses = () => {
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

  const [searchTerm, setSearchTerm] = useState("");
  const [outletFilter, setOutletFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [headFilter, setHeadFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

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

    return () => {
      if (proofPreview) URL.revokeObjectURL(proofPreview);
    };
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);

    try {
      await Promise.all([fetchExpenses(), fetchMasters()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchExpenses = async () => {
    try {
      const response = await dailyAccountsAPI.getExpenses();
      setExpenses(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch expenses");
    }
  };

  const fetchMasters = async () => {
    try {
      const [outletsRes, headsRes, modesRes] = await Promise.all([
        masterAPI.getOutlets(),
        masterAPI.getExpenseHeads(),
        masterAPI.getPaymentModes(),
      ]);

      setOutlets(getRows(outletsRes));
      setExpenseHeads(getRows(headsRes));
      setPaymentModes(getRows(modesRes));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch master data");
    }
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setFormData(initialForm());

    if (proofPreview) {
      URL.revokeObjectURL(proofPreview);
      setProofPreview(null);
    }
  };

  const handleProofChange = (event) => {
    const file = event.target.files?.[0] || null;

    updateField("proof_file", file);

    if (proofPreview) {
      URL.revokeObjectURL(proofPreview);
      setProofPreview(null);
    }

    if (file && file.type?.startsWith("image/")) {
      setProofPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.outlet_id) {
      toast.error("Please select outlet");
      return;
    }

    if (!formData.expense_date) {
      toast.error("Please select expense date");
      return;
    }

    if (!formData.expense_head_id) {
      toast.error("Please select expense head");
      return;
    }

    if (!formData.amount || num(formData.amount) <= 0) {
      toast.error("Please enter valid amount");
      return;
    }

    if (!formData.payment_mode_id) {
      toast.error("Please select payment mode");
      return;
    }

    setSaving(true);

    try {
      const submitData = new FormData();

      submitData.append("outlet_id", formData.outlet_id);
      submitData.append("expense_date", formData.expense_date);
      submitData.append("expense_head_id", formData.expense_head_id);
      submitData.append("amount", num(formData.amount));
      submitData.append("payment_mode_id", formData.payment_mode_id);
      submitData.append("description", formData.description || "");

      if (formData.proof_file) {
        submitData.append("proof_file", formData.proof_file);
      }

      await dailyAccountsAPI.createExpense(submitData);

      toast.success("Expense created successfully");
      setShowForm(false);
      resetForm();
      await fetchExpenses();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create expense");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    setActionLoadingId(id);

    try {
      await dailyAccountsAPI.approveExpense(id, { status });
      toast.success(`Expense ${status.toLowerCase()} successfully`);
      await fetchExpenses();
    } catch (error) {
      toast.error(error.response?.data?.message || "Status update failed");
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const text = `${expense.outlet_name || ""} ${expense.head_name || ""} ${
        expense.mode_name || ""
      } ${expense.description || ""} ${expense.status || ""}`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const outletMatch =
        outletFilter === "all" ||
        String(expense.outlet_id) === String(outletFilter);

      const statusMatch =
        statusFilter === "all" || expense.status === statusFilter;

      const headMatch =
        headFilter === "all" ||
        String(expense.expense_head_id) === String(headFilter);

      const dateMatch =
        !dateFilter ||
        String(expense.expense_date || "").slice(0, 10) ===
          String(dateFilter).slice(0, 10);

      return searchMatch && outletMatch && statusMatch && headMatch && dateMatch;
    });
  }, [expenses, searchTerm, outletFilter, statusFilter, headFilter, dateFilter]);

  const summary = useMemo(() => {
    const totalAmount = filteredExpenses.reduce(
      (sum, row) => sum + num(row.amount),
      0
    );

    const approvedAmount = filteredExpenses
      .filter((row) => row.status === "Approved")
      .reduce((sum, row) => sum + num(row.amount), 0);

    const pendingCount = filteredExpenses.filter(
      (row) => row.status === "Submitted" || row.status === "Draft"
    ).length;

    const rejectedCount = filteredExpenses.filter(
      (row) => row.status === "Rejected"
    ).length;

    const proofMissing = filteredExpenses.filter(
      (row) => !row.proof_path && !row.proof_file
    ).length;

    return {
      totalAmount,
      approvedAmount,
      pendingCount,
      rejectedCount,
      proofMissing,
    };
  }, [filteredExpenses]);

  const handleExport = () => {
    const headers = [
      "Date",
      "Outlet",
      "Expense Head",
      "Amount",
      "Payment Mode",
      "Status",
      "Description",
    ];

    const rows = filteredExpenses.map((expense) => [
      formatDate(expense.expense_date),
      expense.outlet_name || "",
      expense.head_name || "",
      expense.amount || 0,
      expense.mode_name || "",
      expense.status || "",
      expense.description || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "daily-cash-expenses.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Expenses exported");
  };

  const openProof = (expense) => {
    const path = expense.proof_path || expense.proof_url;

    if (!path) {
      toast.error("Proof attachment not available");
      return;
    }

    const url = String(path).startsWith("http") ? path : `/${path}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const StatCard = ({ title, value, subtitle, icon: Icon, color, bg }) => (
    <div
      className={`rounded-md border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-[14px] font-medium ${mutedClass}`}>{title}</p>
          <h3 className={`mt-2 text-[24px] font-semibold ${mainTextClass}`}>
            {value}
          </h3>
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

  return (
    <div
      className="space-y-6"
      style={{
        fontFamily:
          '"Public Sans", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <h1 className={`text-[24px] font-semibold ${mainTextClass}`}>
            Daily Cash Expenses
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Manage outlet-wise daily cash expenses, proof attachments and approvals.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={fetchInitialData}
            className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
          >
            <RefreshCw size={18} />
            Refresh
          </button>

          <button
            type="button"
            onClick={handleExport}
            className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
          >
            <Download size={18} />
            Export
          </button>

          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)]"
            style={{ backgroundColor: primaryColor }}
          >
            {showForm ? <X size={18} /> : <Plus size={18} />}
            {showForm ? "Close Form" : "Add Expense"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total Expenses"
          value={formatCompactINR(summary.totalAmount)}
          subtitle="Filtered expense amount"
          icon={Wallet}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />

        <StatCard
          title="Approved Amount"
          value={formatCompactINR(summary.approvedAmount)}
          subtitle="Verified by admin"
          icon={CheckCircle2}
          color="#28C76F"
          bg="#E9F9EF"
        />

        <StatCard
          title="Pending"
          value={summary.pendingCount}
          subtitle="Waiting for approval"
          icon={Clock}
          color="#FF9F43"
          bg="#FFF4E5"
        />

        <StatCard
          title="Rejected"
          value={summary.rejectedCount}
          subtitle="Need correction"
          icon={X}
          color="#EA5455"
          bg="#FCEAEA"
        />

        <StatCard
          title="Proof Missing"
          value={summary.proofMissing}
          subtitle="Attachment required"
          icon={Upload}
          color="#00CFE8"
          bg="#E6FAFD"
        />
      </div>

      {showForm && (
        <div
          className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
        >
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                New Expense Entry
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add daily outlet cash expense with payment mode and proof.
              </p>
            </div>

            <div
              className="rounded-md px-4 py-2 text-[14px] font-semibold"
              style={{
                color: primaryColor,
                backgroundColor: `${primaryColor}18`,
              }}
            >
              Amount: {formatINR(formData.amount)}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Outlet *
                </label>
                <select
                  value={formData.outlet_id}
                  onChange={(event) => updateField("outlet_id", event.target.value)}
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                >
                  <option value="">Select Outlet</option>
                  {outlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.outlet_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Expense Date *
                </label>
                <div className="relative">
                  <Calendar
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]"
                  />
                  <input
                    type="date"
                    value={formData.expense_date}
                    onChange={(event) =>
                      updateField("expense_date", event.target.value)
                    }
                    className={`h-11 w-full rounded-md border pl-11 pr-4 text-[14px] outline-none ${inputClass}`}
                    required
                  />
                </div>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Expense Head *
                </label>
                <select
                  value={formData.expense_head_id}
                  onChange={(event) =>
                    updateField("expense_head_id", event.target.value)
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                >
                  <option value="">Select Expense Head</option>
                  {expenseHeads.map((head) => (
                    <option key={head.id} value={head.id}>
                      {head.head_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(event) => updateField("amount", event.target.value)}
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Payment Mode *
                </label>
                <select
                  value={formData.payment_mode_id}
                  onChange={(event) =>
                    updateField("payment_mode_id", event.target.value)
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                >
                  <option value="">Select Payment Mode</option>
                  {paymentModes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.mode_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Proof Attachment
                </label>

                <label
                  className={`flex h-11 cursor-pointer items-center gap-3 rounded-md border px-4 text-[14px] transition hover:bg-[#F8F7FA] ${inputClass}`}
                >
                  <Upload size={18} className="text-[#A8AAAE]" />
                  <span className="truncate">
                    {formData.proof_file?.name || "Upload JPG, PNG, WEBP or PDF"}
                  </span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,.webp"
                    onChange={handleProofChange}
                    className="hidden"
                  />
                </label>
              </div>

              {proofPreview && (
                <div className="md:col-span-2 xl:col-span-1">
                  <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                    Preview
                  </label>
                  <img
                    src={proofPreview}
                    alt="Proof preview"
                    className="h-24 w-full rounded-md border border-[#DBDADE] object-cover"
                  />
                </div>
              )}

              <div className="md:col-span-2 xl:col-span-4">
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(event) =>
                    updateField("description", event.target.value)
                  }
                  className={`min-h-[90px] w-full rounded-md border px-4 py-3 text-[14px] outline-none ${inputClass}`}
                  placeholder="Enter expense reason, bill number, vendor name, manager remarks..."
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center justify-center gap-2 rounded-md px-5 py-3 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)] disabled:cursor-not-allowed disabled:opacity-70"
                style={{ backgroundColor: primaryColor }}
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Create Expense
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className={`rounded-md border px-5 py-3 text-[15px] font-medium ${cardClass}`}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div
        className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
      >
        <div className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
              Expense History
            </h3>
            <p className={`mt-1 text-[14px] ${mutedClass}`}>
              Search, filter and approve outlet cash expenses.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search..."
                className={`h-11 w-full rounded-md border pl-11 pr-4 text-[14px] outline-none ${inputClass}`}
              />
            </div>

            <select
              value={outletFilter}
              onChange={(event) => setOutletFilter(event.target.value)}
              className={`h-11 rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
            >
              <option value="all">All Outlets</option>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.outlet_name}
                </option>
              ))}
            </select>

            <select
              value={headFilter}
              onChange={(event) => setHeadFilter(event.target.value)}
              className={`h-11 rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
            >
              <option value="all">All Heads</option>
              {expenseHeads.map((head) => (
                <option key={head.id} value={head.id}>
                  {head.head_name}
                </option>
              ))}
            </select>

            <div className="relative">
              <Filter
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className={`h-11 w-full appearance-none rounded-md border pl-11 pr-4 text-[14px] outline-none ${inputClass}`}
              >
                <option value="all">All Status</option>
                <option value="Draft">Draft</option>
                <option value="Submitted">Submitted</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className={`h-11 rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center">
            <div className="text-center">
              <Loader2
                size={34}
                className="mx-auto animate-spin"
                style={{ color: primaryColor }}
              />
              <p className={`mt-3 text-[14px] ${mutedClass}`}>
                Loading expenses...
              </p>
            </div>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-md border border-dashed border-[#DBDADE]">
            <div className="text-center">
              <FileText size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No expenses found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Create an expense or change the filters.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse">
              <thead>
                <tr
                  className={
                    isDark
                      ? "border-b border-[#3B405A]"
                      : "border-b border-[#EBE9F1]"
                  }
                >
                  {[
                    "Date",
                    "Outlet",
                    "Expense Head",
                    "Amount",
                    "Payment Mode",
                    "Proof",
                    "Status",
                    "Actions",
                  ].map((header) => (
                    <th
                      key={header}
                      className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${mutedClass}`}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredExpenses.map((expense) => (
                  <tr
                    key={expense.id}
                    className={`transition hover:bg-[#F8F7FA] ${
                      isDark
                        ? "border-b border-[#3B405A]"
                        : "border-b border-[#EBE9F1]"
                    }`}
                  >
                    <td className={`px-4 py-4 text-[14px] ${mainTextClass}`}>
                      {formatDate(expense.expense_date)}
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-md text-white"
                          style={{ backgroundColor: primaryColor }}
                        >
                          <Store size={17} />
                        </div>
                        <div>
                          <p className={`text-[14px] font-semibold ${mainTextClass}`}>
                            {expense.outlet_name || "-"}
                          </p>
                          <p className={`text-[12px] ${mutedClass}`}>
                            Outlet ID: {expense.outlet_id || "-"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className={`px-4 py-4 text-[14px] ${mainTextClass}`}>
                      {expense.head_name || "-"}
                    </td>

                    <td className={`px-4 py-4 text-[14px] font-semibold ${mainTextClass}`}>
                      {formatINR(expense.amount)}
                    </td>

                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-2 rounded-full bg-[#F8F7FA] px-3 py-1 text-[12px] font-medium text-[#6F6B7D]">
                        <CreditCard size={14} />
                        {expense.mode_name || "-"}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      {expense.proof_path || expense.proof_url ? (
                        <button
                          type="button"
                          onClick={() => openProof(expense)}
                          className="inline-flex items-center gap-1 rounded-full bg-[#E6FAFD] px-3 py-1 text-[12px] font-semibold text-[#00A6B7]"
                        >
                          <Eye size={14} />
                          View
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF4E5] px-3 py-1 text-[12px] font-semibold text-[#FF9F43]">
                          <AlertCircle size={14} />
                          Missing
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-[12px] font-semibold ${getStatusClass(
                          expense.status
                        )}`}
                      >
                        {expense.status || "Draft"}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {expense.status === "Submitted" && (
                          <>
                            <button
                              type="button"
                              disabled={actionLoadingId === expense.id}
                              onClick={() =>
                                handleStatusChange(expense.id, "Approved")
                              }
                              className="flex h-9 w-9 items-center justify-center rounded-md bg-[#E9F9EF] text-[#28C76F] transition hover:opacity-80 disabled:opacity-50"
                              title="Approve"
                            >
                              {actionLoadingId === expense.id ? (
                                <Loader2 size={17} className="animate-spin" />
                              ) : (
                                <Check size={17} />
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={actionLoadingId === expense.id}
                              onClick={() =>
                                handleStatusChange(expense.id, "Rejected")
                              }
                              className="flex h-9 w-9 items-center justify-center rounded-md bg-[#FCEAEA] text-[#EA5455] transition hover:opacity-80 disabled:opacity-50"
                              title="Reject"
                            >
                              <X size={17} />
                            </button>
                          </>
                        )}

                        {(expense.status === "Draft" ||
                          expense.status === "Approved" ||
                          expense.status === "Rejected") && (
                          <span className={`text-[13px] ${mutedClass}`}>-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className={`rounded-md border p-5 ${cardClass}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E9F9EF] text-[#28C76F]">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <p className={`text-[15px] font-semibold ${mainTextClass}`}>
                Approval Flow
              </p>
              <p className={`mt-1 text-[13px] ${mutedClass}`}>
                Draft / Submitted → Approved or Rejected by admin.
              </p>
            </div>
          </div>
        </div>

        <div className={`rounded-md border p-5 ${cardClass}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#FFF4E5] text-[#FF9F43]">
              <Upload size={22} />
            </div>
            <div>
              <p className={`text-[15px] font-semibold ${mainTextClass}`}>
                Proof Control
              </p>
              <p className={`mt-1 text-[13px] ${mutedClass}`}>
                Attach bill, screenshot, cash voucher or deposit proof.
              </p>
            </div>
          </div>
        </div>

        <div className={`rounded-md border p-5 ${cardClass}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E6FAFD] text-[#00CFE8]">
              <Wallet size={22} />
            </div>
            <div>
              <p className={`text-[15px] font-semibold ${mainTextClass}`}>
                Cashbook Impact
              </p>
              <p className={`mt-1 text-[13px] ${mutedClass}`}>
                Approved cash expenses should reduce expected closing cash.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyCashExpenses;
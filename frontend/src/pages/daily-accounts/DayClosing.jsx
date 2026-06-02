import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Filter,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Send,
  Store,
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
  closing_date: todayISO(),
  sales_confirmed: 0,
  expenses_confirmed: 0,
  purchases_confirmed: 0,
  proofs_uploaded: 0,
  actual_cash_in_hand: "",
  manager_remarks: "",
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
  if (status === "Verified") return "bg-[#E9F9EF] text-[#28C76F]";
  if (status === "Rejected") return "bg-[#FCEAEA] text-[#EA5455]";
  if (status === "Submitted") return "bg-[#E6FAFD] text-[#00A6B7]";
  if (status === "Locked") return "bg-[#F0EEFF] text-[#7367F0]";
  return "bg-[#FFF4E5] text-[#FF9F43]";
};

const confirmationItems = [
  {
    key: "sales_confirmed",
    label: "Sales entries confirmed",
    short: "Sales",
    color: "#28C76F",
  },
  {
    key: "expenses_confirmed",
    label: "Expense entries confirmed",
    short: "Expenses",
    color: "#FF9F43",
  },
  {
    key: "purchases_confirmed",
    label: "Purchase entries confirmed",
    short: "Purchases",
    color: "#7367F0",
  },
  {
    key: "proofs_uploaded",
    label: "All proofs uploaded",
    short: "Proofs",
    color: "#00CFE8",
  },
];

const DayClosing = () => {
  const [closings, setClosings] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(initialForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [outletFilter, setOutletFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
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
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);

    try {
      await Promise.all([fetchClosings(), fetchOutlets()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchClosings = async () => {
    try {
      const response = await dailyAccountsAPI.getDayClosings();
      setClosings(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch day closings");
    }
  };

  const fetchOutlets = async () => {
    try {
      const response = await masterAPI.getOutlets();
      setOutlets(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch outlets");
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
  };

  const confirmationCount = useMemo(() => {
    return confirmationItems.reduce(
      (sum, item) => sum + (Number(formData[item.key]) === 1 ? 1 : 0),
      0
    );
  }, [formData]);

  const confirmationPercent = Math.round(
    (confirmationCount / confirmationItems.length) * 100
  );

  const filteredClosings = useMemo(() => {
    return closings.filter((closing) => {
      const text = `${closing.outlet_name || ""} ${closing.status || ""} ${
        closing.manager_remarks || ""
      } ${closing.closing_date || ""}`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const outletMatch =
        outletFilter === "all" ||
        String(closing.outlet_id) === String(outletFilter);

      const statusMatch =
        statusFilter === "all" || closing.status === statusFilter;

      const dateMatch =
        !dateFilter ||
        String(closing.closing_date || "").slice(0, 10) ===
          String(dateFilter).slice(0, 10);

      return searchMatch && outletMatch && statusMatch && dateMatch;
    });
  }, [closings, searchTerm, outletFilter, statusFilter, dateFilter]);

  const summary = useMemo(() => {
    const totalCash = filteredClosings.reduce(
      (sum, row) => sum + num(row.actual_cash_in_hand),
      0
    );

    const submitted = filteredClosings.filter(
      (row) => row.status === "Submitted"
    ).length;

    const verified = filteredClosings.filter(
      (row) => row.status === "Verified"
    ).length;

    const locked = filteredClosings.filter((row) => row.status === "Locked").length;

    const rejected = filteredClosings.filter(
      (row) => row.status === "Rejected"
    ).length;

    return {
      totalCash,
      submitted,
      verified,
      locked,
      rejected,
      total: filteredClosings.length,
    };
  }, [filteredClosings]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.outlet_id) {
      toast.error("Please select outlet");
      return;
    }

    if (!formData.closing_date) {
      toast.error("Please select closing date");
      return;
    }

    if (formData.actual_cash_in_hand === "" || num(formData.actual_cash_in_hand) < 0) {
      toast.error("Please enter valid actual cash in hand");
      return;
    }

    if (confirmationCount < confirmationItems.length) {
      toast.error("Please complete all confirmations before submitting");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        outlet_id: formData.outlet_id,
        closing_date: formData.closing_date,
        sales_confirmed: Number(formData.sales_confirmed),
        expenses_confirmed: Number(formData.expenses_confirmed),
        purchases_confirmed: Number(formData.purchases_confirmed),
        proofs_uploaded: Number(formData.proofs_uploaded),
        actual_cash_in_hand: num(formData.actual_cash_in_hand),
        manager_remarks: formData.manager_remarks || "",
      };

      await dailyAccountsAPI.createDayClosing(payload);

      toast.success("Day closing submitted successfully");
      setShowForm(false);
      resetForm();
      await fetchClosings();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to submit day closing");
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async (id, status) => {
    setActionLoadingId(`${id}-${status}`);

    try {
      await dailyAccountsAPI.verifyDayClosing(id, { status });
      toast.success(`Day closing ${status.toLowerCase()} successfully`);
      await fetchClosings();
    } catch (error) {
      toast.error(error.response?.data?.message || "Verification failed");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleExport = () => {
    const headers = [
      "Date",
      "Outlet",
      "Actual Cash",
      "Sales Confirmed",
      "Expenses Confirmed",
      "Purchases Confirmed",
      "Proofs Uploaded",
      "Status",
      "Manager Remarks",
    ];

    const rows = filteredClosings.map((closing) => [
      formatDate(closing.closing_date),
      closing.outlet_name || "",
      closing.actual_cash_in_hand || 0,
      closing.sales_confirmed ? "Yes" : "No",
      closing.expenses_confirmed ? "Yes" : "No",
      closing.purchases_confirmed ? "Yes" : "No",
      closing.proofs_uploaded ? "Yes" : "No",
      closing.status || "",
      closing.manager_remarks || "",
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
    link.download = "day-closing-report.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Day closing report exported");
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

  const ConfirmationPill = ({ checked, label }) => (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        checked
          ? "bg-[#E9F9EF] text-[#28C76F]"
          : "bg-[#F3F2F7] text-[#A8AAAE]"
      }`}
    >
      {checked ? <Check size={13} /> : <X size={13} />}
      {label}
    </span>
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
            Day Closing
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Submit, verify and lock outlet day closing after sales, expenses,
            purchases and proofs are confirmed.
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
            {showForm ? <X size={18} /> : <Lock size={18} />}
            {showForm ? "Close Form" : "Submit Day Closing"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total Closing"
          value={summary.total}
          subtitle="Filtered entries"
          icon={FileText}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />

        <StatCard
          title="Submitted"
          value={summary.submitted}
          subtitle="Waiting for verification"
          icon={Clock}
          color="#00CFE8"
          bg="#E6FAFD"
        />

        <StatCard
          title="Verified"
          value={summary.verified}
          subtitle="Verified by admin"
          icon={CheckCircle2}
          color="#28C76F"
          bg="#E9F9EF"
        />

        <StatCard
          title="Locked"
          value={summary.locked}
          subtitle="Month-end safe entries"
          icon={Lock}
          color="#7367F0"
          bg="#F0EEFF"
        />

        <StatCard
          title="Cash in Hand"
          value={formatCompactINR(summary.totalCash)}
          subtitle="Filtered actual cash"
          icon={Wallet}
          color="#FF9F43"
          bg="#FFF4E5"
        />
      </div>

      {showForm && (
        <div
          className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
        >
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                New Day Closing
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Complete all confirmations before submitting day closing.
              </p>
            </div>

            <div
              className="rounded-md px-4 py-2 text-[14px] font-semibold"
              style={{
                color: confirmationPercent === 100 ? "#28C76F" : primaryColor,
                backgroundColor:
                  confirmationPercent === 100 ? "#E9F9EF" : `${primaryColor}18`,
              }}
            >
              Completion: {confirmationPercent}%
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                  Closing Date *
                </label>
                <div className="relative">
                  <Calendar
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]"
                  />
                  <input
                    type="date"
                    value={formData.closing_date}
                    onChange={(event) =>
                      updateField("closing_date", event.target.value)
                    }
                    className={`h-11 w-full rounded-md border pl-11 pr-4 text-[14px] outline-none ${inputClass}`}
                    required
                  />
                </div>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Actual Cash in Hand *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.actual_cash_in_hand}
                  onChange={(event) =>
                    updateField("actual_cash_in_hand", event.target.value)
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div className="rounded-md border border-[#EBE9F1] p-5">
              <div className="mb-5">
                <h4 className={`text-[18px] font-semibold ${mainTextClass}`}>
                  Closing Confirmations
                </h4>
                <p className={`mt-1 text-[13px] ${mutedClass}`}>
                  Outlet manager must confirm each operational section before submission.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {confirmationItems.map((item) => {
                  const checked = Number(formData[item.key]) === 1;

                  return (
                    <label
                      key={item.key}
                      className={`cursor-pointer rounded-md border p-4 transition ${
                        checked
                          ? "border-[#28C76F] bg-[#E9F9EF]"
                          : "border-[#DBDADE] bg-[#F8F7FA]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p
                            className={`text-[15px] font-semibold ${
                              checked ? "text-[#28C76F]" : "text-[#2F2B3D]"
                            }`}
                          >
                            {item.short}
                          </p>
                          <p className="mt-1 text-[13px] text-[#6F6B7D]">
                            {item.label}
                          </p>
                        </div>

                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            updateField(item.key, event.target.checked ? 1 : 0)
                          }
                          className="h-5 w-5 accent-[#28C76F]"
                        />
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#F3F2F7]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${confirmationPercent}%`,
                    backgroundColor:
                      confirmationPercent === 100 ? "#28C76F" : primaryColor,
                  }}
                />
              </div>
            </div>

            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                Manager Remarks
              </label>
              <textarea
                value={formData.manager_remarks}
                onChange={(event) =>
                  updateField("manager_remarks", event.target.value)
                }
                className={`min-h-[100px] w-full rounded-md border px-4 py-3 text-[14px] outline-none ${inputClass}`}
                placeholder="Cash shortage/excess notes, missing proof reason, manager confirmation..."
              />
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
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    Submit Day Closing
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
              Day Closing History
            </h3>
            <p className={`mt-1 text-[14px] ${mutedClass}`}>
              Search, filter, verify and lock day closing entries.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                <option value="Open">Open</option>
                <option value="Submitted">Submitted</option>
                <option value="Verified">Verified</option>
                <option value="Rejected">Rejected</option>
                <option value="Locked">Locked</option>
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
                Loading day closings...
              </p>
            </div>
          </div>
        ) : filteredClosings.length === 0 ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-md border border-dashed border-[#DBDADE]">
            <div className="text-center">
              <Lock size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No day closings found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Submit day closing or adjust your filters.
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
                    "Cash in Hand",
                    "Confirmations",
                    "Status",
                    "Manager Remarks",
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
                {filteredClosings.map((closing) => (
                  <tr
                    key={closing.id}
                    className={`transition hover:bg-[#F8F7FA] ${
                      isDark
                        ? "border-b border-[#3B405A]"
                        : "border-b border-[#EBE9F1]"
                    }`}
                  >
                    <td className={`px-4 py-4 text-[14px] ${mainTextClass}`}>
                      {formatDate(closing.closing_date)}
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
                            {closing.outlet_name || "-"}
                          </p>
                          <p className={`text-[12px] ${mutedClass}`}>
                            Outlet ID: {closing.outlet_id || "-"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className={`px-4 py-4 text-[14px] font-semibold ${mainTextClass}`}>
                      {formatINR(closing.actual_cash_in_hand)}
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        <ConfirmationPill
                          checked={Boolean(closing.sales_confirmed)}
                          label="S"
                        />
                        <ConfirmationPill
                          checked={Boolean(closing.expenses_confirmed)}
                          label="E"
                        />
                        <ConfirmationPill
                          checked={Boolean(closing.purchases_confirmed)}
                          label="P"
                        />
                        <ConfirmationPill
                          checked={Boolean(closing.proofs_uploaded)}
                          label="Pr"
                        />
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-[12px] font-semibold ${getStatusClass(
                          closing.status
                        )}`}
                      >
                        {closing.status || "Open"}
                      </span>
                    </td>

                    <td className={`max-w-[260px] px-4 py-4 text-[13px] ${mutedClass}`}>
                      <span className="line-clamp-2">
                        {closing.manager_remarks || "-"}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {closing.status === "Submitted" && (
                          <>
                            <button
                              type="button"
                              disabled={actionLoadingId === `${closing.id}-Verified`}
                              onClick={() => handleVerify(closing.id, "Verified")}
                              className="flex h-9 w-9 items-center justify-center rounded-md bg-[#E9F9EF] text-[#28C76F] transition hover:opacity-80 disabled:opacity-50"
                              title="Verify"
                            >
                              {actionLoadingId === `${closing.id}-Verified` ? (
                                <Loader2 size={17} className="animate-spin" />
                              ) : (
                                <Check size={17} />
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={actionLoadingId === `${closing.id}-Rejected`}
                              onClick={() => handleVerify(closing.id, "Rejected")}
                              className="flex h-9 w-9 items-center justify-center rounded-md bg-[#FCEAEA] text-[#EA5455] transition hover:opacity-80 disabled:opacity-50"
                              title="Reject"
                            >
                              {actionLoadingId === `${closing.id}-Rejected` ? (
                                <Loader2 size={17} className="animate-spin" />
                              ) : (
                                <X size={17} />
                              )}
                            </button>
                          </>
                        )}

                        {closing.status === "Verified" && (
                          <button
                            type="button"
                            disabled={actionLoadingId === `${closing.id}-Locked`}
                            onClick={() => handleVerify(closing.id, "Locked")}
                            className="flex h-9 w-9 items-center justify-center rounded-md text-white transition hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: primaryColor }}
                            title="Lock"
                          >
                            {actionLoadingId === `${closing.id}-Locked` ? (
                              <Loader2 size={17} className="animate-spin" />
                            ) : (
                              <Lock size={17} />
                            )}
                          </button>
                        )}

                        {(closing.status === "Locked" ||
                          closing.status === "Rejected" ||
                          closing.status === "Open") && (
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
                Verification Flow
              </p>
              <p className={`mt-1 text-[13px] ${mutedClass}`}>
                Submitted → Verified / Rejected → Locked.
              </p>
            </div>
          </div>
        </div>

        <div className={`rounded-md border p-5 ${cardClass}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#FFF4E5] text-[#FF9F43]">
              <AlertTriangle size={22} />
            </div>
            <div>
              <p className={`text-[15px] font-semibold ${mainTextClass}`}>
                Before Closing
              </p>
              <p className={`mt-1 text-[13px] ${mutedClass}`}>
                Confirm sales, expenses, purchases and all proof uploads.
              </p>
            </div>
          </div>
        </div>

        <div className={`rounded-md border p-5 ${cardClass}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#F0EEFF] text-[#7367F0]">
              <Lock size={22} />
            </div>
            <div>
              <p className={`text-[15px] font-semibold ${mainTextClass}`}>
                Locked Entries
              </p>
              <p className={`mt-1 text-[13px] ${mutedClass}`}>
                Locked day closings are ready for month-end reporting.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayClosing;
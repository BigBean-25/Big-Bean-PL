import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Smartphone,
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

const initialForm = () => ({
  date: new Date().toISOString().split("T")[0],
  outlet_id: "",
  opening_cash: 0,
  cash_sales: 0,
  card_sales: 0,
  upi_sales: 0,
  zomato_sales: 0,
  swiggy_sales: 0,
  own_app_sales: 0,
  ownly_sales: 0,
  swiggy_dineout_sales: 0,
  zomato_dining_sales: 0,
  district_sales: 0,
  eazydiner_sales: 0,
  other_sales: 0,
  cash_expenses: 0,
  bank_deposit: 0,
  cash_transfer_to_ho: 0,
  actual_cash_in_hand: 0,
  remarks: "",
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

const formatDate = (date) => {
  if (!date) return "-";

  try {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return date;
  }
};

const getStatusClass = (status) => {
  if (status === "Verified" || status === "Approved") {
    return "bg-[#E9F9EF] text-[#28C76F]";
  }

  if (status === "Rejected") {
    return "bg-[#FCEAEA] text-[#EA5455]";
  }

  if (status === "Submitted") {
    return "bg-[#E6FAFD] text-[#00A6B7]";
  }

  if (status === "Locked") {
    return "bg-[#F3F2F7] text-[#6F6B7D]";
  }

  return "bg-[#FFF4E5] text-[#FF9F43]";
};

const salesFields = [
  {
    key: "cash_sales",
    label: "Cash Sales",
    icon: Banknote,
    color: "#28C76F",
  },
  {
    key: "card_sales",
    label: "Card Sales",
    icon: CreditCard,
    color: "#7367F0",
  },
  {
    key: "upi_sales",
    label: "UPI Sales",
    icon: Smartphone,
    color: "#00CFE8",
  },
  {
    key: "zomato_sales",
    label: "Zomato Sales",
    icon: Store,
    color: "#EA5455",
  },
  {
    key: "swiggy_sales",
    label: "Swiggy Sales",
    icon: Store,
    color: "#FF9F43",
  },
  {
    key: "own_app_sales",
    label: "Own App Sales",
    icon: Smartphone,
    color: "#28C76F",
  },
  {
    key: "ownly_sales",
    label: "Ownly Sales",
    icon: Store,
    color: "#7367F0",
  },
  {
    key: "swiggy_dineout_sales",
    label: "Swiggy Dineout",
    icon: Store,
    color: "#FF9F43",
  },
  {
    key: "zomato_dining_sales",
    label: "Zomato Dining",
    icon: Store,
    color: "#EA5455",
  },
  {
    key: "district_sales",
    label: "District Sales",
    icon: Store,
    color: "#00CFE8",
  },
  {
    key: "eazydiner_sales",
    label: "EazyDiner Sales",
    icon: Store,
    color: "#7367F0",
  },
  {
    key: "other_sales",
    label: "Other Sales",
    icon: Wallet,
    color: "#6F6B7D",
  },
];

const DailyCashbook = () => {
  const [cashbooks, setCashbooks] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [outletFilter, setOutletFilter] = useState("all");
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
      await Promise.all([fetchCashbooks(), fetchOutlets()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCashbooks = async () => {
    try {
      const response = await dailyAccountsAPI.getCashbooks();
      const rows = response?.data?.data || response?.data || [];
      setCashbooks(Array.isArray(rows) ? rows : []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch cashbooks");
    }
  };

  const fetchOutlets = async () => {
    try {
      const response = await masterAPI.getOutlets();
      const rows = response?.data?.data || response?.data || [];
      setOutlets(Array.isArray(rows) ? rows : []);
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

  const totalSales = useMemo(() => {
    return salesFields.reduce((sum, field) => sum + num(formData[field.key]), 0);
  }, [formData]);

  const expectedClosingCash = useMemo(() => {
    return (
      num(formData.opening_cash) +
      num(formData.cash_sales) -
      num(formData.cash_expenses) -
      num(formData.bank_deposit) -
      num(formData.cash_transfer_to_ho)
    );
  }, [formData]);

  const cashDifference = useMemo(() => {
    return num(formData.actual_cash_in_hand) - expectedClosingCash;
  }, [formData.actual_cash_in_hand, expectedClosingCash]);

  const filteredCashbooks = useMemo(() => {
    return cashbooks.filter((item) => {
      const text = `${item.outlet_name || ""} ${item.status || ""} ${
        item.date || ""
      }`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const statusMatch =
        statusFilter === "all" || item.status === statusFilter;

      const outletMatch =
        outletFilter === "all" || String(item.outlet_id) === String(outletFilter);

      const dateMatch =
        !dateFilter ||
        String(item.date || "").slice(0, 10) === String(dateFilter).slice(0, 10);

      return searchMatch && statusMatch && outletMatch && dateMatch;
    });
  }, [cashbooks, searchTerm, statusFilter, outletFilter, dateFilter]);

  const summary = useMemo(() => {
    const totalSalesValue = filteredCashbooks.reduce(
      (sum, row) => sum + num(row.total_sales),
      0
    );

    const totalActualCash = filteredCashbooks.reduce(
      (sum, row) => sum + num(row.actual_cash_in_hand),
      0
    );

    const totalExpectedCash = filteredCashbooks.reduce(
      (sum, row) => sum + num(row.closing_cash),
      0
    );

    const totalDifference = filteredCashbooks.reduce(
      (sum, row) => sum + num(row.cash_difference),
      0
    );

    const pendingCount = filteredCashbooks.filter(
      (row) => row.status !== "Verified" && row.status !== "Locked"
    ).length;

    return {
      totalSalesValue,
      totalActualCash,
      totalExpectedCash,
      totalDifference,
      pendingCount,
    };
  }, [filteredCashbooks]);

  const resetForm = () => {
    setFormData(initialForm());
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.date) {
      toast.error("Please select date");
      return;
    }

    if (!formData.outlet_id) {
      toast.error("Please select outlet");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        ...formData,
        opening_cash: num(formData.opening_cash),
        cash_sales: num(formData.cash_sales),
        card_sales: num(formData.card_sales),
        upi_sales: num(formData.upi_sales),
        zomato_sales: num(formData.zomato_sales),
        swiggy_sales: num(formData.swiggy_sales),
        own_app_sales: num(formData.own_app_sales),
        ownly_sales: num(formData.ownly_sales),
        swiggy_dineout_sales: num(formData.swiggy_dineout_sales),
        zomato_dining_sales: num(formData.zomato_dining_sales),
        district_sales: num(formData.district_sales),
        eazydiner_sales: num(formData.eazydiner_sales),
        other_sales: num(formData.other_sales),
        cash_expenses: num(formData.cash_expenses),
        bank_deposit: num(formData.bank_deposit),
        cash_transfer_to_ho: num(formData.cash_transfer_to_ho),
        actual_cash_in_hand: num(formData.actual_cash_in_hand),
      };

      await dailyAccountsAPI.createCashbook(payload);

      toast.success("Cashbook entry saved successfully");
      setShowForm(false);
      resetForm();
      await fetchCashbooks();
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to save cashbook entry"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const headers = [
      "Date",
      "Outlet",
      "Total Sales",
      "Cash Expenses",
      "Closing Cash",
      "Actual Cash",
      "Difference",
      "Status",
    ];

    const rows = filteredCashbooks.map((row) => [
      formatDate(row.date),
      row.outlet_name || "",
      row.total_sales || 0,
      row.cash_expenses || 0,
      row.closing_cash || 0,
      row.actual_cash_in_hand || 0,
      row.cash_difference || 0,
      row.status || "",
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
    link.download = "daily-cashbook-report.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Cashbook exported");
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
            Daily Cashbook
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Manage daily sales, cash movement, closing cash and verification.
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
            {showForm ? "Close Form" : "Add Cashbook Entry"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total Sales"
          value={formatCompactINR(summary.totalSalesValue)}
          subtitle="Filtered cashbook sales"
          icon={Wallet}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />

        <StatCard
          title="Expected Cash"
          value={formatCompactINR(summary.totalExpectedCash)}
          subtitle="System closing cash"
          icon={Banknote}
          color="#28C76F"
          bg="#E9F9EF"
        />

        <StatCard
          title="Actual Cash"
          value={formatCompactINR(summary.totalActualCash)}
          subtitle="Cash physically available"
          icon={CheckCircle2}
          color="#00CFE8"
          bg="#E6FAFD"
        />

        <StatCard
          title="Difference"
          value={formatCompactINR(summary.totalDifference)}
          subtitle="Actual minus expected"
          icon={AlertTriangle}
          color={summary.totalDifference < 0 ? "#EA5455" : "#28C76F"}
          bg={summary.totalDifference < 0 ? "#FCEAEA" : "#E9F9EF"}
        />

        <StatCard
          title="Pending"
          value={summary.pendingCount}
          subtitle="Need verification"
          icon={Clock}
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
                New Cashbook Entry
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Enter outlet-wise sales and cash closing details.
              </p>
            </div>

            <div className="rounded-md px-4 py-2 text-[14px] font-medium text-[#28C76F] bg-[#E9F9EF]">
              Auto calculated total: {formatINR(totalSales)}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Date *
                </label>
                <div className="relative">
                  <Calendar
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]"
                  />
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(event) => updateField("date", event.target.value)}
                    className={`h-11 w-full rounded-md border pl-11 pr-4 text-[14px] outline-none ${inputClass}`}
                    required
                  />
                </div>
              </div>

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
                  Opening Cash
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.opening_cash}
                  onChange={(event) => updateField("opening_cash", event.target.value)}
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Cash Expenses
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.cash_expenses}
                  onChange={(event) => updateField("cash_expenses", event.target.value)}
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                />
              </div>
            </div>

            <div className="rounded-md border border-[#EBE9F1] p-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h4 className={`text-[18px] font-semibold ${mainTextClass}`}>
                    Sales Breakdown
                  </h4>
                  <p className={`mt-1 text-[13px] ${mutedClass}`}>
                    Cash, card, UPI, online and dine-in portal sales.
                  </p>
                </div>

                <span
                  className="rounded px-3 py-1.5 text-[14px] font-semibold"
                  style={{
                    color: primaryColor,
                    backgroundColor: `${primaryColor}18`,
                  }}
                >
                  {formatINR(totalSales)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {salesFields.map((field) => {
                  const Icon = field.icon;

                  return (
                    <div key={field.key}>
                      <label
                        className={`mb-2 flex items-center gap-2 text-[14px] font-medium ${mainTextClass}`}
                      >
                        <Icon size={16} style={{ color: field.color }} />
                        {field.label}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData[field.key]}
                        onChange={(event) =>
                          updateField(field.key, event.target.value)
                        }
                        className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-md border border-[#EBE9F1] p-5">
              <div className="mb-5">
                <h4 className={`text-[18px] font-semibold ${mainTextClass}`}>
                  Cash Movement & Variance
                </h4>
                <p className={`mt-1 text-[13px] ${mutedClass}`}>
                  Closing cash is calculated automatically from opening cash, cash sales,
                  cash expenses, bank deposit and cash transfer to HO.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                    Bank Deposit
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.bank_deposit}
                    onChange={(event) => updateField("bank_deposit", event.target.value)}
                    className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  />
                </div>

                <div>
                  <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                    Cash Transfer to HO
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cash_transfer_to_ho}
                    onChange={(event) =>
                      updateField("cash_transfer_to_ho", event.target.value)
                    }
                    className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  />
                </div>

                <div>
                  <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                    Actual Cash in Hand
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.actual_cash_in_hand}
                    onChange={(event) =>
                      updateField("actual_cash_in_hand", event.target.value)
                    }
                    className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-md bg-[#F8F7FA] p-4">
                  <p className="text-[13px] font-medium text-[#6F6B7D]">
                    Expected Closing Cash
                  </p>
                  <p className="mt-1 text-[22px] font-semibold text-[#2F2B3D]">
                    {formatINR(expectedClosingCash)}
                  </p>
                </div>

                <div className="rounded-md bg-[#F8F7FA] p-4">
                  <p className="text-[13px] font-medium text-[#6F6B7D]">
                    Actual Cash
                  </p>
                  <p className="mt-1 text-[22px] font-semibold text-[#2F2B3D]">
                    {formatINR(formData.actual_cash_in_hand)}
                  </p>
                </div>

                <div
                  className="rounded-md p-4"
                  style={{
                    backgroundColor:
                      cashDifference < 0
                        ? "#FCEAEA"
                        : cashDifference > 0
                        ? "#FFF4E5"
                        : "#E9F9EF",
                  }}
                >
                  <p
                    className="text-[13px] font-medium"
                    style={{
                      color:
                        cashDifference < 0
                          ? "#EA5455"
                          : cashDifference > 0
                          ? "#FF9F43"
                          : "#28C76F",
                    }}
                  >
                    Cash Difference
                  </p>
                  <p
                    className="mt-1 text-[22px] font-semibold"
                    style={{
                      color:
                        cashDifference < 0
                          ? "#EA5455"
                          : cashDifference > 0
                          ? "#FF9F43"
                          : "#28C76F",
                    }}
                  >
                    {formatINR(cashDifference)}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                Remarks
              </label>
              <textarea
                value={formData.remarks}
                onChange={(event) => updateField("remarks", event.target.value)}
                className={`min-h-[90px] w-full rounded-md border px-4 py-3 text-[14px] outline-none ${inputClass}`}
                placeholder="Manager remarks, shortage/excess reason, deposit notes..."
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
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Save Cashbook Entry
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
              Cashbook Entries
            </h3>
            <p className={`mt-1 text-[14px] ${mutedClass}`}>
              Search, filter and review outlet cashbook entries.
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
                placeholder="Search outlet/status..."
                className={`h-11 w-full rounded-md border pl-11 pr-4 text-[14px] outline-none ${inputClass}`}
              />
            </div>

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
                <option value="Verified">Verified</option>
                <option value="Rejected">Rejected</option>
                <option value="Locked">Locked</option>
              </select>
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
                Loading cashbook entries...
              </p>
            </div>
          </div>
        ) : filteredCashbooks.length === 0 ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-md border border-dashed border-[#DBDADE]">
            <div className="text-center">
              <FileSpreadsheet size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No cashbook entries found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Create a new entry or adjust your filters.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className={isDark ? "border-b border-[#3B405A]" : "border-b border-[#EBE9F1]"}>
                  {[
                    "Date",
                    "Outlet",
                    "Total Sales",
                    "Cash Expenses",
                    "Closing Cash",
                    "Actual Cash",
                    "Difference",
                    "Status",
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
                {filteredCashbooks.map((cashbook) => {
                  const diff = num(cashbook.cash_difference);

                  return (
                    <tr
                      key={cashbook.id}
                      className={`transition hover:bg-[#F8F7FA] ${
                        isDark ? "border-b border-[#3B405A]" : "border-b border-[#EBE9F1]"
                      }`}
                    >
                      <td className={`px-4 py-4 text-[14px] ${mainTextClass}`}>
                        {formatDate(cashbook.date)}
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
                              {cashbook.outlet_name || "-"}
                            </p>
                            <p className={`text-[12px] ${mutedClass}`}>
                              Outlet ID: {cashbook.outlet_id || "-"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className={`px-4 py-4 text-[14px] font-semibold ${mainTextClass}`}>
                        {formatINR(cashbook.total_sales)}
                      </td>

                      <td className={`px-4 py-4 text-[14px] ${mainTextClass}`}>
                        {formatINR(cashbook.cash_expenses)}
                      </td>

                      <td className={`px-4 py-4 text-[14px] ${mainTextClass}`}>
                        {formatINR(cashbook.closing_cash)}
                      </td>

                      <td className={`px-4 py-4 text-[14px] ${mainTextClass}`}>
                        {formatINR(cashbook.actual_cash_in_hand)}
                      </td>

                      <td
                        className="px-4 py-4 text-[14px] font-semibold"
                        style={{
                          color:
                            diff < 0 ? "#EA5455" : diff > 0 ? "#FF9F43" : "#28C76F",
                        }}
                      >
                        {formatINR(diff)}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-[12px] font-semibold ${getStatusClass(
                            cashbook.status
                          )}`}
                        >
                          {cashbook.status || "Draft"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
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
                Formula Used
              </p>
              <p className={`mt-1 text-[13px] ${mutedClass}`}>
                Opening Cash + Cash Sales - Cash Expenses - Bank Deposit - HO Transfer
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
                Variance Check
              </p>
              <p className={`mt-1 text-[13px] ${mutedClass}`}>
                Difference = Actual Cash - System Closing Cash
              </p>
            </div>
          </div>
        </div>

        <div className={`rounded-md border p-5 ${cardClass}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#E6FAFD] text-[#00CFE8]">
              <Send size={22} />
            </div>
            <div>
              <p className={`text-[15px] font-semibold ${mainTextClass}`}>
                Verification Flow
              </p>
              <p className={`mt-1 text-[13px] ${mutedClass}`}>
                Draft → Submitted → Verified / Rejected / Locked
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyCashbook;
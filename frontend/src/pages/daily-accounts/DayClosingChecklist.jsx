import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Calculator,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Smartphone,
  Store,
  Trash2,
  Wallet,
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
  date: todayISO(),
  outlet_id: "",

  sales: 0,
  nob: 0,
  abv: 0,
  mtd_gross_sale: 0,
  mtd_aspd: 0,

  cash: 0,
  card: 0,
  upi: 0,
  zomato: 0,
  swiggy: 0,
  swiggy_dining: 0,
  zomato_dining: 0,
  district: 0,
  easy_dine_out: 0,

  opening_cash: 0,
  total_cash_expenses: 0,
  closing_cash: 0,

  expense_items: [],
  remarks: "",
});

const paymentFields = [
  { key: "cash", label: "Cash", icon: Wallet, color: "#28C76F" },
  { key: "card", label: "Card", icon: CreditCard, color: "#7367F0" },
  { key: "upi", label: "UPI", icon: Smartphone, color: "#00CFE8" },
  { key: "zomato", label: "Zomato", icon: Store, color: "#EA5455" },
  { key: "swiggy", label: "Swiggy", icon: Store, color: "#FF9F43" },
  {
    key: "swiggy_dining",
    label: "Swiggy Dining",
    icon: Store,
    color: "#FF9F43",
  },
  {
    key: "zomato_dining",
    label: "Zomato Dining",
    icon: Store,
    color: "#EA5455",
  },
  { key: "district", label: "District", icon: Store, color: "#00CFE8" },
  {
    key: "easy_dine_out",
    label: "Easy Dine Out",
    icon: Store,
    color: "#7367F0",
  },
];

const num = (value) => Number(value || 0);

const getRows = (response) => {
  const rows = response?.data?.data || response?.data || [];
  return Array.isArray(rows) ? rows : [];
};

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

const DayClosingChecklist = () => {
  const [outlets, setOutlets] = useState([]);
  const [formData, setFormData] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    fetchOutlets();
  }, []);

  const fetchOutlets = async () => {
    setLoading(true);

    try {
      const response = await masterAPI.getOutlets();
      setOutlets(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch outlets");
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const totalPaymentModes = useMemo(() => {
    return paymentFields.reduce((sum, field) => sum + num(formData[field.key]), 0);
  }, [formData]);

  const calculatedABV = useMemo(() => {
    if (num(formData.nob) <= 0) return 0;
    return num(formData.sales) / num(formData.nob);
  }, [formData.sales, formData.nob]);

  const itemizedExpenseTotal = useMemo(() => {
    return formData.expense_items.reduce(
      (sum, item) => sum + num(item.amount),
      0
    );
  }, [formData.expense_items]);

  const paymentDifference = useMemo(() => {
    return totalPaymentModes - num(formData.sales);
  }, [totalPaymentModes, formData.sales]);

  const expenseDifference = useMemo(() => {
    return itemizedExpenseTotal - num(formData.total_cash_expenses);
  }, [itemizedExpenseTotal, formData.total_cash_expenses]);

  const calculatedClosingCash = useMemo(() => {
    return (
      num(formData.opening_cash) +
      num(formData.cash) -
      num(formData.total_cash_expenses)
    );
  }, [formData.opening_cash, formData.cash, formData.total_cash_expenses]);

  const closingDifference = useMemo(() => {
    return num(formData.closing_cash) - calculatedClosingCash;
  }, [formData.closing_cash, calculatedClosingCash]);

  const salesOk = num(formData.sales) > 0 && num(formData.nob) > 0;
  const paymentOk = Math.abs(paymentDifference) <= 1;
  const expenseOk =
    itemizedExpenseTotal === 0 || Math.abs(expenseDifference) <= 1;
  const cashOk = Math.abs(closingDifference) <= 1;

  const completionCount = [salesOk, paymentOk, expenseOk, cashOk].filter(
    Boolean
  ).length;

  const completionPercent = Math.round((completionCount / 4) * 100);

  const addExpenseItem = () => {
    setFormData((prev) => ({
      ...prev,
      expense_items: [
        ...prev.expense_items,
        {
          description: "",
          amount: 0,
        },
      ],
    }));
  };

  const updateExpenseItem = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.expense_items];
      updated[index] = {
        ...updated[index],
        [field]: value,
      };

      return {
        ...prev,
        expense_items: updated,
      };
    });
  };

  const removeExpenseItem = (index) => {
    setFormData((prev) => ({
      ...prev,
      expense_items: prev.expense_items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const useItemizedExpenseTotal = () => {
    updateField("total_cash_expenses", itemizedExpenseTotal.toFixed(2));
    toast.success("Itemized expense total applied");
  };

  const resetForm = () => {
    setFormData(initialForm());
  };

  const buildRemarks = () => {
    const expenseLines =
      formData.expense_items.length > 0
        ? formData.expense_items
            .map(
              (item, index) =>
                `${index + 1}. ${item.description || "Expense"} - ${formatINR(
                  item.amount
                )}`
            )
            .join("\n")
        : "No itemized expenses added";

    return `
${formData.remarks || ""}

--- BIG BEAN DAILY CLOSING CHECKLIST ---

Date: ${formData.date}
Outlet ID: ${formData.outlet_id}

SALES:
Sales: ${formatINR(formData.sales)}
NOB: ${formData.nob}
ABV Entered: ${formatINR(formData.abv)}
ABV Calculated: ${formatINR(calculatedABV)}
MTD Gross Sale: ${formatINR(formData.mtd_gross_sale)}
MTD ASPD: ${formatINR(formData.mtd_aspd)}

PAYMENT MODE SUMMARY:
Cash: ${formatINR(formData.cash)}
Card: ${formatINR(formData.card)}
UPI: ${formatINR(formData.upi)}
Zomato: ${formatINR(formData.zomato)}
Swiggy: ${formatINR(formData.swiggy)}
Swiggy Dining: ${formatINR(formData.swiggy_dining)}
Zomato Dining: ${formatINR(formData.zomato_dining)}
District: ${formatINR(formData.district)}
Easy Dine Out: ${formatINR(formData.easy_dine_out)}
Total Payment Modes: ${formatINR(totalPaymentModes)}
Payment Difference: ${formatINR(paymentDifference)}

CASH MANAGEMENT:
Opening Cash: ${formatINR(formData.opening_cash)}
Total Cash Expenses: ${formatINR(formData.total_cash_expenses)}
Itemized Expense Total: ${formatINR(itemizedExpenseTotal)}
Expected Closing Cash: ${formatINR(calculatedClosingCash)}
Actual Closing Cash: ${formatINR(formData.closing_cash)}
Closing Difference: ${formatINR(closingDifference)}

CASH EXPENSE ITEMS:
${expenseLines}
`.trim();
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

    if (!salesOk) {
      toast.error("Please enter sales and number of bills");
      return;
    }

    if (!paymentOk) {
      toast.error("Payment mode total must match sales");
      return;
    }

    if (!expenseOk) {
      toast.error("Itemized expenses must match total cash expenses");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        outlet_id: formData.outlet_id,
        closing_date: formData.date,
        sales_confirmed: salesOk && paymentOk ? 1 : 0,
        expenses_confirmed: expenseOk ? 1 : 0,
        purchases_confirmed: 1,
        proofs_uploaded: 1,
        actual_cash_in_hand: num(formData.closing_cash),
        manager_remarks: buildRemarks(),
      };

      await dailyAccountsAPI.createDayClosing(payload);

      toast.success("Day closing checklist saved successfully");
      resetForm();
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to save day closing checklist"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const rows = [
      ["Field", "Value"],
      ["Date", formData.date],
      ["Outlet ID", formData.outlet_id],
      ["Sales", formData.sales],
      ["NOB", formData.nob],
      ["Entered ABV", formData.abv],
      ["Calculated ABV", calculatedABV.toFixed(2)],
      ["MTD Gross Sale", formData.mtd_gross_sale],
      ["MTD ASPD", formData.mtd_aspd],
      ["Total Payment Modes", totalPaymentModes.toFixed(2)],
      ["Payment Difference", paymentDifference.toFixed(2)],
      ["Opening Cash", formData.opening_cash],
      ["Total Cash Expenses", formData.total_cash_expenses],
      ["Itemized Expense Total", itemizedExpenseTotal.toFixed(2)],
      ["Expected Closing Cash", calculatedClosingCash.toFixed(2)],
      ["Actual Closing Cash", formData.closing_cash],
      ["Closing Difference", closingDifference.toFixed(2)],
    ];

    const csv = rows
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
    link.download = "day-closing-checklist.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Checklist exported");
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

  const StatusBox = ({ title, ok, description }) => (
    <div
      className={`rounded-md border p-4 ${
        ok ? "border-[#28C76F] bg-[#E9F9EF]" : "border-[#FF9F43] bg-[#FFF4E5]"
      }`}
    >
      <div className="flex items-start gap-3">
        {ok ? (
          <CheckCircle2 size={22} className="shrink-0 text-[#28C76F]" />
        ) : (
          <AlertTriangle size={22} className="shrink-0 text-[#FF9F43]" />
        )}

        <div>
          <p
            className={`text-[15px] font-semibold ${
              ok ? "text-[#28C76F]" : "text-[#FF9F43]"
            }`}
          >
            {title}
          </p>
          <p className="mt-1 text-[13px] text-[#6F6B7D]">{description}</p>
        </div>
      </div>
    </div>
  );

  const NumberInput = ({ label, value, onChange, icon: Icon, color }) => (
    <div>
      <label className={`mb-2 flex items-center gap-2 text-[14px] font-medium ${mainTextClass}`}>
        {Icon && <Icon size={16} style={{ color }} />}
        {label}
      </label>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
      />
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
            Daily Checklist / Day Closing
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Complete daily sales, payment mode reconciliation, cash expenses and
            closing cash verification.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={fetchOutlets}
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
            onClick={resetForm}
            className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
          >
            <RotateCcw size={18} />
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Sales"
          value={formatCompactINR(formData.sales)}
          subtitle="Daily gross sales"
          icon={Wallet}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />

        <StatCard
          title="Payment Total"
          value={formatCompactINR(totalPaymentModes)}
          subtitle="All payment modes"
          icon={CreditCard}
          color="#00CFE8"
          bg="#E6FAFD"
        />

        <StatCard
          title="Payment Diff"
          value={formatINR(paymentDifference)}
          subtitle="Payment total minus sales"
          icon={AlertTriangle}
          color={paymentOk ? "#28C76F" : "#EA5455"}
          bg={paymentOk ? "#E9F9EF" : "#FCEAEA"}
        />

        <StatCard
          title="Expected Closing"
          value={formatCompactINR(calculatedClosingCash)}
          subtitle="Opening + cash - expenses"
          icon={Calculator}
          color="#FF9F43"
          bg="#FFF4E5"
        />

        <StatCard
          title="Completion"
          value={`${completionPercent}%`}
          subtitle={`${completionCount}/4 checks passed`}
          icon={CheckCircle2}
          color={completionPercent === 100 ? "#28C76F" : primaryColor}
          bg={completionPercent === 100 ? "#E9F9EF" : `${primaryColor}18`}
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div
          className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
        >
          <div className="mb-5">
            <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
              Header Details
            </h3>
            <p className={`mt-1 text-[14px] ${mutedClass}`}>
              Select outlet and closing date.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                {loading ? (
                  <option value="">Loading outlets...</option>
                ) : (
                  outlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.outlet_name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>

        <div
          className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
        >
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                Sales
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Enter daily sales and MTD metrics.
              </p>
            </div>

            <div
              className="rounded-md px-4 py-2 text-[14px] font-semibold"
              style={{
                color: primaryColor,
                backgroundColor: `${primaryColor}18`,
              }}
            >
              Calculated ABV: {formatINR(calculatedABV)}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <NumberInput
              label="Sales"
              value={formData.sales}
              onChange={(value) => updateField("sales", value)}
              icon={Wallet}
              color={primaryColor}
            />

            <NumberInput
              label="N.O.B"
              value={formData.nob}
              onChange={(value) => updateField("nob", value)}
              icon={FileText}
              color="#00CFE8"
            />

            <NumberInput
              label="A.B.V"
              value={formData.abv}
              onChange={(value) => updateField("abv", value)}
              icon={Calculator}
              color="#FF9F43"
            />

            <NumberInput
              label="MTD Gross Sale"
              value={formData.mtd_gross_sale}
              onChange={(value) => updateField("mtd_gross_sale", value)}
              icon={Wallet}
              color="#28C76F"
            />

            <NumberInput
              label="MTD ASPD"
              value={formData.mtd_aspd}
              onChange={(value) => updateField("mtd_aspd", value)}
              icon={Calculator}
              color="#7367F0"
            />
          </div>
        </div>

        <div
          className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
        >
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                Payment Mode Summary
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Total payment modes must match daily sales.
              </p>
            </div>

            <div
              className="rounded-md px-4 py-2 text-[14px] font-semibold"
              style={{
                color: paymentOk ? "#28C76F" : "#EA5455",
                backgroundColor: paymentOk ? "#E9F9EF" : "#FCEAEA",
              }}
            >
              Difference: {formatINR(paymentDifference)}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {paymentFields.map((field) => {
              const Icon = field.icon;

              return (
                <NumberInput
                  key={field.key}
                  label={field.label}
                  value={formData[field.key]}
                  onChange={(value) => updateField(field.key, value)}
                  icon={Icon}
                  color={field.color}
                />
              );
            })}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-md bg-[#F8F7FA] p-4">
              <p className="text-[13px] font-medium text-[#6F6B7D]">
                Sales Entered
              </p>
              <p className="mt-1 text-[22px] font-semibold text-[#2F2B3D]">
                {formatINR(formData.sales)}
              </p>
            </div>

            <div className="rounded-md bg-[#F8F7FA] p-4">
              <p className="text-[13px] font-medium text-[#6F6B7D]">
                Payment Total
              </p>
              <p className="mt-1 text-[22px] font-semibold text-[#2F2B3D]">
                {formatINR(totalPaymentModes)}
              </p>
            </div>

            <div
              className="rounded-md p-4"
              style={{
                backgroundColor: paymentOk ? "#E9F9EF" : "#FCEAEA",
              }}
            >
              <p
                className="text-[13px] font-medium"
                style={{ color: paymentOk ? "#28C76F" : "#EA5455" }}
              >
                Payment Difference
              </p>
              <p
                className="mt-1 text-[22px] font-semibold"
                style={{ color: paymentOk ? "#28C76F" : "#EA5455" }}
              >
                {formatINR(paymentDifference)}
              </p>
            </div>
          </div>
        </div>

        <div
          className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
        >
          <div className="mb-5">
            <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
              Cash Management
            </h3>
            <p className={`mt-1 text-[14px] ${mutedClass}`}>
              Expected closing cash = Opening Cash + Cash Sales - Total Cash Expenses.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <NumberInput
              label="Opening Cash"
              value={formData.opening_cash}
              onChange={(value) => updateField("opening_cash", value)}
              icon={Wallet}
              color="#28C76F"
            />

            <NumberInput
              label="Total Cash Expenses"
              value={formData.total_cash_expenses}
              onChange={(value) => updateField("total_cash_expenses", value)}
              icon={FileText}
              color="#EA5455"
            />

            <NumberInput
              label="Actual Closing Cash"
              value={formData.closing_cash}
              onChange={(value) => updateField("closing_cash", value)}
              icon={Calculator}
              color={primaryColor}
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-md bg-[#F8F7FA] p-4">
              <p className="text-[13px] font-medium text-[#6F6B7D]">
                Expected Closing
              </p>
              <p className="mt-1 text-[22px] font-semibold text-[#2F2B3D]">
                {formatINR(calculatedClosingCash)}
              </p>
            </div>

            <div className="rounded-md bg-[#F8F7FA] p-4">
              <p className="text-[13px] font-medium text-[#6F6B7D]">
                Actual Closing
              </p>
              <p className="mt-1 text-[22px] font-semibold text-[#2F2B3D]">
                {formatINR(formData.closing_cash)}
              </p>
            </div>

            <div
              className="rounded-md p-4"
              style={{ backgroundColor: cashOk ? "#E9F9EF" : "#FCEAEA" }}
            >
              <p
                className="text-[13px] font-medium"
                style={{ color: cashOk ? "#28C76F" : "#EA5455" }}
              >
                Closing Difference
              </p>
              <p
                className="mt-1 text-[22px] font-semibold"
                style={{ color: cashOk ? "#28C76F" : "#EA5455" }}
              >
                {formatINR(closingDifference)}
              </p>
            </div>
          </div>
        </div>

        <div
          className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
        >
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                Cash Expenses Itemized
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add cash expense breakup and match it with total cash expenses.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={useItemizedExpenseTotal}
                className={`rounded-md border px-4 py-2 text-[14px] font-medium ${cardClass}`}
              >
                Use Itemized Total
              </button>

              <button
                type="button"
                onClick={addExpenseItem}
                className="flex items-center gap-2 rounded-md px-4 py-2 text-[14px] font-semibold text-white"
                style={{ backgroundColor: primaryColor }}
              >
                <Plus size={17} />
                Add Expense
              </button>
            </div>
          </div>

          {formData.expense_items.length === 0 ? (
            <div className="rounded-md border border-dashed border-[#DBDADE] p-8 text-center">
              <Search size={36} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No expense items added
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add cash expenses such as milk purchase, cleaning, staff food,
                transport or minor repairs.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {formData.expense_items.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 gap-3 rounded-md border border-[#EBE9F1] bg-[#F8F7FA] p-3 md:grid-cols-[1fr_180px_45px]"
                >
                  <input
                    type="text"
                    placeholder="Expense description"
                    value={item.description}
                    onChange={(event) =>
                      updateExpenseItem(index, "description", event.target.value)
                    }
                    className={`h-11 rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  />

                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={item.amount}
                    onChange={(event) =>
                      updateExpenseItem(index, "amount", event.target.value)
                    }
                    className={`h-11 rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  />

                  <button
                    type="button"
                    onClick={() => removeExpenseItem(index)}
                    className="flex h-11 items-center justify-center rounded-md bg-[#FCEAEA] text-[#EA5455]"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-md bg-[#F8F7FA] p-4">
              <p className="text-[13px] font-medium text-[#6F6B7D]">
                Itemized Total
              </p>
              <p className="mt-1 text-[22px] font-semibold text-[#2F2B3D]">
                {formatINR(itemizedExpenseTotal)}
              </p>
            </div>

            <div className="rounded-md bg-[#F8F7FA] p-4">
              <p className="text-[13px] font-medium text-[#6F6B7D]">
                Entered Total
              </p>
              <p className="mt-1 text-[22px] font-semibold text-[#2F2B3D]">
                {formatINR(formData.total_cash_expenses)}
              </p>
            </div>

            <div
              className="rounded-md p-4"
              style={{
                backgroundColor: expenseOk ? "#E9F9EF" : "#FCEAEA",
              }}
            >
              <p
                className="text-[13px] font-medium"
                style={{ color: expenseOk ? "#28C76F" : "#EA5455" }}
              >
                Expense Difference
              </p>
              <p
                className="mt-1 text-[22px] font-semibold"
                style={{ color: expenseOk ? "#28C76F" : "#EA5455" }}
              >
                {formatINR(expenseDifference)}
              </p>
            </div>
          </div>
        </div>

        <div
          className={`rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}
        >
          <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
            Remarks / Notes
          </label>
          <textarea
            value={formData.remarks}
            onChange={(event) => updateField("remarks", event.target.value)}
            className={`min-h-[100px] w-full rounded-md border px-4 py-3 text-[14px] outline-none ${inputClass}`}
            placeholder="Any cash shortage, online sales mismatch, manager notes or pending proof details..."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <StatusBox
            title="Sales Check"
            ok={salesOk}
            description="Sales and number of bills should be entered."
          />

          <StatusBox
            title="Payment Check"
            ok={paymentOk}
            description="Payment mode total should match sales."
          />

          <StatusBox
            title="Expense Check"
            ok={expenseOk}
            description="Itemized expense total should match cash expenses."
          />

          <StatusBox
            title="Cash Check"
            ok={cashOk}
            description="Actual closing cash should match expected closing."
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
                Save Day Closing Checklist
              </>
            )}
          </button>

          <button
            type="button"
            onClick={resetForm}
            className={`rounded-md border px-5 py-3 text-[15px] font-medium ${cardClass}`}
          >
            Reset Form
          </button>
        </div>
      </form>
    </div>
  );
};

export default DayClosingChecklist;
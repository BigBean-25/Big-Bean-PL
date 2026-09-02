import { useEffect, useMemo, useRef, useState } from "react";
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
  Lock as LockIcon,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Smartphone,
  Store,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { dailyAccountsAPI, masterAPI, getSelectedOutletId, getStoredPermissions } from "../../services/api";
import useAuthStore from "../../store/authStore";
import { useSelectedOutlet } from "../../hooks/useSelectedOutlet";
import exportToExcel from "../../utils/exportToExcel";
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

const getDifferenceDisplay = (value) => {
  const n = Number(value || 0);

  if (n === 0) {
    return {
      label: "Balanced",
      amount: "₹0.00",
      color: "#28C76F",
      bg: "#E9F9EF",
    };
  }

  if (n > 0) {
    return {
      label: "Excess",
      amount: formatINR(n),
      color: "#FF9F43",
      bg: "#FFF4E5",
    };
  }

  return {
    label: "Shortage",
    amount: formatINR(n),
    color: "#EA5455",
    bg: "#FCEAEA",
  };
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
  const [editId, setEditId] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [cashExpensesLoading, setCashExpensesLoading] = useState(false);
  const [bankDepositSummary, setBankDepositSummary] = useState({ verified_bank_deposits: 0, verified_count: 0 });

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  const isFirstFilterEffect = useRef(true);

  const { user } = useAuthStore();
  const userOutlets = user?.outlets || [];
  const isMultiOutlet = userOutlets.length > 1;
  const isAdmin = ["Super Admin", "Admin", "Developer"].includes(user?.role_name);

  const getContextualFilter = () => {
    const sid = getSelectedOutletId();
    if (sid && sid !== "all") return sid;
    if (userOutlets.length === 1) {
      const first = userOutlets[0];
      return String(first?.id || first?.outlet_id || "");
    }
    return "all";
  };

  const [outletFilter, setOutletFilter] = useState(getContextualFilter);
  const [formErrors, setFormErrors] = useState({});

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const permissions = getStoredPermissions();
  const can = (action) => Boolean(permissions?.daily_cashbook?.[action]);

  const { selectedOutletId, selectedOutletLabel } = useSelectedOutlet((nextId) => {
    if (editId || !showForm) return;
    if (nextId && nextId !== "all") {
      setFormData((prev) => ({ ...prev, outlet_id: nextId }));
    } else if (userOutlets.length === 1) {
      const first = userOutlets[0];
      setFormData((prev) => ({
        ...prev,
        outlet_id: String(first?.id || first?.outlet_id || ""),
      }));
    } else {
      setFormData((prev) => ({ ...prev, outlet_id: "" }));
    }
  });

  useEffect(() => {
    let nextFilter = "all";
    if (selectedOutletId && selectedOutletId !== "all") {
      nextFilter = selectedOutletId;
    } else if (userOutlets.length === 1) {
      const first = userOutlets[0];
      nextFilter = String(first?.id || first?.outlet_id || "");
    }
    setOutletFilter((prev) => (prev === nextFilter ? prev : nextFilter));
  }, [selectedOutletId, userOutlets]);

  const isOutletSelectAllowed = isAdmin || (isMultiOutlet && selectedOutletId === "all");
  const isOutletLocked = !isOutletSelectAllowed;

  const cardClass = isDark
    ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
    : "border-[#EBE9F1] bg-white text-[#2F2B3D]";

  const inputClass = isDark
    ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6] focus:border-[#7367F0]"
    : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE] focus:border-[#7367F0]";

  const mutedClass = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainTextClass = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  const StatusBanner = ({ status }) => {
    const messages = {
      Submitted: "Submitted for verification. Editing is disabled.",
      Verified: "Verified. This cashbook is awaiting final lock.",
      Locked: "Locked. This cashbook is final and cannot be modified.",
      Rejected: "Rejected. Review the remarks, correct the entry and resubmit.",
    };

    if (!messages[status]) return null;

    const isWarning = status === "Rejected";
    const bg = isWarning
      ? isDark
        ? "bg-[#3B405A]"
        : "bg-[#FFF4E5]"
      : isDark
      ? "bg-[#3B405A]"
      : "bg-[#E6FAFD]";
    const text = isWarning
      ? isDark
        ? "text-[#FF9F43]"
        : "text-[#FF9F43]"
      : isDark
      ? "text-[#00A6B7]"
      : "text-[#00A6B7]";

    return (
      <div className={`mb-5 rounded-md border px-4 py-3 text-[13px] font-medium ${bg} ${text} ${isDark ? "border-[#3B405A]" : "border-[#DBDADE]"}`}>
        {messages[status]}
      </div>
    );
  };

  const WorkflowStepper = ({ status }) => {
    const steps = ["Draft", "Submitted", "Verified", "Locked"];
    const activeIndex = status === "Rejected" ? -1 : steps.indexOf(status);

    return (
      <div className="mb-5 flex flex-wrap items-center gap-2 text-[12px]">
        {steps.map((step, index) => {
          const isActive = index <= activeIndex;
          const isCurrent = index === activeIndex;
          const baseClass =
            "rounded-full px-3 py-1 font-medium transition ";
          const activeClass = isActive
            ? isCurrent
              ? isDark
                ? "bg-[#7367F0] text-white"
                : "bg-[#7367F0] text-white"
              : isDark
              ? "bg-[#3B405A] text-[#D0D2D6]"
              : "bg-[#E9F9EF] text-[#28C76F]"
            : isDark
            ? "bg-[#3B405A] text-[#A5A8B6]"
            : "bg-[#F3F2F7] text-[#A8AAAE]";

          return (
            <span key={step} className={baseClass + activeClass}>
              {step}
            </span>
          );
        })}

        {status === "Rejected" && (
          <span
            className={
              isDark
                ? "rounded-full bg-[#3B405A] px-3 py-1 font-medium text-[#EA5455]"
                : "rounded-full bg-[#FCEAEA] px-3 py-1 font-medium text-[#EA5455]"
            }
          >
            Rejected → Correct & Resubmit
          </span>
        )}
      </div>
    );
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await fetchInitialData();
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (isFirstFilterEffect.current) {
      isFirstFilterEffect.current = false;
      return;
    }
    fetchCashbooks();
  }, [outletFilter]);

  const fetchCashbooks = async () => {
    try {
      const params = {};
      if (outletFilter && outletFilter !== "all") {
        params.outlet_id = outletFilter;
      }
      const response = await dailyAccountsAPI.getCashbooks(params);
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

  const fetchInitialData = async () => {
    await Promise.all([fetchOutlets(), fetchCashbooks()]);
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const fetchBankDepositSummary = async () => {
    if (!formData.outlet_id || !formData.date || !showForm) {
      setBankDepositSummary({ verified_bank_deposits: 0, verified_count: 0 });
      return;
    }
    try {
      const res = await dailyAccountsAPI.getBankDepositSummary({
        outlet_id: formData.outlet_id,
        date: formData.date,
      });
      const data = res?.data?.data || {};
      setBankDepositSummary({
        verified_bank_deposits: Number(data.verified_bank_deposits) || 0,
        verified_count: Number(data.verified_count) || 0,
      });
    } catch (error) {
      console.error("Bank deposit summary fetch failed:", error.message);
      setBankDepositSummary({ verified_bank_deposits: 0, verified_count: 0 });
    }
  };

  const fetchCashbookSummary = async () => {
    if (!formData.outlet_id || !formData.date || !showForm) return;
    setCashExpensesLoading(true);
    try {
      const res = await dailyAccountsAPI.getCashbookSummary({
        outlet_id: formData.outlet_id,
        date: formData.date,
      });
      const approved = res?.data?.data?.approved_cash_expenses || 0;
      setFormData((prev) => ({ ...prev, cash_expenses: approved }));
    } catch (error) {
      console.error("Failed to fetch cash expenses summary", error);
    } finally {
      setCashExpensesLoading(false);
    }
  };

  useEffect(() => {
    fetchCashbookSummary();
    fetchBankDepositSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.outlet_id, formData.date, showForm]);

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

  const formDiffMeta = useMemo(
    () => getDifferenceDisplay(cashDifference),
    [cashDifference]
  );

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

  const differenceMeta = useMemo(
    () => getDifferenceDisplay(summary.totalDifference),
    [summary.totalDifference]
  );

  const resetForm = () => {
    let nextOutlet = "";
    if (selectedOutletId && selectedOutletId !== "all") {
      nextOutlet = selectedOutletId;
    } else if (userOutlets.length === 1) {
      const first = userOutlets[0];
      nextOutlet = String(first?.id || first?.outlet_id || "");
    }
    setFormData({ ...initialForm(), outlet_id: nextOutlet });
    setEditId(null);
  };

  const handleEdit = (row) => {
    setEditId(row.id);
    setFormData({ ...initialForm(), ...row });
    setShowForm(true);
  };

  const handleAction = async (id, action) => {
    setActionLoadingId(`${id}-${action}`);
    try {
      if (action === "submit") await dailyAccountsAPI.submitCashbook(id);
      else if (action === "verify")
        await dailyAccountsAPI.verifyCashbook(id, { action: "Verified" });
      else if (action === "reject")
        await dailyAccountsAPI.verifyCashbook(id, { action: "Rejected" });
      else if (action === "lock") await dailyAccountsAPI.lockCashbook(id);

      const actionPast =
        action === "submit"
          ? "submitted"
          : action === "verify"
          ? "verified"
          : action === "reject"
          ? "rejected"
          : "locked";
      toast.success(`Cashbook ${actionPast} successfully`);
      await fetchCashbooks();
    } catch (error) {
      toast.error(
        error.response?.data?.message || `Failed to ${action} cashbook`
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id) => {
    const cashbook = cashbooks.find((c) => c.id === id);
    if (!cashbook) return;

    if (cashbook.status !== "Draft" && cashbook.status !== "Rejected") {
      toast.error("Only Draft or Rejected cashbooks can be deleted");
      return;
    }

    if (
      !window.confirm(
        "Delete this Daily Cashbook draft?\n\nThis removes only this Draft/Rejected cashbook. Approved expenses, bank deposits and other source records will remain unchanged."
      )
    ) {
      return;
    }

    setActionLoadingId(`${id}-delete`);
    try {
      await dailyAccountsAPI.deleteCashbook(id);
      toast.success("Daily cashbook deleted successfully");
      await fetchCashbooks();
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to delete cashbook"
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = {};

    if (!formData.date) {
      nextErrors.date = "Please select a date";
    }

    if (!formData.outlet_id || formData.outlet_id === "all") {
      nextErrors.outlet = "Please select a valid outlet";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      toast.error("Please fix the highlighted fields");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        date: formData.date,
        outlet_id: formData.outlet_id,
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
        bank_deposit: num(formData.bank_deposit),
        cash_transfer_to_ho: num(formData.cash_transfer_to_ho),
        actual_cash_in_hand: num(formData.actual_cash_in_hand),
        remarks: formData.remarks,
      };

      if (editId) {
        await dailyAccountsAPI.updateCashbook(editId, payload);
        toast.success("Cashbook entry updated successfully");
      } else {
        await dailyAccountsAPI.createCashbook(payload);
        toast.success("Cashbook entry saved successfully");
      }

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

  const handleExport = async () => {
    if (!filteredCashbooks.length) {
      toast.error("No data available to export.");
      return;
    }

    const columns = [
      { label: "Date", type: "date", width: 14 },
      { label: "Outlet", type: "text", width: 28 },
      { label: "Opening Cash", type: "currency", width: 16 },
      { label: "Cash Sales", type: "currency", width: 15 },
      { label: "Card Sales", type: "currency", width: 15 },
      { label: "UPI Sales", type: "currency", width: 15 },
      { label: "Zomato Sales", type: "currency", width: 16 },
      { label: "Swiggy Sales", type: "currency", width: 16 },
      { label: "Own App Sales", type: "currency", width: 17 },
      { label: "Ownly Sales", type: "currency", width: 16 },
      { label: "Swiggy Dineout", type: "currency", width: 18 },
      { label: "Zomato Dining", type: "currency", width: 17 },
      { label: "District Sales", type: "currency", width: 17 },
      { label: "EazyDiner Sales", type: "currency", width: 18 },
      { label: "Other Sales", type: "currency", width: 16 },
      { label: "Total Sales", type: "currency", width: 16 },
      { label: "Approved Cash Expenses", type: "currency", width: 18 },
      { label: "Bank Deposit", type: "currency", width: 16 },
      { label: "Cash Transfer to HO", type: "currency", width: 18 },
      { label: "Expected Closing Cash", type: "currency", width: 19 },
      { label: "Actual Cash In Hand", type: "currency", width: 19 },
      { label: "Difference", type: "currency", width: 15 },
      { label: "Status", type: "text", width: 14 },
      { label: "Submitted By", type: "text", width: 22 },
      { label: "Reviewer", type: "text", width: 22 },
      { label: "Remarks", type: "text", width: 45, wrap: true },
    ];

    const rows = filteredCashbooks.map((row) => [
      row.date,
      row.outlet_name || "",
      row.opening_cash,
      row.cash_sales,
      row.card_sales,
      row.upi_sales,
      row.zomato_sales,
      row.swiggy_sales,
      row.own_app_sales,
      row.ownly_sales,
      row.swiggy_dineout_sales,
      row.zomato_dining_sales,
      row.district_sales,
      row.eazydiner_sales,
      row.other_sales,
      row.total_sales,
      row.cash_expenses,
      row.bank_deposit,
      row.cash_transfer_to_ho,
      row.closing_cash,
      row.actual_cash_in_hand,
      row.cash_difference,
      row.status,
      row.submitted_by_name,
      row.verified_by_name,
      row.remarks,
    ]);

    const datePart = dateFilter ? formatDate(dateFilter).replace(/\s/g, "-") : "All";
    const outletPart = selectedOutletId === "all" ? "All-Outlets" : (selectedOutletLabel || "Outlet").replace(/\s/g, "-");
    const filename = `Daily_Cashbook_${outletPart}_${datePart}.xlsx`;

    await exportToExcel({
      filename,
      reportTitle: "Daily Cashbook Report",
      outletLabel: selectedOutletLabel,
      periodLabel: dateFilter ? formatDate(dateFilter) : "All Dates",
      columns,
      rows,
    });

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
            <FileSpreadsheet size={18} />
            Export Excel
          </button>

          <button
            type="button"
            onClick={() => {
              if (!showForm) resetForm();
              setShowForm((prev) => !prev);
            }}
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
          title="Expected Closing Cash"
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
          value={differenceMeta.amount}
          subtitle={differenceMeta.label}
          icon={AlertTriangle}
          color={differenceMeta.color}
          bg={differenceMeta.bg}
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
                {editId ? "Edit Cashbook Entry" : "New Cashbook Entry"}
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                {editId
                  ? "Review and update the cashbook details."
                  : "Enter outlet-wise sales and cash closing details."}
              </p>
            </div>

            <div className="rounded-md px-4 py-2 text-[14px] font-medium text-[#28C76F] bg-[#E9F9EF]">
              Total Sales: {formatINR(totalSales)}
            </div>
          </div>

          {editId && (
            <>
              <StatusBanner status={formData.status} />
              <WorkflowStepper status={formData.status} />
            </>
          )}

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
                    onChange={(event) => {
                      updateField("date", event.target.value);
                      setFormErrors((prev) => ({ ...prev, date: "" }));
                    }}
                    className={`h-11 w-full rounded-md border pl-11 pr-4 text-[14px] outline-none ${inputClass} ${formErrors.date ? "border-[#EA5455]" : ""}`}
                    required
                  />
                  {formErrors.date && (
                    <p className="mt-1 text-[12px] text-[#EA5455]">{formErrors.date}</p>
                  )}
                </div>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Outlet *
                </label>
                <select
                  value={formData.outlet_id}
                  onChange={(event) => {
                    updateField("outlet_id", event.target.value);
                    setFormErrors((prev) => ({ ...prev, outlet: "" }));
                  }}
                  disabled={isOutletLocked}
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass} ${isOutletLocked ? "opacity-70" : ""} ${formErrors.outlet ? "border-[#EA5455]" : ""}`}
                  required
                >
                  <option value="">Select Outlet</option>
                  {outlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.outlet_name}
                    </option>
                  ))}
                </select>
                {formErrors.outlet && (
                  <p className="mt-1 text-[12px] text-[#EA5455]">{formErrors.outlet}</p>
                )}
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Opening Cash
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.opening_cash}
                  placeholder="₹0.00"
                  onChange={(event) => updateField("opening_cash", event.target.value)}
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                />
              </div>

              <div>
                <div className={`mb-2 flex items-center justify-between text-[14px] font-medium ${mainTextClass}`}>
                  <span>Approved Cash Expenses</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      isDark
                        ? "bg-[#3B405A] text-[#28C76F]"
                        : "bg-[#E9F9EF] text-[#28C76F]"
                    }`}
                  >
                    Auto-calculated
                  </span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={formData.cash_expenses}
                  disabled
                  className={`h-11 w-full rounded-md border bg-opacity-50 px-4 text-[14px] outline-none ${inputClass} opacity-70`}
                />
                {cashExpensesLoading && (
                  <p className={`mt-1 text-[12px] ${mutedClass}`}>
                    <Loader2 size={12} className="mr-1 inline animate-spin" />
                    Fetching approved expenses...
                  </p>
                )}
                {!cashExpensesLoading && (
                  <p className={`mt-1 text-[12px] ${mutedClass}`}>
                    Automatically calculated from approved Daily Cash Expenses for this outlet and date.
                  </p>
                )}
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
                        min="0"
                        value={formData[field.key]}
                        placeholder="₹0.00"
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
                    min="0"
                    placeholder="₹0.00"
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
                    min="0"
                    placeholder="₹0.00"
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
                    min="0"
                    placeholder="₹0.00"
                    value={formData.actual_cash_in_hand}
                    onChange={(event) =>
                      updateField("actual_cash_in_hand", event.target.value)
                    }
                    className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  />
                </div>
              </div>

              {showForm && (
                <div className={`mt-5 rounded-md border p-4 ${isDark ? "border-[#3B405A] bg-[#25293C]" : "border-[#EBE9F1] bg-[#F8F7FA]"}`}>
                  <h4 className={`mb-3 text-[14px] font-semibold ${mainTextClass}`}>
                    Bank Deposit Reconciliation
                  </h4>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <p className={`text-[12px] font-medium ${mutedClass}`}>Recorded Verified Bank Deposits</p>
                      <p className={`text-[20px] font-bold ${mainTextClass}`}>{formatINR(bankDepositSummary.verified_bank_deposits)}</p>
                    </div>
                    <div>
                      <p className={`text-[12px] font-medium ${mutedClass}`}>Cashbook Bank Deposit</p>
                      <p className={`text-[20px] font-bold ${mainTextClass}`}>{formatINR(formData.bank_deposit)}</p>
                    </div>
                    <div>
                      <p className={`text-[12px] font-medium ${mutedClass}`}>Difference</p>
                      {(() => {
                        const diff = num(formData.bank_deposit) - num(bankDepositSummary.verified_bank_deposits);
                        if (diff === 0) {
                          return <p className="text-[20px] font-bold text-[#28C76F]">Matched</p>;
                        }
                        if (diff > 0) {
                          return <p className="text-[14px] font-semibold text-[#FF9F43]">Cashbook deposit higher by {formatINR(diff)}</p>;
                        }
                        return <p className="text-[14px] font-semibold text-[#EA5455]">Verified deposits higher by {formatINR(Math.abs(diff))}</p>;
                      })()}
                    </div>
                  </div>
                  <p className={`mt-3 text-[12px] ${mutedClass}`}>
                    Bank deposits are reconciled by deposit date. Deposits made on a later day for previous-day cash may require operational review.
                  </p>
                </div>
              )}

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div
                  className={`rounded-md p-4 ${
                    isDark ? "bg-[#3B405A]" : "bg-[#F8F7FA]"
                  }`}
                >
                  <p className={`text-[13px] font-medium ${mutedClass}`}>
                    Expected Closing Cash
                  </p>
                  <p className={`mt-1 text-[22px] font-semibold ${mainTextClass}`}>
                    {formatINR(expectedClosingCash)}
                  </p>
                </div>

                <div
                  className={`rounded-md p-4 ${
                    isDark ? "bg-[#3B405A]" : "bg-[#F8F7FA]"
                  }`}
                >
                  <p className={`text-[13px] font-medium ${mutedClass}`}>
                    Actual Cash
                  </p>
                  <p className={`mt-1 text-[22px] font-semibold ${mainTextClass}`}>
                    {formatINR(formData.actual_cash_in_hand)}
                  </p>
                </div>

                <div
                  className="rounded-md p-4"
                  style={{
                    backgroundColor: formDiffMeta.bg,
                  }}
                >
                  <p
                    className="text-[13px] font-medium"
                    style={{
                      color: formDiffMeta.color,
                    }}
                  >
                    {formDiffMeta.label}
                  </p>
                  <p
                    className="mt-1 text-[22px] font-semibold"
                    style={{
                      color: formDiffMeta.color,
                    }}
                  >
                    {formDiffMeta.amount}
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

            <div
              className={`sticky bottom-0 z-10 mt-6 -mx-6 border-t px-6 pt-4 backdrop-blur-sm ${
                isDark
                  ? "border-[#3B405A] bg-[#2F3349]/95"
                  : "border-[#EBE9F1] bg-white/95"
              }`}
            >
              <div className="flex flex-col gap-3 pb-6 sm:flex-row">
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
                      {editId ? "Save Changes" : "Save Draft"}
                    </>
                  )}
                </button>

                {editId && (
                  <button
                    type="button"
                    onClick={() => handleAction(editId, "submit")}
                    disabled={
                      saving ||
                      actionLoadingId === `${editId}-submit` ||
                      !(formData.status === "Draft" || formData.status === "Rejected")
                    }
                    className="flex items-center justify-center gap-2 rounded-md border px-5 py-3 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)] disabled:cursor-not-allowed disabled:opacity-70"
                    style={{
                      backgroundColor:
                        formData.status === "Rejected" ? "#FF9F43" : "#00A6B7",
                    }}
                  >
                    {actionLoadingId === `${editId}-submit` ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Send size={18} />
                    )}
                    {formData.status === "Rejected" ? "Resubmit" : "Submit"}
                  </button>
                )}

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
              disabled={isOutletLocked}
              className={`h-11 rounded-md border px-4 text-[14px] outline-none ${inputClass} ${isOutletLocked ? "opacity-70" : ""}`}
            >
              {isOutletLocked ? (
                <option value={outletFilter}>{selectedOutletLabel}</option>
              ) : (
                <>
                  <option value="all">All Outlets</option>
                  {outlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.outlet_name}
                    </option>
                  ))}
                </>
              )}
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
                Create a Daily Cashbook entry for this outlet to begin daily reconciliation.
              </p>
              {can("can_create") && (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowForm(true);
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)]"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Plus size={18} />
                  Add Cashbook Entry
                </button>
              )}
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
                    "Approved Cash Expenses",
                    "Expected Closing Cash",
                    "Actual Cash",
                    "Difference",
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
                        {getDifferenceDisplay(diff).amount}
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

                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          {(cashbook.status === "Draft" ||
                            cashbook.status === "Rejected") &&
                            can("can_submit") && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleAction(
                                    cashbook.id,
                                    cashbook.status === "Rejected"
                                      ? "submit"
                                      : "submit"
                                  )
                                }
                                disabled={
                                  actionLoadingId === `${cashbook.id}-submit`
                                }
                                className="flex h-8 items-center gap-1 rounded-md bg-[#E6FAFD] px-2.5 text-[12px] font-semibold text-[#00A6B7] transition hover:opacity-80 disabled:opacity-50"
                              >
                                {actionLoadingId ===
                                `${cashbook.id}-submit` ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Send size={14} />
                                )}
                                {cashbook.status === "Rejected"
                                  ? "Resubmit"
                                  : "Submit"}
                              </button>
                            )}

                          {cashbook.status === "Draft" && can("can_edit") && (
                            <button
                              type="button"
                              onClick={() => handleEdit(cashbook)}
                              className="flex h-8 items-center gap-1 rounded-md bg-[#F0EEFF] px-2.5 text-[12px] font-semibold text-[#7367F0] transition hover:opacity-80"
                            >
                              Edit
                            </button>
                          )}

                          {cashbook.status === "Submitted" &&
                            can("can_verify") && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAction(cashbook.id, "verify")
                                  }
                                  disabled={
                                    actionLoadingId ===
                                    `${cashbook.id}-verify`
                                  }
                                  className="flex h-8 items-center gap-1 rounded-md bg-[#E9F9EF] px-2.5 text-[12px] font-semibold text-[#28C76F] transition hover:opacity-80 disabled:opacity-50"
                                >
                                  {actionLoadingId ===
                                  `${cashbook.id}-verify` ? (
                                    <Loader2
                                      size={14}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <CheckCircle2 size={14} />
                                  )}
                                  Verify
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAction(cashbook.id, "reject")
                                  }
                                  disabled={
                                    actionLoadingId ===
                                    `${cashbook.id}-reject`
                                  }
                                  className="flex h-8 items-center gap-1 rounded-md bg-[#FCEAEA] px-2.5 text-[12px] font-semibold text-[#EA5455] transition hover:opacity-80 disabled:opacity-50"
                                >
                                  {actionLoadingId ===
                                  `${cashbook.id}-reject` ? (
                                    <Loader2
                                      size={14}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <X size={14} />
                                  )}
                                  Reject
                                </button>
                              </>
                            )}

                          {cashbook.status === "Verified" &&
                            can("can_lock") && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleAction(cashbook.id, "lock")
                                }
                                disabled={
                                  actionLoadingId === `${cashbook.id}-lock`
                                }
                                className="flex h-8 items-center gap-1 rounded-md bg-[#F3F2F7] px-2.5 text-[12px] font-semibold text-[#6F6B7D] transition hover:opacity-80 disabled:opacity-50"
                              >
                                {actionLoadingId ===
                                `${cashbook.id}-lock` ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <LockIcon size={14} />
                                )}
                                Lock
                              </button>
                            )}

                          {(cashbook.status === "Draft" ||
                            cashbook.status === "Rejected") &&
                            can("can_delete") && (
                              <button
                                type="button"
                                onClick={() => handleDelete(cashbook.id)}
                                disabled={
                                  actionLoadingId === `${cashbook.id}-delete`
                                }
                                className="flex h-8 items-center gap-1 rounded-md bg-[#FCEAEA] px-2.5 text-[12px] font-semibold text-[#EA5455] transition hover:opacity-80 disabled:opacity-50"
                              >
                                {actionLoadingId ===
                                `${cashbook.id}-delete` ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                                Delete
                              </button>
                            )}
                        </div>
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
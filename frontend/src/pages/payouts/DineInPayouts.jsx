import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Eye,
  Search,
  Loader2,
  RefreshCw,
  Calendar,
  Wallet,
  CreditCard,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { payoutAPI, masterAPI, getStoredPermissions } from "../../services/api";
import useAuthStore from "../../store/authStore";
import toast from "react-hot-toast";
import exportToExcel from "../../utils/exportToExcel";
import PayoutRejectModal from "../../components/PayoutRejectModal";

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

const monthName = (month) =>
  new Date(2000, Number(month || 1) - 1).toLocaleString("default", {
    month: "long",
  });

const monthShortName = (month) =>
  new Date(2000, Number(month || 1) - 1).toLocaleString("default", {
    month: "short",
  });

const formatDateTime = (value) => {
  if (!value) return "-";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    const day = d.getDate();
    const month = d.toLocaleString("default", { month: "short" });
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${day} ${month} ${year} ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
  } catch {
    return value;
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

const getPrimaryColor = () => {
  try {
    return localStorage.getItem("bbc_primary_color") || "#7367F0";
  } catch {
    return "#7367F0";
  }
};

const emptyForm = () => ({
  outlet_id: "",
  portal_id: "",
  month: String(new Date().getMonth() + 1),
  year: String(new Date().getFullYear()),
  customer_paid: "",
  commission_percent: "",
  commission_amount: "",
  net_received: "",
});

const DineInPayouts = () => {
  const [payouts, setPayouts] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [portals, setPortals] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedPayout, setSelectedPayout] = useState(null);

  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [actioningId, setActioningId] = useState(null);
  const [rejectModal, setRejectModal] = useState({
    open: false,
    payout: null,
    loading: false,
  });
  const { user } = useAuthStore();

  const [searchTerm, setSearchTerm] = useState("");
  const [outletFilter, setOutletFilter] = useState("all");
  const [portalFilter, setPortalFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);

  const isDark = getThemeMode() === "dark";
  const primaryColor = getPrimaryColor();

  const permissions = useMemo(
    () => getStoredPermissions()?.dine_in_payouts || {},
    []
  );
  const can = (action) => Boolean(permissions[action]);

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

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchPayouts(), fetchMasters()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPayouts = async () => {
    try {
      const response = await payoutAPI.getDineInPayouts();
      setPayouts(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch payouts");
    }
  };

  const fetchMasters = async () => {
    try {
      const [outletRes, portalRes] = await Promise.all([
        masterAPI.getOutlets(),
        masterAPI.getDineInPortals(),
      ]);

      setOutlets(getRows(outletRes));
      setPortals(getRows(portalRes));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch master data");
    }
  };

  const getOutletName = (payout) => {
    if (payout?.outlet_name) return payout.outlet_name;
    const outlet = outlets.find((item) => Number(item.id) === Number(payout?.outlet_id));
    return outlet?.outlet_name || "-";
  };

  const getPortalName = (payout) => {
    if (payout?.portal_name) return payout.portal_name;
    const portal = portals.find((item) => Number(item.id) === Number(payout?.portal_id));
    return portal?.portal_name || "-";
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
    setSelectedPayout(null);
    setShowForm(true);
  };

  const updateMoneyField = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };

      const customerPaid = num(
        field === "customer_paid" ? value : updated.customer_paid
      );

      const commissionPercent = num(
        field === "commission_percent" ? value : updated.commission_percent
      );

      const commissionAmount = num(
        field === "commission_amount" ? value : updated.commission_amount
      );

      const netReceived = num(
        field === "net_received" ? value : updated.net_received
      );

      if (field === "customer_paid" || field === "commission_percent") {
        const calculatedCommission =
          customerPaid > 0 && commissionPercent > 0
            ? (customerPaid * commissionPercent) / 100
            : 0;

        updated.commission_amount = calculatedCommission
          ? calculatedCommission.toFixed(2)
          : "";

        updated.net_received =
          customerPaid > 0 ? (customerPaid - calculatedCommission).toFixed(2) : "";
      }

      if (field === "commission_amount") {
        updated.net_received =
          customerPaid > 0 ? (customerPaid - commissionAmount).toFixed(2) : "";

        updated.commission_percent =
          customerPaid > 0 && commissionAmount > 0
            ? ((commissionAmount / customerPaid) * 100).toFixed(2)
            : "";
      }

      if (field === "net_received") {
        const calculatedCommission =
          customerPaid > 0 ? customerPaid - netReceived : 0;

        updated.commission_amount =
          calculatedCommission >= 0 ? calculatedCommission.toFixed(2) : "";

        updated.commission_percent =
          customerPaid > 0 && calculatedCommission >= 0
            ? ((calculatedCommission / customerPaid) * 100).toFixed(2)
            : "";
      }

      return updated;
    });
  };

  const handleEdit = (payout) => {
    setEditingId(payout.id);
    setSelectedPayout(null);
    setFormData({
      outlet_id: payout.outlet_id || "",
      portal_id: payout.portal_id || "",
      month: String(payout.month || new Date().getMonth() + 1),
      year: String(payout.year || new Date().getFullYear()),
      customer_paid: payout.customer_paid || "",
      commission_percent: payout.commission_percent || "",
      commission_amount: payout.commission_amount || "",
      net_received: payout.net_received || "",
    });
    setShowForm(true);
  };

  const handleView = (payout) => {
    setSelectedPayout(payout);
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this payout?")) return;

    if (typeof payoutAPI.deleteDineInPayout !== "function") {
      toast.error("Delete API is not configured for dine-in payouts");
      return;
    }

    setDeletingId(id);

    try {
      await payoutAPI.deleteDineInPayout(id);
      toast.success("Payout deleted successfully");

      if (selectedPayout?.id === id) {
        setSelectedPayout(null);
      }

      await fetchPayouts();
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleWorkflow = async (id, action) => {
    if (action === "reject") {
      const payout =
        payouts.find((p) => p.id === id) ||
        (selectedPayout?.id === id ? selectedPayout : null);
      if (!payout) return;
      setRejectModal({ open: true, payout, loading: false });
      return;
    }

    let handler;
    if (action === "submit") {
      handler = payoutAPI.submitDineInPayout;
    } else if (action === "verify") {
      handler = payoutAPI.verifyDineInPayout;
    } else {
      return;
    }
    if (typeof handler !== "function") return;
    setActioningId(id);
    try {
      await handler(id);
      toast.success(`Dine-in payout ${action}ed`);
      await fetchPayouts();
      if (selectedPayout?.id === id) {
        const refreshed = (await payoutAPI.getDineInPayouts()).data?.data?.find((p) => p.id === id);
        setSelectedPayout(refreshed || null);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || `${action} failed`);
    } finally {
      setActioningId(null);
    }
  };

  const handleRejectConfirm = async (reason) => {
    const id = rejectModal.payout?.id;
    if (!id) return;

    setRejectModal((prev) => ({ ...prev, loading: true }));
    try {
      await payoutAPI.rejectDineInPayout(id, reason);
      toast.success("Payout rejected successfully.");
      setRejectModal({ open: false, payout: null, loading: false });
      await fetchPayouts();
      if (selectedPayout?.id === id) {
        const refreshed = (await payoutAPI.getDineInPayouts()).data?.data?.find((p) => p.id === id);
        setSelectedPayout(refreshed || null);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Reject failed");
      setRejectModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.outlet_id) {
      toast.error("Please select outlet");
      return;
    }

    if (!formData.portal_id) {
      toast.error("Please select portal");
      return;
    }

    if (!formData.customer_paid || num(formData.customer_paid) <= 0) {
      toast.error("Please enter customer paid amount");
      return;
    }

    if (!formData.net_received || num(formData.net_received) < 0) {
      toast.error("Please enter net received amount");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        outlet_id: formData.outlet_id,
        portal_id: formData.portal_id,
        month: Number(formData.month),
        year: Number(formData.year),
        customer_paid: num(formData.customer_paid),
        commission_percent: num(formData.commission_percent),
        commission_amount: num(formData.commission_amount),
        net_received: num(formData.net_received),
      };

      if (editingId) {
        if (typeof payoutAPI.updateDineInPayout !== "function") {
          toast.error("Update API is not configured for dine-in payouts");
          return;
        }

        await payoutAPI.updateDineInPayout(editingId, payload);
        toast.success("Payout updated successfully");
      } else {
        await payoutAPI.createDineInPayout(payload);
        toast.success("Payout created successfully");
      }

      closeForm();
      await fetchPayouts();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const yearOptions = useMemo(() => {
    const years = payouts.map((payout) => payout.year).filter(Boolean);
    return Array.from(new Set(years)).sort((a, b) => Number(b) - Number(a));
  }, [payouts]);

  const filteredPayouts = useMemo(() => {
    return payouts.filter((payout) => {
      const text = `${getOutletName(payout)} ${getPortalName(payout)} ${
        payout.month
      } ${payout.year}`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const outletMatch =
        outletFilter === "all" || String(payout.outlet_id) === String(outletFilter);

      const portalMatch =
        portalFilter === "all" || String(payout.portal_id) === String(portalFilter);

      const monthMatch =
        monthFilter === "all" || String(payout.month) === String(monthFilter);

      const yearMatch =
        yearFilter === "all" || String(payout.year) === String(yearFilter);

      return searchMatch && outletMatch && portalMatch && monthMatch && yearMatch;
    });
  }, [
    payouts,
    outlets,
    portals,
    searchTerm,
    outletFilter,
    portalFilter,
    monthFilter,
    yearFilter,
  ]);

  const visiblePayouts = useMemo(() => {
    return filteredPayouts.slice(0, Number(pageSize));
  }, [filteredPayouts, pageSize]);

  const summary = useMemo(() => {
    const customerPaid = filteredPayouts.reduce(
      (sum, payout) => sum + num(payout.customer_paid),
      0
    );

    const commission = filteredPayouts.reduce(
      (sum, payout) => sum + num(payout.commission_amount),
      0
    );

    const netReceived = filteredPayouts.reduce(
      (sum, payout) => sum + num(payout.net_received),
      0
    );

    const avgCommission = customerPaid > 0 ? (commission / customerPaid) * 100 : 0;

    return {
      entries: filteredPayouts.length,
      customerPaid,
      commission,
      netReceived,
      avgCommission,
      difference: customerPaid - netReceived,
    };
  }, [filteredPayouts]);

  const handleExport = async () => {
    if (!filteredPayouts.length) {
      toast.error("No data available to export.");
      return;
    }

    const outletLabel =
      outletFilter === "all"
        ? "All Outlets"
        : getOutletName({ outlet_id: Number(outletFilter) });

    let periodLabel = "All Periods";
    let periodFile = "All-Periods";
    if (monthFilter !== "all" && yearFilter !== "all") {
      periodLabel = `${monthName(Number(monthFilter))} ${yearFilter}`;
      periodFile = `${monthShortName(Number(monthFilter))}-${yearFilter}`;
    } else if (yearFilter !== "all") {
      periodLabel = `All Months ${yearFilter}`;
      periodFile = `All-Months-${yearFilter}`;
    } else if (monthFilter !== "all") {
      periodLabel = `${monthName(Number(monthFilter))} All Years`;
      periodFile = `${monthShortName(Number(monthFilter))}-All-Years`;
    }

    const outletFile = outletLabel.replace(/\s+/g, "-");
    const filename = `DineIn_Payouts_${outletFile}_${periodFile}.xlsx`;

    const columns = [
      { label: "Month", type: "text", width: 16 },
      { label: "Year", type: "integer", width: 10 },
      { label: "Outlet", type: "text", width: 28 },
      { label: "Portal", type: "text", width: 18 },
      { label: "Customer Bill Value", type: "currency", width: 18 },
      { label: "Customer Paid Value", type: "currency", width: 18 },
      { label: "Commission Amount", type: "currency", width: 16 },
      { label: "TCS", type: "currency", width: 14 },
      { label: "TDS", type: "currency", width: 14 },
      { label: "Other Deduction", type: "currency", width: 16 },
      { label: "Expected Payout", type: "currency", width: 18 },
      { label: "Actual Payout Received", type: "currency", width: 18 },
      { label: "Difference", type: "currency", width: 14 },
      { label: "Status", type: "text", width: 14 },
      { label: "Created By", type: "text", width: 22 },
      { label: "Created At", type: "datetime", width: 22 },
      { label: "Submitted By", type: "text", width: 22 },
      { label: "Submitted At", type: "datetime", width: 22 },
      { label: "Verified By", type: "text", width: 22 },
      { label: "Verified At", type: "datetime", width: 22 },
      { label: "Rejected By", type: "text", width: 22 },
      { label: "Rejected At", type: "datetime", width: 22 },
      { label: "Rejection Reason", type: "text", width: 35, wrap: true },
    ];

    const rows = filteredPayouts.map((payout) => [
      monthName(payout.month),
      payout.year,
      getOutletName(payout),
      getPortalName(payout),
      payout.customer_bill_value,
      payout.customer_paid,
      payout.commission_amount,
      payout.tcs,
      payout.tds,
      payout.other_deduction,
      payout.net_received,
      payout.actual_payout_received,
      payout.difference,
      payout.status,
      payout.created_by_name,
      payout.created_at,
      payout.submitted_by_name,
      payout.submitted_at,
      payout.verified_by_name,
      payout.verified_at,
      payout.rejected_by_name,
      payout.rejected_at,
      payout.rejection_reason,
    ]);

    try {
      await exportToExcel({
        filename,
        reportTitle: "DINE-IN PORTAL PAYOUTS REPORT",
        sheetName: "Dine-in Payouts",
        outletLabel,
        periodLabel,
        columns,
        rows,
      });
      toast.success("Dine-in payouts exported");
    } catch (error) {
      toast.error(error.message || "Export failed");
    }
  };

  const StatCard = ({ title, value, subtitle, icon: Icon, color, bg }) => (
    <div className={`rounded-md border p-5 shadow-sm ${cardClass}`}>
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

  const DetailItem = ({ label, value }) => (
    <div className="flex items-start gap-2 py-1.5">
      <span className={`min-w-[155px] text-[14px] font-semibold ${mainTextClass}`}>
        {label}
      </span>
      <span className={`text-[14px] ${mutedClass}`}>{value || "-"}</span>
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
            Dine-in Portal Payouts
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Manage Dineout, Zomato Dining, Swiggy Dineout and other dine-in portal payouts.
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
            onClick={openCreateForm}
            className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus size={18} />
            Add Payout
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Entries"
          value={summary.entries}
          subtitle="Filtered payout rows"
          icon={FileText}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />

        <StatCard
          title="Customer Paid"
          value={compactINR(summary.customerPaid)}
          subtitle="Gross customer amount"
          icon={Wallet}
          color="#00CFE8"
          bg="#E6FAFD"
        />

        <StatCard
          title="Commission"
          value={compactINR(summary.commission)}
          subtitle={`${summary.avgCommission.toFixed(2)}% average`}
          icon={CreditCard}
          color="#FF9F43"
          bg="#FFF4E5"
        />

        <StatCard
          title="Net Received"
          value={compactINR(summary.netReceived)}
          subtitle="Amount received"
          icon={Wallet}
          color="#28C76F"
          bg="#E9F9EF"
        />

        <StatCard
          title="Difference"
          value={compactINR(summary.difference)}
          subtitle="Gross minus net"
          icon={CreditCard}
          color="#EA5455"
          bg="#FCEAEA"
        />
      </div>

      {showForm && (
        <div className={`rounded-md border p-6 shadow-sm ${cardClass}`}>
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                {editingId ? "Edit Payout" : "New Payout"}
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Enter customer paid amount, commission and net received.
              </p>
            </div>

            <button
              type="button"
              onClick={closeForm}
              className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Outlet *
                </label>
                <select
                  value={formData.outlet_id}
                  onChange={(event) =>
                    setFormData({ ...formData, outlet_id: event.target.value })
                  }
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
                  Portal *
                </label>
                <select
                  value={formData.portal_id}
                  onChange={(event) =>
                    setFormData({ ...formData, portal_id: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                >
                  <option value="">Select Portal</option>
                  {portals.map((portal) => (
                    <option key={portal.id} value={portal.id}>
                      {portal.portal_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Month *
                </label>
                <select
                  value={formData.month}
                  onChange={(event) =>
                    setFormData({ ...formData, month: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                >
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {monthName(index + 1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Year *
                </label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(event) =>
                    setFormData({ ...formData, year: event.target.value })
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Customer Paid *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.customer_paid}
                  onChange={(event) =>
                    updateMoneyField("customer_paid", event.target.value)
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Commission %
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.commission_percent}
                  onChange={(event) =>
                    updateMoneyField("commission_percent", event.target.value)
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Commission Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.commission_amount}
                  onChange={(event) =>
                    updateMoneyField("commission_amount", event.target.value)
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Net Received *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.net_received}
                  onChange={(event) =>
                    updateMoneyField("net_received", event.target.value)
                  }
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-md bg-[#F8F7FA] p-4">
                <p className="text-[13px] font-medium text-[#6F6B7D]">Customer Paid</p>
                <p className="mt-1 text-[22px] font-semibold text-[#2F2B3D]">
                  {formatINR(formData.customer_paid)}
                </p>
              </div>

              <div className="rounded-md bg-[#FFF4E5] p-4">
                <p className="text-[13px] font-medium text-[#FF9F43]">Commission</p>
                <p className="mt-1 text-[22px] font-semibold text-[#FF9F43]">
                  {formatINR(formData.commission_amount)}
                </p>
              </div>

              <div className="rounded-md bg-[#E9F9EF] p-4">
                <p className="text-[13px] font-medium text-[#28C76F]">Net Received</p>
                <p className="mt-1 text-[22px] font-semibold text-[#28C76F]">
                  {formatINR(formData.net_received)}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center justify-center gap-2 rounded-md px-5 py-3 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
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
                    {editingId ? "Update Payout" : "Create Payout"}
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

      {selectedPayout && (
        <div className={`rounded-md border p-6 shadow-sm ${cardClass}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                Payout Details
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                {getPortalName(selectedPayout)} - {getOutletName(selectedPayout)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedPayout(null)}
              className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem label="Payout ID:" value={selectedPayout.id} />
              <DetailItem label="Outlet:" value={getOutletName(selectedPayout)} />
              <DetailItem label="Portal:" value={getPortalName(selectedPayout)} />
              <DetailItem
                label="Period:"
                value={`${monthName(selectedPayout.month)} ${selectedPayout.year}`}
              />
              <DetailItem label="Status:" value={selectedPayout.status} />
              <DetailItem
                label="Rejected By:"
                value={selectedPayout.rejected_by_name || "-"}
              />
              <DetailItem
                label="Rejected At:"
                value={formatDateTime(selectedPayout.rejected_at)}
              />
              <DetailItem
                label="Rejection Reason:"
                value={selectedPayout.rejection_reason || "-"}
              />
            </div>

            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem
                label="Customer Paid:"
                value={formatINR(selectedPayout.customer_paid)}
              />
              <DetailItem
                label="Commission %:"
                value={
                  num(selectedPayout.customer_paid) > 0
                    ? `${(
                        (num(selectedPayout.commission_amount) /
                          num(selectedPayout.customer_paid)) *
                        100
                      ).toFixed(2)}%`
                    : "0.00%"
                }
              />
              <DetailItem
                label="Commission:"
                value={formatINR(selectedPayout.commission_amount)}
              />
              <DetailItem
                label="Net Received:"
                value={formatINR(selectedPayout.net_received)}
              />
            </div>

            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem
                label="Difference:"
                value={formatINR(
                  num(selectedPayout.customer_paid) - num(selectedPayout.net_received)
                )}
              />
              <DetailItem
                label="Created At:"
                value={formatDateTime(selectedPayout.created_at)}
              />
              <DetailItem
                label="Updated At:"
                value={formatDateTime(selectedPayout.updated_at)}
              />
            </div>
          </div>

          {["Draft", "Rejected"].includes(selectedPayout.status) &&
            (can("can_edit") || can("can_delete")) && (
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {can("can_edit") && (
                  <button
                    type="button"
                    onClick={() => handleEdit(selectedPayout)}
                    className="flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[15px] font-semibold text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Edit2 size={17} />
                    Edit
                  </button>
                )}

                {can("can_delete") && (
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedPayout.id)}
                    className="flex items-center justify-center gap-2 rounded-md bg-[#FCEAEA] px-5 py-2.5 text-[15px] font-semibold text-[#EA5455]"
                  >
                    <Trash2 size={17} />
                    Delete
                  </button>
                )}
              </div>
            )}
        </div>
      )}

      <PayoutRejectModal
        open={rejectModal.open}
        onClose={() => setRejectModal({ open: false, payout: null, loading: false })}
        onConfirm={handleRejectConfirm}
        loading={rejectModal.loading}
        isDark={isDark}
        type="dine-in"
        payout={rejectModal.payout}
      />

      <div className={`rounded-md border shadow-sm ${cardClass}`}>
        <div className="border-b border-[#EBE9F1] p-6">
          <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>Filters</h3>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-5">
            <select
              value={outletFilter}
              onChange={(event) => setOutletFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Outlet</option>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.outlet_name}
                </option>
              ))}
            </select>

            <select
              value={portalFilter}
              onChange={(event) => setPortalFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Portal</option>
              {portals.map((portal) => (
                <option key={portal.id} value={portal.id}>
                  {portal.portal_name}
                </option>
              ))}
            </select>

            <select
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Month</option>
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {monthName(index + 1)}
                </option>
              ))}
            </select>

            <select
              value={yearFilter}
              onChange={(event) => setYearFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Year</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search Payout"
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

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleExport}
              className="flex h-12 items-center justify-center gap-2 rounded-md bg-[#F3F2F7] px-5 text-[15px] font-semibold text-[#6F6B7D]"
            >
              <FileSpreadsheet size={17} />
              Export Excel
            </button>

            <button
              type="button"
              onClick={openCreateForm}
              className="flex h-12 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-semibold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus size={18} />
              Add Payout
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Loader2
                size={36}
                className="mx-auto animate-spin"
                style={{ color: primaryColor }}
              />
              <p className={`mt-3 text-[14px] ${mutedClass}`}>Loading payouts...</p>
            </div>
          </div>
        ) : visiblePayouts.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Wallet size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No payouts found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add a new payout or change filters.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] border-collapse">
              <thead>
                <tr className="border-b border-[#EBE9F1]">
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Month / Year
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Outlet
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Portal
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Customer Paid
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Commission
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Net Received
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {visiblePayouts.map((payout) => (
                  <tr
                    key={payout.id}
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
                        <div>
                          <p className="text-[15px] font-semibold text-[#2F2B3D]">
                            {monthName(payout.month)}
                          </p>
                          <p className="text-[13px] text-[#6F6B7D]">
                            {payout.year || "-"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                      {getOutletName(payout)}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className="inline-flex rounded-full px-3 py-1 text-[12px] font-semibold"
                        style={{
                          color: primaryColor,
                          backgroundColor: `${primaryColor}18`,
                        }}
                      >
                        {getPortalName(payout)}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-[14px] font-semibold text-[#2F2B3D]">
                      {formatINR(payout.customer_paid)}
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-[14px] text-[#6F6B7D]">
                        <p>{formatINR(payout.commission_amount)}</p>
                        <p className="text-[12px] text-[#A8AAAE]">
                          {num(payout.commission_percent).toFixed(2)}%
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-[14px] font-semibold text-[#28C76F]">
                      {formatINR(payout.net_received)}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${
                          payout.status === 'Verified' ? 'bg-[#E9F9EF] text-[#28C76F]' :
                          payout.status === 'Submitted' ? 'bg-[#E6FAFD] text-[#00CFE8]' :
                          payout.status === 'Rejected' ? 'bg-[#FCEAEA] text-[#EA5455]' :
                          'bg-[#F3F2F7] text-[#6F6B7D]'
                        }`}
                      >
                        {payout.status || 'Draft'}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 text-[#6F6B7D]">
                        {(payout.status === 'Draft' || payout.status === 'Rejected') && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEdit(payout)}
                              className="transition hover:text-[#00A6B7]"
                              title="Edit"
                            >
                              <Edit2 size={20} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleWorkflow(payout.id, 'submit')}
                              disabled={actioningId === payout.id}
                              className="transition hover:text-[#00CFE8] disabled:opacity-50"
                              title="Submit"
                            >
                              {actioningId === payout.id ? <Loader2 size={20} className="animate-spin" /> : <FileText size={20} />}
                            </button>
                          </>
                        )}
                        {payout.status === 'Submitted' && payout.submitted_by !== user?.id && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleWorkflow(payout.id, 'verify')}
                              disabled={actioningId === payout.id}
                              className="transition hover:text-[#28C76F] disabled:opacity-50"
                              title="Verify"
                            >
                              {actioningId === payout.id ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleWorkflow(payout.id, 'reject')}
                              disabled={actioningId === payout.id}
                              className="transition hover:text-[#EA5455] disabled:opacity-50"
                              title="Reject"
                            >
                              {actioningId === payout.id ? <Loader2 size={20} className="animate-spin" /> : <X size={20} />}
                            </button>
                          </>
                        )}
                        {(payout.status === 'Draft' || payout.status === 'Rejected') && (
                          <button
                            type="button"
                            onClick={() => handleDelete(payout.id)}
                            disabled={deletingId === payout.id}
                            className="transition hover:text-[#EA5455] disabled:opacity-50"
                            title="Delete"
                          >
                            {deletingId === payout.id ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleView(payout)}
                          className="transition hover:text-[#7367F0]"
                          title="View Details"
                        >
                          <Eye size={20} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredPayouts.length > pageSize && (
              <div className="border-t border-[#EBE9F1] px-6 py-4 text-[14px] text-[#6F6B7D]">
                Showing first {pageSize} of {filteredPayouts.length} payouts.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DineInPayouts;
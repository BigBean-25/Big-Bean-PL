import { useEffect, useMemo, useState } from "react";
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
  Zap,
  Droplets,
  Wrench,
  CheckCircle2,
  FileText,
  Trash2,
} from "lucide-react";
import { useOutletContext } from "react-router-dom";
import api, { masterAPI, deleteUtilityBill } from "../../services/api";
import useAuthStore from "../../store/authStore";
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

const monthName = (month) =>
  new Date(2000, Number(month || 1) - 1).toLocaleString("default", {
    month: "long",
  });

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
  month: String(new Date().getMonth() + 1),
  year: String(new Date().getFullYear()),
  outlet_id: "",
  electricity_bill: "",
  maintenance_cost: "",
  water_bill: "",
  garbage: "",
  internet: "",
  gas_monthly: "",
  other_utility: "",
  remarks: "",
});

const calculateTotal = (data) =>
  num(data.electricity_bill) +
  num(data.maintenance_cost) +
  num(data.water_bill) +
  num(data.garbage) +
  num(data.internet) +
  num(data.gas_monthly) +
  num(data.other_utility);

const UtilityBills = () => {
  const outletContext = useOutletContext() || {};

  const {
    selectedOutletId = "all",
    availableOutlets = [],
  } = outletContext;

  const dashboardOutletId =
    selectedOutletId && String(selectedOutletId) !== "all"
      ? String(selectedOutletId)
      : "all";

  const scrollToUtilityTop = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({
          top: 0,
          left: 0,
          behavior: "auto",
        });
      });
    });
  };

  const [bills, setBills] = useState([]);
  const [outlets, setOutlets] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedBill, setSelectedBill] = useState(null);

  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifyingId, setVerifyingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const { user } = useAuthStore();
  const canDelete = Boolean(user?.permissions?.utility_bills?.can_delete);

  const [searchTerm, setSearchTerm] = useState("");
  const [outletFilter, setOutletFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
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
  }, [dashboardOutletId]);

  useEffect(() => {
    if (dashboardOutletId !== "all") {
      setOutletFilter(dashboardOutletId);

      setFormData((current) => ({
        ...current,
        outlet_id: dashboardOutletId,
      }));
    } else {
      setOutletFilter("all");
    }
  }, [dashboardOutletId]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchBills(), fetchOutlets()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBills = async () => {
    try {
      const response = await api.get(`/utility-bills`, {
        params:
          dashboardOutletId !== "all"
            ? { outlet_id: dashboardOutletId }
            : undefined,
      });
      setBills(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch utility bills");
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

  const getOutletName = (bill) => {
    if (bill?.outlet_name) return bill.outlet_name;
    const outlet = outlets.find((item) => Number(item.id) === Number(bill?.outlet_id));
    return outlet?.outlet_name || "-";
  };


  const scopedOutlets = useMemo(() => {
    if (dashboardOutletId !== "all") {
      return outlets.filter(
        (outlet) => String(outlet.id) === String(dashboardOutletId)
      );
    }

    if (Array.isArray(availableOutlets) && availableOutlets.length > 0) {
      const allowedIds = new Set(
        availableOutlets.map((outlet) => String(outlet.id))
      );

      const filtered = outlets.filter((outlet) =>
        allowedIds.has(String(outlet.id))
      );

      return filtered.length > 0 ? filtered : outlets;
    }

    return outlets;
  }, [outlets, availableOutlets, dashboardOutletId]);

  const effectiveOutletFilter =
    dashboardOutletId !== "all" ? dashboardOutletId : outletFilter;

  const formTotal = calculateTotal(formData);

  const resetForm = () => {
    setFormData({
      ...emptyForm(),
      outlet_id: dashboardOutletId !== "all" ? dashboardOutletId : "",
    });
    setEditingId(null);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const openCreateForm = () => {
    resetForm();
    setSelectedBill(null);
    setShowForm(true);
  };

  const handleEdit = (bill) => {
    if (
      dashboardOutletId !== "all" &&
      String(bill.outlet_id) !== String(dashboardOutletId)
    ) {
      toast.error("This utility bill does not belong to the selected outlet");
      return;
    }

    setEditingId(bill.id);
    setSelectedBill(null);
    setFormData({
      month: String(bill.month || new Date().getMonth() + 1),
      year: String(bill.year || new Date().getFullYear()),
      outlet_id:
        dashboardOutletId !== "all"
          ? dashboardOutletId
          : bill.outlet_id || "",
      electricity_bill: bill.electricity_bill || "",
      maintenance_cost: bill.maintenance_cost || "",
      water_bill: bill.water_bill || "",
      garbage: bill.garbage || "",
      internet: bill.internet || "",
      gas_monthly: bill.gas_monthly || "",
      other_utility: bill.other_utility || "",
      remarks: bill.remarks || "",
    });
    setShowForm(true);
  };

  const handleView = (bill) => {
    setSelectedBill(bill);
    setShowForm(false);
  };

  const handleVerify = async (id, action = "Verified") => {
    setVerifyingId(id);
    try {
      await api.post(`/utility-bills/${id}/verify`, { action });
      toast.success(`Utility bill ${action.toLowerCase()} successfully`);
      await fetchBills();
    } catch (error) {
      toast.error(error.response?.data?.message || "Verification failed");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async (bill) => {
    if (
      !window.confirm(
        "Delete this utility bill? This action cannot be undone."
      )
    ) {
      return;
    }

    setDeletingId(bill.id);
    try {
      await deleteUtilityBill(bill.id);
      setBills((prev) => prev.filter((item) => item.id !== bill.id));
      toast.success("Utility bill deleted successfully");
      scrollToUtilityTop();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete utility bill");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.outlet_id) {
      toast.error("Please select outlet");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        month: Number(formData.month),
        year: Number(formData.year),
        outlet_id:
          dashboardOutletId !== "all"
            ? dashboardOutletId
            : formData.outlet_id,
        electricity_bill: num(formData.electricity_bill),
        maintenance_cost: num(formData.maintenance_cost),
        water_bill: num(formData.water_bill),
        garbage: num(formData.garbage),
        internet: num(formData.internet),
        gas_monthly: num(formData.gas_monthly),
        other_utility: num(formData.other_utility),
        remarks: formData.remarks || "",
      };

      if (editingId) {
        await api.put(`/utility-bills/${editingId}`, payload);
        toast.success("Utility bill updated successfully");
      } else {
        await api.post(`/utility-bills`, payload);
        toast.success("Utility bill created successfully");
      }

      await fetchBills();
      closeForm();
      scrollToUtilityTop();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (
      selectedBill &&
      dashboardOutletId !== "all" &&
      String(selectedBill.outlet_id) !== String(dashboardOutletId)
    ) {
      setSelectedBill(null);
    }

    if (showForm && editingId && dashboardOutletId !== "all") {
      const editingBill = bills.find(
        (bill) => String(bill.id) === String(editingId)
      );

      if (
        editingBill &&
        String(editingBill.outlet_id) !== String(dashboardOutletId)
      ) {
        closeForm();
      }
    }
  }, [dashboardOutletId, selectedBill, editingId, showForm, bills]);

  const yearOptions = useMemo(() => {
    const years = bills.map((bill) => bill.year).filter(Boolean);
    return Array.from(new Set(years)).sort((a, b) => Number(b) - Number(a));
  }, [bills]);

  const filteredBills = useMemo(() => {
    return bills.filter((bill) => {
      const text = `${getOutletName(bill)} ${bill.month || ""} ${bill.year || ""} ${
        bill.status || ""
      } ${bill.remarks || ""}`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const dashboardOutletMatch =
        dashboardOutletId === "all" ||
        String(bill.outlet_id) === String(dashboardOutletId);

      const outletMatch =
        effectiveOutletFilter === "all" ||
        String(bill.outlet_id) === String(effectiveOutletFilter);

      const monthMatch = monthFilter === "all" || String(bill.month) === String(monthFilter);
      const yearMatch = yearFilter === "all" || String(bill.year) === String(yearFilter);
      const statusMatch =
        statusFilter === "all" ||
        String(bill.status || "").toLowerCase() === String(statusFilter).toLowerCase();

      return (
        dashboardOutletMatch &&
        searchMatch &&
        outletMatch &&
        monthMatch &&
        yearMatch &&
        statusMatch
      );
    });
  }, [
    bills,
    outlets,
    searchTerm,
    outletFilter,
    effectiveOutletFilter,
    dashboardOutletId,
    monthFilter,
    yearFilter,
    statusFilter,
  ]);

  const visibleBills = useMemo(() => filteredBills.slice(0, Number(pageSize)), [
    filteredBills,
    pageSize,
  ]);

  const summary = useMemo(() => {
    const electricity = filteredBills.reduce((sum, bill) => sum + num(bill.electricity_bill), 0);
    const water = filteredBills.reduce((sum, bill) => sum + num(bill.water_bill), 0);
    const maintenance = filteredBills.reduce((sum, bill) => sum + num(bill.maintenance_cost), 0);
    const total = filteredBills.reduce(
      (sum, bill) => sum + (num(bill.total_utility_cost) || calculateTotal(bill)),
      0
    );

    return {
      entries: filteredBills.length,
      electricity,
      water,
      maintenance,
      total,
      verified: filteredBills.filter((item) => item.status === "Verified").length,
    };
  }, [filteredBills]);

  const handleExport = () => {
    const headers = [
      "Month",
      "Year",
      "Outlet",
      "Electricity",
      "Maintenance",
      "Water",
      "Garbage",
      "Internet",
      "Gas",
      "Other",
      "Total Utility Cost",
      "Status",
      "Remarks",
    ];

    const rows = filteredBills.map((bill) => [
      monthName(bill.month),
      bill.year || "",
      getOutletName(bill),
      bill.electricity_bill || 0,
      bill.maintenance_cost || 0,
      bill.water_bill || 0,
      bill.garbage || 0,
      bill.internet || 0,
      bill.gas_monthly || 0,
      bill.other_utility || 0,
      bill.total_utility_cost || calculateTotal(bill),
      bill.status || "",
      bill.remarks || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bigbean-utility-bills.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Utility bills exported");
  };

  const StatusBadge = ({ status }) => {
    const styles = {
      Draft: "bg-[#FFF4E5] text-[#FF9F43]",
      Submitted: "bg-[#E6FAFD] text-[#00A6B7]",
      Verified: "bg-[#E9F9EF] text-[#28C76F]",
    };
    return (
      <span
        className={`inline-flex rounded px-3 py-1 text-[12px] font-semibold ${
          styles[status] || "bg-[#F3F2F7] text-[#6F6B7D]"
        }`}
      >
        {status || "Draft"}
      </span>
    );
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
          <h1 className={`text-[24px] font-semibold ${mainTextClass}`}>Utility Bills</h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Enter outlet-wise month-end electricity, water, maintenance and other utility costs for P&amp;L.
            {dashboardOutletId !== "all" && (
              <> Showing only the outlet selected in the dashboard.</>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
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
            onClick={openCreateForm}
            className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus size={18} />
            Add Utility Bill
          </button>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Entries"
          value={summary.entries}
          subtitle="Filtered bill rows"
          icon={FileText}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />
        <StatCard
          title="Electricity"
          value={compactINR(summary.electricity)}
          subtitle="Electricity bill total"
          icon={Zap}
          color="#FF9F43"
          bg="#FFF4E5"
        />
        <StatCard
          title="Water"
          value={compactINR(summary.water)}
          subtitle="Water bill total"
          icon={Droplets}
          color="#00CFE8"
          bg="#E6FAFD"
        />
        <StatCard
          title="Maintenance"
          value={compactINR(summary.maintenance)}
          subtitle="Maintenance cost total"
          icon={Wrench}
          color="#7367F0"
          bg="#F0EEFF"
        />
        <StatCard
          title="Total Cost"
          value={compactINR(summary.total)}
          subtitle={`${summary.verified} verified records`}
          icon={CheckCircle2}
          color="#28C76F"
          bg="#E9F9EF"
        />
      </div>

      {showForm && (
        <div className={`min-w-0 rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                {editingId ? "Edit Utility Bill" : "New Utility Bill"}
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Enter outlet-wise utility costs for the selected month.
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Month *
                </label>
                <select
                  value={formData.month}
                  onChange={(event) => setFormData({ ...formData, month: event.target.value })}
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
                  onChange={(event) => setFormData({ ...formData, year: event.target.value })}
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  required
                />
              </div>

              <div>
                <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                  Outlet *
                </label>
                <select
                  value={
                    dashboardOutletId !== "all"
                      ? dashboardOutletId
                      : formData.outlet_id
                  }
                  onChange={(event) =>
                    setFormData({ ...formData, outlet_id: event.target.value })
                  }
                  disabled={dashboardOutletId !== "all"}
                  className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none disabled:cursor-not-allowed disabled:opacity-70 ${inputClass}`}
                  required
                >
                  <option value="">Select Outlet</option>
                  {scopedOutlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.outlet_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-md border border-[#EBE9F1] p-5">
              <h4 className={`text-[18px] font-semibold ${mainTextClass}`}>Utility Components</h4>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["electricity_bill", "Electricity Bill"],
                  ["maintenance_cost", "Maintenance Cost"],
                  ["water_bill", "Water Bill"],
                  ["garbage", "Garbage"],
                  ["internet", "Internet"],
                  ["gas_monthly", "Gas (Monthly)"],
                  ["other_utility", "Other Utility"],
                ].map(([field, label]) => (
                  <div key={field}>
                    <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                      {label}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData[field]}
                      onChange={(event) =>
                        setFormData({ ...formData, [field]: event.target.value })
                      }
                      className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-md bg-[#E9F9EF] p-4">
                <p className="text-[13px] font-medium text-[#28C76F]">Total Utility Cost</p>
                <p className="mt-1 text-[22px] font-semibold text-[#28C76F]">
                  {formatINR(formTotal)}
                </p>
              </div>
            </div>

            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                Remarks
              </label>
              <textarea
                value={formData.remarks}
                onChange={(event) => setFormData({ ...formData, remarks: event.target.value })}
                className={`min-h-[90px] w-full rounded-md border px-4 py-3 text-[14px] outline-none ${inputClass}`}
                placeholder="Any additional notes..."
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
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
                    <Zap size={18} />
                    {editingId ? "Update Utility Bill" : "Create Utility Bill"}
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

      {selectedBill && (
        <div className={`min-w-0 rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>Utility Bill Details</h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                {getOutletName(selectedBill)} - {monthName(selectedBill.month)} {selectedBill.year}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedBill(null)}
              className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem label="Record ID:" value={selectedBill.id} />
              <DetailItem label="Outlet:" value={getOutletName(selectedBill)} />
              <DetailItem
                label="Period:"
                value={`${monthName(selectedBill.month)} ${selectedBill.year}`}
              />
              <DetailItem label="Status:" value={selectedBill.status || "Draft"} />
            </div>

            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem label="Electricity:" value={formatINR(selectedBill.electricity_bill)} />
              <DetailItem label="Maintenance:" value={formatINR(selectedBill.maintenance_cost)} />
              <DetailItem label="Water:" value={formatINR(selectedBill.water_bill)} />
              <DetailItem label="Garbage:" value={formatINR(selectedBill.garbage)} />
            </div>

            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem label="Internet:" value={formatINR(selectedBill.internet)} />
              <DetailItem label="Gas:" value={formatINR(selectedBill.gas_monthly)} />
              <DetailItem label="Other:" value={formatINR(selectedBill.other_utility)} />
              <DetailItem
                label="Total Cost:"
                value={formatINR(
                  selectedBill.total_utility_cost || calculateTotal(selectedBill)
                )}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {selectedBill.status !== "Verified" && (
              <button
                type="button"
                onClick={() => handleEdit(selectedBill)}
                className="flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[15px] font-semibold text-white"
                style={{ backgroundColor: primaryColor }}
              >
                <Edit2 size={17} />
                Edit
              </button>
            )}

            {selectedBill.status === "Submitted" && (
              <button
                type="button"
                onClick={() => handleVerify(selectedBill.id, "Verified")}
                disabled={verifyingId === selectedBill.id}
                className="flex items-center justify-center gap-2 rounded-md bg-[#E9F9EF] px-5 py-2.5 text-[15px] font-semibold text-[#28C76F]"
              >
                {verifyingId === selectedBill.id ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={17} />
                )}
                Verify
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`min-w-0 max-w-full rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
        <div className="border-b border-[#EBE9F1] p-6">
          <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>Filters</h3>

          <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <select
              value={effectiveOutletFilter}
              onChange={(event) => setOutletFilter(event.target.value)}
              disabled={dashboardOutletId !== "all"}
              className={`h-12 w-full min-w-0 rounded-md border px-4 text-[15px] outline-none disabled:cursor-not-allowed disabled:opacity-70 ${inputClass}`}
            >
              {dashboardOutletId === "all" && (
                <option value="all">Select Outlet</option>
              )}
              {scopedOutlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.outlet_name}
                </option>
              ))}
            </select>

            <select
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
              className={`h-12 w-full min-w-0 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
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
              className={`h-12 w-full min-w-0 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Year</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={`h-12 w-full min-w-0 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Status</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="Verified">Verified</option>
            </select>

            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search Utility Bills"
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
              <Download size={17} />
              Export
            </button>

            <button
              type="button"
              onClick={openCreateForm}
              className="flex h-12 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)]"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus size={18} />
              Add Utility Bill
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Loader2 size={36} className="mx-auto animate-spin" style={{ color: primaryColor }} />
              <p className={`mt-3 text-[14px] ${mutedClass}`}>Loading utility bills...</p>
            </div>
          </div>
        ) : visibleBills.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Zap size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No utility bills found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add a new utility bill or change filters.
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full min-w-0 max-w-full overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse xl:min-w-full">
              <thead>
                <tr className="border-b border-[#EBE9F1]">
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Month / Year
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Outlet
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Electricity
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Water
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Maintenance
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Total Cost
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Status
                  </th>
                  <th className={`sticky right-0 z-10 bg-inherit px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D] ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleBills.map((bill) => {
                  const total = num(bill.total_utility_cost) || calculateTotal(bill);

                  return (
                    <tr key={bill.id} className="border-b border-[#EBE9F1] transition hover:bg-[#F8F7FA]">
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
                              {monthName(bill.month)}
                            </p>
                            <p className="text-[13px] text-[#6F6B7D]">{bill.year || "-"}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">{getOutletName(bill)}</td>
                      <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                        {formatINR(bill.electricity_bill)}
                      </td>
                      <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                        {formatINR(bill.water_bill)}
                      </td>
                      <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                        {formatINR(bill.maintenance_cost)}
                      </td>
                      <td className="px-6 py-4 text-[14px] font-semibold text-[#28C76F]">
                        {formatINR(total)}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={bill.status} />
                      </td>
                      <td className={`sticky right-0 z-10 px-6 py-4 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                        <div className="flex items-center gap-3 text-[#6F6B7D]">
                          <button
                            type="button"
                            onClick={() => handleView(bill)}
                            className="transition hover:text-[#7367F0]"
                            title="View Details"
                          >
                            <Eye size={20} />
                          </button>

                          {bill.status !== "Verified" && (
                            <button
                              type="button"
                              onClick={() => handleEdit(bill)}
                              className="transition hover:text-[#00A6B7]"
                              title="Edit"
                            >
                              <Edit2 size={20} />
                            </button>
                          )}

                          {bill.status === "Submitted" && (
                            <button
                              type="button"
                              onClick={() => handleVerify(bill.id, "Verified")}
                              disabled={verifyingId === bill.id}
                              className="text-[13px] font-semibold text-[#28C76F] disabled:opacity-50"
                            >
                              {verifyingId === bill.id ? "Verifying..." : "Verify"}
                            </button>
                          )}

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(bill)}
                              disabled={deletingId === bill.id}
                              className="transition hover:text-[#EA5455] disabled:opacity-50"
                              title="Delete"
                            >
                              {deletingId === bill.id ? (
                                <Loader2 size={20} className="animate-spin" />
                              ) : (
                                <Trash2 size={20} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredBills.length > pageSize && (
              <div className="border-t border-[#EBE9F1] px-6 py-4 text-[14px] text-[#6F6B7D]">
                Showing first {pageSize} of {filteredBills.length} utility bills.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UtilityBills;

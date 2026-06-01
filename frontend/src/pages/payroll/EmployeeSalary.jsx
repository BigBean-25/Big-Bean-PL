import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Eye,
  Search,
  Download,
  Loader2,
  RefreshCw,
  Calendar,
  DollarSign,
  Wallet,
  Home,
  FileText,
  CheckCircle2,
  AlertCircle,
  Store,
} from "lucide-react";
import { masterAPI } from "../../services/api";
import toast from "react-hot-toast";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001/api";

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
  total_employee_salary: "",
  incentive_bonus: "",
  staff_accommodation: "",
  other_staff_cost: "",
  remarks: "",
  status: "Draft",
});

const getTokenHeaders = () => {
  const token = localStorage.getItem("token");

  return {
    Authorization: `Bearer ${token}`,
  };
};

const EmployeeSalary = () => {
  const [salaries, setSalaries] = useState([]);
  const [outlets, setOutlets] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedSalary, setSelectedSalary] = useState(null);

  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);

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
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);

    try {
      await Promise.all([fetchSalaries(), fetchOutlets()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSalaries = async () => {
    try {
      const response = await axios.get(`${API_URL}/payroll/employee-salary`, {
        headers: getTokenHeaders(),
      });

      setSalaries(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch employee salaries");
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

  const getOutletName = (salary) => {
    if (salary?.outlet_name) return salary.outlet_name;

    const outlet = outlets.find(
      (item) => Number(item.id) === Number(salary?.outlet_id)
    );

    return outlet?.outlet_name || "-";
  };

  const calculateTotal = (data) =>
    num(data.total_employee_salary) +
    num(data.incentive_bonus) +
    num(data.staff_accommodation) +
    num(data.other_staff_cost);

  const formTotalCost = calculateTotal(formData);

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
    setSelectedSalary(null);
    setShowForm(true);
  };

  const handleEdit = (salary) => {
    setEditingId(salary.id);
    setSelectedSalary(null);

    setFormData({
      month: String(salary.month || new Date().getMonth() + 1),
      year: String(salary.year || new Date().getFullYear()),
      outlet_id: salary.outlet_id || "",
      total_employee_salary: salary.total_employee_salary || "",
      incentive_bonus: salary.incentive_bonus || "",
      staff_accommodation: salary.staff_accommodation || "",
      other_staff_cost: salary.other_staff_cost || "",
      remarks: salary.remarks || "",
      status: salary.status || "Draft",
    });

    setShowForm(true);
  };

  const handleView = (salary) => {
    setSelectedSalary(salary);
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this salary record?")) return;

    setDeletingId(id);

    try {
      await axios.delete(`${API_URL}/payroll/employee-salary/${id}`, {
        headers: getTokenHeaders(),
      });

      toast.success("Employee salary deleted successfully");

      if (selectedSalary?.id === id) {
        setSelectedSalary(null);
      }

      await fetchSalaries();
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleVerify = async (id, action = "Verified") => {
    setVerifyingId(id);

    try {
      await axios.post(
        `${API_URL}/payroll/employee-salary/${id}/verify`,
        { action },
        {
          headers: getTokenHeaders(),
        }
      );

      toast.success(`Salary ${action.toLowerCase()} successfully`);
      await fetchSalaries();
    } catch (error) {
      toast.error(error.response?.data?.message || "Verification failed");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.outlet_id) {
      toast.error("Please select outlet");
      return;
    }

    if (!formData.total_employee_salary || num(formData.total_employee_salary) < 0) {
      toast.error("Please enter employee salary");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        month: Number(formData.month),
        year: Number(formData.year),
        outlet_id: formData.outlet_id,
        total_employee_salary: num(formData.total_employee_salary),
        incentive_bonus: num(formData.incentive_bonus),
        staff_accommodation: num(formData.staff_accommodation),
        other_staff_cost: num(formData.other_staff_cost),
        remarks: formData.remarks || "",
        status: formData.status || "Draft",
      };

      if (editingId) {
        await axios.put(`${API_URL}/payroll/employee-salary/${editingId}`, payload, {
          headers: getTokenHeaders(),
        });

        toast.success("Employee salary updated successfully");
      } else {
        await axios.post(`${API_URL}/payroll/employee-salary`, payload, {
          headers: getTokenHeaders(),
        });

        toast.success("Employee salary created successfully");
      }

      closeForm();
      await fetchSalaries();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const yearOptions = useMemo(() => {
    const years = salaries.map((salary) => salary.year).filter(Boolean);
    return Array.from(new Set(years)).sort((a, b) => Number(b) - Number(a));
  }, [salaries]);

  const filteredSalaries = useMemo(() => {
    return salaries.filter((salary) => {
      const text = `${getOutletName(salary)} ${salary.month || ""} ${
        salary.year || ""
      } ${salary.status || ""} ${salary.remarks || ""}`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const outletMatch =
        outletFilter === "all" || String(salary.outlet_id) === String(outletFilter);

      const monthMatch =
        monthFilter === "all" || String(salary.month) === String(monthFilter);

      const yearMatch =
        yearFilter === "all" || String(salary.year) === String(yearFilter);

      const statusMatch =
        statusFilter === "all" ||
        String(salary.status || "").toLowerCase() ===
          String(statusFilter).toLowerCase();

      return searchMatch && outletMatch && monthMatch && yearMatch && statusMatch;
    });
  }, [
    salaries,
    outlets,
    searchTerm,
    outletFilter,
    monthFilter,
    yearFilter,
    statusFilter,
  ]);

  const visibleSalaries = useMemo(() => {
    return filteredSalaries.slice(0, Number(pageSize));
  }, [filteredSalaries, pageSize]);

  const summary = useMemo(() => {
    const baseSalary = filteredSalaries.reduce(
      (sum, salary) => sum + num(salary.total_employee_salary),
      0
    );

    const incentive = filteredSalaries.reduce(
      (sum, salary) => sum + num(salary.incentive_bonus),
      0
    );

    const accommodation = filteredSalaries.reduce(
      (sum, salary) => sum + num(salary.staff_accommodation),
      0
    );

    const otherCost = filteredSalaries.reduce(
      (sum, salary) => sum + num(salary.other_staff_cost),
      0
    );

    const totalCost = filteredSalaries.reduce(
      (sum, salary) =>
        sum +
        (num(salary.total_salary_cost) ||
          num(salary.total_employee_salary) +
            num(salary.incentive_bonus) +
            num(salary.staff_accommodation) +
            num(salary.other_staff_cost)),
      0
    );

    return {
      entries: filteredSalaries.length,
      baseSalary,
      incentive,
      accommodation,
      otherCost,
      totalCost,
      verified: filteredSalaries.filter((item) => item.status === "Verified").length,
    };
  }, [filteredSalaries]);

  const handleExport = () => {
    const headers = [
      "Month",
      "Year",
      "Outlet",
      "Base Salary",
      "Incentive Bonus",
      "Staff Accommodation",
      "Other Staff Cost",
      "Total Salary Cost",
      "Status",
      "Remarks",
    ];

    const rows = filteredSalaries.map((salary) => [
      monthName(salary.month),
      salary.year || "",
      getOutletName(salary),
      salary.total_employee_salary || 0,
      salary.incentive_bonus || 0,
      salary.staff_accommodation || 0,
      salary.other_staff_cost || 0,
      salary.total_salary_cost || calculateTotal(salary),
      salary.status || "",
      salary.remarks || "",
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
    link.download = "bigbean-employee-salary.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Employee salary exported");
  };

  const StatusBadge = ({ status }) => {
    const styles = {
      Draft: "bg-[#FFF4E5] text-[#FF9F43]",
      Submitted: "bg-[#E6FAFD] text-[#00A6B7]",
      Verified: "bg-[#E9F9EF] text-[#28C76F]",
      Rejected: "bg-[#FCEAEA] text-[#EA5455]",
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
      <span className={`min-w-[165px] text-[14px] font-semibold ${mainTextClass}`}>
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
            Employee Salary Management
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Manage monthly employee salary, incentives, accommodation and staff costs for P&amp;L.
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
            onClick={openCreateForm}
            className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus size={18} />
            Add Salary Record
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Entries"
          value={summary.entries}
          subtitle="Filtered salary rows"
          icon={FileText}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />

        <StatCard
          title="Base Salary"
          value={compactINR(summary.baseSalary)}
          subtitle="Employee salary total"
          icon={DollarSign}
          color="#00CFE8"
          bg="#E6FAFD"
        />

        <StatCard
          title="Incentive"
          value={compactINR(summary.incentive)}
          subtitle="Bonus and incentives"
          icon={Wallet}
          color="#FF9F43"
          bg="#FFF4E5"
        />

        <StatCard
          title="Accommodation"
          value={compactINR(summary.accommodation)}
          subtitle="Staff accommodation"
          icon={Home}
          color="#7367F0"
          bg="#F0EEFF"
        />

        <StatCard
          title="Total Cost"
          value={compactINR(summary.totalCost)}
          subtitle={`${summary.verified} verified records`}
          icon={CheckCircle2}
          color="#28C76F"
          bg="#E9F9EF"
        />
      </div>

      {showForm && (
        <div className={`rounded-md border p-6 shadow-sm ${cardClass}`}>
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                {editingId ? "Edit Salary Record" : "New Salary Record"}
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Enter outlet-wise payroll cost for the selected month.
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
            </div>

            <div className="rounded-md border border-[#EBE9F1] p-5">
              <h4 className={`text-[18px] font-semibold ${mainTextClass}`}>
                Salary Components
              </h4>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                    Total Employee Salary *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.total_employee_salary}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        total_employee_salary: event.target.value,
                      })
                    }
                    className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                    required
                  />
                </div>

                <div>
                  <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                    Incentive / Bonus
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.incentive_bonus}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        incentive_bonus: event.target.value,
                      })
                    }
                    className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  />
                </div>

                <div>
                  <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                    Staff Accommodation
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.staff_accommodation}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        staff_accommodation: event.target.value,
                      })
                    }
                    className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  />
                </div>

                <div>
                  <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                    Other Staff Cost
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.other_staff_cost}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        other_staff_cost: event.target.value,
                      })
                    }
                    className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                  />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-md bg-[#F8F7FA] p-4">
                  <p className="text-[13px] font-medium text-[#6F6B7D]">Base Salary</p>
                  <p className="mt-1 text-[22px] font-semibold text-[#2F2B3D]">
                    {formatINR(formData.total_employee_salary)}
                  </p>
                </div>

                <div className="rounded-md bg-[#FFF4E5] p-4">
                  <p className="text-[13px] font-medium text-[#FF9F43]">
                    Incentive
                  </p>
                  <p className="mt-1 text-[22px] font-semibold text-[#FF9F43]">
                    {formatINR(formData.incentive_bonus)}
                  </p>
                </div>

                <div className="rounded-md bg-[#F0EEFF] p-4">
                  <p className="text-[13px] font-medium text-[#7367F0]">
                    Accommodation
                  </p>
                  <p className="mt-1 text-[22px] font-semibold text-[#7367F0]">
                    {formatINR(formData.staff_accommodation)}
                  </p>
                </div>

                <div className="rounded-md bg-[#E9F9EF] p-4">
                  <p className="text-[13px] font-medium text-[#28C76F]">
                    Total Cost
                  </p>
                  <p className="mt-1 text-[22px] font-semibold text-[#28C76F]">
                    {formatINR(formTotalCost)}
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
                onChange={(event) =>
                  setFormData({ ...formData, remarks: event.target.value })
                }
                className={`min-h-[90px] w-full rounded-md border px-4 py-3 text-[14px] outline-none ${inputClass}`}
                placeholder="Any additional notes..."
              />
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
                    <DollarSign size={18} />
                    {editingId ? "Update Salary Record" : "Create Salary Record"}
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

      {selectedSalary && (
        <div className={`rounded-md border p-6 shadow-sm ${cardClass}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                Salary Record Details
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                {getOutletName(selectedSalary)} - {monthName(selectedSalary.month)}{" "}
                {selectedSalary.year}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedSalary(null)}
              className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem label="Record ID:" value={selectedSalary.id} />
              <DetailItem label="Outlet:" value={getOutletName(selectedSalary)} />
              <DetailItem
                label="Period:"
                value={`${monthName(selectedSalary.month)} ${selectedSalary.year}`}
              />
              <DetailItem label="Status:" value={selectedSalary.status || "Draft"} />
            </div>

            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem
                label="Base Salary:"
                value={formatINR(selectedSalary.total_employee_salary)}
              />
              <DetailItem
                label="Incentive:"
                value={formatINR(selectedSalary.incentive_bonus)}
              />
              <DetailItem
                label="Accommodation:"
                value={formatINR(selectedSalary.staff_accommodation)}
              />
              <DetailItem
                label="Other Staff Cost:"
                value={formatINR(selectedSalary.other_staff_cost)}
              />
            </div>

            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem
                label="Total Salary Cost:"
                value={formatINR(
                  selectedSalary.total_salary_cost || calculateTotal(selectedSalary)
                )}
              />
              <DetailItem label="Remarks:" value={selectedSalary.remarks} />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {selectedSalary.status === "Draft" && (
              <>
                <button
                  type="button"
                  onClick={() => handleEdit(selectedSalary)}
                  className="flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[15px] font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Edit2 size={17} />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(selectedSalary.id)}
                  className="flex items-center justify-center gap-2 rounded-md bg-[#FCEAEA] px-5 py-2.5 text-[15px] font-semibold text-[#EA5455]"
                >
                  <Trash2 size={17} />
                  Delete
                </button>
              </>
            )}

            {selectedSalary.status === "Submitted" && (
              <button
                type="button"
                onClick={() => handleVerify(selectedSalary.id, "Verified")}
                disabled={verifyingId === selectedSalary.id}
                className="flex items-center justify-center gap-2 rounded-md bg-[#E9F9EF] px-5 py-2.5 text-[15px] font-semibold text-[#28C76F]"
              >
                {verifyingId === selectedSalary.id ? (
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

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Status</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="Verified">Verified</option>
              <option value="Rejected">Rejected</option>
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
                placeholder="Search Salary"
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
              className="flex h-12 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-semibold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus size={18} />
              Add Salary Record
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
              <p className={`mt-3 text-[14px] ${mutedClass}`}>
                Loading salary records...
              </p>
            </div>
          </div>
        ) : visibleSalaries.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <DollarSign size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No salary records found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Add a new salary record or change filters.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1250px] border-collapse">
              <thead>
                <tr className="border-b border-[#EBE9F1]">
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Month / Year
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Outlet
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Base Salary
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Incentive
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Accommodation
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Other Cost
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Total Cost
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
                {visibleSalaries.map((salary) => {
                  const total =
                    num(salary.total_salary_cost) || calculateTotal(salary);

                  return (
                    <tr
                      key={salary.id}
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
                              {monthName(salary.month)}
                            </p>
                            <p className="text-[13px] text-[#6F6B7D]">
                              {salary.year || "-"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                        {getOutletName(salary)}
                      </td>

                      <td className="px-6 py-4 text-[14px] font-semibold text-[#2F2B3D]">
                        {formatINR(salary.total_employee_salary)}
                      </td>

                      <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                        {formatINR(salary.incentive_bonus)}
                      </td>

                      <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                        {formatINR(salary.staff_accommodation)}
                      </td>

                      <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                        {formatINR(salary.other_staff_cost)}
                      </td>

                      <td className="px-6 py-4 text-[14px] font-semibold text-[#28C76F]">
                        {formatINR(total)}
                      </td>

                      <td className="px-6 py-4">
                        <StatusBadge status={salary.status} />
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 text-[#6F6B7D]">
                          {salary.status === "Draft" && (
                            <button
                              type="button"
                              onClick={() => handleDelete(salary.id)}
                              disabled={deletingId === salary.id}
                              className="transition hover:text-[#EA5455] disabled:opacity-50"
                              title="Delete"
                            >
                              {deletingId === salary.id ? (
                                <Loader2 size={20} className="animate-spin" />
                              ) : (
                                <Trash2 size={20} />
                              )}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleView(salary)}
                            className="transition hover:text-[#7367F0]"
                            title="View Details"
                          >
                            <Eye size={20} />
                          </button>

                          {salary.status === "Draft" && (
                            <button
                              type="button"
                              onClick={() => handleEdit(salary)}
                              className="transition hover:text-[#00A6B7]"
                              title="Edit"
                            >
                              <Edit2 size={20} />
                            </button>
                          )}

                          {salary.status === "Submitted" && (
                            <button
                              type="button"
                              onClick={() => handleVerify(salary.id, "Verified")}
                              disabled={verifyingId === salary.id}
                              className="text-[13px] font-semibold text-[#28C76F] disabled:opacity-50"
                            >
                              {verifyingId === salary.id ? "Verifying..." : "Verify"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredSalaries.length > pageSize && (
              <div className="border-t border-[#EBE9F1] px-6 py-4 text-[14px] text-[#6F6B7D]">
                Showing first {pageSize} of {filteredSalaries.length} salary records.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeSalary;
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Download,
  Eye,
  AlertCircle,
  Search,
  Loader2,
  RefreshCw,
  X,
  FileText,
  CheckCircle2,
  Clock,
  Trash2,
  Store,
  Calendar,
  IndianRupee,
} from "lucide-react";
import { uploadAPI, masterAPI } from "../../services/api";
import toast from "react-hot-toast";

const getRows = (response) => {
  const data = response?.data?.data || response?.data || [];
  return Array.isArray(data) ? data : [];
};

const todayInput = () => new Date().toISOString().slice(0, 10);

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

const formatDate = (value, withTime = false) => {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(withTime
        ? {
            hour: "2-digit",
            minute: "2-digit",
          }
        : {}),
    });
  } catch {
    return "-";
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
  purchase_date: todayInput(),
});

const MaterialPurchaseUpload = () => {
  const fileInputRef = useRef(null);

  const [uploads, setUploads] = useState([]);
  const [outlets, setOutlets] = useState([]);

  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedUpload, setSelectedUpload] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [outletFilter, setOutletFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
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
      await Promise.all([fetchUploads(), fetchOutlets()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUploads = async () => {
    try {
      const response = await uploadAPI.getUploadHistory("material_purchase");
      setUploads(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch upload history");
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

  const getOutletName = (upload) => {
    if (upload?.outlet_name) return upload.outlet_name;

    const outlet = outlets.find(
      (item) => Number(item.id) === Number(upload?.outlet_id)
    );

    return outlet?.outlet_name || "-";
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const validExtension =
      lowerName.endsWith(".xls") || lowerName.endsWith(".xlsx");

    if (!validExtension) {
      toast.error("Please upload a valid Excel file (.xls or .xlsx)");
      event.target.value = "";
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const clearFile = () => {
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();

    if (!formData.outlet_id) {
      toast.error("Please select outlet");
      return;
    }

    if (!formData.purchase_date) {
      toast.error("Please select purchase date");
      return;
    }

    if (!selectedFile) {
      toast.error("Please select an Excel file");
      return;
    }

    const uploadData = new FormData();
    uploadData.append("file", selectedFile);
    uploadData.append("outlet_id", formData.outlet_id);
    uploadData.append("purchase_date", formData.purchase_date);

    setUploading(true);

    try {
      await uploadAPI.uploadMaterialPurchase(uploadData);
      toast.success("Material purchase uploaded successfully");

      clearFile();
      setFormData(emptyForm());
      await fetchUploads();
    } catch (error) {
      toast.error(error.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const headers = [
      "Date",
      "Supplier",
      "Material",
      "Qty",
      "Unit",
      "Rate",
      "Amount",
      "Bill No",
      "Remarks",
    ];

    const sampleRows = [
      [
        todayInput(),
        "Sample Supplier",
        "Milk",
        "10",
        "Litre",
        "60",
        "600",
        "BILL-001",
        "Sample row",
      ],
    ];

    const csv = [headers, ...sampleRows]
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
    link.download = "material_purchase_template.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Template downloaded");
  };

  const filteredUploads = useMemo(() => {
    return uploads.filter((upload) => {
      const text = `${getOutletName(upload)} ${upload.file_name || ""} ${
        upload.status || ""
      } ${upload.purchase_date || ""}`.toLowerCase();

      const searchMatch = text.includes(searchTerm.toLowerCase());

      const outletMatch =
        outletFilter === "all" ||
        String(upload.outlet_id) === String(outletFilter);

      const statusMatch =
        statusFilter === "all" ||
        String(upload.status || "").toLowerCase() ===
          String(statusFilter).toLowerCase();

      const dateMatch =
        !dateFilter ||
        String(upload.purchase_date || "").slice(0, 10) === String(dateFilter);

      return searchMatch && outletMatch && statusMatch && dateMatch;
    });
  }, [uploads, outlets, searchTerm, outletFilter, statusFilter, dateFilter]);

  const visibleUploads = useMemo(() => {
    return filteredUploads.slice(0, Number(pageSize));
  }, [filteredUploads, pageSize]);

  const summary = useMemo(() => {
    const totalRows = filteredUploads.reduce(
      (sum, upload) => sum + num(upload.total_rows),
      0
    );

    const successRows = filteredUploads.reduce(
      (sum, upload) => sum + num(upload.success_rows),
      0
    );

    const failedRows = filteredUploads.reduce(
      (sum, upload) => sum + num(upload.failed_rows),
      0
    );

    const totalAmount = filteredUploads.reduce(
      (sum, upload) => sum + num(upload.total_amount),
      0
    );

    return {
      entries: filteredUploads.length,
      totalRows,
      successRows,
      failedRows,
      totalAmount,
      completed: filteredUploads.filter((item) => item.status === "Completed")
        .length,
    };
  }, [filteredUploads]);

  const exportHistory = () => {
    const headers = [
      "Upload Date",
      "Outlet",
      "Purchase Date",
      "File Name",
      "Success Rows",
      "Failed Rows",
      "Total Rows",
      "Total Amount",
      "Status",
    ];

    const rows = filteredUploads.map((upload) => [
      formatDate(upload.created_at, true),
      getOutletName(upload),
      formatDate(upload.purchase_date),
      upload.file_name || "",
      upload.success_rows || 0,
      upload.failed_rows || 0,
      upload.total_rows || 0,
      upload.total_amount || 0,
      upload.status || "",
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
    link.download = "material_purchase_upload_history.csv";
    link.click();

    URL.revokeObjectURL(url);
    toast.success("Upload history exported");
  };

  const StatusBadge = ({ status }) => {
    const styles = {
      Pending: "bg-[#F3F2F7] text-[#6F6B7D]",
      Processing: "bg-[#FFF4E5] text-[#FF9F43]",
      Completed: "bg-[#E9F9EF] text-[#28C76F]",
      Failed: "bg-[#FCEAEA] text-[#EA5455]",
    };

    return (
      <span
        className={`inline-flex rounded px-3 py-1 text-[12px] font-semibold ${
          styles[status] || "bg-[#F3F2F7] text-[#6F6B7D]"
        }`}
      >
        {status || "Pending"}
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
      <span className={`min-w-[150px] text-[14px] font-semibold ${mainTextClass}`}>
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
            Material Purchase Upload
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Upload outlet-wise material purchases from PetPooja purchase format.
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
            onClick={exportHistory}
            className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
          >
            <Download size={18} />
            Export
          </button>

          <button
            type="button"
            onClick={downloadTemplate}
            className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <Download size={18} />
            Download Template
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Uploads"
          value={summary.entries}
          subtitle="Filtered upload records"
          icon={FileText}
          color={primaryColor}
          bg={`${primaryColor}18`}
        />

        <StatCard
          title="Completed"
          value={summary.completed}
          subtitle="Successfully processed"
          icon={CheckCircle2}
          color="#28C76F"
          bg="#E9F9EF"
        />

        <StatCard
          title="Success Rows"
          value={summary.successRows}
          subtitle={`${summary.totalRows} total rows`}
          icon={Upload}
          color="#00CFE8"
          bg="#E6FAFD"
        />

        <StatCard
          title="Failed Rows"
          value={summary.failedRows}
          subtitle="Rows with issues"
          icon={AlertCircle}
          color="#EA5455"
          bg="#FCEAEA"
        />

        <StatCard
          title="Total Amount"
          value={compactINR(summary.totalAmount)}
          subtitle="Uploaded purchase value"
          icon={IndianRupee}
          color="#FF9F43"
          bg="#FFF4E5"
        />
      </div>

      <div className={`rounded-md border p-6 shadow-sm ${cardClass}`}>
        <div className="mb-6">
          <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
            Upload Material Purchases
          </h3>
          <p className={`mt-1 text-[14px] ${mutedClass}`}>
            Select outlet, purchase date and upload the Excel file.
          </p>
        </div>

        <form onSubmit={handleUpload} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                Purchase Date *
              </label>
              <input
                type="date"
                value={formData.purchase_date}
                onChange={(event) =>
                  setFormData({ ...formData, purchase_date: event.target.value })
                }
                className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                required
              />
            </div>

            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                Excel File *
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx"
                onChange={handleFileChange}
                className={`block h-11 w-full rounded-md border text-[14px] file:mr-4 file:h-full file:border-0 file:px-4 file:font-semibold file:text-white ${inputClass}`}
                style={{
                  "--tw-file-bg": primaryColor,
                }}
                required
              />
            </div>
          </div>

          {selectedFile && (
            <div className="flex flex-col gap-3 rounded-md bg-[#F8F7FA] p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-md text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <FileText size={20} />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-[#2F2B3D]">
                    {selectedFile.name}
                  </p>
                  <p className="text-[13px] text-[#6F6B7D]">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={clearFile}
                className="flex items-center gap-2 rounded-md bg-[#FCEAEA] px-4 py-2 text-[14px] font-semibold text-[#EA5455]"
              >
                <X size={16} />
                Remove
              </button>
            </div>
          )}

          <div className="rounded-md border border-[#BEE5EB] bg-[#E6FAFD] p-4">
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 shrink-0 text-[#00A6B7]" size={20} />
              <div className="text-[14px] text-[#00A6B7]">
                <p className="font-semibold">PetPooja Purchase Format</p>
                <p className="mt-1">
                  Required columns: Date, Supplier, Material, Qty, Unit, Rate,
                  Amount, Bill No, Remarks.
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="flex items-center justify-center gap-2 rounded-md px-5 py-3 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
            style={{ backgroundColor: primaryColor }}
          >
            {uploading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={18} />
                Upload File
              </>
            )}
          </button>
        </form>
      </div>

      {selectedUpload && (
        <div className={`rounded-md border p-6 shadow-sm ${cardClass}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
                Upload Details
              </h3>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                {selectedUpload.file_name || "Material Purchase Upload"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedUpload(null)}
              className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F3F2F7] text-[#6F6B7D]"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem label="Upload ID:" value={selectedUpload.id} />
              <DetailItem label="Outlet:" value={getOutletName(selectedUpload)} />
              <DetailItem
                label="Purchase Date:"
                value={formatDate(selectedUpload.purchase_date)}
              />
              <DetailItem
                label="Uploaded At:"
                value={formatDate(selectedUpload.created_at, true)}
              />
            </div>

            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem label="File Name:" value={selectedUpload.file_name} />
              <DetailItem label="Status:" value={selectedUpload.status || "Pending"} />
              <DetailItem label="Total Rows:" value={selectedUpload.total_rows || 0} />
              <DetailItem
                label="Total Amount:"
                value={formatINR(selectedUpload.total_amount)}
              />
            </div>

            <div className="rounded-md bg-[#F8F7FA] p-5">
              <DetailItem label="Success Rows:" value={selectedUpload.success_rows || 0} />
              <DetailItem label="Failed Rows:" value={selectedUpload.failed_rows || 0} />
              <DetailItem
                label="Processing:"
                value={
                  selectedUpload.status === "Completed"
                    ? "Completed"
                    : selectedUpload.status || "Pending"
                }
              />
            </div>
          </div>
        </div>
      )}

      <div className={`rounded-md border shadow-sm ${cardClass}`}>
        <div className="border-b border-[#EBE9F1] p-6">
          <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
            Upload History
          </h3>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
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
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            >
              <option value="all">Select Status</option>
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="Completed">Completed</option>
              <option value="Failed">Failed</option>
            </select>

            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className={`h-12 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
            />

            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search Upload"
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

          <button
            type="button"
            onClick={exportHistory}
            className="flex h-12 items-center justify-center gap-2 rounded-md bg-[#F3F2F7] px-5 text-[15px] font-semibold text-[#6F6B7D]"
          >
            <Download size={17} />
            Export History
          </button>
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
                Loading upload history...
              </p>
            </div>
          </div>
        ) : visibleUploads.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Upload size={42} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[16px] font-semibold ${mainTextClass}`}>
                No uploads found
              </p>
              <p className={`mt-1 text-[14px] ${mutedClass}`}>
                Upload a material purchase file or change filters.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] border-collapse">
              <thead>
                <tr className="border-b border-[#EBE9F1]">
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Uploaded Date
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Outlet
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Purchase Date
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    File
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Rows
                  </th>
                  <th className="px-6 py-4 text-left text-[13px] font-semibold uppercase tracking-wide text-[#2F2B3D]">
                    Total Amount
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
                {visibleUploads.map((upload) => (
                  <tr
                    key={upload.id}
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
                            {formatDate(upload.created_at)}
                          </p>
                          <p className="text-[13px] text-[#6F6B7D]">
                            {formatDate(upload.created_at, true)}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                      <div className="flex items-center gap-2">
                        <Store size={16} />
                        {getOutletName(upload)}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-[14px] text-[#6F6B7D]">
                      {formatDate(upload.purchase_date)}
                    </td>

                    <td className="max-w-[280px] px-6 py-4">
                      <p className="truncate text-[14px] font-semibold text-[#2F2B3D]">
                        {upload.file_name || "-"}
                      </p>
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-[14px]">
                        <span className="font-semibold text-[#28C76F]">
                          {upload.success_rows || 0}
                        </span>
                        <span className="mx-1 text-[#A8AAAE]">/</span>
                        <span className="font-semibold text-[#EA5455]">
                          {upload.failed_rows || 0}
                        </span>
                        <span className="mx-1 text-[#A8AAAE]">/</span>
                        <span className="font-semibold text-[#6F6B7D]">
                          {upload.total_rows || 0}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-[14px] font-semibold text-[#2F2B3D]">
                      {formatINR(upload.total_amount)}
                    </td>

                    <td className="px-6 py-4">
                      <StatusBadge status={upload.status} />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 text-[#6F6B7D]">
                        <button
                          type="button"
                          onClick={() => setSelectedUpload(upload)}
                          className="transition hover:text-[#7367F0]"
                          title="View Details"
                        >
                          <Eye size={20} />
                        </button>

                        {upload.status === "Failed" && (
                          <button
                            type="button"
                            className="transition hover:text-[#EA5455]"
                            title="Failed Upload"
                          >
                            <Trash2 size={20} />
                          </button>
                        )}

                        {upload.status === "Processing" && (
                          <Clock size={20} className="text-[#FF9F43]" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredUploads.length > pageSize && (
              <div className="border-t border-[#EBE9F1] px-6 py-4 text-[14px] text-[#6F6B7D]">
                Showing first {pageSize} of {filteredUploads.length} uploads.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MaterialPurchaseUpload;
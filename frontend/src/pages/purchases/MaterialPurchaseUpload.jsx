import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Download,
  ChevronDown,
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

// Download dropdown reused for both the Upload History row action and the
// Upload Details panel. Gating rules:
// - Original: enabled whenever the upload exists (server 404s if the file is missing)
// - Processed: enabled only when success_rows > 0
// - Error Report: enabled only when failed_rows > 0
const DownloadMenu = ({
  upload,
  onDownloadOriginal,
  onDownloadProcessed,
  onDownloadErrors,
  downloadKey,
  cardClass,
  primaryColor,
  compact = true,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const canDownloadOriginal = true;
  const canDownloadProcessed = Number(upload?.success_rows) > 0;
  const canDownloadErrors = Number(upload?.failed_rows) > 0;

  const isBusy = (suffix) => downloadKey === `${upload?.id}-${suffix}`;

  const menuItemClass =
    "flex w-full items-center gap-2 px-4 py-2.5 text-left text-[14px] font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-inherit hover:bg-[#F0EEFF] hover:text-[#7367F0]";

  const spinnerClass = "ml-auto shrink-0";

  return (
    <div className="relative inline-flex items-center overflow-visible" ref={containerRef}>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex h-8 w-9 items-center justify-center gap-0.5 rounded-md text-[13px] font-semibold transition hover:bg-[#E9F9EF] hover:text-[#28C76F]"
          title="Download"
        >
          <Download size={16} />
          <ChevronDown size={14} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-[14px] font-semibold text-white shadow-sm"
          style={{ backgroundColor: primaryColor }}
        >
          <Download size={16} />
          Download
          <ChevronDown size={14} />
        </button>
      )}

      {open && (
        <div
          className={`absolute right-0 top-full z-50 mt-2 min-w-[220px] max-w-[260px] rounded-md border shadow-lg py-1 ${cardClass}`}
        >
          <button
            type="button"
            disabled={!canDownloadOriginal || isBusy("original")}
            onClick={() => {
              setOpen(false);
              onDownloadOriginal(upload);
            }}
            className={menuItemClass}
          >
            <Download size={16} className="shrink-0" />
            Original File
            {isBusy("original") && (
              <Loader2 size={14} className={`${spinnerClass} animate-spin`} />
            )}
          </button>
          <button
            type="button"
            disabled={!canDownloadProcessed || isBusy("processed")}
            onClick={() => {
              setOpen(false);
              onDownloadProcessed(upload);
            }}
            className={menuItemClass}
          >
            <Download size={16} className="shrink-0" />
            Processed File
            {isBusy("processed") && (
              <Loader2 size={14} className={`${spinnerClass} animate-spin`} />
            )}
          </button>
          <button
            type="button"
            disabled={!canDownloadErrors || isBusy("errors")}
            onClick={() => {
              setOpen(false);
              onDownloadErrors(upload);
            }}
            className={menuItemClass}
          >
            <FileText size={16} className="shrink-0" />
            Error Report
            {isBusy("errors") && (
              <Loader2 size={14} className={`${spinnerClass} animate-spin`} />
            )}
          </button>
        </div>
      )}
    </div>
  );
};

const MaterialPurchaseUpload = () => {
  const fileInputRef = useRef(null);

  const [uploads, setUploads] = useState([]);
  const [outlets, setOutlets] = useState([]);

  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedUpload, setSelectedUpload] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadKey, setDownloadKey] = useState(null);
  const [templateDownloading, setTemplateDownloading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

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
      const response = await uploadAPI.uploadMaterialPurchase(uploadData);
      const result = response?.data?.data || {};
      const successRows = Number(result.successRows || 0);
      const failedRows = Number(result.failedRows || 0);

      if (failedRows > 0 && successRows > 0) {
        toast.error(
          `Uploaded with issues: ${successRows} row${successRows === 1 ? "" : "s"} succeeded, ${failedRows} row${failedRows === 1 ? "" : "s"} rejected. Check the upload history below for the Error Report.`
        );
      } else if (failedRows > 0 && successRows === 0) {
        toast.error(
          `Upload failed: all ${failedRows} row${failedRows === 1 ? "" : "s"} were rejected. Check the upload history below for the Error Report.`
        );
      } else {
        toast.success("Material purchase uploaded successfully");
      }

      clearFile();
      setFormData(emptyForm());
      await fetchUploads();
    } catch (error) {
      toast.error(error.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const downloadBlobResponse = (response, fallbackFileName) => {
    const blob = new Blob([response.data]);
    const disposition = response.headers?.["content-disposition"] || "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const fileName = match ? match[1] : fallbackFileName;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = async () => {
    setTemplateDownloading(true);

    try {
      const [yearPart, monthPart] = (
        formData.purchase_date || todayInput()
      ).split("-");
      const year = Number(yearPart);
      const month = Number(monthPart);

      const response = await uploadAPI.downloadMaterialPurchaseTemplate({
        month,
        year,
      });

      downloadBlobResponse(
        response,
        `Material_Purchase_Template_${month}_${year}.xlsx`
      );

      toast.success("Template downloaded");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to download template"
      );
    } finally {
      setTemplateDownloading(false);
    }
  };

  const handleDownloadOriginal = async (upload) => {
    if (!upload?.id) return;
    const key = `${upload.id}-original`;
    setDownloadKey(key);

    try {
      const response = await uploadAPI.downloadMaterialPurchaseOriginal(
        upload.id
      );
      downloadBlobResponse(
        response,
        upload.file_name || `material-purchase-${upload.id}.xlsx`
      );
      toast.success("Original file downloaded");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to download original file"
      );
    } finally {
      setDownloadKey(null);
    }
  };

  const handleDownloadProcessed = async (upload) => {
    if (!upload?.id) return;
    const key = `${upload.id}-processed`;
    setDownloadKey(key);

    try {
      const response = await uploadAPI.downloadMaterialPurchaseProcessed(
        upload.id
      );
      downloadBlobResponse(
        response,
        `material-purchase-processed-${upload.id}.xlsx`
      );
      toast.success("Processed file downloaded");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to download processed file"
      );
    } finally {
      setDownloadKey(null);
    }
  };

  const handleDownloadErrorReport = async (upload) => {
    if (!upload?.id) return;
    const key = `${upload.id}-errors`;
    setDownloadKey(key);

    try {
      const response = await uploadAPI.downloadMaterialPurchaseErrors(
        upload.id
      );
      downloadBlobResponse(
        response,
        `material-purchase-errors-${upload.id}.xlsx`
      );
      toast.success("Error report downloaded");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to download error report"
      );
    } finally {
      setDownloadKey(null);
    }
  };

  const handleDeleteUpload = async (upload) => {
    if (!upload?.id) return;

    const confirmed = window.confirm(
      `Delete "${upload.file_name || "this material purchase upload"}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    if (typeof uploadAPI.deleteUpload !== "function") {
      toast.error("Delete API is not configured yet.");
      return;
    }

    setDeletingId(upload.id);

    try {
      await uploadAPI.deleteUpload(upload.id, "material_purchase");

      toast.success("Material purchase upload deleted successfully");

      if (selectedUpload?.id === upload.id) {
        setSelectedUpload(null);
      }

      await fetchUploads();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete upload");
    } finally {
      setDeletingId(null);
    }
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
    <div className={`min-w-0 rounded-md border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
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
      className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden"
      style={{
        fontFamily:
          '"Public Sans", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div className="flex min-w-0 flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div className="min-w-0">
          <h1 className={`text-[24px] font-semibold ${mainTextClass}`}>
            Material Purchase Upload
          </h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>
            Upload outlet-wise material purchases from PetPooja purchase format.
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
            onClick={exportHistory}
            className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
          >
            <Download size={18} />
            Export
          </button>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            disabled={templateDownloading}
            className="flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
            style={{ backgroundColor: primaryColor }}
          >
            {templateDownloading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Download size={18} />
            )}
            Download Template
          </button>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
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

      <div className={`min-w-0 rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
        <div className="mb-6">
          <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
            Upload Material Purchases
          </h3>
          <p className={`mt-1 text-[14px] ${mutedClass}`}>
            Select outlet, purchase date and upload the Excel file.
          </p>
        </div>

        <form onSubmit={handleUpload} className="space-y-6">
          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
                Outlet *
              </label>
              <select
                value={formData.outlet_id}
                onChange={(event) =>
                  setFormData({ ...formData, outlet_id: event.target.value })
                }
                className={`h-11 w-full min-w-0 rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
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
                className={`h-11 w-full min-w-0 rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                required
              />
            </div>
          </div>

          <div>
            <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
              Purchase Excel File *
            </label>

            <input
              ref={fileInputRef}
              id="material-purchase-file"
              type="file"
              accept=".xls,.xlsx"
              onChange={handleFileChange}
              className="sr-only"
              required
            />

            <label
              htmlFor="material-purchase-file"
              className={`group flex min-h-[180px] w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-5 py-7 text-center transition ${
                selectedFile
                  ? isDark
                    ? "border-[#28C76F] bg-[#223B31]"
                    : "border-[#28C76F] bg-[#F1FBF5]"
                  : isDark
                  ? "border-[#4A4F68] bg-[#25293C] hover:border-[#7367F0]"
                  : "border-[#D8D6DE] bg-[#FBFAFC] hover:border-[#7367F0] hover:bg-[#F8F7FF]"
              }`}
            >
              <div
                className="flex h-14 w-14 items-center justify-center rounded-xl transition group-hover:scale-105"
                style={{
                  color: selectedFile ? "#28C76F" : primaryColor,
                  backgroundColor: selectedFile ? "#E9F9EF" : `${primaryColor}18`,
                }}
              >
                {selectedFile ? <CheckCircle2 size={28} /> : <Upload size={29} />}
              </div>

              <p className={`mt-4 text-[15px] font-semibold ${mainTextClass}`}>
                {selectedFile ? "Purchase file ready to upload" : "Choose purchase Excel file"}
              </p>

              <p className={`mt-1 text-[13px] ${mutedClass}`}>
                {selectedFile
                  ? "Click here to replace the selected file"
                  : "Click to browse .xls or .xlsx files"}
              </p>

              <div
                className={`mt-4 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-[13px] font-semibold shadow-sm ${
                  isDark
                    ? "border-[#4A4F68] bg-[#2F3349] text-[#D0D2D6]"
                    : "border-[#DBDADE] bg-white text-[#5D596C]"
                }`}
              >
                <Upload size={16} />
                Browse Excel File
              </div>
            </label>
          </div>

          {selectedFile && (
            <div
              className={`flex min-w-0 flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between ${
                isDark
                  ? "border-[#3B405A] bg-[#25293C]"
                  : "border-[#EBE9F1] bg-[#F8F7FA]"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#E9F9EF] text-[#28C76F]">
                  <CheckCircle2 size={21} />
                </div>

                <div className="min-w-0">
                  <p className={`truncate text-[14px] font-semibold ${mainTextClass}`}>
                    {selectedFile.name}
                  </p>
                  <p className={`mt-0.5 text-[12px] ${mutedClass}`}>
                    {(selectedFile.size / 1024).toFixed(1)} KB • Excel purchase file
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={clearFile}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-[#FCEAEA] px-3 text-[13px] font-semibold text-[#EA5455] transition hover:bg-[#F9DCDC]"
              >
                <X size={16} />
                Remove
              </button>
            </div>
          )}

          <div
            className={`flex min-w-0 items-start gap-3 rounded-md border p-4 ${
              isDark
                ? "border-[#3B405A] bg-[#25293C]"
                : "border-[#E2E0F4] bg-[#F6F5FF]"
            }`}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
              style={{ color: primaryColor, backgroundColor: `${primaryColor}18` }}
            >
              <AlertCircle size={18} />
            </div>

            <div className="min-w-0 text-[13px]">
              <p className={`font-semibold ${mainTextClass}`}>PetPooja Purchase Format</p>
              <p className={`mt-1 leading-5 ${mutedClass}`}>
                Required columns: Date, Supplier, Material, Qty, Unit, Rate, Amount,
                Bill No, Remarks.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-[15px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
              style={{ backgroundColor: primaryColor }}
            >
              {uploading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Uploading Purchases...
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Upload Material Purchases
                </>
              )}
            </button>

            <p className={`text-[12px] ${mutedClass}`}>
              Only Excel files (.xls, .xlsx) are supported.
            </p>
          </div>
        </form>
      </div>

      {selectedUpload && (
        <div className={`min-w-0 rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
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

          <div
            className={`mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-end ${
              isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"
            }`}
          >
            <DownloadMenu
              upload={selectedUpload}
              onDownloadOriginal={handleDownloadOriginal}
              onDownloadProcessed={handleDownloadProcessed}
              onDownloadErrors={handleDownloadErrorReport}
              downloadKey={downloadKey}
              cardClass={cardClass}
              primaryColor={primaryColor}
              compact={false}
            />

            <button
              type="button"
              onClick={() => handleDeleteUpload(selectedUpload)}
              disabled={deletingId === selectedUpload.id}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#FCEAEA] px-4 text-[14px] font-semibold text-[#EA5455] transition hover:bg-[#F9DCDC] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deletingId === selectedUpload.id ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 size={16} />
                  Delete
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className={`min-w-0 max-w-full rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
        <div className="border-b border-[#EBE9F1] p-6">
          <h3 className={`text-[22px] font-semibold ${mainTextClass}`}>
            Upload History
          </h3>

          <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={`h-12 w-full min-w-0 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
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
              className={`h-12 w-full min-w-0 rounded-md border px-4 text-[15px] outline-none ${inputClass}`}
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
          <div className="w-full min-w-0 max-w-full overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse xl:min-w-full">
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
                {visibleUploads.map((upload) => (
                  <tr
                    key={upload.id}
                    className="group border-b border-[#EBE9F1] transition hover:bg-[#F8F7FA]"
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

                    <td
                      className={`sticky right-0 z-10 overflow-visible px-6 py-4 group-hover:z-50 ${
                        isDark ? "bg-[#2F3349]" : "bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1.5 overflow-visible text-[#6F6B7D]">
                        <button
                          type="button"
                          onClick={() => setSelectedUpload(upload)}
                          className="flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[#F0EEFF] hover:text-[#7367F0]"
                          title="View Details"
                        >
                          <Eye size={18} />
                        </button>

                        <DownloadMenu
                          upload={upload}
                          onDownloadOriginal={handleDownloadOriginal}
                          onDownloadProcessed={handleDownloadProcessed}
                          onDownloadErrors={handleDownloadErrorReport}
                          downloadKey={downloadKey}
                          cardClass={cardClass}
                          primaryColor={primaryColor}
                          compact
                        />

                        <button
                          type="button"
                          onClick={() => handleDeleteUpload(upload)}
                          disabled={deletingId === upload.id}
                          className="flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[#FCEAEA] hover:text-[#EA5455] disabled:cursor-not-allowed disabled:opacity-50"
                          title="Delete Upload"
                        >
                          {deletingId === upload.id ? (
                            <Loader2 size={17} className="animate-spin" />
                          ) : (
                            <Trash2 size={18} />
                          )}
                        </button>

                        {upload.status === "Processing" && (
                          <Clock size={18} className="ml-1 text-[#FF9F43]" />
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
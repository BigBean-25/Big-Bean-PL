import { useState, useEffect, useRef } from "react";
import {
  Upload,
  Eye,
  Download,
  Trash2,
  AlertCircle,
  RefreshCw,
  Loader2,
  FileSpreadsheet,
  Package,
  CheckCircle2,
  ChevronDown,
  FileDown,
  FileWarning,
  X,
} from "lucide-react";
import { uploadAPI, masterAPI } from "../../services/api";
import DownloadMenu from "../../components/DownloadMenu";
import { StatusBadge } from "../../components/ui";
import toast from "react-hot-toast";

const getPrimaryColor = () => {
  try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; }
};

const getThemeMode = () => {
  try {
    const mode = localStorage.getItem("bbc_theme_mode") || "light";
    if (mode === "system") return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
    return mode;
  } catch { return "light"; }
};

const formatDate = (value) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "-"; }
};

const ClosingStockUpload = () => {
  const fileInputRef = useRef(null);
  const [uploads, setUploads] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedUpload, setSelectedUpload] = useState(null);
  const [downloadingKey, setDownloadingKey] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [openDownloadMenuId, setOpenDownloadMenuId] = useState(null);
  const [modalDownloadMenuOpen, setModalDownloadMenuOpen] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    outlet_id: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });

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
      await Promise.all([fetchUploads(), fetchOutlets()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUploads = async () => {
    try {
      const response = await uploadAPI.getUploadHistory("closing_stock");
      setUploads(response.data.data || []);
    } catch {
      toast.error("Failed to fetch upload history");
    }
  };

  const fetchOutlets = async () => {
    try {
      const response = await masterAPI.getOutlets();
      setOutlets(response.data.data || []);
    } catch {
      /* silent */
    }
  };


  const getOutletName = (upload) => {
    if (upload?.outlet_name) return upload.outlet_name;

    const outlet = outlets.find(
      (item) => String(item.id) === String(upload?.outlet_id)
    );

    return outlet?.outlet_name || outlet?.name || "-";
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const validTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a valid Excel file (.xls or .xlsx)");
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) { toast.error("Please select a file"); return; }
    setUploading(true);
    try {
      const uploadData = new FormData();
      uploadData.append("file", selectedFile);
      uploadData.append("outlet_id", formData.outlet_id);
      uploadData.append("month", formData.month);
      uploadData.append("year", formData.year);
      await uploadAPI.uploadClosingStock(uploadData);
      toast.success("Closing stock uploaded successfully");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      e.target.reset();
      await fetchUploads();
    } catch (error) {
      toast.error(error.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };


  const handleView = (upload) => {
    setSelectedUpload(upload);
  };

  const parseBlobErrorMessage = async (error, fallback) => {
    try {
      const blob = error?.response?.data;
      if (blob instanceof Blob) {
        const text = await blob.text();
        const parsed = JSON.parse(text);
        return parsed?.message || fallback;
      }
    } catch {
      /* ignore parse failure */
    }
    return error?.response?.data?.message || fallback;
  };

  const triggerBlobDownload = (blob, fileName) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadOriginal = async (upload) => {
    if (!upload?.id) return;
    setOpenDownloadMenuId(null);
    setModalDownloadMenuOpen(false);
    const key = `${upload.id}-original`;
    setDownloadingKey(key);
    try {
      const response = await uploadAPI.downloadClosingStockOriginal(upload.id);
      triggerBlobDownload(response.data, upload.file_name || `closing-stock-${upload.id}.xlsx`);
    } catch (error) {
      toast.error(await parseBlobErrorMessage(error, "Unable to download original file"));
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleDownloadProcessed = async (upload) => {
    if (!upload?.id) return;
    setOpenDownloadMenuId(null);
    setModalDownloadMenuOpen(false);
    const key = `${upload.id}-processed`;
    setDownloadingKey(key);
    try {
      const response = await uploadAPI.downloadClosingStockProcessed(upload.id);
      triggerBlobDownload(response.data, `closing-stock-processed-${upload.id}.xlsx`);
    } catch (error) {
      toast.error(await parseBlobErrorMessage(error, "No processed rows available for this upload."));
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleDownloadErrors = async (upload) => {
    if (!upload?.id) return;
    setOpenDownloadMenuId(null);
    setModalDownloadMenuOpen(false);
    const key = `${upload.id}-errors`;
    setDownloadingKey(key);
    try {
      const response = await uploadAPI.downloadClosingStockErrors(upload.id);
      triggerBlobDownload(response.data, `closing-stock-errors-${upload.id}.xlsx`);
    } catch (error) {
      toast.error(await parseBlobErrorMessage(error, "No error rows available for this upload."));
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const month = Number(formData.month) || new Date().getMonth() + 1;
      const year = Number(formData.year) || new Date().getFullYear();
      const response = await uploadAPI.downloadClosingStockTemplate({ month, year });
      const monthLabel = new Date(2000, month - 1).toLocaleString("default", { month: "long" });
      triggerBlobDownload(response.data, `Closing_Stock_Template_${monthLabel}_${year}.xlsx`);
    } catch (error) {
      toast.error(await parseBlobErrorMessage(error, "Unable to download template"));
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleDelete = async (upload) => {
    if (!upload?.id) return;

    const confirmed = window.confirm(
      `Delete "${upload.file_name || "this closing stock upload"}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    if (typeof uploadAPI.deleteUpload !== "function") {
      toast.error("Delete API is not configured yet.");
      return;
    }

    setDeletingId(upload.id);

    try {
      await uploadAPI.deleteUpload(upload.id, "closing_stock");
      toast.success("Closing stock upload deleted successfully");

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


  const DetailItem = ({ label, value }) => (
    <div
      className={`rounded-md border p-4 ${
        isDark
          ? "border-[#3B405A] bg-[#25293C]"
          : "border-[#EBE9F1] bg-[#F8F7FA]"
      }`}
    >
      <p className={`text-[12px] font-semibold uppercase tracking-wide ${mutedClass}`}>
        {label}
      </p>
      <p className={`mt-1 break-words text-[14px] font-medium ${mainTextClass}`}>
        {value ?? "-"}
      </p>
    </div>
  );

  return (
    <div
      className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden"
      style={{ fontFamily: '"Public Sans", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
    >
      <div className="flex min-w-0 flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div className="min-w-0">
          <h1 className={`text-[24px] font-semibold ${mainTextClass}`}>Closing Stock Upload</h1>
          <p className={`mt-1 text-[15px] ${mutedClass}`}>Upload monthly closing stock data via Excel.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <button
            type="button"
            onClick={fetchInitialData}
            className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-[15px] font-medium ${cardClass}`}
          >
            <RefreshCw size={18} /> Refresh
          </button>
        </div>
      </div>

      <div className={`min-w-0 rounded-md border p-6 shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
        <div className="mb-6">
          <h3 className={`text-[20px] font-semibold ${mainTextClass}`}>Upload Closing Stock</h3>
          <p className={`mt-1 text-[14px] ${mutedClass}`}>Select outlet, month, year and upload the Excel file.</p>
        </div>

        <form onSubmit={handleUpload} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>Outlet *</label>
              <select
                value={formData.outlet_id}
                onChange={(e) => setFormData({ ...formData, outlet_id: e.target.value })}
                className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                required
              >
                <option value="">Select Outlet</option>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
              </select>
            </div>
            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>Month *</label>
              <select
                value={formData.month}
                onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                required
              >
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString("default", { month: "long" })}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>Year *</label>
              <input
                type="number"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                className={`h-11 w-full rounded-md border px-4 text-[14px] outline-none ${inputClass}`}
                required
              />
            </div>
          </div>

          <div>
            <label className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}>
              Excel File *
            </label>

            <input
              ref={fileInputRef}
              id="closing-stock-file"
              type="file"
              accept=".xls,.xlsx"
              onChange={handleFileChange}
              className="sr-only"
              required
            />

            <label
              htmlFor="closing-stock-file"
              className={`group flex min-h-[170px] w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-5 py-7 text-center transition ${
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
                {selectedFile ? "Excel file ready to upload" : "Choose an Excel file"}
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
                <FileSpreadsheet size={16} />
                Browse Excel File
              </div>
            </label>

            {selectedFile && (
              <div
                className={`mt-3 flex min-w-0 items-center justify-between gap-3 rounded-md border px-4 py-3 ${
                  isDark
                    ? "border-[#3B405A] bg-[#25293C]"
                    : "border-[#EBE9F1] bg-[#F8F7FA]"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#E9F9EF] text-[#28C76F]">
                    <CheckCircle2 size={18} />
                  </div>

                  <div className="min-w-0">
                    <p className={`truncate text-[14px] font-semibold ${mainTextClass}`}>
                      {selectedFile.name}
                    </p>
                    <p className={`text-[12px] ${mutedClass}`}>
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#A8AAAE] transition hover:bg-[#FCEAEA] hover:text-[#EA5455]"
                  title="Remove selected file"
                >
                  <X size={17} />
                </button>
              </div>
            )}
          </div>

          <div
            className={`flex min-w-0 flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-start sm:justify-between ${
              isDark
                ? "border-[#3B405A] bg-[#25293C]"
                : "border-[#E2E0F4] bg-[#F6F5FF]"
            }`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                style={{ color: primaryColor, backgroundColor: `${primaryColor}18` }}
              >
                <AlertCircle size={18} />
              </div>

              <div className="min-w-0 text-[13px]">
                <p className={`font-semibold ${mainTextClass}`}>Expected Excel format</p>
                <p className={`mt-1 ${mutedClass}`}>
                  Date, Material Name, Qty, Unit, Rate, Remarks
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate}
              className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border px-4 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${cardClass}`}
            >
              {downloadingTemplate ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={16} />
              )}
              Download Template
            </button>
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
                  Uploading Closing Stock...
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Upload Closing Stock
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close upload details"
            onClick={() => setSelectedUpload(null)}
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
          />

          <div className={`relative z-10 w-full max-w-2xl overflow-hidden rounded-xl border shadow-2xl ${cardClass}`}>
            <div
              className={`flex items-start justify-between gap-4 border-b p-5 sm:p-6 ${
                isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                  style={{ color: primaryColor, backgroundColor: `${primaryColor}18` }}
                >
                  <FileSpreadsheet size={22} />
                </div>

                <div className="min-w-0">
                  <h3 className={`text-[20px] font-semibold ${mainTextClass}`}>
                    Closing Stock Upload Details
                  </h3>
                  <p className={`mt-1 truncate text-[13px] ${mutedClass}`}>
                    {selectedUpload.file_name || "Uploaded Excel file"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedUpload(null)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition ${
                  isDark
                    ? "bg-[#25293C] text-[#A5A8B6] hover:text-white"
                    : "bg-[#F3F2F7] text-[#6F6B7D] hover:bg-[#EAE8EF]"
                }`}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5 sm:p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DetailItem label="Uploaded At" value={formatDate(selectedUpload.created_at)} />
                <DetailItem label="Outlet" value={getOutletName(selectedUpload)} />
                <DetailItem
                  label="Month / Year"
                  value={`${selectedUpload.month || "-"}/${selectedUpload.year || "-"}`}
                />
                <DetailItem label="Status" value={selectedUpload.status || "Pending"} />
                <DetailItem label="Success Rows" value={selectedUpload.success_rows ?? 0} />
                <DetailItem label="Failed Rows" value={selectedUpload.failed_rows ?? 0} />
                <DetailItem label="Total Rows" value={selectedUpload.total_rows ?? 0} />
                <DetailItem label="File Name" value={selectedUpload.file_name || "-"} />
              </div>

              <div
                className={`mt-5 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between ${
                  isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"
                }`}
              >
                <p className={`text-[12px] ${mutedClass}`}>
                  View the uploaded batch details or download/delete the uploaded file.
                </p>

                <div className="flex flex-wrap gap-2">
                  <DownloadMenu
                    upload={selectedUpload}
                    open={modalDownloadMenuOpen}
                    onToggle={() => setModalDownloadMenuOpen((prev) => !prev)}
                    variant="modal"
                    onOriginal={() => handleDownloadOriginal(selectedUpload)}
                    onProcessed={() => handleDownloadProcessed(selectedUpload)}
                    onErrors={() => handleDownloadErrors(selectedUpload)}
                    downloadingKey={downloadingKey}
                    cardClass={cardClass}
                    primaryColor={primaryColor}
                    mainTextClass={mainTextClass}
                    mutedClass={mutedClass}
                  />

                  <button
                    type="button"
                    onClick={() => handleDelete(selectedUpload)}
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
            </div>
          </div>
        </div>
      )}

      <div className={`min-w-0 max-w-full rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.08)] ${cardClass}`}>
        <div className="border-b border-[#EBE9F1] p-6">
          <h3 className={`text-[20px] font-semibold ${mainTextClass}`}>Upload History</h3>
          <p className={`mt-1 text-[14px] ${mutedClass}`}>Previous closing stock upload records.</p>
        </div>

        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 size={30} className="animate-spin" style={{ color: primaryColor }} />
          </div>
        ) : uploads.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-md border border-dashed border-[#DBDADE] m-6">
            <div className="text-center">
              <Package size={38} className="mx-auto text-[#A8AAAE]" />
              <p className={`mt-3 text-[15px] font-semibold ${mainTextClass}`}>No uploads yet</p>
              <p className={`mt-1 text-[13px] ${mutedClass}`}>Upload an Excel file to get started.</p>
            </div>
          </div>
        ) : (
          <div className="w-full min-w-0 max-w-full overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse">
              <thead>
                <tr className={isDark ? "border-b border-[#3B405A]" : "border-b border-[#EBE9F1]"}>
                  {["Uploaded At", "Outlet", "Month/Year", "File Name", "Rows (✓/✗/Total)", "Status"].map((h) => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${mutedClass}`}
                    >
                      {h}
                    </th>
                  ))}
                  <th
                    className={`sticky right-0 z-20 px-5 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${
                      isDark ? "bg-[#2F3349]" : "bg-white"
                    } ${mutedClass}`}
                  >
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((upload) => (
                  <tr key={upload.id} className={`group transition hover:bg-[#F8F7FA] ${isDark ? "border-b border-[#3B405A]" : "border-b border-[#EBE9F1]"}`}>
                    <td className={`px-5 py-4 text-[14px] ${mainTextClass}`}>{formatDate(upload.created_at)}</td>
                    <td className={`px-5 py-4 text-[14px] ${mainTextClass}`}>{getOutletName(upload)}</td>
                    <td className={`px-5 py-4 text-[14px] ${mainTextClass}`}>{upload.month}/{upload.year}</td>
                    <td className={`px-5 py-4 max-w-[200px] truncate text-[13px] ${mutedClass}`}>{upload.file_name || "-"}</td>
                    <td className="px-5 py-4 text-[14px]">
                      <span className="text-[#28C76F] font-semibold">{upload.success_rows ?? 0}</span>
                      <span className={mutedClass}>/</span>
                      <span className="text-[#EA5455] font-semibold">{upload.failed_rows ?? 0}</span>
                      <span className={mutedClass}>/</span>
                      <span className={mainTextClass}>{upload.total_rows ?? 0}</span>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={upload.status || "Pending"} />
                    </td>
                    <td
                      className={`sticky right-0 z-10 overflow-visible px-5 py-4 group-hover:z-50 ${
                        isDark ? "bg-[#2F3349]" : "bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 overflow-visible">
                        <button
                          type="button"
                          onClick={() => handleView(upload)}
                          className={`flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[#F0EEFF] hover:text-[#7367F0] ${mutedClass}`}
                          title="View Details"
                        >
                          <Eye size={18} />
                        </button>

                        <DownloadMenu
                          upload={upload}
                          open={openDownloadMenuId === upload.id}
                          onToggle={() =>
                            setOpenDownloadMenuId((prev) => (prev === upload.id ? null : upload.id))
                          }
                          variant="row"
                          onOriginal={() => handleDownloadOriginal(upload)}
                          onProcessed={() => handleDownloadProcessed(upload)}
                          onErrors={() => handleDownloadErrors(upload)}
                          downloadingKey={downloadingKey}
                          cardClass={cardClass}
                          primaryColor={primaryColor}
                          mainTextClass={mainTextClass}
                          mutedClass={mutedClass}
                        />

                        <button
                          type="button"
                          onClick={() => handleDelete(upload)}
                          disabled={deletingId === upload.id}
                          className={`flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-[#FCEAEA] hover:text-[#EA5455] disabled:cursor-not-allowed disabled:opacity-50 ${mutedClass}`}
                          title="Delete Upload"
                        >
                          {deletingId === upload.id ? (
                            <Loader2 size={17} className="animate-spin" />
                          ) : (
                            <Trash2 size={18} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClosingStockUpload;

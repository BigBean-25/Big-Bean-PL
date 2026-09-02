import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Upload,
  Download,
  Eye,
  X,
  Search,
  Loader2,
  RefreshCw,
  FileSpreadsheet,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
  FileDown,
  Trash2,
  Info,
} from "lucide-react";
import {
  PageHeader,
  SectionCard,
  TableWrapper,
  EmptyState,
  LoadingRows,
  FilterBar,
  MobileActionMenu,
  getPrimaryColor,
  getThemeMode,
  getCardClass,
  getInputClass,
} from "../../components/ui";
import { uploadAPI, masterAPI } from "../../services/api";
import useAuthStore from "../../store/authStore";
import toast from "react-hot-toast";

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

const formatDate = (value, dateOnly = false) => {
  if (!value) return "-";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "-";
    if (dateOnly) {
      const locale = d.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      return String(locale).replace(/\//g, "-");
    }
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
};

const formatDateRange = (from, to) => {
  if (!from || !to) return "-";
  const f = formatDate(from, true);
  const t = formatDate(to, true);
  return f === t ? f : `${f} → ${t}`;
};

const formatDateTime = (value) => {
  if (!value) return "-";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
};

const StatusBadge = ({ status = "" }) => {
  const styles = {
    Pending: "bg-[#FFF4E5] text-[#FF9F43]",
    Processing: "bg-[#E6FAFD] text-[#00CFE8]",
    Completed: "bg-[#E9F9EF] text-[#28C76F]",
    Failed: "bg-[#FCEAEA] text-[#EA5455]",
    "Rolled Back": "bg-[#F3F2F7] text-[#6F6B7D]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        styles[status] || "bg-[#F3F2F7] text-[#6F6B7D]"
      }`}
    >
      {status || "Pending"}
    </span>
  );
};

const KpiCard = ({ title, value, subtitle, icon: Icon, color, bg, isDark }) => (
  <div className={`rounded-xl border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${getCardClass(isDark)}`}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className={`text-[13px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>{title}</p>
        <h3 className={`mt-2 text-[22px] font-bold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{value}</h3>
        {subtitle && <p className={`mt-1 text-[12px] ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>{subtitle}</p>}
      </div>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: bg, color }}>
        <Icon size={22} />
      </div>
    </div>
  </div>
);

const ItemSalesUpload = () => {
  const outletContext = useOutletContext() || {};
  const { selectedOutletId = "all", availableOutlets = [] } = outletContext;

  const isDark = getThemeMode() === "dark";
  const primaryColor = getPrimaryColor();

  const muted = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const main = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  const fileInputRef = useRef(null);
  const [uploads, setUploads] = useState([]);
  const [apiOutlets, setApiOutlets] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailErrors, setDetailErrors] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [outletFilter, setOutletFilter] = useState("all");
  const [pageSize, setPageSize] = useState(10);

  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions || {};

  const hasPermission = (module, action) => {
    const adminRoles = ["Super Admin", "Admin", "Developer"];
    if (adminRoles.includes(user?.role_name)) return true;
    return !!permissions[module]?.[action];
  };

  const canUpload = hasPermission("item_sales", "can_upload");
  const canDelete = hasPermission("item_sales", "can_delete");

  const contextOutlets = useMemo(
    () => (availableOutlets || []).filter((o) => o && o.id && !Number.isNaN(Number(o.id))),
    [availableOutlets]
  );
  const displayOutlets = contextOutlets.length > 0 ? contextOutlets : apiOutlets;

  const isOutletLocked =
    (outletContext?.isOutletLocked || false) ||
    (selectedOutletId !== "all") ||
    (displayOutlets.length === 1);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    let defaultId = "";
    if (selectedOutletId && selectedOutletId !== "all" && !Number.isNaN(Number(selectedOutletId))) {
      defaultId = String(selectedOutletId);
    } else if (displayOutlets.length === 1) {
      defaultId = String(displayOutlets[0].id);
    }
    setOutletId(defaultId);
    setOutletFilter(selectedOutletId === "all" ? "all" : String(selectedOutletId || "all"));
  }, [selectedOutletId, displayOutlets]);

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
      const response = await uploadAPI.getUploadHistory("item_sales");
      setUploads(response.data.data || []);
    } catch {
      toast.error("Failed to fetch upload history");
    }
  };

  const fetchOutlets = async () => {
    try {
      const response = await masterAPI.getOutlets();
      setApiOutlets(response.data.data || []);
    } catch {
      /* silent */
    }
  };

  const handleFileChange = (f) => {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      toast.error("Please upload a valid .xlsx Excel file");
      return;
    }
    setFile(f);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select a file");
      return;
    }
    if (!outletId || outletId === "all") {
      toast.error("Please select a valid outlet");
      return;
    }
    setUploading(true);
    try {
      const uploadData = new FormData();
      uploadData.append("file", file);
      uploadData.append("outlet_id", outletId);
      const response = await uploadAPI.uploadItemSales(uploadData);
      const result = response?.data?.data || {};
      const successRows = Number(result.successRows || 0);
      const failedRows = Number(result.failedRows || 0);

      if (failedRows > 0 && successRows > 0) {
        toast.error(
          `Uploaded with issues: ${successRows} row${successRows === 1 ? "" : "s"} succeeded, ${failedRows} row${failedRows === 1 ? "" : "s"} rejected. Check the upload history below for details.`
        );
      } else if (failedRows > 0 && successRows === 0) {
        toast.error(
          `Upload failed: all ${failedRows} row${failedRows === 1 ? "" : "s"} were rejected. Check the upload history below for details.`
        );
      } else {
        toast.success("Item sales uploaded successfully");
      }

      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchUploads();
    } catch (error) {
      toast.error(error.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await uploadAPI.downloadItemSalesTemplate();
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Item_Sales_Upload_Template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Item Sales template downloaded");
    } catch {
      toast.error("Unable to download Item Sales template");
    }
  };

  const openDetail = async (id) => {
    setDetailLoading(true);
    try {
      const [detailRes, errorsRes] = await Promise.all([
        uploadAPI.getItemSalesUploadById(id),
        uploadAPI.getUploadErrors(id, "item_sales")
      ]);
      setDetail(detailRes.data.data || null);
      setDetailErrors(errorsRes.data.data || []);
    } catch {
      toast.error("Failed to fetch upload details");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setDetailErrors([]);
  };

  const handleDelete = async (id) => {
    try {
      await uploadAPI.deleteUpload(id, "item_sales");
      toast.success("Item sales upload deleted");
      await fetchUploads();
      closeDetail();
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    }
  };

  const filteredUploads = useMemo(() => {
    return uploads.filter((row) => {
      const text = `${row.outlet_name || ""} ${row.batch_id || ""} ${row.file_name || ""}`.toLowerCase();
      const searchMatch = text.includes(searchTerm.toLowerCase());
      const outletMatch =
        outletFilter === "all" ||
        String(row.outlet_id) === String(outletFilter) ||
        String(row.outlet_name) === String(outletFilter);
      const statusMatch = !statusFilter || row.status === statusFilter;
      return searchMatch && outletMatch && statusMatch;
    });
  }, [uploads, searchTerm, outletFilter, statusFilter]);

  const visibleUploads = useMemo(
    () => filteredUploads.slice(0, Number(pageSize)),
    [filteredUploads, pageSize]
  );

  const summary = useMemo(() => {
    const batches = filteredUploads.length;
    const totalQty = filteredUploads.reduce((s, r) => s + num(r.total_qty), 0);
    const netValue = filteredUploads.reduce((s, r) => s + num(r.net_sales_total), 0);
    const needsAttention = filteredUploads.filter(
      (r) => r.status === "Failed" || r.failed_rows > 0 || r.unmapped_items > 0
    ).length;
    return { batches, totalQty, netValue, needsAttention };
  }, [filteredUploads]);

  const [confirmAction, setConfirmAction] = useState(null);

  const clearFilters = () => {
    setSearchTerm("");
    setOutletFilter(selectedOutletId === "all" ? "all" : String(selectedOutletId || "all"));
    setStatusFilter("");
  };

  const rowActions = (row) => {
    const actions = [];
    actions.push({
      label: "View Details",
      icon: Eye,
      onClick: () => openDetail(row.id),
    });
    if (canDelete && !["Completed"].includes(row.status)) {
      actions.push({
        label: "Delete",
        icon: Trash2,
        danger: true,
        onClick: () =>
          setConfirmAction({
            type: "delete",
            row,
            message:
              "This removes this upload and its related Item Sales records.",
          }),
      });
    }
    return actions;
  };

  return (
    <div
      className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden p-1 sm:p-0"
      style={{ fontFamily: '"Public Sans", "Inter", system-ui, sans-serif' }}
    >
      <PageHeader
        title="Item Sales"
        subtitle="Upload item-wise sales quantities for SOP and consumption analysis."
        isDark={isDark}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadTemplate}
              className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-[14px] font-medium transition ${getCardClass(
                isDark
              )} hover:-translate-y-px`}
            >
              <Download size={16} />
              Download Template
            </button>
            <button
              type="button"
              onClick={fetchInitialData}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${getCardClass(
                isDark
              )} hover:-translate-y-px`}
              title="Refresh"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        }
      />

      <div
        className={`flex items-start gap-3 rounded-xl border p-4 ${
          isDark
            ? "border-[#3B405A] bg-[#25293C]"
            : "border-[#E2E0F4] bg-[#F6F5FF]"
        }`}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ color: primaryColor, backgroundColor: `${primaryColor}18` }}
        >
          <Info size={18} />
        </div>
        <div className="min-w-0 text-[13px]">
          <p className={`font-semibold ${main}`}>About Item Sales</p>
          <p className={`mt-1 leading-5 ${muted}`}>
            Item Sales is used for quantity, recipe/SOP and theoretical consumption.
            Accounting revenue continues to come from approved Daily/Monthly Sales.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Upload Batches"
          value={summary.batches}
          subtitle="Visible item sales uploads"
          icon={FileSpreadsheet}
          color={primaryColor}
          bg={`${primaryColor}18`}
          isDark={isDark}
        />
        <KpiCard
          title="Total Quantity Sold"
          value={Number(summary.totalQty).toLocaleString("en-IN")}
          subtitle="From loaded uploads"
          icon={ShoppingCart}
          color="#00CFE8"
          bg="#E6FAFD"
          isDark={isDark}
        />
        <KpiCard
          title="Uploaded Net Value"
          value={compactINR(summary.netValue)}
          subtitle="Not P&L revenue"
          icon={CheckCircle2}
          color="#28C76F"
          bg="#E9F9EF"
          isDark={isDark}
        />
        <KpiCard
          title="Needs Mapping / Issues"
          value={summary.needsAttention}
          subtitle="Failed / unmapped rows"
          icon={AlertTriangle}
          color="#FF9F43"
          bg="#FFF4E5"
          isDark={isDark}
        />
      </div>

      <SectionCard isDark={isDark}>
        <div className="mb-5">
          <h3 className={`text-lg font-semibold ${main}`}>Upload Item Sales</h3>
          <p className={`mt-0.5 text-[13px] ${muted}`}>
            Select an outlet and upload the PetPooja Excel export.
          </p>
        </div>

        <form onSubmit={handleUpload} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${main}`}>Outlet *</label>
              <select
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                disabled={isOutletLocked || uploading}
                className={`h-11 w-full rounded-lg border px-3 text-[14px] outline-none ${getInputClass(
                  isDark
                )} disabled:opacity-70`}
              >
                <option value="">Select Outlet</option>
                {displayOutlets.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.outlet_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${main}`}>Report File *</label>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) handleFileChange(dropped);
                }}
                className={`relative rounded-xl border-2 border-dashed p-5 text-center transition ${
                  file || dragOver
                    ? isDark
                      ? "border-[#28C76F] bg-[#223B31]"
                      : "border-[#28C76F] bg-[#F1FBF5]"
                    : isDark
                    ? "border-[#4A4F68] bg-[#25293C] hover:border-[#7367F0]"
                    : "border-[#D8D6DE] bg-[#FBFAFC] hover:border-[#7367F0]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  id="item-sales-file"
                  type="file"
                  accept=".xlsx"
                  className="sr-only"
                  onChange={(e) => handleFileChange(e.target.files?.[0])}
                />

                {!file ? (
                  <>
                    <div
                      className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}
                    >
                      <FileSpreadsheet size={24} />
                    </div>
                    <p className={`mt-3 text-[15px] font-semibold ${main}`}>Drop your .xlsx file here</p>
                    <p className={`mt-0.5 text-[13px] ${muted}`}>
                      or <label htmlFor="item-sales-file" className="cursor-pointer text-[#7367F0] hover:underline">click to browse</label>
                    </p>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "#E9F9EF", color: "#28C76F" }}>
                        <CheckCircle2 size={20} />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className={`truncate text-[14px] font-semibold ${main}`}>{file.name}</p>
                        <p className={`text-[12px] ${muted}`}>
                          {(file.size / 1024).toFixed(1)} KB • .xlsx
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#FCEAEA] px-3 text-[13px] font-medium text-[#EA5455] transition hover:bg-[#F9DCDC]"
                    >
                      <X size={14} />
                      Remove
                    </button>
                  </div>
                )}
              </div>
              <p className={`mt-2 text-[12px] ${muted}`}>
                Sales dates will be read from the uploaded Excel file.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploading || !outletId || !file || !canUpload}
              className="inline-flex h-11 items-center gap-2 rounded-lg px-5 text-[14px] font-semibold text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              {uploading ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />}
              {uploading ? "Uploading..." : "Upload Item Sales"}
            </button>
          </div>
        </form>
      </SectionCard>

      <FilterBar isDark={isDark} title="Filters">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8AAAE]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search batch, file or outlet..."
              className={`h-10 w-full rounded-lg border pl-9 pr-3 text-[14px] outline-none ${getInputClass(isDark)}`}
            />
          </div>
          <select
            value={outletFilter}
            onChange={(e) => setOutletFilter(e.target.value)}
            className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${getInputClass(isDark)}`}
          >
            <option value="all">All Outlets</option>
            {displayOutlets.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.outlet_name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${getInputClass(isDark)}`}
          >
            <option value="">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Processing">Processing</option>
            <option value="Completed">Completed</option>
            <option value="Failed">Failed</option>
            <option value="Rolled Back">Rolled Back</option>
          </select>
          <button
            type="button"
            onClick={clearFilters}
            className={`h-10 rounded-lg border px-3 text-[14px] font-medium transition ${getCardClass(isDark)} hover:bg-[#F8F7FA]`}
          >
            Clear Filters
          </button>
        </div>
      </FilterBar>

      <SectionCard isDark={isDark}>
        <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <div>
            <h3 className={`text-lg font-semibold ${main}`}>Item Sales History</h3>
            <p className={`text-[13px] ${muted}`}>Previous item sales upload records.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[13px] ${muted}`}>{filteredUploads.length} records</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className={`h-9 w-[75px] rounded-lg border px-2 text-[13px] outline-none ${getInputClass(isDark)}`}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {loading ? (
          <TableWrapper isDark={isDark}>
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                  {["Date Range", "Outlet", "Rows", "Total Qty", "Net Value", "Success", "Failed", "Status", "Uploaded On", "Actions"].map((h) => (
                    <th key={h} className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <LoadingRows rows={5} cols={10} isDark={isDark} />
              </tbody>
            </table>
          </TableWrapper>
        ) : visibleUploads.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="No Item Sales uploads yet"
            subtitle="Upload an item-wise sales file to start quantity and SOP analysis."
            isDark={isDark}
            action={
              canUpload ? (
                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className="h-10 rounded-lg px-4 text-[14px] font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                  >
                  Upload Item Sales
                </button>
              ) : null
            }
          />
        ) : (
          <TableWrapper isDark={isDark}>
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                  <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>Date Range</th>
                  <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>Outlet</th>
                  <th className={`px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide ${main}`}>Rows</th>
                  <th className={`px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide ${main}`}>Total Qty</th>
                  <th className={`px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide ${main}`}>Net Value</th>
                  <th className={`px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide ${main}`}>Success</th>
                  <th className={`px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide ${main}`}>Failed</th>
                  <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>Status</th>
                  <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>Uploaded On</th>
                  <th className={`sticky right-0 z-10 px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main} ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleUploads.map((upload) => (
                  <tr
                    key={upload.id}
                    className={`border-b transition hover:bg-[#F8F7FA] ${
                      isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className={`text-[14px] font-semibold ${main}`}>{formatDateRange(upload.date_from, upload.date_to)}</p>
                    </td>
                    <td className="px-4 py-3 text-[14px] text-[#6F6B7D]">{upload.outlet_name || "-"}</td>
                    <td className="px-4 py-3 text-right text-[14px] text-[#6F6B7D]">{Number(upload.total_rows || 0)}</td>
                    <td className="px-4 py-3 text-right text-[14px] text-[#6F6B7D]">{Number(upload.total_qty || 0).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right text-[14px] font-medium" style={{ color: primaryColor }}>
                      {formatINR(upload.net_sales_total)}
                    </td>
                    <td className="px-4 py-3 text-right text-[14px] text-[#28C76F] font-semibold">
                      {Number(upload.success_rows || 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-[14px] text-[#EA5455] font-semibold">
                      {Number(upload.failed_rows || 0)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={upload.status} />
                    </td>
                    <td className="px-4 py-3 text-[14px] text-[#6F6B7D]">{formatDateTime(upload.created_at)}</td>
                    <td
                      className={`sticky right-0 z-10 px-4 py-3 ${
                        isDark ? "bg-[#2F3349]" : "bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => openDetail(upload.id)}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                              isDark ? "text-[#D0D2D6] hover:bg-[#3B405A]" : "text-[#6F6B7D] hover:bg-[#F0EEFF] hover:text-[#7367F0]"
                            }`}
                            title="View Details"
                          >
                            <Eye size={17} />
                          </button>
                          <MobileActionMenu actions={rowActions(upload)} isDark={isDark} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </SectionCard>

      {detail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className={`flex max-h-[90vh] w-full max-w-[1000px] flex-col overflow-hidden rounded-2xl border shadow-2xl ${
              isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"
            }`}
          >
            <div className={`flex items-start justify-between border-b px-6 py-5 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <div>
                <h2 className={`text-xl font-bold ${main}`}>Item Sales Upload</h2>
                <p className={`text-[14px] ${muted}`}>
                  {detail.upload?.outlet_name || detail.outlet_name || "-"} — {detail.upload?.batch_id || detail.batch_id || "-"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
                  isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"
                }`}
              >
                <X size={20} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex min-h-[200px] items-center justify-center p-6">
                <Loader2 size={30} className="animate-spin" style={{ color: primaryColor }} />
              </div>
            ) : (
              <div className="overflow-y-auto p-6">
                <div className={`grid grid-cols-2 gap-4 rounded-xl border p-4 md:grid-cols-4 ${isDark ? "border-[#3B405A] bg-[#25293C]" : "border-[#EBE9F1] bg-[#F8F7FA]"}`}>
                  <div>
                    <p className={`text-[12px] font-medium ${muted}`}>Total Rows</p>
                    <p className={`mt-0.5 text-[16px] font-bold ${main}`}>{Number(detail.upload?.total_rows || 0)}</p>
                  </div>
                  <div>
                    <p className={`text-[12px] font-medium ${muted}`}>Total Qty</p>
                    <p className={`mt-0.5 text-[16px] font-bold ${main}`}>{Number(detail.summary?.total_qty || 0).toLocaleString("en-IN")}</p>
                  </div>
                  <div>
                    <p className={`text-[12px] font-medium ${muted}`}>Uploaded Net Value</p>
                    <p className={`mt-0.5 text-[16px] font-bold ${main}`}>{formatINR(detail.summary?.net_sales_total)}</p>
                  </div>
                  <div>
                    <p className={`text-[12px] font-medium ${muted}`}>Failed Rows</p>
                    <p className={`mt-0.5 text-[16px] font-bold ${main}`}>{Number(detail.upload?.failed_rows || 0)}</p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <p className={`text-[12px] font-medium ${muted}`}>Date Range</p>
                    <p className={`mt-0.5 text-[14px] font-semibold ${main}`}>{formatDateRange(detail.summary?.date_from, detail.summary?.date_to)}</p>
                  </div>
                  <div>
                    <p className={`text-[12px] font-medium ${muted}`}>File Name</p>
                    <p className={`mt-0.5 text-[14px] font-semibold ${main}`}>{detail.upload?.file_name || "-"}</p>
                  </div>
                  <div>
                    <p className={`text-[12px] font-medium ${muted}`}>Status</p>
                    <div className="mt-1">
                      <StatusBadge status={detail.upload?.status} />
                    </div>
                  </div>
                  <div>
                    <p className={`text-[12px] font-medium ${muted}`}>Uploaded At</p>
                    <p className={`mt-0.5 text-[14px] font-semibold ${main}`}>{formatDateTime(detail.upload?.created_at)}</p>
                  </div>
                </div>

                {detail.items?.length > 0 && (
                  <div className="mt-6">
                    <h4 className={`mb-3 text-[15px] font-semibold ${main}`}>Items</h4>
                    <TableWrapper isDark={isDark} className="max-h-[260px]">
                      <table className="w-full min-w-[800px] border-collapse">
                        <thead>
                          <tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                            {["Date", "Category", "Item", "Qty", "Gross", "Discount", "Tax", "Net", "Mapping"].map((h) => (
                              <th key={h} className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide ${main}`}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.items.map((item) => (
                            <tr key={item.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                              <td className={`px-3 py-2 text-[13px] ${main}`}>{formatDate(item.date)}</td>
                              <td className={`px-3 py-2 text-[13px] ${main}`}>{item.category_name || "-"}</td>
                              <td className={`px-3 py-2 text-[13px] ${main}`}>{item.item_name || "-"}</td>
                              <td className={`px-3 py-2 text-[13px] ${muted}`}>{Number(item.qty_sold || 0).toLocaleString("en-IN")}</td>
                              <td className={`px-3 py-2 text-[13px] ${main}`}>{formatINR(item.gross_sales)}</td>
                              <td className={`px-3 py-2 text-[13px] ${main}`}>{formatINR(item.discount)}</td>
                              <td className={`px-3 py-2 text-[13px] ${main}`}>{formatINR(item.tax)}</td>
                              <td className={`px-3 py-2 text-[13px] font-medium`} style={{ color: primaryColor }}>{formatINR(item.net_sales)}</td>
                              <td className="px-3 py-2 text-[13px]">
                                {item.is_mapped === true || item.menu_item_id ? (
                                  <span className="font-medium text-[#28C76F]">Mapped</span>
                                ) : item.unknown_item || item.unmapped ? (
                                  <span className="font-medium text-[#FF9F43]">Unmapped — add/map this item before SOP calculation.</span>
                                ) : (
                                  <span className={muted}>-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableWrapper>
                  </div>
                )}

                <div className="mt-6">
                  <h4 className={`mb-3 text-[15px] font-semibold ${main}`}>Issues</h4>
                  {detailErrors.length > 0 ? (
                    <div className="space-y-2">
                      {detailErrors.map((err, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-3 rounded-lg border p-3 ${
                            err.severity === "Error" || err.is_error
                              ? isDark
                                ? "border-[#EA5455]/30 bg-[#3B2328]"
                                : "border-[#EA5455]/30 bg-[#FDF2F2]"
                              : isDark
                              ? "border-[#FF9F43]/30 bg-[#33281F]"
                              : "border-[#FF9F43]/30 bg-[#FFF9F2]"
                          }`}
                        >
                          <AlertTriangle size={16} className={err.severity === "Error" || err.is_error ? "text-[#EA5455]" : "text-[#FF9F43]"} />
                          <div>
                            <p className={`text-[13px] font-semibold ${main}`}>
                              {err.severity === "Error" || err.is_error ? "Error" : "Warning"} — Row {err.row_number ?? "-"}
                            </p>
                            <p className={`text-[13px] ${muted}`}>{err.error_message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={`text-[13px] ${muted}`}>No errors or warnings found.</p>
                  )}
                </div>
              </div>
            )}

            {detail && (
              <div className={`flex flex-col justify-between gap-3 border-t px-6 py-4 sm:flex-row sm:items-center ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                <div className="text-[13px] text-[#6F6B7D]">
                  This is a quantity/SOP upload — not accounting revenue.
                </div>
                {canDelete && !["Completed"].includes(detail.upload?.status) && (
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmAction({
                        type: "delete",
                        row: detail.upload || detail,
                        message: "This removes this upload and its related Item Sales records.",
                      })
                    }
                    className="h-9 rounded-lg bg-[#FCEAEA] px-4 text-[13px] font-semibold text-[#EA5455] transition hover:bg-[#F9DCDC]"
                  >
                    Delete Upload
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${getCardClass(isDark)}`}>
            <h3 className={`text-lg font-bold ${main}`}>Delete Item Sales Upload?</h3>
            <p className={`mt-2 text-[14px] ${muted}`}>{confirmAction.message}</p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className={`h-10 rounded-lg border px-4 text-[14px] font-medium transition ${getCardClass(isDark)}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { row } = confirmAction;
                  setConfirmAction(null);
                  handleDelete(row.id);
                }}
                className="h-10 rounded-lg bg-[#EA5455] px-4 text-[14px] font-semibold text-white transition hover:bg-[#D14545]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemSalesUpload;

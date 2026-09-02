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
  IndianRupee,
  CheckCircle2,
  AlertTriangle,
  FileDown,
  Check,
  XCircle,
  Trash2,
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
import api, { masterAPI } from "../../services/api";
import { salesAPI } from "../../services/salesAPI";
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

const formatDate = (value) => {
  if (!value) return "-";
  const str = String(value).split("T")[0];
  if (!str) return "-";
  const [year, month, day] = str.split("-");
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN");
};

const StatusBadge = ({ status = "" }) => {
  const styles = {
    Pending: "bg-[#FFF4E5] text-[#FF9F43]",
    Reconciling: "bg-[#E6FAFD] text-[#00CFE8]",
    Matched: "bg-[#E9F9EF] text-[#28C76F]",
    Mismatched: "bg-[#FFF4E5] text-[#FF9F43]",
    Approved: "bg-[#E9F9EF] text-[#28C76F]",
    Rejected: "bg-[#FCEAEA] text-[#EA5455]",
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

const DailySalesUpload = () => {
  const outletContext = useOutletContext() || {};
  const { selectedOutletId = "all", availableOutlets = [] } = outletContext;

  const isDark = getThemeMode() === "dark";
  const primaryColor = getPrimaryColor();

  const muted = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const main = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  const fileInputRef = useRef(null);
  const [uploads, setUploads] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [selectedUpload, setSelectedUpload] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const [outletId, setOutletId] = useState("");
  const [file, setFile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

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
  const isOutletLocked = selectedOutletId !== "all";

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    const allowed = availableOutlets
      .map((o) => Number(o?.id ?? o))
      .filter((id) => Number.isFinite(id));
    const defaultOutlet =
      selectedOutletId !== "all"
        ? selectedOutletId
        : allowed.length === 1
        ? allowed[0]
        : "";
    setOutletId(String(defaultOutlet || ""));
    setOutletFilter(selectedOutletId === "all" ? "all" : String(selectedOutletId || "all"));
  }, [selectedOutletId, availableOutlets]);

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
      const response = await salesAPI.getReconciliations({ mode: "daily" });
      setUploads(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch upload history");
    }
  };

  const fetchOutlets = async () => {
    try {
      const response = await masterAPI.getOutlets();
      const rows = getRows(response);
      const allowedIds = new Set(
        availableOutlets
          .map((o) => Number(o?.id ?? o))
          .filter((id) => Number.isFinite(id))
      );
      const scoped =
        allowedIds.size > 0
          ? rows.filter((item) => allowedIds.has(Number(item.id)))
          : rows;
      setOutlets(scoped);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch outlets");
    }
  };

  const getOutletName = (row) => {
    if (row?.outlet_name) return row.outlet_name;
    const outlet = outlets.find((item) => Number(item.id) === Number(row?.outlet_id));
    return outlet?.outlet_name || "-";
  };

  const fetchDetail = async (row) => {
    setSelectedUpload(row);
    setDetailLoading(true);
    try {
      const response = await salesAPI.getReconciliationById(row.id);
      const data = response?.data?.data || {};
      setDetail({
        ...row,
        ...data.reconciliation,
        errors: data.errors || [],
        items: data.items || [],
      });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch details");
      setDetail({ ...row, errors: [], items: [] });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleView = (row) => {
    fetchDetail(row);
  };

  const handleDownloadTemplate = async () => {
    try {
      await salesAPI.downloadPetPoojaTemplate();
      toast.success("PetPooja sales template downloaded");
    } catch (error) {
      toast.error("Unable to download template");
    }
  };

  const handleDownloadOriginal = (row) => {
    const filename = row.file_name || `original-${row.batch_number}.xlsx`;
    salesAPI
      .downloadOriginal(row.upload_id, filename)
      .catch((error) => toast.error(error.response?.data?.message || "Download failed"));
  };

  const handleDownloadProcessed = (row) => {
    const safeOutlet = String(getOutletName(row) || "Outlet").replace(/[^a-zA-Z0-9\-_]/g, "_");
    const safeDate = String(row.sales_date || "").replace(/[^a-zA-Z0-9\-_]/g, "_");
    const filename = `Daily_Sales_Processed_${safeOutlet}_${safeDate}.xlsx`;
    salesAPI
      .downloadProcessed(row.upload_id, filename)
      .catch((error) => toast.error(error.response?.data?.message || "Download failed"));
  };

  const handleDownloadErrorReport = (row) => {
    const filename = `reconciliation-${row.id}-errors.xlsx`;
    salesAPI
      .downloadErrorReport(row.id, filename)
      .catch((error) => toast.error(error.response?.data?.message || "Download failed"));
  };

  const handleApprove = async (row) => {
    try {
      await salesAPI.approveReconciliation(row.id);
      toast.success("Daily sales approved");
      await fetchUploads();
      if (detail?.id === row.id) await fetchDetail(row);
    } catch (error) {
      toast.error(error.response?.data?.message || "Approval failed");
    }
  };

  const handleReject = async (row, reason) => {
    try {
      await salesAPI.rejectReconciliation(row.id, reason);
      toast.success("Daily sales rejected");
      await fetchUploads();
      if (detail?.id === row.id) await fetchDetail(row);
    } catch (error) {
      toast.error(error.response?.data?.message || "Rejection failed");
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();

    if (!outletId || outletId === "all") {
      toast.error("Please select a specific outlet");
      return;
    }
    if (!file) {
      toast.error("Please choose a .xlsx file exported from PetPooja for this date");
      return;
    }
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error("Please upload a .xlsx PetPooja export");
      return;
    }

    setUploading(true);

    try {
      const payload = new FormData();
      payload.append("outlet_id", outletId);
      payload.append("file", file);

      const response = await api.post(`/sales/petpooja-upload/daily`, payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const data = response?.data?.data || {};
      const isMatched = data.is_matched;
      const warnings = Number(data.warnings || 0);
      const errors = Number(data.errors || 0);
      const reconciliationStatus = data.reconciliation_status;

      if (isMatched && errors === 0 && warnings === 0) {
        toast.success("Daily sales uploaded and reconciled successfully.");
      } else if (isMatched && warnings > 0) {
        toast.success(`Daily sales uploaded with ${warnings} warning${warnings === 1 ? "" : "s"}. Review the error report.`);
      } else if (errors > 0) {
        toast.error(`Daily sales uploaded with ${errors} error${errors === 1 ? "" : "s"}. Review the error report before approving.`);
      } else if (reconciliationStatus === "Mismatched" || !isMatched) {
        toast.error("Daily sales uploaded, but reconciliation is mismatched.");
      } else {
        toast.success("Daily sales uploaded successfully.");
      }

      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchUploads();
    } catch (error) {
      const message = error.response?.data?.message || "Upload failed";
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const filteredUploads = useMemo(() => {
    return uploads.filter((row) => {
      const text = `${getOutletName(row)} ${row.batch_number || ""} ${row.file_name || ""}`.toLowerCase();
      const searchMatch = text.includes(searchTerm.toLowerCase());
      const outletMatch = outletFilter === "all" || String(row.outlet_id) === String(outletFilter);
      const statusMatch =
        !statusFilter ||
        row.upload_status === statusFilter ||
        row.reconciliation_status === statusFilter;
      return searchMatch && outletMatch && statusMatch;
    });
  }, [uploads, outlets, searchTerm, outletFilter, statusFilter]);

  const visibleUploads = useMemo(
    () => filteredUploads.slice(0, Number(pageSize)),
    [filteredUploads, pageSize]
  );

  const summary = useMemo(() => {
    const entries = filteredUploads.length;
    const totalNet = filteredUploads
      .filter((r) => r.upload_status !== "Rejected")
      .reduce((s, r) => s + num(r.petpooja_net_sales), 0);
    const matched = filteredUploads.filter(
      (r) => r.reconciliation_status === "Matched" || r.reconciliation_status === "Approved" || r.is_matched
    ).length;
    const needsAttention = filteredUploads.filter(
      (r) =>
        r.reconciliation_status === "Mismatched" ||
        r.error_count > 0 ||
        r.warning_count > 0
    ).length;
    return { entries, totalNet, matched, needsAttention };
  }, [filteredUploads]);

  const [confirmAction, setConfirmAction] = useState(null);

  const clearFilters = () => {
    setSearchTerm("");
    setOutletFilter(selectedOutletId === "all" ? "all" : String(selectedOutletId || "all"));
    setStatusFilter("");
  };

  const rowActions = (row) => {
    const actions = [];
    if (hasPermission("item_sales", "can_export")) {
      actions.push({
        label: "Download Original",
        icon: FileDown,
        onClick: () => handleDownloadOriginal(row),
      });
      actions.push({
        label: "Download Processed",
        icon: FileSpreadsheet,
        onClick: () => handleDownloadProcessed(row),
      });
      if (row.error_count > 0 || row.warning_count > 0) {
        actions.push({
          label: "Download Error Report",
          icon: FileDown,
          onClick: () => handleDownloadErrorReport(row),
        });
      }
    }
    if (hasPermission("item_sales", "can_approve") && row.is_matched && row.reconciliation_status === "Matched") {
      actions.push({
        label: "Approve",
        icon: Check,
        onClick: () =>
          setConfirmAction({
            type: "approve",
            row,
            message: "This approved sales record becomes eligible for accounting and P&L.",
          }),
      });
    }
    if (hasPermission("item_sales", "can_reject") && !["Approved", "Rejected"].includes(row.upload_status)) {
      actions.push({
        label: "Reject",
        icon: XCircle,
        onClick: () =>
          setConfirmAction({
            type: "reject",
            row,
            message: "Reject this Daily Sales reconciliation?",
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
        title="Daily Sales"
        subtitle="Upload, reconcile and manage daily PetPooja sales reports."
        isDark={isDark}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-[14px] font-medium transition ${getCardClass(isDark)} hover:-translate-y-px`}
            >
              <Download size={16} />
              Download Template
            </button>
            <button
              type="button"
              onClick={fetchInitialData}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${getCardClass(isDark)} hover:-translate-y-px`}
              title="Refresh"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Daily Uploads"
          value={summary.entries}
          subtitle="Visible daily records"
          icon={FileSpreadsheet}
          color={primaryColor}
          bg={`${primaryColor}18`}
          isDark={isDark}
        />
        <KpiCard
          title="Net Sales"
          value={compactINR(summary.totalNet)}
          subtitle="Excludes rejected batches"
          icon={IndianRupee}
          color="#00CFE8"
          bg="#E6FAFD"
          isDark={isDark}
        />
        <KpiCard
          title="Matched"
          value={summary.matched}
          subtitle="Reconciled / Approved"
          icon={CheckCircle2}
          color="#28C76F"
          bg="#E9F9EF"
          isDark={isDark}
        />
        <KpiCard
          title="Needs Attention"
          value={summary.needsAttention}
          subtitle="Mismatched / errors / warnings"
          icon={AlertTriangle}
          color="#FF9F43"
          bg="#FFF4E5"
          isDark={isDark}
        />
      </div>

      <SectionCard isDark={isDark}>
        <div className="mb-5">
          <h3 className={`text-lg font-semibold ${main}`}>Upload Daily PetPooja Sales</h3>
          <p className={`mt-0.5 text-[13px] ${muted}`}>
            Upload the PetPooja Item Wise Sales Report for one business day.
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
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.outlet_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${main}`}>Sales Date</label>
              <div
                className={`flex h-11 w-full items-center rounded-lg border px-3 text-[14px] ${getInputClass(
                  isDark
                )}`}
              >
                <span className={muted}>Sales date will be detected automatically from the uploaded Excel file.</span>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className={`mb-1.5 block text-[13px] font-medium ${main}`}>Report File *</label>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped && /\.xlsx$/i.test(dropped.name)) {
                    setFile(dropped);
                  } else if (dropped) {
                    toast.error("Please upload a .xlsx file");
                  }
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
                  id="daily-sales-file"
                  type="file"
                  accept=".xlsx"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
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
                      or <label htmlFor="daily-sales-file" className="cursor-pointer text-[#7367F0] hover:underline">click to browse</label>
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
              {uploading ? "Uploading..." : "Upload Daily Sales"}
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
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.outlet_name}
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
            <option value="Reconciling">Reconciling</option>
            <option value="Matched">Matched</option>
            <option value="Mismatched">Mismatched</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
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
            <h3 className={`text-lg font-semibold ${main}`}>Daily Sales History</h3>
            <p className={`text-[13px] ${muted}`}>Daily PetPooja uploads and cashbook reconciliation status.</p>
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
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                  {["Date", "Outlet", "Net Sales", "Cashbook", "Difference", "Tolerance", "Reconciliation", "Upload Status", "Uploaded On", "Actions"].map((h) => (
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
            title="No Daily Sales uploads yet"
            subtitle="Upload a PetPooja daily sales report to begin reconciliation."
            isDark={isDark}
            action={
              canUpload ? (
                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className="h-10 rounded-lg px-4 text-[14px] font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                  >
                  Upload Daily Sales
                </button>
              ) : null
            }
          />
        ) : (
          <TableWrapper isDark={isDark}>
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                  <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>Date</th>
                  <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>Outlet</th>
                  <th className={`px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide ${main}`}>Net Sales</th>
                  <th className={`px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide ${main}`}>Cashbook</th>
                  <th className={`px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide ${main}`}>Difference</th>
                  <th className={`px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide ${main}`}>Tolerance</th>
                  <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>Reconciliation</th>
                  <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>Upload Status</th>
                  <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>Uploaded On</th>
                  <th className={`sticky right-0 z-10 px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main} ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleUploads.map((row) => {
                  const diff = num(row.collection_difference);
                  const tol = num(row.tolerance_amount);
                  const within = Math.abs(diff) <= tol;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b transition hover:bg-[#F8F7FA] ${
                        isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className={`text-[14px] font-semibold ${main}`}>{formatDate(row.sales_date)}</p>
                      </td>
                      <td className="px-4 py-3 text-[14px] text-[#6F6B7D]">{getOutletName(row)}</td>
                      <td className="px-4 py-3 text-right text-[14px] font-semibold" style={{ color: primaryColor }}>
                        {formatINR(row.petpooja_net_sales)}
                      </td>
                      <td className="px-4 py-3 text-right text-[14px] text-[#6F6B7D]">
                        {formatINR(row.cashbook_total)}
                      </td>
                      <td className={`px-4 py-3 text-right text-[14px] font-medium ${within ? "text-[#28C76F]" : "text-[#FF9F43]"}`}>
                        {formatINR(diff)}
                      </td>
                      <td className="px-4 py-3 text-right text-[14px] text-[#6F6B7D]">
                        {formatINR(tol)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.reconciliation_status} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.upload_status} />
                      </td>
                      <td className="px-4 py-3 text-[14px] text-[#6F6B7D]">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td
                        className={`sticky right-0 z-10 px-4 py-3 ${
                          isDark ? "bg-[#2F3349]" : "bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleView(row)}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                              isDark ? "text-[#D0D2D6] hover:bg-[#3B405A]" : "text-[#6F6B7D] hover:bg-[#F0EEFF] hover:text-[#7367F0]"
                            }`}
                            title="View Details"
                          >
                            <Eye size={17} />
                          </button>
                          <MobileActionMenu actions={rowActions(row)} isDark={isDark} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
                <h2 className={`text-xl font-bold ${main}`}>
                  {formatDate(detail.sales_date)}
                </h2>
                <p className={`text-[14px] ${muted}`}>
                  {getOutletName(detail)} — {detail.batch_number}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
                  isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"
                }`}
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  { label: "Gross Sales", value: formatINR(detail.petpooja_gross_sales) },
                  { label: "Net Sales", value: formatINR(detail.petpooja_net_sales) },
                  { label: "Cashbook Total", value: formatINR(detail.cashbook_total) },
                  { label: "Difference", value: formatINR(detail.collection_difference) },
                ].map((k) => (
                  <div
                    key={k.label}
                    className={`rounded-xl border p-4 ${isDark ? "border-[#3B405A] bg-[#25293C]" : "border-[#EBE9F1] bg-[#F8F7FA]"}`}
                  >
                    <p className={`text-[12px] font-medium ${muted}`}>{k.label}</p>
                    <p className={`mt-1 text-[18px] font-bold ${main}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
                {[
                  { label: "Tolerance", value: formatINR(detail.tolerance_amount) },
                  { label: "Final Collection", value: formatINR(detail.petpooja_final_collection) },
                  { label: "Discount", value: formatINR(detail.petpooja_discount) },
                  { label: "Tax", value: formatINR(detail.petpooja_tax) },
                ].map((k) => (
                  <div key={k.label}>
                    <p className={`text-[12px] font-medium ${muted}`}>{k.label}</p>
                    <p className={`mt-0.5 text-[15px] font-semibold ${main}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              <div
                className={`mt-5 rounded-xl border p-5 ${
                  detail.is_matched
                    ? isDark
                      ? "border-[#28C76F]/30 bg-[#223B31]"
                      : "border-[#28C76F]/30 bg-[#F1FBF5]"
                    : isDark
                    ? "border-[#FF9F43]/30 bg-[#33281F]"
                    : "border-[#FF9F43]/30 bg-[#FFF9F2]"
                }`}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                  <div>
                    <p className={`text-[12px] font-medium ${muted}`}>PetPooja Collection</p>
                    <p className={`text-[15px] font-semibold ${main}`}>{formatINR(detail.petpooja_final_collection)}</p>
                  </div>
                  <div>
                    <p className={`text-[12px] font-medium ${muted}`}>Cashbook Sales</p>
                    <p className={`text-[15px] font-semibold ${main}`}>{formatINR(detail.cashbook_total)}</p>
                  </div>
                  <div>
                    <p className={`text-[12px] font-medium ${muted}`}>Difference</p>
                    <p className={`text-[15px] font-semibold ${main}`}>{formatINR(detail.collection_difference)}</p>
                  </div>
                  <div>
                    <p className={`text-[12px] font-medium ${muted}`}>Allowed Tolerance</p>
                    <p className={`text-[15px] font-semibold ${main}`}>{formatINR(detail.tolerance_amount)}</p>
                  </div>
                  <div className="sm:col-span-2 md:col-span-2">
                    <p className={`text-[12px] font-medium ${muted}`}>Result</p>
                    <div className="mt-1">
                      <StatusBadge status={detail.is_matched ? "Matched" : "Mismatched"} />
                    </div>
                  </div>
                </div>
              </div>

              {detail.items?.length > 0 && (
                <div className="mt-6">
                  <h4 className={`mb-3 text-[15px] font-semibold ${main}`}>Items</h4>
                  <TableWrapper isDark={isDark} className="max-h-[260px]">
                    <table className="w-full min-w-[600px] border-collapse">
                      <thead>
                        <tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                          {["Category", "Item", "SAP Code", "Qty", "Net Sales"].map((h) => (
                            <th key={h} className={`px-4 py-2 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((item, idx) => (
                          <tr key={idx} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                            <td className={`px-4 py-2 text-[13px] ${main}`}>{item.category || "-"}</td>
                            <td className={`px-4 py-2 text-[13px] ${main}`}>{item.item_name || "-"}</td>
                            <td className={`px-4 py-2 text-[13px] ${muted}`}>{item.sap_code || "-"}</td>
                            <td className={`px-4 py-2 text-[13px] ${muted}`}>{Number(item.quantity || 0)}</td>
                            <td className={`px-4 py-2 text-[13px] font-medium`} style={{ color: primaryColor }}>
                              {formatINR(item.net_sales)}
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
                {detail.errors?.length > 0 ? (
                  <div className="space-y-2">
                    {detail.errors.map((err, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start gap-3 rounded-lg border p-3 ${
                          err.severity === "Error"
                            ? isDark
                              ? "border-[#EA5455]/30 bg-[#3B2328]"
                              : "border-[#EA5455]/30 bg-[#FDF2F2]"
                            : isDark
                            ? "border-[#FF9F43]/30 bg-[#33281F]"
                            : "border-[#FF9F43]/30 bg-[#FFF9F2]"
                        }`}
                      >
                        <AlertTriangle size={16} className={err.severity === "Error" ? "text-[#EA5455]" : "text-[#FF9F43]"} />
                        <div>
                          <p className={`text-[13px] font-semibold ${main}`}>
                            {err.severity === "Error" ? "Error" : "Warning"} — Row {err.row_number || "-"}
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

            <div
              className={`flex flex-col justify-between gap-3 border-t px-6 py-4 sm:flex-row sm:items-center ${
                isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"
              }`}
            >
              <div className="flex flex-wrap gap-2">
                {hasPermission("item_sales", "can_export") && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDownloadOriginal(detail)}
                      className={`h-9 rounded-lg border px-3 text-[13px] font-medium transition ${getCardClass(isDark)}`}
                    >
                      Original
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadProcessed(detail)}
                      className={`h-9 rounded-lg border px-3 text-[13px] font-medium transition ${getCardClass(isDark)}`}
                    >
                      Processed
                    </button>
                  </>
                )}
                {hasPermission("item_sales", "can_export") &&
                  (detail.error_count > 0 || detail.warning_count > 0) && (
                    <button
                      type="button"
                      onClick={() => handleDownloadErrorReport(detail)}
                      className={`h-9 rounded-lg border px-3 text-[13px] font-medium transition ${getCardClass(isDark)}`}
                    >
                      Error Report
                    </button>
                  )}
              </div>

              <div className="flex gap-2">
                {hasPermission("item_sales", "can_reject") &&
                  !["Approved", "Rejected"].includes(detail.upload_status) && (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmAction({
                          type: "reject",
                          row: detail,
                          message: "Reject this Daily Sales reconciliation?",
                        })
                      }
                      className="h-9 rounded-lg bg-[#FCEAEA] px-4 text-[13px] font-semibold text-[#EA5455] transition hover:bg-[#F9DCDC]"
                    >
                      Reject
                    </button>
                  )}
                {hasPermission("item_sales", "can_approve") &&
                  detail.is_matched &&
                  detail.reconciliation_status === "Matched" && (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmAction({
                          type: "approve",
                          row: detail,
                          message: "This approved sales record becomes eligible for accounting and P&L.",
                        })
                      }
                      className="h-9 rounded-lg bg-[#28C76F] px-4 text-[13px] font-semibold text-white transition hover:bg-[#20B360]"
                    >
                      Approve
                    </button>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${getCardClass(isDark)}`}>
            <h3 className={`text-lg font-bold ${main}`}>
              {confirmAction.type === "approve" && "Approve Daily Sales?"}
              {confirmAction.type === "reject" && "Reject Daily Sales"}
            </h3>
            <p className={`mt-2 text-[14px] ${muted}`}>{confirmAction.message}</p>

            {confirmAction.type === "reject" && (
              <div className="mt-4">
                <label className={`mb-1.5 block text-[13px] font-medium ${main}`}>Reason for rejection *</label>
                <textarea
                  autoFocus
                  value={confirmAction.reason || ""}
                  onChange={(e) => setConfirmAction({ ...confirmAction, reason: e.target.value })}
                  placeholder="Enter reason for rejection"
                  className={`h-24 w-full rounded-lg border p-3 text-[14px] outline-none ${getInputClass(isDark)}`}
                />
              </div>
            )}

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
                  const { type, row, reason } = confirmAction;
                  setConfirmAction(null);
                  if (type === "approve") handleApprove(row);
                  if (type === "reject") {
                    if (!reason?.trim()) {
                      toast.error("Rejection reason is required");
                      return;
                    }
                    handleReject(row, reason);
                  }
                }}
                className={`h-10 rounded-lg px-4 text-[14px] font-semibold transition ${
                  confirmAction.type === "reject"
                    ? "bg-[#EA5455] text-white hover:bg-[#D14545]"
                    : "bg-[#28C76F] text-white hover:bg-[#20B360]"
                }`}
              >
                {confirmAction.type === "approve" && "Approve"}
                {confirmAction.type === "reject" && "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailySalesUpload;

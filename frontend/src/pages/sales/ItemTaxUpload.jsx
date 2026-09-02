import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Upload,
  Download,
  X,
  Trash2,
  Loader2,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  ShieldCheck,
  IndianRupee,
  Percent,
} from "lucide-react";
import {
  PageHeader,
  SectionCard,
  TableWrapper,
  EmptyState,
  LoadingRows,
  getPrimaryColor,
  getThemeMode,
  getCardClass,
  getInputClass,
} from "../../components/ui";
import { masterAPI } from "../../services/api";
import { salesAPI } from "../../services/salesAPI";
import useAuthStore from "../../store/authStore";
import toast from "react-hot-toast";

const getRows = (response) => {
  const data = response?.data?.data || response?.data || [];
  return Array.isArray(data) ? data : [];
};

const num = (value) => Number(value || 0);

const formatINR = (value = 0) =>
  "₹" + Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value) => {
  if (!value) return "-";
  const str = String(value).split("T")[0];
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

const ItemTaxUpload = () => {
  const outletContext = useOutletContext() || {};
  const { selectedOutletId = "all", availableOutlets = [] } = outletContext;

  const isDark = getThemeMode() === "dark";
  const primaryColor = getPrimaryColor();
  const muted = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const main = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  const fileInputRef = useRef(null);
  const [uploads, setUploads] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [outletId, setOutletId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [file, setFile] = useState(null);

  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions || {};
  const hasPermission = (module, action) => {
    const adminRoles = ["Super Admin", "Admin", "Developer"];
    if (adminRoles.includes(user?.role_name)) return true;
    return !!permissions[module]?.[action];
  };
  const canUpload = hasPermission("item_sales_tax", "can_upload");
  const canDelete = hasPermission("item_sales_tax", "can_delete");

  const isOutletLocked = selectedOutletId !== "all";

  useEffect(() => {
    const allowed = availableOutlets.map((o) => Number(o?.id ?? o)).filter((id) => Number.isFinite(id));
    const defaultOutlet = selectedOutletId !== "all" ? selectedOutletId : allowed.length === 1 ? allowed[0] : "";
    setOutletId(String(defaultOutlet || ""));
  }, [selectedOutletId, availableOutlets]);

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
      const params = {};
      if (selectedOutletId !== "all") params.outlet_id = selectedOutletId;
      const response = await salesAPI.getItemTaxUploads(params);
      setUploads(getRows(response));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch item tax report history");
    }
  };

  const fetchOutlets = async () => {
    try {
      const response = await masterAPI.getOutlets();
      const rows = getRows(response);
      const allowedIds = new Set(availableOutlets.map((o) => Number(o?.id ?? o)).filter((id) => Number.isFinite(id)));
      setOutlets(allowedIds.size > 0 ? rows.filter((item) => allowedIds.has(Number(item.id))) : rows);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch outlets");
    }
  };

  const getOutletName = (row) => {
    if (row?.outlet_name) return row.outlet_name;
    const outlet = outlets.find((item) => Number(item.id) === Number(row?.outlet_id));
    return outlet?.outlet_name || "-";
  };

  const handleDownloadTemplate = async () => {
    try {
      await salesAPI.downloadItemTaxTemplate();
      toast.success("Template downloaded");
    } catch {
      toast.error("Unable to download template");
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!outletId) return toast.error("Please select a specific outlet");
    if (!fromDate || !toDate) return toast.error("Please choose the period this report covers");
    if (fromDate > toDate) return toast.error("From date must be before to date");
    if (!file) return toast.error("Please choose the Item Wise Tax Report file from PetPooja");
    if (!/\.xlsx$/i.test(file.name)) return toast.error("Please upload a .xlsx PetPooja export");

    setUploading(true);
    try {
      const payload = new FormData();
      payload.append("outlet_id", outletId);
      payload.append("from_date", fromDate);
      payload.append("to_date", toDate);
      payload.append("file", file);

      const response = await salesAPI.uploadItemTaxReport(payload);
      const data = response?.data?.data || {};
      toast.success(`Item tax report uploaded — ${data.total_items || 0} items. GSTR-1 for this outlet/period will now use these exact figures.`);
      setFile(null);
      setFromDate("");
      setToDate("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchUploads();
    } catch (error) {
      toast.error(error.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (row) => {
    try {
      await salesAPI.deleteItemTaxUpload(row.id);
      toast.success("Item tax report deleted");
      setConfirmDelete(null);
      await fetchUploads();
    } catch (error) {
      toast.error(error.response?.data?.message || "Delete failed");
    }
  };

  const summary = useMemo(() => {
    const entries = uploads.length;
    const totalNet = uploads.reduce((s, r) => s + num(r.total_net_amount), 0);
    const totalTax = uploads.reduce((s, r) => s + num(r.total_tax), 0);
    return { entries, totalNet, totalTax };
  }, [uploads]);

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden p-1 sm:p-0" style={{ fontFamily: '"Public Sans", "Inter", system-ui, sans-serif' }}>
      <PageHeader
        title="Item Tax Report"
        subtitle="Upload PetPooja's Item Wise Tax Report to give GSTR-1 the real CGST/SGST split per item — no name-matching or 50/50 guessing needed for outlets and periods covered here."
        isDark={isDark}
        actions={
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleDownloadTemplate} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-[14px] font-medium transition ${getCardClass(isDark)} hover:-translate-y-px`}>
              <Download size={16} /> Download Template
            </button>
            <button type="button" onClick={fetchInitialData} className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${getCardClass(isDark)} hover:-translate-y-px`} title="Refresh">
              <RefreshCw size={17} />
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={`rounded-xl border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${getCardClass(isDark)}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={`text-[13px] font-medium ${muted}`}>Reports Uploaded</p>
              <h3 className={`mt-2 text-[22px] font-bold ${main}`}>{summary.entries}</h3>
              <p className={`mt-1 text-[12px] ${muted}`}>Outlet+period combinations</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
              <FileSpreadsheet size={22} />
            </div>
          </div>
        </div>
        <div className={`rounded-xl border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${getCardClass(isDark)}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={`text-[13px] font-medium ${muted}`}>Net Amount Covered</p>
              <h3 className={`mt-2 text-[22px] font-bold ${main}`}>{formatINR(summary.totalNet)}</h3>
              <p className={`mt-1 text-[12px] ${muted}`}>Sum across all uploads</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#E9F9EF] text-[#28C76F]">
              <IndianRupee size={22} />
            </div>
          </div>
        </div>
        <div className={`rounded-xl border p-5 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${getCardClass(isDark)}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={`text-[13px] font-medium ${muted}`}>Exact Tax Captured</p>
              <h3 className={`mt-2 text-[22px] font-bold ${main}`}>{formatINR(summary.totalTax)}</h3>
              <p className={`mt-1 text-[12px] ${muted}`}>Real CGST+SGST, not estimated</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#E6FAFD] text-[#00CFE8]">
              <Percent size={22} />
            </div>
          </div>
        </div>
      </div>

      <SectionCard isDark={isDark}>
        <div className="mb-5">
          <h3 className={`text-lg font-semibold ${main}`}>Upload Item Wise Tax Report</h3>
          <p className={`mt-0.5 text-[13px] ${muted}`}>
            This PetPooja export has no date range embedded in the file — enter the period it covers yourself. For it to sharpen a GSTR-1 report, the period entered here must exactly match the GSTR-1 date range requested.
          </p>
        </div>

        <form onSubmit={handleUpload} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${main}`}>Outlet *</label>
              <select
                value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                disabled={isOutletLocked || uploading}
                className={`h-11 w-full rounded-lg border px-3 text-[14px] outline-none ${getInputClass(isDark)} disabled:opacity-70`}
              >
                <option value="">Select Outlet</option>
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>{outlet.outlet_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${main}`}>From Date *</label>
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
                disabled={uploading}
                className={`h-11 w-full rounded-lg border px-3 text-[14px] outline-none ${getInputClass(isDark)}`}
              />
            </div>
            <div>
              <label className={`mb-1.5 block text-[13px] font-medium ${main}`}>To Date *</label>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setToDate(e.target.value)}
                disabled={uploading}
                className={`h-11 w-full rounded-lg border px-3 text-[14px] outline-none ${getInputClass(isDark)}`}
              />
            </div>
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
                if (dropped) setFile(dropped);
              }}
              className={`relative rounded-xl border-2 border-dashed p-5 text-center transition ${
                file || dragOver
                  ? isDark ? "border-[#28C76F] bg-[#223B31]" : "border-[#28C76F] bg-[#F1FBF5]"
                  : isDark ? "border-[#4A4F68] bg-[#25293C] hover:border-[#7367F0]" : "border-[#D8D6DE] bg-[#FBFAFC] hover:border-[#7367F0]"
              }`}
            >
              <input ref={fileInputRef} id="item-tax-file" type="file" accept=".xlsx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {!file ? (
                <>
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                    <FileSpreadsheet size={24} />
                  </div>
                  <p className={`mt-3 text-[15px] font-semibold ${main}`}>Drop your .xlsx file here</p>
                  <p className={`mt-0.5 text-[13px] ${muted}`}>
                    or <label htmlFor="item-tax-file" className="cursor-pointer text-[#7367F0] hover:underline">click to browse</label>
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
                      <p className={`text-[12px] ${muted}`}>{(file.size / 1024).toFixed(1)} KB • .xlsx</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#FCEAEA] px-3 text-[13px] font-medium text-[#EA5455] transition hover:bg-[#F9DCDC]">
                    <X size={14} /> Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploading || !outletId || !fromDate || !toDate || !file || !canUpload}
              className="inline-flex h-11 items-center gap-2 rounded-lg px-5 text-[14px] font-semibold text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              {uploading ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />}
              {uploading ? "Uploading…" : "Upload Item Tax Report"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard isDark={isDark}>
        <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <div>
            <h3 className={`text-lg font-semibold ${main}`}>Upload History</h3>
            <p className={`text-[13px] ${muted}`}>Every outlet/period this precise tax data covers.</p>
          </div>
          <span className={`text-[13px] ${muted}`}>{uploads.length} records</span>
        </div>

        {loading ? (
          <TableWrapper isDark={isDark}>
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                  {["Period", "Outlet", "Items", "Net Amount", "CGST", "SGST", "Total Tax", "Uploaded", ""].map((h) => (
                    <th key={h} className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody><LoadingRows rows={4} cols={9} isDark={isDark} /></tbody>
            </table>
          </TableWrapper>
        ) : uploads.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No item tax reports uploaded yet"
            subtitle="Upload PetPooja's Item Wise Tax Report for an outlet and period to make that period's GSTR-1 precise."
            isDark={isDark}
          />
        ) : (
          <TableWrapper isDark={isDark}>
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                  <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>Period</th>
                  <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>Outlet</th>
                  <th className={`px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide ${main}`}>Items</th>
                  <th className={`px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide ${main}`}>Net Amount</th>
                  <th className={`px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide ${main}`}>CGST</th>
                  <th className={`px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide ${main}`}>SGST</th>
                  <th className={`px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide ${main}`}>Total Tax</th>
                  <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}>Uploaded</th>
                  <th className={`px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide ${main}`}></th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((row) => (
                  <tr key={row.id} className={`border-b transition hover:bg-[#F8F7FA] ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                    <td className="px-4 py-3">
                      <p className={`text-[14px] font-medium ${main}`}>{formatDate(row.upload_date_from)} → {formatDate(row.upload_date_to)}</p>
                      <p className={`text-[12px] ${muted}`}>{row.batch_number}</p>
                    </td>
                    <td className="px-4 py-3 text-[14px] text-[#6F6B7D]">{getOutletName(row)}</td>
                    <td className="px-4 py-3 text-right text-[14px] text-[#6F6B7D]">{row.total_items}</td>
                    <td className="px-4 py-3 text-right text-[14px] font-semibold" style={{ color: primaryColor }}>{formatINR(row.total_net_amount)}</td>
                    <td className="px-4 py-3 text-right text-[14px] text-[#6F6B7D]">{formatINR(row.total_cgst)}</td>
                    <td className="px-4 py-3 text-right text-[14px] text-[#6F6B7D]">{formatINR(row.total_sgst)}</td>
                    <td className="px-4 py-3 text-right text-[14px] font-medium text-[#28C76F]">{formatINR(row.total_tax)}</td>
                    <td className="px-4 py-3 text-[13px] text-[#6F6B7D]">{formatDateTime(row.created_at)}</td>
                    <td className="px-4 py-3">
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(row)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#EA5455] transition hover:bg-[#FCEAEA]"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </SectionCard>

      {confirmDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${getCardClass(isDark)}`}>
            <h3 className={`text-lg font-bold ${main}`}>Delete Item Tax Report?</h3>
            <p className={`mt-2 text-[14px] ${muted}`}>
              This removes the upload and its item rows for {getOutletName(confirmDelete)}, {formatDate(confirmDelete.upload_date_from)} to {formatDate(confirmDelete.upload_date_to)}. GSTR-1 for that period will fall back to the estimated split. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmDelete(null)} className={`h-10 rounded-lg border px-4 text-[14px] font-medium transition ${getCardClass(isDark)}`}>Cancel</button>
              <button type="button" onClick={() => handleDelete(confirmDelete)} className="h-10 rounded-lg bg-[#EA5455] px-4 text-[14px] font-semibold text-white transition hover:bg-[#D14545]">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemTaxUpload;

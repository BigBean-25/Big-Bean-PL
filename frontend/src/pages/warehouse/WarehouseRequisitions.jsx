import { useEffect, useRef, useState } from "react";
import ExcelJS from "exceljs";
import { warehouseAPI, getStoredPermissions } from "../../services/api";
import useAuthStore from "../../store/authStore";
import { SectionCard, TableWrapper, LoadingRows, EmptyState, StatusBadge, Pagination } from "../../components/ui";
import { KpiCard, fmtCurrency, fmtQty, fmtDate, num, EmptyRow } from "./WarehouseShared";
import { getInputClass } from "../../components/ui";
import { Search, RotateCcw, Plus, Eye, CheckCircle, XCircle, Truck, ClipboardList, X, Upload, Download } from "lucide-react";
import { IMPORT_MAX_ROWS, IMPORT_TEMPLATE_HEADER, parseCsvText, cellText, mapImportHeaders, buildMaterialIndex, buildUnitIndex, evaluateImportRow } from "./requisitionImport";
import toast from "react-hot-toast";

// Searchable material picker for Outlet PO line items. Matches on
// material_name and material_code, is keyboard-usable (arrows + Enter +
// Escape), supports clearing, and hides materials already picked on other
// rows so a duplicate line can't be created through the UI (the backend
// still rejects duplicates deterministically as a second guard).
const MaterialCombobox = ({ value, onSelect, materials, excludeIds, stockById, isDark, inputClass }) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);
  const selected = materials.find((m) => String(m.id) === String(value));

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = term.trim().toLowerCase();
  const options = materials
    .filter((m) => !excludeIds.has(String(m.id)))
    .filter((m) => !q || (m.material_name || "").toLowerCase().includes(q) || (m.material_code || "").toLowerCase().includes(q))
    .slice(0, 50);

  const pick = (m) => { onSelect(String(m.id)); setTerm(""); setOpen(false); };

  return (
    <div ref={boxRef} className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        value={open ? term : (selected ? `${selected.material_name}${selected.material_code ? ` (${selected.material_code})` : ""}` : "")}
        onFocus={() => { setOpen(true); setTerm(""); setHi(0); }}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, Math.max(options.length - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); if (open && options[hi]) pick(options[hi]); }
          else if (e.key === "Escape") { setOpen(false); }
        }}
        className={`h-10 w-full rounded-lg border pl-9 pr-8 text-[14px] outline-none ${inputClass}`}
        placeholder="Search material name or code"
      />
      {selected && !open && (
        <button type="button" onClick={() => onSelect("")} title="Clear material" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-rose-500"><X size={14} /></button>
      )}
      {open && (
        <div className={`absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border shadow-lg ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
          {options.length === 0 ? (
            <div className="px-3 py-2 text-[13px] text-gray-400">No materials match</div>
          ) : options.map((m, i) => {
            const stock = stockById[String(m.id)];
            return (
              <button key={m.id} type="button" onMouseDown={(e) => { e.preventDefault(); pick(m); }} onMouseEnter={() => setHi(i)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] ${i === hi ? (isDark ? "bg-[#3B405A]" : "bg-[#F3F2F7]") : ""}`}>
                <span className="min-w-0 truncate">{m.material_name}{m.material_code ? ` · ${m.material_code}` : ""}</span>
                {stock && <span className="shrink-0 text-[11px] text-gray-400">{fmtQty(stock.current_qty)} {stock.unit_name || ""}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function WarehouseRequisitions({ locationId, locations, materials, isDark, units = [] }) {
  const [loading, setLoading] = useState(true);
  const [requisitions, setRequisitions] = useState([]);
  const [filters, setFilters] = useState({ search: "", status: "", from: "", to: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState(null);
  const [approval, setApproval] = useState({ items: [], open: false });
  const [warehouseStock, setWarehouseStock] = useState({});
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, pages: 1 });
  const inputClass = getInputClass(isDark);
  const { user } = useAuthStore();
  const isAdminRole = ["Super Admin", "Admin", "Developer"].includes(user?.role_name);
  const reqPerms = getStoredPermissions()?.warehouse_requisitions || {};
  const can = (a) => isAdminRole || Boolean(reqPerms[a]);
  const isOwn = (r) =>
    Boolean(user?.id && r?.created_by && Number(user.id) === Number(r.created_by));

  const warehouses = locations.filter((l) => l.location_type === "Central Warehouse");
  const outlets = locations.filter((l) => l.location_type === "Outlet");

  // Requisitions are meant to reflect what the warehouse actually has, so
  // the create form shows live available quantity per material rather than
  // making the requester guess or check a separate tab.
  const fetchWarehouseStock = async (fromLocationId) => {
    if (!fromLocationId) { setWarehouseStock({}); return; }
    try {
      const res = await warehouseAPI.getStock({ location_id: fromLocationId });
      const rows = res?.data?.data || [];
      setWarehouseStock(Object.fromEntries(rows.map((r) => [String(r.raw_material_id), r])));
    } catch { setWarehouseStock({}); }
  };

  const [form, setForm] = useState({
    from_location_id: warehouses[0]?.id || "",
    to_location_id: outlets[0]?.id || "",
    request_date: new Date().toISOString().split("T")[0],
    required_date: "",
    remarks: "",
    items: [{ raw_material_id: "", requested_qty: "", unit_id: "", remarks: "" }],
  });

  const fetchRequisitions = async (pageArg = page) => {
    setLoading(true);
    try {
      const res = await warehouseAPI.getRequisitions({ ...filters, page: pageArg, limit: pageSize });
      setRequisitions(res?.data?.data || []);
      if (res?.data?.pagination) setPagination(res.data.pagination);
    } catch (error) { toast.error("Failed to load outlet purchase orders"); }
    finally { setLoading(false); }
  };

  // Changing a filter resets to page 1 and fetches directly (rather than
  // waiting for the page state update to flush and re-trigger the effect
  // below), so the list never briefly shows a stale page under new filters.
  useEffect(() => {
    setPage(1);
    fetchRequisitions(1);
  }, [filters]);

  useEffect(() => {
    if (page === 1) return;
    fetchRequisitions(page);
  }, [page]);

  // Per-material valid-UOM cache for the page session. Entries are mutated in
  // a ref (no re-render needed mid-fetch); uomTick just repaints when a fetch
  // settles. The backend endpoint answers through the same findConversionFactor
  // the create validator uses, so these options can never disagree with it.
  const uomCache = useRef({}); // { [materialId]: { status: 'loading'|'ready'|'error', options: [] } }
  const [, setUomTick] = useState(0);

  // Returns a promise resolving to the material's valid-UOM options (or null
  // on failure). The in-flight promise is stored on the cache entry itself so
  // repeated callers - the per-row selector AND the bulk importer - share one
  // request and one result.
  const loadValidUoms = (matId) => {
    const key = String(matId);
    const cached = uomCache.current[key];
    if (cached && cached.status !== "error") return cached.promise;
    const promise = warehouseAPI.getRequisitionValidUoms(key)
      .then((res) => {
        const options = res?.data?.data || [];
        uomCache.current[key] = { status: "ready", options, promise: Promise.resolve(options) };
        // Default the line's UOM to the material's base unit now that the
        // valid set is known - but never clobber a still-valid user choice.
        const base = options.find((o) => o.is_base);
        if (base) {
          setForm((f) => ({
            ...f,
            items: f.items.map((it) =>
              String(it.raw_material_id) === key && !options.some((o) => String(o.id) === String(it.unit_id))
                ? { ...it, unit_id: String(base.id) }
                : it
            ),
          }));
        }
        return options;
      })
      .catch(() => { uomCache.current[key] = { status: "error", options: [], promise: null }; return null; })
      .finally(() => setUomTick((t) => t + 1));
    uomCache.current[key] = { status: "loading", options: [], promise };
    setUomTick((t) => t + 1);
    return promise;
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { raw_material_id: "", requested_qty: "", unit_id: "", remarks: "" }] });
  const updateItem = (idx, key, value) => {
    const items = [...form.items];
    items[idx][key] = value;
    if (key === "raw_material_id") {
      if (value && form.items.some((it, i) => i !== idx && String(it.raw_material_id) === String(value))) {
        toast.error("This material is already on another line - increase that line's quantity instead");
        return;
      }
      // UOM resets whenever the material changes; the valid-UOM fetch below
      // re-defaults it to the new material's base unit once options arrive.
      items[idx].unit_id = "";
      if (value) loadValidUoms(value);
    }
    setForm({ ...form, items });
  };

  // ---- Phase 7B3A: client-side bulk item import (optional convenience; the
  // one-by-one entry above is unchanged). The file is parsed in the browser,
  // evaluated against material master + the valid-UOM endpoint, previewed,
  // and only rows marked "Valid" are appended to form.items. Nothing is
  // persisted - create() still calls the same API with the same payload.
  const [importPreview, setImportPreview] = useState(null); // { rows, truncated, fileName }
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const parseImportFile = async (file) => {
    const lower = (file.name || "").toLowerCase();
    if (lower.endsWith(".csv")) return parseCsvText(await file.text());
    if (lower.endsWith(".xlsx")) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("No worksheet found in the file");
      const rows = [];
      ws.eachRow((row) => {
        const cells = [];
        for (let i = 1; i <= Math.max(row.cellCount, 5); i++) cells.push(cellText(row.getCell(i).value));
        rows.push(cells);
      });
      return rows;
    }
    throw new Error("Unsupported file type - upload a .xlsx or .csv file");
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after fixing it
    if (!file) return;
    setImporting(true);
    try {
      const raw = (await parseImportFile(file)).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
      if (raw.length < 2) throw new Error("No data rows found - the first row must be the header");
      const cols = mapImportHeaders(raw[0]);
      const dataRows = raw.slice(1);
      const ctx = {
        ...buildMaterialIndex(materials),
        unitByName: buildUnitIndex(units),
        getValidUoms: (matId) => loadValidUoms(matId),
        existingIds: new Set(form.items.map((it) => String(it.raw_material_id)).filter(Boolean)),
        importedIds: new Set(),
      };
      const rows = [];
      for (let i = 0; i < Math.min(dataRows.length, IMPORT_MAX_ROWS); i++) {
        const cells = dataRows[i];
        rows.push(await evaluateImportRow({
          rowNo: i + 2,
          codeText: String(cells[cols.code] ?? ""),
          nameText: String(cells[cols.name] ?? ""),
          qtyText: String(cells[cols.qty] ?? ""),
          uomText: String(cols.uom !== undefined ? (cells[cols.uom] ?? "") : ""),
          remarks: cols.remarks !== undefined ? String(cells[cols.remarks] ?? "") : "",
        }, ctx));
      }
      setImportPreview({ rows, truncated: dataRows.length > IMPORT_MAX_ROWS, fileName: file.name });
    } catch (err) { toast.error(err.message || "Could not read the file"); }
    finally { setImporting(false); }
  };

  const applyImport = () => {
    const valid = (importPreview?.rows || []).filter((r) => r.status === "Valid");
    if (!valid.length) return;
    setForm((f) => ({
      ...f,
      // Drop only completely-empty starter rows before appending; a row the
      // user partially typed into is preserved.
      items: [
        ...f.items.filter((it) => it.raw_material_id || it.requested_qty || it.unit_id || it.remarks),
        ...valid.map((r) => ({
          raw_material_id: String(r.material.id),
          requested_qty: String(r.qty),
          unit_id: String(r.uomOption.id),
          remarks: r.remarks || "",
        })),
      ],
    }));
    setImportPreview(null);
    toast.success(`${valid.length} item${valid.length === 1 ? "" : "s"} added to the Outlet Purchase Order`);
  };

  const downloadImportTemplate = () => {
    const blob = new Blob([`${IMPORT_TEMPLATE_HEADER}\n`], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "outlet_po_items_template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const create = async (submit = false) => {
    if (saving) return;
    // Client-side mirror of the backend rule - the server stays authoritative,
    // this just saves a round trip for the common mistake.
    if (form.required_date && form.required_date < form.request_date) {
      toast.error("Expected Delivery Date cannot be before Request Date");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, items: form.items.map((it) => ({ ...it, raw_material_id: Number(it.raw_material_id), requested_qty: Number(it.requested_qty), unit_id: Number(it.unit_id) })) };
      const created = await warehouseAPI.createRequisition(payload);
      const poNo = created?.data?.data?.requisition_no;
      if (submit && created?.data?.data?.id) await warehouseAPI.submitRequisition(created.data.data.id);
      toast.success(`${poNo ? `${poNo} ` : ""}${submit ? "submitted" : "saved"}`);
      setShowCreate(false);
      setForm({ from_location_id: warehouses[0]?.id || "", to_location_id: outlets[0]?.id || "", request_date: new Date().toISOString().split("T")[0], required_date: "", remarks: "", items: [{ raw_material_id: "", requested_qty: "", unit_id: "", remarks: "" }] });
      fetchRequisitions();
    } catch (error) { toast.error(error.response?.data?.message || "Save failed"); }
    finally { setSaving(false); }
  };

  const openDetail = async (r) => {
    try {
      const res = await warehouseAPI.getRequisition(r.id);
      const d = res?.data?.data;
      setDetail(d);
      setApproval({ open: false, items: (d?.items || []).map((it) => ({ ...it, approved_qty: "", rejected_qty: "", approval_remarks: "" })) });
    } catch (error) { toast.error("Failed to load outlet purchase order"); }
  };

  const approve = async (reject = false) => {
    try {
      const payload = {
        items: approval.items.map((it) => ({ id: it.id, approved_qty: reject ? 0 : num(it.approved_qty), rejected_qty: reject ? num(it.requested_qty) : 0, remarks: it.approval_remarks })),
      };
      await warehouseAPI.approveRequisition(detail.id, payload);
      toast.success(reject ? "Rejected" : "Approved");
      setApproval({ ...approval, open: false });
      openDetail(detail);
      fetchRequisitions();
    } catch (error) { toast.error(error.response?.data?.message || "Approval failed"); }
  };

  const dispatch = async () => {
    try {
      const items = detail.items.filter((it) => num(it.approved_qty) > 0 && num(it.dispatched_qty) < num(it.approved_qty));
      if (!items.length) return toast.error("Nothing to dispatch");
      const payload = {
        transfer_no: `TRF-${Date.now()}`,
        dispatch_date: new Date().toISOString().split("T")[0],
        items: items.map((it) => ({ raw_material_id: it.raw_material_id, dispatched_qty: Number(it._dispatch || 0), unit_id: it.unit_id, batch_no: it._batch || "", expiry_date: it._expiry || null })),
      };
      await warehouseAPI.dispatchRequisition(detail.id, payload);
      toast.success("Dispatched");
      openDetail(detail);
      fetchRequisitions();
    } catch (error) { toast.error(error.response?.data?.message || "Dispatch failed"); }
  };

  const filtered = requisitions.filter((r) => {
    const term = filters.search.toLowerCase();
    return (term === "" || (r.requisition_no || "").toLowerCase().includes(term) || (r.to_location || "").toLowerCase().includes(term))
      && (filters.status === "" || r.status === filters.status)
      && (filters.from === "" || String(r.from_location_id) === filters.from)
      && (filters.to === "" || String(r.to_location_id) === filters.to);
  });

  const reset = () => setFilters({ search: "", status: "", from: "", to: "" });

  const statusOptions = ["Draft", "Submitted", "Approved", "Partially Approved", "Rejected", "Dispatched", "Partially Received", "Received"];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={ClipboardList} label="Draft" value={requisitions.filter((r) => r.status === "Draft").length} isDark={isDark} />
        <KpiCard icon={ClipboardList} label="Submitted" value={requisitions.filter((r) => r.status === "Submitted").length} isDark={isDark} />
        <KpiCard icon={ClipboardList} label="Approved" value={requisitions.filter((r) => r.status === "Approved").length} isDark={isDark} />
        <KpiCard icon={ClipboardList} label="Partially Approved" value={requisitions.filter((r) => r.status === "Partially Approved").length} isDark={isDark} />
        <KpiCard icon={Truck} label="Pending Dispatch" value={requisitions.filter((r) => r.status === "Approved").length} isDark={isDark} />
      </div>

      <SectionCard title="Filters" isDark={isDark}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className={`h-10 w-full rounded-lg border pl-9 pr-3 text-[14px] outline-none ${inputClass}`} placeholder="Search outlet purchase order or outlet" />
          </div>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">All Status</option>
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">From Warehouse</option>
            {warehouses.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}
          </select>
          <select value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">To Outlet</option>
            {outlets.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}
          </select>
          <button onClick={reset} className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#A5A8B6]" : "border-[#EBE9F1] bg-white text-[#6F6B7D]"}`}>
            <RotateCcw size={14} /> Reset
          </button>
          {can("can_create") && (
            <button onClick={() => { setShowCreate(true); fetchWarehouseStock(form.from_location_id); }} className="flex h-10 items-center gap-2 rounded-lg bg-[#7367F0] px-3 text-[13px] font-semibold text-white hover:bg-[#6354D8]">
              <Plus size={16} /> New Outlet Purchase Order
            </button>
          )}
        </div>
      </SectionCard>

      <SectionCard isDark={isDark}>
        <TableWrapper isDark={isDark}>
          <table className="w-full border-collapse text-[13px]">
            <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
              <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                <th className="px-3 py-3">Outlet PO No</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Outlet</th>
                <th className="px-3 py-3">Warehouse</th>
                <th className="px-3 py-3 text-center">Items</th>
                <th className="px-3 py-3 text-right">Requested</th>
                <th className="px-3 py-3 text-right">Approved</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3">Created By</th>
                <th className="sticky right-0 px-3 py-3 text-center" style={{ background: isDark ? "#2F3349" : "white" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRows rows={5} cols={10} isDark={isDark} /> : (
                <>
                  {filtered.map((r) => (
                    <tr key={r.id} className={`border-b transition ${isDark ? "border-[#3B405A] hover:bg-[#3B405A]/30" : "border-[#F3F2F7] hover:bg-[#F8F7FA]"}`}>
                      <td className="px-3 py-2.5 font-medium">{r.requisition_no}</td>
                      <td className="px-3 py-2.5">{fmtDate(r.request_date)}</td>
                      <td className="px-3 py-2.5">{r.to_location}</td>
                      <td className="px-3 py-2.5">{r.from_location}</td>
                      <td className="px-3 py-2.5 text-center">{r.item_count || r.items || 0}</td>
                      <td className="px-3 py-2.5 text-right">{fmtQty(r.total_requested)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtQty(r.total_approved)}</td>
                      <td className="px-3 py-2.5 text-center"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2.5">{r.created_by_name}</td>
                      <td className="sticky right-0 px-3 py-2.5 text-center" style={{ background: isDark ? "#2F3349" : "white" }}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openDetail(r)} className={`rounded-md p-1.5 ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}><Eye size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && <EmptyRow colSpan={10} isDark={isDark} />}
                </>
              )}
            </tbody>
          </table>
        </TableWrapper>
        <Pagination
          page={pagination.page || page}
          pages={pagination.pages || 1}
          total={pagination.total || 0}
          limit={pagination.limit || pageSize}
          onPageChange={setPage}
          isDark={isDark}
        />
      </SectionCard>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">Create Outlet Purchase Order</h3>
              <button onClick={() => setShowCreate(false)} className="text-2xl leading-none">&times;</button>
            </div>
            <div className="space-y-4 p-4">
              <SectionCard title="Outlet Purchase Order Details" isDark={isDark}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className={`flex h-10 items-center rounded-lg border px-3 text-[13px] ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                    PO No — auto-generated on save (e.g. OPO-&lt;OUTLET&gt;-&lt;YEAR&gt;-000001)
                  </div>
                  <select value={form.from_location_id} onChange={(e) => { const v = e.target.value; setForm({ ...form, from_location_id: v }); fetchWarehouseStock(v); }} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                    <option value="">Requested Warehouse</option>
                    {warehouses.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}
                  </select>
                  <select value={form.to_location_id} onChange={(e) => setForm({ ...form, to_location_id: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
                    <option value="">Outlet</option>
                    {outlets.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}
                  </select>
                  <div>
                    <label className={`mb-1 block text-[12px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Request Date</label>
                    <input type="date" value={form.request_date} onChange={(e) => setForm({ ...form, request_date: e.target.value })} className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                  </div>
                  <div>
                    <label className={`mb-1 block text-[12px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Expected Delivery Date</label>
                    <input type="date" value={form.required_date} min={form.request_date || undefined} onChange={(e) => setForm({ ...form, required_date: e.target.value })} className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
                  </div>
                  <div>
                    <label className={`mb-1 block text-[12px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Remarks</label>
                    <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} placeholder="Remarks" />
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Items" isDark={isDark}>
                <div className="space-y-3">
                  {form.items.map((it, idx) => {
                    // UOM options come ONLY from the backend valid-UOM endpoint
                    // (base unit + units with a defined uom_conversions path to
                    // base) - never inferred from unit_type here, and there is
                    // deliberately no fallback to "all units" on failure.
                    const uomState = it.raw_material_id ? uomCache.current[String(it.raw_material_id)] : null;
                    const uomOptions = uomState?.status === "ready" ? uomState.options : [];
                    const uomLoading = uomState?.status === "loading" || (it.raw_material_id && !uomState);
                    const uomError = uomState?.status === "error";
                    const uom = uomOptions.find((o) => String(o.id) === String(it.unit_id))?.unit_name || "";
                    const baseUnitName = uomOptions.find((o) => o.is_base)?.unit_name || "";
                    const available = it.raw_material_id ? num(warehouseStock[it.raw_material_id]?.current_qty) : null;
                    const overRequested = available !== null && Number(it.requested_qty || 0) > available;
                    const usedElsewhere = new Set(form.items.filter((_, i) => i !== idx).map((x) => String(x.raw_material_id)).filter(Boolean));
                    return (
                      <div key={idx} className={`rounded-lg border p-3 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                          <MaterialCombobox
                            value={it.raw_material_id}
                            onSelect={(v) => updateItem(idx, "raw_material_id", v)}
                            materials={materials}
                            excludeIds={usedElsewhere}
                            stockById={warehouseStock}
                            isDark={isDark}
                            inputClass={inputClass}
                          />
                          <input type="number" min="0" step="any" value={it.requested_qty} onChange={(e) => updateItem(idx, "requested_qty", e.target.value)} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass} ${overRequested ? "border-rose-400" : ""}`} placeholder={`Qty${uom ? ` (${uom})` : ""}`} />
                          <select value={it.unit_id} onChange={(e) => updateItem(idx, "unit_id", e.target.value)} disabled={!it.raw_material_id || uomLoading || uomError} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass} ${!it.raw_material_id || uomLoading || uomError ? "opacity-50 cursor-not-allowed" : ""}`}>
                            <option value="">{uomLoading ? "Loading units…" : uomError ? "UOM unavailable" : "UOM"}</option>
                            {uomOptions.map((u) => <option key={u.id} value={u.id}>{u.unit_name}{u.unit_symbol ? ` (${u.unit_symbol})` : ""}{u.is_base ? " — base" : ""}</option>)}
                          </select>
                          <input value={it.remarks} onChange={(e) => updateItem(idx, "remarks", e.target.value)} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} placeholder="Item Remarks" />
                          <button onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })} className="h-10 rounded-lg border border-rose-300 text-rose-500" disabled={form.items.length === 1}>Remove</button>
                        </div>
                        {uomError && (
                          <p className="mt-1.5 text-[12px] text-rose-500">
                            Couldn't load valid units for this material. <button type="button" onClick={() => loadValidUoms(it.raw_material_id)} className="underline">Retry</button>
                          </p>
                        )}
                        {it.raw_material_id && !uomError && (
                          <p className={`mt-1.5 text-[12px] ${overRequested ? "text-rose-500" : isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>
                            {available !== null ? `Available in warehouse: ${fmtQty(available)} ${baseUnitName}` : "No stock record for this material at this warehouse"}
                            {overRequested ? " — requested quantity exceeds current stock" : ""}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2">
                    <button onClick={addItem} className="flex h-9 items-center gap-1.5 rounded-lg border border-[#7367F0] px-3 text-[13px] font-medium text-[#7367F0]">
                      <Plus size={14} /> Add Item
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium disabled:opacity-50">
                      <Upload size={14} /> {importing ? "Reading file…" : "Import Items"}
                    </button>
                    <button type="button" onClick={downloadImportTemplate} title="Download a sample column layout" className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium">
                      <Download size={14} /> Template
                    </button>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleImportFile} />
                    <span className={`text-[11px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>.xlsx or .csv · columns: {IMPORT_TEMPLATE_HEADER}</span>
                  </div>
                </div>
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreate(false)} disabled={saving} className="h-10 rounded-lg border px-4 text-[14px] font-medium disabled:opacity-50">Cancel</button>
                <button onClick={() => create(false)} disabled={saving} className="h-10 rounded-lg border border-[#7367F0] px-4 text-[14px] font-medium text-[#7367F0] disabled:opacity-50">{saving ? "Saving…" : "Save Draft"}</button>
                <button onClick={() => create(true)} disabled={saving} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8] disabled:opacity-50">{saving ? "Submitting…" : "Submit Outlet Purchase Order"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {importPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">Import Items — {importPreview.fileName}</h3>
              <button onClick={() => setImportPreview(null)} className="text-2xl leading-none">&times;</button>
            </div>
            <div className="space-y-3 p-4">
              {importPreview.truncated && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-700">
                  File exceeds {IMPORT_MAX_ROWS} rows — only the first {IMPORT_MAX_ROWS} were read.
                </p>
              )}
              <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>
                {importPreview.rows.filter((r) => r.status === "Valid").length} valid · {importPreview.rows.filter((r) => r.status !== "Valid").length} need attention — only valid rows can be added.
              </p>
              <TableWrapper isDark={isDark}>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className={`border-b text-left ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Material</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">UOM</th>
                      <th className="px-3 py-2">Remarks</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((r) => (
                      <tr key={r.rowNo} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                        <td className="px-3 py-2">{r.rowNo}</td>
                        <td className="px-3 py-2">
                          {r.material ? `${r.material.material_name}${r.material.material_code ? ` (${r.material.material_code})` : ""}` : (r.codeText || r.nameText || "—")}
                        </td>
                        <td className="px-3 py-2">{r.qty ?? r.qtyText}</td>
                        <td className="px-3 py-2">{r.uomOption ? r.uomOption.unit_name : (r.uomText || "—")}</td>
                        <td className="px-3 py-2">{r.remarks || "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`font-medium ${r.status === "Valid" ? "text-emerald-600" : r.status === "Duplicate" ? "text-amber-600" : "text-rose-500"}`}>{r.status}</span>
                          {r.reason && <span className={`block text-[11px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>{r.reason}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
              <div className="flex justify-end gap-2">
                <button onClick={() => setImportPreview(null)} className="h-10 rounded-lg border px-4 text-[14px] font-medium">Cancel</button>
                <button onClick={applyImport} disabled={!importPreview.rows.some((r) => r.status === "Valid")} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8] disabled:opacity-50">
                  Add Valid Items
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{detail.requisition_no}</h3>
              <button onClick={() => setDetail(null)} className="text-2xl leading-none">&times;</button>
            </div>
            <div className="space-y-4 p-4">
              <SectionCard isDark={isDark}>
                <div className="grid grid-cols-2 gap-4 text-[14px]">
                  <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Outlet:</span> {detail.to_location}</div>
                  <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Warehouse:</span> {detail.from_location}</div>
                  <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Request Date:</span> {fmtDate(detail.request_date)}</div>
                  <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Expected Delivery Date:</span> {fmtDate(detail.required_date)}</div>
                  <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Status:</span> <StatusBadge status={detail.status} /></div>
                </div>
              </SectionCard>

              <SectionCard title="Items" isDark={isDark}>
                <TableWrapper isDark={isDark}>
                  <table className="w-full border-collapse text-[13px]">
                    <thead className={`${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                      <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                        <th className="px-2 py-2">Material</th>
                        <th className="px-2 py-2 text-right">Requested</th>
                        <th className="px-2 py-2 text-right">Approved</th>
                        <th className="px-2 py-2 text-right">Dispatched</th>
                        <th className="px-2 py-2 text-right">Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((it) => (
                        <tr key={it.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                          <td className="px-2 py-2">{it.material_name}</td>
                          <td className="px-2 py-2 text-right">{fmtQty(it.requested_qty)}</td>
                          <td className="px-2 py-2 text-right">{fmtQty(it.approved_qty)}</td>
                          <td className="px-2 py-2 text-right">{fmtQty(it.dispatched_qty)}</td>
                          <td className="px-2 py-2">{it.unit_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button onClick={() => setDetail(null)} className="h-10 rounded-lg border px-4 text-[14px] font-medium">Close</button>
                {detail.status === "Draft" && can("can_submit") && <button onClick={() => { toast.promise(warehouseAPI.submitRequisition(detail.id).then(() => { openDetail(detail); fetchRequisitions(); }), { loading: "Submitting...", success: "Submitted", error: "Failed" }); }} className="h-10 rounded-lg bg-[#00CFE8] px-4 text-[14px] font-semibold text-white">Submit</button>}
                {detail.status === "Submitted" && can("can_approve") && !isOwn(detail) && <button onClick={() => setApproval({ ...approval, open: true })} className="h-10 rounded-lg bg-[#28C76F] px-4 text-[14px] font-semibold text-white"><CheckCircle size={16} className="inline mr-1" /> Approve</button>}
                {detail.status === "Submitted" && can("can_approve") && !isOwn(detail) && <button onClick={() => approve(true)} className="h-10 rounded-lg bg-[#EA5455] px-4 text-[14px] font-semibold text-white"><XCircle size={16} className="inline mr-1" /> Reject</button>}
                {detail.status === "Approved" && can("can_edit") && <button onClick={() => setApproval({ ...approval, open: true, mode: "dispatch" })} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white"><Truck size={16} className="inline mr-1" /> Dispatch</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {approval.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-4xl rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{approval.mode === "dispatch" ? "Dispatch Outlet Purchase Order" : "Approve / Reject Items"}</h3>
            </div>
            <div className="p-4">
              <TableWrapper isDark={isDark}>
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                      <th className="px-2 py-2">Material</th>
                      <th className="px-2 py-2 text-right">Requested</th>
                      <th className="px-2 py-2 text-right">Approved</th>
                      <th className="px-2 py-2 text-right">{approval.mode === "dispatch" ? "Dispatch Qty" : "Approve Qty"}</th>
                      <th className="px-2 py-2">{approval.mode === "dispatch" ? "Batch / Expiry" : "Remarks"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approval.items.map((it, idx) => (
                      <tr key={it.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                        <td className="px-2 py-2">{it.material_name}</td>
                        <td className="px-2 py-2 text-right">{fmtQty(it.requested_qty)}</td>
                        <td className="px-2 py-2 text-right">{fmtQty(it.approved_qty)}</td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" value={it._dispatch || ""} onChange={(e) => {
                            const items = [...approval.items];
                            items[idx]._dispatch = e.target.value;
                            items[idx].approved_qty = e.target.value;
                            setApproval({ ...approval, items });
                          }} className={`w-24 rounded-md border px-2 py-1 text-right text-[13px] outline-none ${inputClass}`} />
                        </td>
                        <td className="px-2 py-2">
                          {approval.mode === "dispatch" ? (
                            <div className="flex gap-2">
                              <input value={it._batch || ""} onChange={(e) => { const items = [...approval.items]; items[idx]._batch = e.target.value; setApproval({ ...approval, items }); }} className={`w-20 rounded-md border px-2 py-1 text-[13px] outline-none ${inputClass}`} placeholder="Batch" />
                              <input type="date" value={it._expiry || ""} onChange={(e) => { const items = [...approval.items]; items[idx]._expiry = e.target.value; setApproval({ ...approval, items }); }} className={`w-32 rounded-md border px-2 py-1 text-[13px] outline-none ${inputClass}`} />
                            </div>
                          ) : (
                            <input value={it.approval_remarks || ""} onChange={(e) => { const items = [...approval.items]; items[idx].approval_remarks = e.target.value; setApproval({ ...approval, items }); }} className={`w-full rounded-md border px-2 py-1 text-[13px] outline-none ${inputClass}`} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setApproval({ ...approval, open: false })} className="h-10 rounded-lg border px-4 text-[14px] font-medium">Cancel</button>
                {approval.mode === "dispatch" ? (
                  <button onClick={dispatch} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8]">Confirm Dispatch</button>
                ) : (
                  <>
                    <button onClick={() => approve(true)} className="h-10 rounded-lg bg-[#EA5455] px-4 text-[14px] font-semibold text-white">Reject</button>
                    <button onClick={() => approve(false)} className="h-10 rounded-lg bg-[#28C76F] px-4 text-[14px] font-semibold text-white">Approve</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

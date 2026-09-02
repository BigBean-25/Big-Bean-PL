import { useEffect, useState } from "react";
import { warehouseAPI, getStoredPermissions } from "../../services/api";
import { SectionCard, TableWrapper, LoadingRows, EmptyState, PageHeader, FilterBar } from "../../components/ui";
import { KpiCard, fmtQty, fmtDate } from "./WarehouseShared";
import { getInputClass } from "../../components/ui";
import { Search, RotateCcw, Download, Plus, AlertTriangle, AlertCircle, PackageCheck, TrendingUp, ArrowUpCircle, CheckCircle, Edit, ShoppingCart, History } from "lucide-react";
import toast from "react-hot-toast";
import ExcelJS from "exceljs";

const statuses = ['All', 'OUT OF STOCK', 'CRITICAL', 'REORDER REQUIRED', 'HEALTHY', 'OVERSTOCK'];
const num = v => v === null || v === undefined || v === '' ? 0 : Number(v);
const fmtCurrency = v => `₹${num(v).toFixed(2)}`;

export default function LowStockReorder({ locationId, materials, suppliers, categories, isDark }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [settings, setSettings] = useState(null);
  const permissions = getStoredPermissions();
  const inputClass = getInputClass(isDark);
  const [filters, setFilters] = useState({
    search: "", category_id: "", supplier_id: "", status_filter: "",
  });

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await warehouseAPI.getReorderData({
        location_id: locationId,
        category_id: filters.category_id || undefined,
        supplier_id: filters.supplier_id || undefined,
        status_filter: filters.status_filter === 'All' ? '' : filters.status_filter,
        search: filters.search || undefined,
      });
      setData(res?.data?.data || []);
    } catch (error) { toast.error("Failed to load reorder data"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [locationId, filters]);

  const kpi = {
    outOfStock: data.filter(d => d.physical_status === 'OUT OF STOCK').length,
    critical: data.filter(d => d.physical_status === 'CRITICAL').length,
    reorder: data.filter(d => d.physical_status === 'REORDER REQUIRED').length,
    overstock: data.filter(d => d.physical_status === 'OVERSTOCK').length,
    healthy: data.filter(d => d.physical_status === 'HEALTHY').length,
    estimatedValue: data.reduce((s, d) => s + num(d.estimated_reorder_value), 0),
  };

  const toggleSelect = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const openSettings = (m) => {
    setSettings({
      ...m,
      min_stock_qty: m.min_stock_qty,
      reorder_level: m.reorder_level,
      max_stock_qty: m.max_stock_qty,
      safety_stock_qty: m.safety_stock_qty,
      lead_time_days: m.lead_time_days,
      preferred_supplier_id: m.preferred_supplier_id,
    });
  };

  const saveSettings = async () => {
    try {
      const payload = {
        min_stock_qty: num(settings.min_stock_qty),
        reorder_level: num(settings.reorder_level),
        max_stock_qty: num(settings.max_stock_qty),
        safety_stock_qty: num(settings.safety_stock_qty),
        lead_time_days: settings.lead_time_days,
        preferred_supplier_id: settings.preferred_supplier_id,
      };
      await warehouseAPI.updateReorderSettings(settings.material_id, payload);
      toast.success("Settings saved");
      setSettings(null);
      fetch();
    } catch (error) { toast.error(error.response?.data?.message || "Save failed"); }
  };

  const createPO = async (materialId) => {
    try {
      await warehouseAPI.createDraftPOFromReorder({ material_ids: [materialId], location_id: locationId });
      toast.success("Draft PO created");
      fetch();
    } catch (error) { toast.error(error.response?.data?.message || "Create PO failed"); }
  };

  const createMultiPO = async () => {
    if (!selected.length) { toast.error("Select at least one material"); return; }
    try {
      await warehouseAPI.createDraftPOFromReorder({ material_ids: selected, location_id: locationId });
      toast.success("Draft PO(s) created");
      setSelected([]);
      fetch();
    } catch (error) { toast.error(error.response?.data?.message || "Create PO failed"); }
  };

  const exportToExcel = async () => {
    if (!data.length) { toast.error("No data to export"); return; }
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Low Stock Reorder");
      const headers = ["Material Code", "Material", "Category", "Current Qty", "UOM", "Minimum", "Reorder", "Maximum", "Pending PO", "Projected", "Suggested", "Preferred Supplier", "Last Rate", "Estimated Value", "Lead Time", "Status"];
      ws.addRow(headers);
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).freeze = true;
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
      data.forEach(d => ws.addRow([
        d.material_code, d.material_name, d.category, d.current_qty, d.base_unit,
        d.min_stock_qty, d.reorder_level, d.max_stock_qty, d.pending_po_qty, d.projected_stock,
        d.suggested_purchase_qty, d.preferred_supplier_name || '-', d.last_purchase_rate || '-',
        d.estimated_reorder_value, d.lead_time_days || '-', d.physical_status
      ]));
      ws.columns = headers.map((h, i) => ({ width: Math.max(12, h.length + 3) }));

      const sum = wb.addWorksheet("Summary");
      sum.addRow(["Out of Stock", kpi.outOfStock]);
      sum.addRow(["Critical", kpi.critical]);
      sum.addRow(["Reorder Required", kpi.reorder]);
      sum.addRow(["Overstock", kpi.overstock]);
      sum.addRow(["Healthy", kpi.healthy]);
      sum.addRow(["Estimated Reorder Value", kpi.estimatedValue]);
      sum.columns = [{ width: 28 }, { width: 16 }];

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BigBean_Low_Stock_Reorder_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export complete");
    } catch (error) { toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  const statusColor = (s) => {
    if (s === 'OUT OF STOCK') return 'text-[#EA5455] font-bold';
    if (s === 'CRITICAL') return 'text-[#FF9F43] font-bold';
    if (s === 'REORDER REQUIRED') return 'text-[#7367F0] font-semibold';
    if (s === 'OVERSTOCK') return 'text-[#28C76F]';
    return 'text-[#28C76F]';
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <PageHeader
        title="Low Stock & Reorder"
        subtitle="Monitor stock levels and prepare purchase requirements before materials run out."
        actions={
          <div className="flex flex-wrap gap-2">
            {permissions?.warehouse_reorder?.can_export && (
              <button onClick={exportToExcel} disabled={exporting} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[14px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]"}`}>
                <Download size={16} /> {exporting ? "Exporting..." : "Export"}
              </button>
            )}
            {permissions?.warehouse_reorder?.can_create && (
              <button onClick={createMultiPO} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#7367F0] px-3 text-[14px] font-semibold text-white hover:bg-[#6354D8]">
                <ShoppingCart size={16} /> Create Draft PO
              </button>
            )}
          </div>
        }
        isDark={isDark}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <KpiCard icon={AlertCircle} label="Out of Stock" value={kpi.outOfStock} isDark={isDark} />
        <KpiCard icon={AlertTriangle} label="Critical" value={kpi.critical} isDark={isDark} />
        <KpiCard icon={PackageCheck} label="Reorder Required" value={kpi.reorder} isDark={isDark} />
        <KpiCard icon={ArrowUpCircle} label="Overstock" value={kpi.overstock} isDark={isDark} />
        <KpiCard icon={CheckCircle} label="Healthy" value={kpi.healthy} isDark={isDark} />
        <KpiCard icon={TrendingUp} label="Est. Reorder Value" value={fmtCurrency(kpi.estimatedValue)} isDark={isDark} />
      </div>

      <FilterBar isDark={isDark} title="Filters">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8AAAE]" /><input value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} placeholder="Material code / name" className={`w-full rounded-md py-2 pl-9 pr-3 text-sm ${inputClass}`} /></div>
          <select value={filters.category_id} onChange={e => setFilters({...filters, category_id: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">All Categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}</select>
          <select value={filters.supplier_id} onChange={e => setFilters({...filters, supplier_id: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">Preferred Supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select>
          <select value={filters.status_filter} onChange={e => setFilters({...filters, status_filter: e.target.value})} className={`w-full rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">All Statuses</option>{statuses.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <button onClick={() => setFilters({ search: "", category_id: "", supplier_id: "", status_filter: "" })} className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]" : "border-[#EBE9F1] bg-white text-[#2F2B3D]"}`}><RotateCcw size={16} /> Reset</button>
        </div>
      </FilterBar>

      <SectionCard isDark={isDark}>
        <TableWrapper isDark={isDark}>
          <table className="w-full border-collapse text-[13px]">
            <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
              <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                <th className="px-3 py-3"><input type="checkbox" checked={selected.length === data.length && data.length > 0} onChange={e => setSelected(e.target.checked ? data.map(d => d.material_id) : [])} className="h-4 w-4" /></th>
                <th className="px-3 py-3">Material</th>
                <th className="px-3 py-3 text-right">Current</th>
                <th className="px-3 py-3 text-right">Pending PO</th>
                <th className="px-3 py-3 text-right">Projected</th>
                <th className="px-3 py-3 text-right">Suggested</th>
                <th className="px-3 py-3">Supplier</th>
                <th className="px-3 py-3 text-right">Last Rate</th>
                <th className="px-3 py-3 text-right">Est. Value</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRows rows={5} cols={11} isDark={isDark} /> : data.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-10"><EmptyState isDark={isDark} message="No materials found" subMessage="Adjust filters or check warehouse location" /></td></tr>
              ) : data.map(d => (
                <tr key={d.material_id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                  <td className="px-3 py-3"><input type="checkbox" checked={selected.includes(d.material_id)} onChange={() => toggleSelect(d.material_id)} className="h-4 w-4" /></td>
                  <td className="px-3 py-3"><div className="font-medium">{d.material_name}</div><div className="text-[11px] text-[#A5A8B6]">{d.material_code}</div></td>
                  <td className="px-3 py-3 text-right">{fmtQty(d.current_qty)} {d.base_unit}</td>
                  <td className="px-3 py-3 text-right">{fmtQty(d.pending_po_qty)}</td>
                  <td className="px-3 py-3 text-right">{fmtQty(d.projected_stock)}</td>
                  <td className="px-3 py-3 text-right font-semibold">{fmtQty(d.suggested_purchase_qty)}</td>
                  <td className="px-3 py-3">{d.preferred_supplier_name || <span className="text-[#A5A8B6]">Not set</span>}</td>
                  <td className="px-3 py-3 text-right">{d.last_purchase_rate ? `₹${num(d.last_purchase_rate).toFixed(2)}` : '-'}</td>
                  <td className="px-3 py-3 text-right">{d.suggested_purchase_qty > 0 ? fmtCurrency(d.estimated_reorder_value) : '-'}</td>
                  <td className={`px-3 py-3 ${statusColor(d.physical_status)}`}>{d.physical_status}</td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => openSettings(d)} className={`p-1.5 rounded ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`} title="Edit settings"><Edit size={16} /></button>
                      {d.suggested_purchase_qty > 0 && permissions?.warehouse_reorder?.can_create && <button onClick={() => createPO(d.material_id)} className={`p-1.5 rounded ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`} title="Create PO"><ShoppingCart size={16} /></button>}
                      <button className={`p-1.5 rounded ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`} title="View history" onClick={() => window.open(`/warehouse/supplier-history?material=${d.material_id}`, '_blank')}><History size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>
      </SectionCard>

      {settings && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-md rounded-xl border p-4 shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <h3 className="mb-4 text-lg font-semibold">Reorder Settings — {settings.material_name}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Minimum Stock</label><input type="number" value={settings.min_stock_qty} onChange={e => setSettings({...settings, min_stock_qty: e.target.value})} className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${inputClass}`} /></div>
                <div><label className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Reorder Level</label><input type="number" value={settings.reorder_level} onChange={e => setSettings({...settings, reorder_level: e.target.value})} className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${inputClass}`} /></div>
                <div><label className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Maximum Stock</label><input type="number" value={settings.max_stock_qty} onChange={e => setSettings({...settings, max_stock_qty: e.target.value})} className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${inputClass}`} /></div>
                <div><label className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Safety Stock</label><input type="number" value={settings.safety_stock_qty} onChange={e => setSettings({...settings, safety_stock_qty: e.target.value})} className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${inputClass}`} /></div>
                <div><label className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Lead Time (days)</label><input type="number" value={settings.lead_time_days || ''} onChange={e => setSettings({...settings, lead_time_days: e.target.value})} className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${inputClass}`} /></div>
                <div><label className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Preferred Supplier</label><select value={settings.preferred_supplier_id || ''} onChange={e => setSettings({...settings, preferred_supplier_id: e.target.value})} className={`mt-1 w-full rounded-md px-3 py-2 text-sm ${inputClass}`}><option value="">Select</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select></div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setSettings(null)} className="h-10 rounded-lg border px-4 text-[14px]">Cancel</button>
                <button onClick={saveSettings} className="h-10 rounded-lg bg-[#7367F0] px-4 text-[14px] font-semibold text-white hover:bg-[#6354D8]">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

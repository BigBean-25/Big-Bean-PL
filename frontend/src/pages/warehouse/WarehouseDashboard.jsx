import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { warehouseAPI, getStoredPermissions } from "../../services/api";
import { SectionCard, TableWrapper, LoadingRows, EmptyState, StatusBadge } from "../../components/ui";
import {
  KpiCard, MiniKpi, fmtCurrency, fmtDate, fmtQty, EmptyRow, InlineSpinner,
} from "./WarehouseShared";
import {
  TrendingUp, Package, AlertTriangle, AlertCircle, Clock, ClipboardCheck,
  ArrowRightLeft, ClipboardList, Truck, DollarSign,
} from "lucide-react";
import toast from "react-hot-toast";

const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);

const ActivityIcon = (type) => {
  if (type?.includes("Goods Receipt")) return ClipboardCheck;
  if (type?.includes("Transfer")) return ArrowRightLeft;
  if (type?.includes("Outlet PO")) return ClipboardList;
  return Truck;
};

export default function WarehouseDashboard({ locationId, locations, materials, isDark }) {
  const navigate = useNavigate();
  const selectTab = (nextTab) => navigate(`/warehouse/${nextTab}`);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [recent, setRecent] = useState([]);
  const [profit, setProfit] = useState(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [profitFrom, setProfitFrom] = useState(firstOfMonth());
  const [profitTo, setProfitTo] = useState(today());
  const [ledger, setLedger] = useState([]);

  const permissions = getStoredPermissions();
  const canViewDashboard = permissions?.warehouse_dashboard?.can_view !== false;
  const canViewGRN = permissions?.grn?.can_view;
  const canViewRequisitions = permissions?.warehouse_requisitions?.can_view;
  const canViewTransfers = permissions?.warehouse_transfers?.can_view;
  const canViewReports = permissions?.warehouse_reports?.can_view;

  const fetchData = async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      const [dash, grns, reqs, trans] = await Promise.all([
        canViewDashboard ? warehouseAPI.getDashboard({ location_id: locationId }) : Promise.resolve(null),
        canViewGRN ? warehouseAPI.getGRNs({ location_id: locationId, limit: 5 }) : Promise.resolve(null),
        canViewRequisitions ? warehouseAPI.getRequisitions({ from_location_id: locationId, limit: 5 }) : Promise.resolve(null),
        canViewTransfers ? warehouseAPI.getTransfers({ from_location_id: locationId, limit: 5 }) : Promise.resolve(null),
      ]);
      const d = dash?.data?.data || {};
      setDashboard(d);
      const merged = [
        ...(grns?.data?.data || []).map((x) => ({ ...x, _type: "Goods Receipt", _ref: x.grn_no, _date: x.grn_date, _qty: x.total_qty || 1, _status: x.status })),
        ...(reqs?.data?.data || []).map((x) => ({ ...x, _type: "Outlet PO", _ref: x.requisition_no, _date: x.request_date, _qty: x.items, _status: x.status })),
        ...(trans?.data?.data || []).map((x) => ({ ...x, _type: "Transfer", _ref: x.transfer_no, _date: x.dispatch_date, _qty: x.items, _status: x.status })),
      ].sort((a, b) => new Date(b._date || b.created_at) - new Date(a._date || a.created_at)).slice(0, 10);
      setRecent(merged);
    } catch (error) { toast.error("Failed to load dashboard"); }
    finally { setLoading(false); }
  };

  const fetchProfit = async () => {
    if (!locationId || !canViewReports) return;
    setProfitLoading(true);
    try {
      const res = await warehouseAPI.getWarehouseReport("profit", { location_id: locationId, from_date: profitFrom, to_date: profitTo });
      setProfit(res?.data?.data || null);
    } catch (error) { toast.error("Failed to load profit report"); }
    finally { setProfitLoading(false); }
  };

  const fetchLedger = async () => {
    if (!locationId || !canViewReports) return;
    try {
      const res = await warehouseAPI.getWarehouseReport("ledger", { location_id: locationId, from_date: profitFrom, to_date: profitTo });
      setLedger(res?.data?.data || []);
    } catch (error) { /* non-fatal - ledger preview just shows empty */ }
  };

  useEffect(() => { fetchData(); }, [locationId]);
  useEffect(() => { fetchProfit(); fetchLedger(); }, [locationId, profitFrom, profitTo]);

  if (!locationId) return <EmptyState icon={Package} title="Select a warehouse" subtitle="Choose a warehouse location to view the dashboard." isDark={isDark} />;

  const kpi = dashboard || {};

  return (
    <div className="space-y-6">
      <SectionCard title="Current Stock" isDark={isDark}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard icon={TrendingUp} label="Current Stock Value" value={fmtCurrency(kpi.current_stock_value)} isDark={isDark} />
          <KpiCard icon={Package} label="Total Materials" value={kpi.total_materials ?? 0} isDark={isDark} />
          <KpiCard icon={AlertTriangle} label="Low Stock" value={kpi.low_stock ?? 0} sub="Items below reorder" isDark={isDark} />
          <KpiCard icon={AlertCircle} label="Out of Stock" value={kpi.out_of_stock ?? 0} isDark={isDark} />
          <KpiCard icon={Clock} label="Near Expiry" value={kpi.near_expiry ?? 0} isDark={isDark} />
          <KpiCard icon={ClipboardCheck} label="Pending Goods Receipts" value={kpi.pending_grns ?? 0} isDark={isDark} />
        </div>
        <button onClick={() => selectTab("current-stock")} className="mt-3 text-[13px] font-medium text-[#7367F0] hover:underline">View full stock list →</button>
      </SectionCard>

      <SectionCard title="Stock Health" isDark={isDark}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MiniKpi label="In Stock" value={kpi.in_stock ?? 0} isDark={isDark} />
          <MiniKpi label="Low Stock" value={kpi.low_stock ?? 0} isDark={isDark} />
          <MiniKpi label="Out of Stock" value={kpi.out_of_stock ?? 0} isDark={isDark} />
          <MiniKpi label="Near Expiry" value={kpi.near_expiry ?? 0} isDark={isDark} />
          <MiniKpi label="Expired" value={kpi.expired ?? 0} isDark={isDark} />
        </div>
      </SectionCard>

      <SectionCard title="Outlet Purchase Orders" subtitle="Outlets asking this warehouse for stock" isDark={isDark}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniKpi label="Pending Outlet Purchase Orders" value={kpi.pending_requisitions ?? 0} isDark={isDark} />
          <MiniKpi label="In Transit to Outlets" value={kpi.in_transit_transfers ?? 0} isDark={isDark} />
          <MiniKpi label="Pending Receipts" value={kpi.pending_receipts ?? 0} isDark={isDark} />
          <MiniKpi label="Completed Today" value={kpi.completed_today_transfers ?? 0} isDark={isDark} />
        </div>
        <button onClick={() => selectTab("requisitions")} className="mt-3 text-[13px] font-medium text-[#7367F0] hover:underline">View all outlet purchase orders →</button>
      </SectionCard>

      {canViewReports && (
        <SectionCard title="Purchase, Sales & Profit" isDark={isDark}>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium">
              <span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>From</span>
              <input type="date" value={profitFrom} max={profitTo} onChange={(e) => setProfitFrom(e.target.value)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? "border-[#3B405A] bg-[#2F3349] text-white" : "border-[#EBE9F1] bg-white text-[#3A3541]"}`} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              <span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>To</span>
              <input type="date" value={profitTo} min={profitFrom} max={today()} onChange={(e) => setProfitTo(e.target.value)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? "border-[#3B405A] bg-[#2F3349] text-white" : "border-[#EBE9F1] bg-white text-[#3A3541]"}`} />
            </label>
          </div>
          {profitLoading ? (
            <InlineSpinner />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard icon={ClipboardCheck} label="Total Purchase Value" value={fmtCurrency(profit?.total_purchase_value)} isDark={isDark} />
                <KpiCard icon={ArrowRightLeft} label="Transfer Sale Value" value={fmtCurrency(profit?.total_transfer_sale_value)} isDark={isDark} />
                <KpiCard icon={DollarSign} label="Gross Profit" value={fmtCurrency(profit?.gross_profit)} isDark={isDark} />
                <KpiCard icon={AlertTriangle} label="Unpriced Dispatch Qty" value={fmtQty(profit?.unpriced_dispatch_qty, "")} sub={profit?.unpriced_dispatch_qty > 0 ? "Set Transfer Price on these materials" : undefined} isDark={isDark} />
              </div>
              {Array.isArray(profit?.by_material) && profit.by_material.length > 0 && (
                <TableWrapper isDark={isDark} className="mt-4">
                  <table className="w-full border-collapse text-[13px]">
                    <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                      <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                        <th className="px-3 py-2.5">Material</th>
                        <th className="px-3 py-2.5">Qty Transferred</th>
                        <th className="px-3 py-2.5">Cost Value</th>
                        <th className="px-3 py-2.5">Sale Value</th>
                        <th className="px-3 py-2.5">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profit.by_material.map((m, idx) => (
                        <tr key={idx} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                          <td className="px-3 py-2.5 font-medium">{m.material_name}</td>
                          <td className="px-3 py-2.5">{fmtQty(m.qty, "")}</td>
                          <td className="px-3 py-2.5">{fmtCurrency(m.cost_value)}</td>
                          <td className="px-3 py-2.5">{fmtCurrency(m.sale_value)}</td>
                          <td className="px-3 py-2.5">{fmtCurrency(m.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
              )}
            </>
          )}
        </SectionCard>
      )}

      {canViewReports && (
        <SectionCard title="Ledger" subtitle="Stock movement in and out of this warehouse for the selected date range" isDark={isDark}>
          {ledger.length === 0 ? (
            <EmptyState isDark={isDark} title="No stock movement" subtitle="No stock ledger entries in this date range." />
          ) : (
            <TableWrapper isDark={isDark}>
              <table className="w-full border-collapse text-[13px]">
                <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                  <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                    <th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Material</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">In</th><th className="px-3 py-2.5">Out</th><th className="px-3 py-2.5">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice(0, 50).map((l, idx) => (
                    <tr key={idx} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                      <td className="px-3 py-2.5">{fmtDate(l.transaction_date)}</td>
                      <td className="px-3 py-2.5">{l.material_name}</td>
                      <td className="px-3 py-2.5">{l.transaction_type}</td>
                      <td className="px-3 py-2.5">{fmtQty(l.qty_in, "")}</td>
                      <td className="px-3 py-2.5">{fmtQty(l.qty_out, "")}</td>
                      <td className="px-3 py-2.5">{fmtCurrency((l.value_in || 0) - (l.value_out || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          )}
          <button onClick={() => selectTab("ledger")} className="mt-3 text-[13px] font-medium text-[#7367F0] hover:underline">View full ledger →</button>
        </SectionCard>
      )}

      <SectionCard title="Recent Inventory Activity" isDark={isDark}>
        <TableWrapper isDark={isDark}>
          <table className="w-full border-collapse text-[13px]">
            <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
              <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Reference</th>
                <th className="px-3 py-2.5">Items</th>
                <th className="px-3 py-2.5">Location</th>
                <th className="px-3 py-2.5">Qty</th>
                <th className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRows rows={4} cols={7} isDark={isDark} /> : (
                <>
                  {!recent.length ? <EmptyRow colSpan={7} message="No recent activity." isDark={isDark} /> : recent.map((r, idx) => {
                    const Icon = ActivityIcon(r._type);
                    const loc = locations.find((l) => String(l.id) === String(r.from_location_id || r.location_id));
                    return (
                      <tr key={idx} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                        <td className="px-3 py-2.5">{fmtDate(r._date)}</td>
                        <td className="px-3 py-2.5"><span className="flex items-center gap-1.5"><Icon size={14} /> {r._type}</span></td>
                        <td className="px-3 py-2.5 font-medium">{r._ref}</td>
                        <td className="px-3 py-2.5">{r._qty || "-"}</td>
                        <td className="px-3 py-2.5">{loc?.location_name || "-"}</td>
                        <td className="px-3 py-2.5">{r._type === "Goods Receipt" ? fmtQty(r.total_qty, "") : (r.items || "-")}</td>
                        <td className="px-3 py-2.5"><StatusBadge status={r._status} /></td>
                      </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </TableWrapper>
      </SectionCard>

      <SectionCard title="Attention Required" isDark={isDark}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <MiniKpi label="Low Stock Items" value={kpi.low_stock ?? 0} isDark={isDark} />
          <MiniKpi label="Pending Outlet Purchase Orders" value={kpi.pending_requisitions ?? 0} isDark={isDark} />
          <MiniKpi label="Pending Receipts" value={kpi.pending_receipts ?? 0} isDark={isDark} />
          <MiniKpi label="Near Expiry Items" value={kpi.near_expiry ?? 0} isDark={isDark} />
        </div>
      </SectionCard>
    </div>
  );
}

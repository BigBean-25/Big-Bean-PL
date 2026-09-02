import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { productionAPI, warehouseAPI, masterAPI, recipeAPI } from "../../services/api";
import { PageHeader, SectionCard, TableWrapper, EmptyState, LoadingSpinner, getThemeMode } from "../../components/ui";
import { getInputClass } from "../../components/ui";
import { LayoutDashboard, ClipboardList, ChefHat, Package, RefreshCw, Trash2, BarChart3, Truck, Search, Download, Plus, X, Eye, Send, Printer } from "lucide-react";
import { amountInWords } from "../warehouse/invoiceWords";
import { getStoredPermissions } from "../../services/api";
import toast from "react-hot-toast";
import RequestsTab from "./tabs/RequestsTab";
import PlanningTab from "./tabs/PlanningTab";
import BatchesTab from "./tabs/BatchesTab";
import WastageTab from "./tabs/WastageTab";
import VarianceTab from "./tabs/VarianceTab";

const tabs = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, moduleKey: "production_dashboard" },
  { key: "requests", label: "Requests", icon: ClipboardList, moduleKey: "production_requests" },
  { key: "plans", label: "Planning", icon: ChefHat, moduleKey: "production_planning" },
  { key: "batches", label: "Batches", icon: Package, moduleKey: "production_batches" },
  { key: "wastage", label: "Wastage", icon: Trash2, moduleKey: "production_wastage" },
  { key: "variance", label: "Variance", icon: BarChart3, moduleKey: "production_variance" },
  { key: "dispatches", label: "Dispatches", icon: Truck, moduleKey: "production_dispatch" },
];

const Kpi = ({ label, value, isDark }) => (
  <div className={`rounded-xl border p-4 shadow-sm ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
    <div className={`text-[12px] uppercase tracking-wide ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>{label}</div>
    <div className={`mt-1 text-[22px] font-bold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{value}</div>
  </div>
);

const CENTRAL_KITCHEN_LOCATION_KEY = "bbc_central_kitchen_location_id";

export default function CentralKitchen() {
  const isDark = getThemeMode() === "dark";
  const { tab } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(tab || "dashboard");
  const [kitchens, setKitchens] = useState([]);
  const [kitchenId, setKitchenId] = useState("");
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({});
  const [varianceKPIs, setVarianceKPIs] = useState({});
  const [requests, setRequests] = useState([]);
  const [plans, setPlans] = useState([]);
  const [batches, setBatches] = useState([]);
  const [wastage, setWastage] = useState([]);
  const [variance, setVariance] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [dispatchKPIs, setDispatchKPIs] = useState({});
  const [dispatchFilters, setDispatchFilters] = useState({ search: "", status: "", outlet: "", fromDate: "", toDate: "" });
  const [showNewDispatch, setShowNewDispatch] = useState(false);
  const [viewingDispatch, setViewingDispatch] = useState(null);
  const [printDispatchOpen, setPrintDispatchOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState("");
  const [pendingRequestItems, setPendingRequestItems] = useState([]);
  const [newDispatchForm, setNewDispatchForm] = useState({ transfer_no: "", dispatch_date: new Date().toISOString().split("T")[0], vehicle_no: "", driver_name: "", dispatch_reference: "", remarks: "", items: [] });
  const [availableBatches, setAvailableBatches] = useState({});
  const [materials, setMaterials] = useState([]);
  const [units, setUnits] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [finishedStock, setFinishedStock] = useState([]);
  const [profit, setProfit] = useState(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [profitFrom, setProfitFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [profitTo, setProfitTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [ledger, setLedger] = useState([]);
  const permissions = getStoredPermissions()?.production_dashboard || {};
  const batchPerms = getStoredPermissions()?.production_batches || {};
  const canEdit = batchPerms?.can_edit || false;
  const requestPerms = getStoredPermissions()?.production_requests || {};
  const planningPerms = getStoredPermissions()?.production_planning || {};
  const wastagePerms = getStoredPermissions()?.production_wastage || {};
  const dispatchPermissions = getStoredPermissions()?.production_dispatch || {};
  const warehouseReportsPerms = getStoredPermissions()?.warehouse_reports || {};
  const canCreateDispatch = dispatchPermissions?.can_create || false;
  const canEditDispatch = dispatchPermissions?.can_edit || false;
  const canViewDispatch = dispatchPermissions?.can_view || false;
  const inputClass = getInputClass(isDark);

  const fetchKitchens = async () => {
    try { const res = await productionAPI.getCentralKitchens(); setKitchens(res?.data?.data || []); }
    catch (error) { toast.error("Failed to load central kitchens"); }
  };

  const fetchMasterData = async () => {
    try {
      const [matRes, unitRes, outletRes, recipeRes] = await Promise.all([
        masterAPI.getRawMaterials({ limit: 1000 }),
        masterAPI.getUnits(),
        masterAPI.getOutlets(),
        recipeAPI.getRecipes({ limit: 500 }),
      ]);
      setMaterials(matRes?.data?.data || []);
      setUnits(unitRes?.data?.data || []);
      setOutlets(outletRes?.data?.data || []);
      setRecipes(recipeRes?.data?.data || []);
    } catch (error) { /* non-fatal - forms will just show empty pickers */ }
  };

  const fetchAll = async () => {
    if (!kitchenId) { setLoading(false); return; }
    setLoading(true);

    // Each data source is fetched and caught independently so one failing call
    // (e.g. the tab-specific extra) can't blank out data other tabs already loaded.
    const safe = async (label, promise, onSuccess) => {
      try {
        const res = await promise;
        onSuccess(res?.data?.data);
      } catch (error) {
        toast.error(`Failed to load ${label}`);
      }
    };

    const base = [];
    if (permissions.can_view) base.push(safe("dashboard", productionAPI.getDashboard(kitchenId), (d) => setDashboard(d || {})));
    if (requestPerms.can_view) base.push(safe("requests", productionAPI.getProductionRequests(kitchenId), (d) => setRequests(d || [])));
    if (planningPerms.can_view) base.push(safe("plans", productionAPI.getProductionPlans(kitchenId), (d) => setPlans(d || [])));
    if (batchPerms.can_view) base.push(safe("batches", productionAPI.getProductionBatches(kitchenId), (d) => setBatches(d || [])));

    if (activeTab === "wastage") {
      base.push(safe("wastage", productionAPI.getProductionWastages({ central_kitchen_id: kitchenId }), (d) => setWastage(d || [])));
    }
    if (activeTab === "variance") {
      base.push(safe("variance", productionAPI.getProductionVariance({ central_kitchen_id: kitchenId }), (d) => setVariance(d || [])));
    }
    if (activeTab === "dashboard") {
      base.push(safe("variance KPIs", productionAPI.getWastageKPIs(kitchenId), (d) => setVarianceKPIs(d || {})));
      base.push(safe("current stock", productionAPI.getFinishedGoodsStock(kitchenId), (d) => setFinishedStock(d || [])));
      if (warehouseReportsPerms.can_view) {
        base.push(safe("ledger", warehouseAPI.getWarehouseReport("ledger", { location_id: kitchenId, from_date: profitFrom, to_date: profitTo }), (d) => setLedger(d || [])));
      }
    }
    if (activeTab === "dispatches") {
      base.push(safe("dispatches", productionAPI.getProductionDispatches({ from_location_id: kitchenId }), (d) => setDispatches(d || [])));
      base.push(safe("dispatch KPIs", productionAPI.getProductionDispatchKPIs({ from_location_id: kitchenId }), (d) => setDispatchKPIs(d || {})));
    }

    await Promise.all(base);
    setLoading(false);
  };

  useEffect(() => { fetchKitchens(); fetchMasterData(); }, []);
  useEffect(() => {
    if (kitchens.length && !kitchenId) {
      const saved = typeof window !== "undefined" ? localStorage.getItem(CENTRAL_KITCHEN_LOCATION_KEY) : "";
      const valid = saved && kitchens.some((k) => String(k.id) === saved) ? saved : String(kitchens[0].id);
      setKitchenId(valid);
      if (typeof window !== "undefined") localStorage.setItem(CENTRAL_KITCHEN_LOCATION_KEY, valid);
    }
  }, [kitchens]);
  useEffect(() => { fetchAll(); }, [kitchenId, activeTab]);
  useEffect(() => { setActiveTab(tab || "dashboard"); }, [tab]);

  const fetchProfit = async () => {
    if (!kitchenId || activeTab !== "dashboard") return;
    setProfitLoading(true);
    try {
      const res = await productionAPI.getProductionProfitReport({ from_location_id: kitchenId, from_date: profitFrom, to_date: profitTo });
      setProfit(res?.data?.data || null);
    } catch (error) { /* non-fatal - profit section just shows empty */ }
    finally { setProfitLoading(false); }
  };
  useEffect(() => { fetchProfit(); }, [kitchenId, activeTab, profitFrom, profitTo]);

  const allPermissions = getStoredPermissions();
  const visibleTabs = tabs.filter((t) => allPermissions?.[t.moduleKey]?.can_view);

  // If the current tab isn't one this user has view access to (e.g. an
  // Outlet Admin landing on the default "dashboard" tab, which they don't
  // have), fall through to the first tab they actually can see.
  useEffect(() => {
    if (!visibleTabs.length) return;
    if (!visibleTabs.some((t) => t.key === activeTab)) {
      navigate(`/central-kitchen/${visibleTabs[0].key}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, visibleTabs.length]);

  const selectTab = (nextTab) => { navigate(`/central-kitchen/${nextTab}`); };

  const renderDashboard = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Pending Requests" value={dashboard.pending_requests} isDark={isDark} />
        <Kpi label="Planned Today" value={dashboard.planned_today} isDark={isDark} />
        <Kpi label="In Production" value={dashboard.in_production} isDark={isDark} />
        <Kpi label="Completed Today" value={dashboard.completed_today} isDark={isDark} />
        <Kpi label="Raw Shortages" value={dashboard.raw_material_shortages} isDark={isDark} />
        <Kpi label="Finished Stock Value" value={`₹${Number(dashboard.finished_stock_value || 0).toFixed(2)}`} isDark={isDark} />
        <Kpi label="Today's Wastage Value" value={`₹${Number(varianceKPIs.today_wastage_value || 0).toFixed(2)}`} isDark={isDark} />
        <Kpi label="Average Yield %" value={`${Number(varianceKPIs.average_yield || 0).toFixed(1)}%`} isDark={isDark} />
      </div>

      <SectionCard title="Current Stock" subtitle="Finished bakery items on hand at this Bakehouse" isDark={isDark}>
        {finishedStock.length === 0 ? (
          <EmptyState isDark={isDark} title="No finished stock" subtitle="Post a production batch to see finished goods here." />
        ) : (
          <TableWrapper isDark={isDark}>
            <table className="w-full border-collapse text-[13px]">
              <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                  <th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {finishedStock.map((s) => (
                  <tr key={s.raw_material_id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                    <td className="px-3 py-2">{s.material_name}</td>
                    <td className="px-3 py-2 text-right">{Number(s.current_qty || 0).toFixed(2)} {s.unit_name}</td>
                    <td className="px-3 py-2 text-right">₹{Number(s.total_value || 0).toFixed(2)}</td>
                    <td className="px-3 py-2">{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </SectionCard>

      <SectionCard title="Intend — Requests from Outlets" subtitle="Outlets asking this Bakehouse for bakery items" isDark={isDark}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Pending Requests" value={dashboard.pending_requests || 0} isDark={isDark} />
          <Kpi label="Approved, Awaiting Dispatch" value={dispatchKPIs.pending_fulfilment || 0} isDark={isDark} />
          <Kpi label="In Transit to Outlets" value={dispatchKPIs.in_transit || 0} isDark={isDark} />
          <Kpi label="Completed Today" value={dispatchKPIs.completed_today || 0} isDark={isDark} />
        </div>
        <button onClick={() => selectTab("requests")} className="mt-3 text-[13px] font-medium text-[#7367F0] hover:underline">View all requests →</button>
      </SectionCard>

      <SectionCard title="Sales &amp; Profit" subtitle="Value of finished goods dispatched to outlets vs. their production cost" isDark={isDark}>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium">
            <span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>From</span>
            <input type="date" value={profitFrom} max={profitTo} onChange={(e) => setProfitFrom(e.target.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? "border-[#3B405A] bg-[#2F3349] text-white" : "border-[#EBE9F1] bg-white text-[#3A3541]"}`} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            <span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>To</span>
            <input type="date" value={profitTo} min={profitFrom} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setProfitTo(e.target.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${isDark ? "border-[#3B405A] bg-[#2F3349] text-white" : "border-[#EBE9F1] bg-white text-[#3A3541]"}`} />
          </label>
        </div>
        {profitLoading ? (
          <LoadingSpinner size={24} isDark={isDark} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Sales Value (Dispatched to Outlets)" value={`₹${Number(profit?.total_dispatch_sale_value || 0).toFixed(2)}`} isDark={isDark} />
              <Kpi label="Production Cost of Dispatched Goods" value={`₹${Number(profit?.total_dispatch_cost || 0).toFixed(2)}`} isDark={isDark} />
              <Kpi label="Profit" value={`₹${Number(profit?.gross_profit || 0).toFixed(2)}`} isDark={isDark} />
              <Kpi label="Unpriced Dispatch Qty" value={Number(profit?.unpriced_dispatch_qty || 0).toFixed(2)} isDark={isDark} />
            </div>
            {profit?.unpriced_dispatch_qty > 0 && (
              <p className={`mt-2 text-[12px] ${isDark ? "text-[#FF9F43]" : "text-[#B87E1E]"}`}>Some dispatched items have no Warehouse Transfer Price set on their Raw Material master, so they're excluded from the sales value above. Set a Transfer Price on those finished-good items in Masters → Raw Materials.</p>
            )}
            {Array.isArray(profit?.by_material) && profit.by_material.length > 0 && (
              <TableWrapper isDark={isDark} className="mt-4">
                <table className="w-full border-collapse text-[13px]">
                  <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                    <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                      <th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty Dispatched</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Sale Value</th><th className="px-3 py-2 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profit.by_material.map((m, idx) => (
                      <tr key={idx} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                        <td className="px-3 py-2 font-medium">{m.material_name}</td>
                        <td className="px-3 py-2 text-right">{Number(m.qty || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">₹{Number(m.cost_value || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">₹{Number(m.sale_value || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">₹{Number(m.profit || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
            )}
          </>
        )}
      </SectionCard>

      {warehouseReportsPerms.can_view && (
        <SectionCard title="Ledger" subtitle="Stock movement in and out of this Bakehouse for the selected date range" isDark={isDark}>
          {ledger.length === 0 ? (
            <EmptyState isDark={isDark} title="No stock movement" subtitle="No stock ledger entries in this date range." />
          ) : (
            <TableWrapper isDark={isDark}>
              <table className="w-full border-collapse text-[13px]">
                <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                  <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                    <th className="px-3 py-2">Date</th><th className="px-3 py-2">Item</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">In</th><th className="px-3 py-2 text-right">Out</th><th className="px-3 py-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice(0, 50).map((l, idx) => (
                    <tr key={idx} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                      <td className="px-3 py-2">{l.transaction_date ? String(l.transaction_date).slice(0, 10) : "-"}</td>
                      <td className="px-3 py-2">{l.material_name}</td>
                      <td className="px-3 py-2">{l.transaction_type}</td>
                      <td className="px-3 py-2 text-right">{Number(l.qty_in || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{Number(l.qty_out || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">₹{Number((l.value_in || 0) - (l.value_out || 0)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </SectionCard>
      )}
    </div>
  );

  const handleDispatchExport = async () => {
    try {
      const res = await productionAPI.exportProductionDispatches({ from_location_id: kitchenId, ...dispatchFilters });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `production_dispatch_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (error) { toast.error("Export failed"); }
  };

  const openNewDispatch = () => {
    setSelectedRequest("");
    setPendingRequestItems([]);
    setAvailableBatches({});
    setNewDispatchForm({ transfer_no: "", dispatch_date: new Date().toISOString().split("T")[0], vehicle_no: "", driver_name: "", dispatch_reference: "", remarks: "", items: [] });
    setShowNewDispatch(true);
  };

  const fetchPendingForRequest = async (requestId) => {
    try {
      const res = await productionAPI.getPendingRequestItems(requestId);
      const items = res?.data?.data || [];
      setPendingRequestItems(items);
      const initialItems = items.map((it) => ({
        production_request_item_id: it.id,
        raw_material_id: it.raw_material_id,
        material_name: it.material_name,
        unit_id: it.unit_id,
        unit_name: it.unit_name,
        is_batch_tracked: it.is_batch_tracked,
        approved_qty: it.approved_qty,
        received_qty: it.request_item_received || 0,
        pending_qty: it.pending_qty,
        available_finished_stock: it.available_finished_stock,
        production_required: Math.max(0, it.pending_qty - it.available_finished_stock),
        dispatch_qty: Math.min(it.pending_qty, it.available_finished_stock).toFixed(2),
      }));
      setNewDispatchForm((f) => ({ ...f, items: initialItems }));
      for (const it of initialItems) {
        if (it.is_batch_tracked && Number(it.dispatch_qty) > 0) await fetchFEFO(it, Number(it.dispatch_qty));
      }
    } catch (error) { toast.error("Failed to load request items"); }
  };

  const fetchFEFO = async (item, qty) => {
    try {
      const res = await warehouseAPI.getFEFOAllocation(item.raw_material_id, { location_id: kitchenId, required_qty: qty });
      setAvailableBatches((prev) => ({ ...prev, [item.production_request_item_id]: res?.data?.data || [] }));
    } catch (error) { setAvailableBatches((prev) => ({ ...prev, [item.production_request_item_id]: [] })); }
  };

  const handleRequestSelect = async (e) => {
    const requestId = e.target.value;
    setSelectedRequest(requestId);
    if (!requestId) { setPendingRequestItems([]); setNewDispatchForm((f) => ({ ...f, items: [] })); return; }
    const req = requests.find((r) => String(r.id) === requestId);
    setNewDispatchForm((f) => ({ ...f, transfer_no: `PD-${Date.now()}`, to_location_id: req?.from_outlet_location_id || "" }));
    await fetchPendingForRequest(requestId);
  };

  const updateDispatchQty = async (index, value) => {
    const qty = Number(value) || 0;
    const item = newDispatchForm.items[index];
    if (qty > item.pending_qty) return toast.error("Dispatch qty exceeds pending request qty");
    if (qty > item.available_finished_stock) return toast.error("Dispatch qty exceeds usable finished stock");
    const next = [...newDispatchForm.items];
    next[index] = { ...item, dispatch_qty: qty };
    setNewDispatchForm((f) => ({ ...f, items: next }));
    if (item.is_batch_tracked) await fetchFEFO(next[index], qty);
  };

  const handleCreateAndPostDispatch = async () => {
    const req = requests.find((r) => String(r.id) === selectedRequest);
    if (!req) return toast.error("Select a production request");
    const items = newDispatchForm.items.filter((it) => Number(it.dispatch_qty) > 0).map((it) => ({
      production_request_item_id: it.production_request_item_id,
      raw_material_id: it.raw_material_id,
      dispatched_qty: it.dispatch_qty,
      unit_id: it.unit_id,
    }));
    if (!items.length) return toast.error("Enter dispatch quantities");
    try {
      const d = await productionAPI.createProductionDispatch({
        transfer_no: newDispatchForm.transfer_no || `PD-${Date.now()}`,
        production_request_id: req.id,
        from_location_id: kitchenId,
        to_location_id: newDispatchForm.to_location_id,
        dispatch_date: newDispatchForm.dispatch_date,
        vehicle_no: newDispatchForm.vehicle_no,
        driver_name: newDispatchForm.driver_name,
        dispatch_reference: newDispatchForm.dispatch_reference,
        remarks: newDispatchForm.remarks,
        items,
      });
      await productionAPI.postProductionDispatch(d?.data?.data?.id || d?.data?.id);
      toast.success("Dispatch created and posted");
      setShowNewDispatch(false);
      fetchAll();
    } catch (error) { toast.error(error?.response?.data?.message || "Dispatch failed"); }
  };

  const handlePostDispatch = async (id) => {
    if (!canEditDispatch) return toast.error("Permission denied");
    try { await productionAPI.postProductionDispatch(id); toast.success("Dispatch posted"); fetchAll(); }
    catch (error) { toast.error(error?.response?.data?.message || "Post failed"); }
  };

  const handleViewDispatch = async (id) => {
    try { const res = await productionAPI.getProductionDispatch(id); setViewingDispatch(res?.data?.data || res?.data); }
    catch (error) { toast.error("Failed to load dispatch details"); }
  };

  const filteredDispatches = () => {
    return dispatches.filter((d) => {
      const s = (dispatchFilters.search || "").toLowerCase();
      const matchesSearch = !s || (d.transfer_no || "").toLowerCase().includes(s) || (d.production_request_no || "").toLowerCase().includes(s) || (d.outlet_name || "").toLowerCase().includes(s);
      const matchesStatus = !dispatchFilters.status || d.status === dispatchFilters.status;
      const matchesOutlet = !dispatchFilters.outlet || String(d.to_location_id) === dispatchFilters.outlet;
      const from = dispatchFilters.fromDate;
      const to = dispatchFilters.toDate;
      const inDate = !from || !to || (d.dispatch_date >= from && d.dispatch_date <= to);
      return matchesSearch && matchesStatus && matchesOutlet && inDate;
    });
  };

  const renderDispatchDetail = () => {
    if (!viewingDispatch) return null;
    return (
      <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewingDispatch(null)}>
        <div className={`w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-xl ${isDark ? "bg-[#2F3349]" : "bg-white"}`} onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className={`text-lg font-semibold ${isDark ? "text-white" : "text-[#2F2B3D]"}`}>Dispatch Detail</h3>
            <div className="flex items-center gap-3">
              <button onClick={() => setPrintDispatchOpen(true)} className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] font-medium ${isDark ? "border-[#3B405A] hover:bg-[#3B405A]" : "border-[#EBE9F1] hover:bg-[#F3F2F7]"}`}><Printer size={14} /> Delivery Challan</button>
              <button onClick={() => setViewingDispatch(null)} className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}><X size={20} /></button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-[13px]">
            <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Dispatch No:</span> <span className={isDark ? "text-white" : "text-[#2F2B3D]"}>{viewingDispatch.transfer_no}</span></div>
            <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Request No:</span> <span className={isDark ? "text-white" : "text-[#2F2B3D]"}>{viewingDispatch.production_request_no}</span></div>
            <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Bakehouse:</span> <span className={isDark ? "text-white" : "text-[#2F2B3D]"}>{viewingDispatch.from_location}</span></div>
            <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Outlet:</span> <span className={isDark ? "text-white" : "text-[#2F2B3D]"}>{viewingDispatch.to_location}</span></div>
            <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Date:</span> <span className={isDark ? "text-white" : "text-[#2F2B3D]"}>{viewingDispatch.dispatch_date}</span></div>
            <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Status:</span> <span className={isDark ? "text-white" : "text-[#2F2B3D]"}>{viewingDispatch.status}</span></div>
            <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Vehicle:</span> <span className={isDark ? "text-white" : "text-[#2F2B3D]"}>{viewingDispatch.vehicle_no || "-"}</span></div>
            <div><span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Driver:</span> <span className={isDark ? "text-white" : "text-[#2F2B3D]"}>{viewingDispatch.driver_name || "-"}</span></div>
          </div>
          <div className="mt-6">
            <h4 className={`mb-2 font-medium ${isDark ? "text-white" : "text-[#2F2B3D]"}`}>Items</h4>
            <TableWrapper isDark={isDark}>
              <table className="w-full border-collapse text-[13px]">
                <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                  <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                    <th className="px-3 py-2">Product</th><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Expiry</th><th className="px-3 py-2">Dispatched</th><th className="px-3 py-2">Received</th><th className="px-3 py-2">Short</th><th className="px-3 py-2">Damaged</th><th className="px-3 py-2">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingDispatch.items || []).map((it) => (
                    <tr key={it.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                      <td className="px-3 py-2">{it.material_name}</td>
                      <td className="px-3 py-2">{it.batch_no || "-"}</td>
                      <td className="px-3 py-2">{it.expiry_date || "-"}</td>
                      <td className="px-3 py-2">{Number(it.dispatched_qty).toFixed(2)} {it.unit_name}</td>
                      <td className="px-3 py-2">{Number(it.received_qty || 0).toFixed(2)}</td>
                      <td className="px-3 py-2">{Number(it.short_qty || 0).toFixed(2)}</td>
                      <td className="px-3 py-2">{Number(it.damaged_qty || 0).toFixed(2)}</td>
                      <td className="px-3 py-2">{Math.max(0, Number(it.dispatched_qty) - Number(it.received_qty || 0)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          </div>
        </div>
      </div>
      {printDispatchOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 print:hidden print:bg-white print:p-0" onClick={() => setPrintDispatchOpen(false)}>
          <div data-print-root className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border bg-white p-6 text-[12px] text-black shadow-xl print:max-h-none print:overflow-visible print:rounded-none print:border-0 print:shadow-none" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-center text-[15px] font-bold underline">Bakehouse Delivery Challan</p>
            <p className="mb-3 text-center text-[11px] text-gray-600">Internal stock transfer — not a tax invoice / not a taxable supply</p>

            <table className="w-full border-collapse border border-black text-[11px]">
              <tbody>
                <tr>
                  <td className="w-1/2 border border-black p-2 align-top">
                    <p className="font-semibold">From</p>
                    <p className="text-[13px] font-bold">{viewingDispatch.from_location}</p>
                    <p className="mt-0.5 whitespace-pre-line">{viewingDispatch.from_location_address || "-"}</p>
                    <p>{[viewingDispatch.from_location_city, viewingDispatch.from_location_state, viewingDispatch.from_location_pincode].filter(Boolean).join(", ") || "-"}</p>
                    {viewingDispatch.from_location_gstin && <p>GSTIN/UIN: {viewingDispatch.from_location_gstin}</p>}
                  </td>
                  <td className="w-1/2 border border-black p-2 align-top">
                    <table className="w-full text-[11px]">
                      <tbody>
                        <tr><td className="pb-1 font-semibold">Challan No.:</td><td className="pb-1 text-right">{viewingDispatch.transfer_no}</td></tr>
                        <tr><td className="pb-1 font-semibold">Dated:</td><td className="pb-1 text-right">{viewingDispatch.dispatch_date}</td></tr>
                        <tr><td className="font-semibold">Vehicle No.:</td><td className="text-right">{viewingDispatch.vehicle_no || "-"}</td></tr>
                        <tr><td className="font-semibold">Driver:</td><td className="text-right">{viewingDispatch.driver_name || "-"}</td></tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="border border-black p-2 align-top">
                    <p className="font-semibold">Ship To</p>
                    <p className="text-[13px] font-bold">{viewingDispatch.to_location}</p>
                    <p className="mt-0.5 whitespace-pre-line">{viewingDispatch.to_location_address || "-"}</p>
                    <p>{[viewingDispatch.to_location_city, viewingDispatch.to_location_state, viewingDispatch.to_location_pincode].filter(Boolean).join(", ") || "-"}</p>
                    {viewingDispatch.to_location_gstin && <p>GSTIN/UIN: {viewingDispatch.to_location_gstin}</p>}
                  </td>
                </tr>
              </tbody>
            </table>

            <table className="mt-2 w-full border-collapse border border-black text-[11px]">
              <thead>
                <tr className="text-center">
                  <th className="border border-black p-1">SI No.</th>
                  <th className="border border-black p-1 text-left">Description of Goods</th>
                  <th className="border border-black p-1">HSN</th>
                  <th className="border border-black p-1">Quantity</th>
                  <th className="border border-black p-1">Rate</th>
                  <th className="border border-black p-1">Value</th>
                </tr>
              </thead>
              <tbody>
                {(viewingDispatch.items || []).map((it, idx) => (
                  <tr key={it.id}>
                    <td className="border border-black p-1 text-center">{idx + 1}</td>
                    <td className="border border-black p-1">{it.material_name}</td>
                    <td className="border border-black p-1 text-center">{it.hsn_code || "-"}</td>
                    <td className="border border-black p-1 text-right">{Number(it.dispatched_qty).toFixed(2)} {it.unit_name}</td>
                    <td className="border border-black p-1 text-right">{it.transfer_price !== null && it.transfer_price !== undefined ? Number(it.transfer_price).toFixed(2) : "-"}</td>
                    <td className="border border-black p-1 text-right">{it.sale_value !== null && it.sale_value !== undefined ? Number(it.sale_value).toFixed(2) : "-"}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={5} className="border border-black p-1 text-right font-bold">Total Value</td>
                  <td className="border border-black p-1 text-right font-bold">
                    {(viewingDispatch.items || []).reduce((s, it) => s + (Number(it.sale_value) || 0), 0).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="mt-2"><span className="font-semibold">Value (in words):</span> {amountInWords((viewingDispatch.items || []).reduce((s, it) => s + (Number(it.sale_value) || 0), 0))}</p>
            {viewingDispatch.remarks && <p className="mt-2"><span className="font-semibold">Remarks:</span> {viewingDispatch.remarks}</p>}

            <div className="mt-8 flex items-end justify-between">
              <p>Receiver's Signature</p>
              <div className="text-right">
                <p>for {viewingDispatch.from_location}</p>
                <p className="mt-8">Authorised Signatory</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 print:hidden">
              <button onClick={() => window.print()} className="rounded bg-gray-800 px-4 py-2 text-white">Print</button>
              <button onClick={() => setPrintDispatchOpen(false)} className="rounded border px-4 py-2">Close</button>
            </div>
          </div>
        </div>
      )}
      </>
    );
  };

  const renderNewDispatchModal = () => {
    if (!showNewDispatch) return null;
    const req = requests.find((r) => String(r.id) === selectedRequest);
    const totalValue = newDispatchForm.items.reduce((s, it) => s + (Number(it.dispatch_qty) * Number(it.unit_cost || 0)), 0);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowNewDispatch(false)}>
        <div className={`w-full max-w-4xl max-h-[95vh] overflow-y-auto rounded-2xl p-6 shadow-xl ${isDark ? "bg-[#2F3349]" : "bg-white"}`} onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className={`text-lg font-semibold ${isDark ? "text-white" : "text-[#2F2B3D]"}`}>New Finished Goods Dispatch</h3>
            <button onClick={() => setShowNewDispatch(false)} className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}><X size={20} /></button>
          </div>
          <div className="mb-4 space-y-3">
            <label className={`block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Select Production Request</label>
            <select value={selectedRequest} onChange={handleRequestSelect} className={`w-full rounded-lg border px-3 py-2 text-[14px] outline-none ${inputClass}`}>
              <option value="">Select request</option>
              {requests.filter((r) => r.status === "Approved" || r.status === "Partially Fulfilled").map((r) => (
                <option key={r.id} value={r.id}>{r.request_no} — {r.outlet_name} (Pending {Math.max(0, (r.planned_qty || r.requested_qty || 0) - (r.received_qty || 0))})</option>
              ))}
            </select>
          </div>
          {selectedRequest && (
            <>
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input type="date" value={newDispatchForm.dispatch_date} onChange={(e) => setNewDispatchForm((f) => ({ ...f, dispatch_date: e.target.value }))} className={inputClass} />
                <input type="text" placeholder="Vehicle No" value={newDispatchForm.vehicle_no} onChange={(e) => setNewDispatchForm((f) => ({ ...f, vehicle_no: e.target.value }))} className={inputClass} />
                <input type="text" placeholder="Driver Name" value={newDispatchForm.driver_name} onChange={(e) => setNewDispatchForm((f) => ({ ...f, driver_name: e.target.value }))} className={inputClass} />
                <input type="text" placeholder="Dispatch Reference" value={newDispatchForm.dispatch_reference} onChange={(e) => setNewDispatchForm((f) => ({ ...f, dispatch_reference: e.target.value }))} className={inputClass} />
                <textarea placeholder="Remarks" value={newDispatchForm.remarks} onChange={(e) => setNewDispatchForm((f) => ({ ...f, remarks: e.target.value }))} className={`col-span-1 sm:col-span-2 ${inputClass}`} rows={2} />
              </div>
              <div className="mb-4 rounded-xl border p-4 shadow-sm text-[13px] space-y-3" style={{ borderColor: isDark ? "#3B405A" : "#EBE9F1", background: isDark ? "#2F3349" : "white" }}>
                <div className={`font-medium ${isDark ? "text-white" : "text-[#2F2B3D]"}`}>Destination: {req?.outlet_name}</div>
                <TableWrapper isDark={isDark}>
                  <table className="w-full border-collapse">
                    <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                      <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                        <th className="px-2 py-2">Product</th><th className="px-2 py-2">Approved</th><th className="px-2 py-2">Received</th><th className="px-2 py-2">Pending</th><th className="px-2 py-2">Available Stock</th><th className="px-2 py-2">Production Required</th><th className="px-2 py-2">Dispatch Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newDispatchForm.items.map((it, idx) => (
                        <tr key={it.production_request_item_id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                          <td className="px-2 py-2">{it.material_name}</td>
                          <td className="px-2 py-2">{Number(it.approved_qty).toFixed(2)}</td>
                          <td className="px-2 py-2">{Number(it.received_qty).toFixed(2)}</td>
                          <td className="px-2 py-2">{Number(it.pending_qty).toFixed(2)}</td>
                          <td className="px-2 py-2">{Number(it.available_finished_stock).toFixed(2)}</td>
                          <td className="px-2 py-2">{Number(it.production_required).toFixed(2)}</td>
                          <td className="px-2 py-2">
                            <input type="number" step="0.01" value={it.dispatch_qty} onChange={(e) => updateDispatchQty(idx, e.target.value)} className={`w-24 rounded border px-2 py-1 text-[13px] ${inputClass}`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
                {newDispatchForm.items.map((it) => it.is_batch_tracked && (availableBatches[it.production_request_item_id] || []).length > 0 && (
                  <div key={it.production_request_item_id} className="rounded-lg border p-3" style={{ borderColor: isDark ? "#3B405A" : "#EBE9F1" }}>
                    <div className={`font-medium mb-2 ${isDark ? "text-white" : "text-[#2F2B3D]"}`}>FEFO Allocation: {it.material_name}</div>
                    <div className="grid grid-cols-3 gap-2 text-[12px]" style={{ color: isDark ? "#D0D2D6" : "#2F2B3D" }}>
                      <span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Batch</span>
                      <span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Expiry</span>
                      <span className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Allocated</span>
                    </div>
                    {(availableBatches[it.production_request_item_id] || []).map((b) => (
                      <div key={b.batch_no} className="grid grid-cols-3 gap-2 py-1 text-[12px]" style={{ color: isDark ? "#D0D2D6" : "#2F2B3D" }}>
                        <span>{b.batch_no}</span>
                        <span>{b.expiry_date || "-"}</span>
                        <span>{Number(b.allocated_qty).toFixed(2)} {it.unit_name}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className={`mb-4 rounded-xl border p-4 text-[13px] ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                <div className={`mb-2 font-medium ${isDark ? "text-white" : "text-[#2F2B3D]"}`}>Dispatch Summary</div>
                <div style={{ color: isDark ? "#D0D2D6" : "#2F2B3D" }}>Request No: {req?.request_no}</div>
                <div style={{ color: isDark ? "#D0D2D6" : "#2F2B3D" }}>Outlet: {req?.outlet_name}</div>
                <div style={{ color: isDark ? "#D0D2D6" : "#2F2B3D" }}>Products: {newDispatchForm.items.map((it) => it.material_name).join(", ")}</div>
                <div style={{ color: isDark ? "#D0D2D6" : "#2F2B3D" }}>Total Value: ₹{totalValue.toFixed(2)}</div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowNewDispatch(false)} className={`rounded-lg border px-4 py-2 text-[13px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-white" : "border-[#EBE9F1] bg-white text-[#2F2B3D]"}`}>Cancel</button>
                <button onClick={handleCreateAndPostDispatch} disabled={!selectedRequest} className="rounded-lg bg-[#7367F0] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#6354D8] disabled:opacity-50">Confirm Dispatch</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderDispatches = () => {
    const list = filteredDispatches();
    const outlets = [...new Set(dispatches.map((d) => d.to_location).filter(Boolean))];
    return (
      <div className="space-y-4">
        <PageHeader
          title="Finished Goods Dispatches"
          subtitle="Manage outlet fulfilment, dispatch, transit and receipt of Bakehouse finished goods."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handleDispatchExport} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[14px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}><Download size={16} /> Export</button>
              {canCreateDispatch && (
                <button onClick={openNewDispatch} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#7367F0] px-3 text-[14px] font-medium text-white hover:bg-[#6354D8]"><Plus size={16} /> New Dispatch</button>
              )}
            </div>
          }
          isDark={isDark}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi label="Ready for Dispatch" value={dispatchKPIs.ready_for_dispatch || 0} isDark={isDark} />
          <Kpi label="In Transit" value={dispatchKPIs.in_transit || 0} isDark={isDark} />
          <Kpi label="Partially Received" value={dispatchKPIs.partially_received || 0} isDark={isDark} />
          <Kpi label="Completed Today" value={dispatchKPIs.completed_today || 0} isDark={isDark} />
          <Kpi label="Pending Fulfilment" value={dispatchKPIs.pending_fulfilment || 0} isDark={isDark} />
        </div>

        <SectionCard isDark={isDark}>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`} />
              <input type="text" placeholder="Search dispatch / request / outlet" value={dispatchFilters.search} onChange={(e) => setDispatchFilters((f) => ({ ...f, search: e.target.value }))} className={`w-full rounded-lg border py-2 pl-9 pr-3 text-[14px] outline-none ${inputClass}`} />
            </div>
            <select value={dispatchFilters.status} onChange={(e) => setDispatchFilters((f) => ({ ...f, status: e.target.value }))} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
              <option value="">All Status</option>
              <option value="Draft">Draft</option>
              <option value="In Transit">In Transit</option>
              <option value="Partially Received">Partially Received</option>
              <option value="Received">Received</option>
            </select>
            <select value={dispatchFilters.outlet} onChange={(e) => setDispatchFilters((f) => ({ ...f, outlet: e.target.value }))} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
              <option value="">All Outlets</option>
              {outlets.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <input type="date" value={dispatchFilters.fromDate} onChange={(e) => setDispatchFilters((f) => ({ ...f, fromDate: e.target.value }))} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
            <input type="date" value={dispatchFilters.toDate} onChange={(e) => setDispatchFilters((f) => ({ ...f, toDate: e.target.value }))} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`} />
            <button onClick={() => setDispatchFilters({ search: "", status: "", outlet: "", fromDate: "", toDate: "" })} className={`inline-flex h-10 items-center gap-1 rounded-lg border px-3 text-[14px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>Reset</button>
          </div>

          {list.length === 0 ? (
            <EmptyState isDark={isDark} title="No Production Dispatches" subtitle="Finished goods dispatches to outlets will appear here." />
          ) : (
            <TableWrapper isDark={isDark}>
              <table className="w-full border-collapse text-[13px]">
                <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                  <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                    <th className="px-3 py-3">Dispatch No</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Outlet</th>
                    <th className="px-3 py-3">Request No</th>
                    <th className="px-3 py-3">Items</th>
                    <th className="px-3 py-3">Dispatched</th>
                    <th className="px-3 py-3">Received</th>
                    <th className="px-3 py-3">Pending</th>
                    <th className="px-3 py-3">Value</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => {
                    const itemCount = d.items ? d.items.length : 0;
                    const totalDispatched = d.items ? d.items.reduce((s, it) => s + Number(it.dispatched_qty || 0), 0) : 0;
                    const totalReceived = d.items ? d.items.reduce((s, it) => s + Number(it.received_qty || 0), 0) : 0;
                    const totalValue = d.items ? d.items.reduce((s, it) => s + (Number(it.dispatched_qty || 0) * Number(it.unit_cost || 0)), 0) : 0;
                    return (
                      <tr key={d.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                        <td className="px-3 py-3 font-medium">{d.transfer_no}</td>
                        <td className="px-3 py-3">{d.dispatch_date}</td>
                        <td className="px-3 py-3">{d.to_location || d.outlet_name}</td>
                        <td className="px-3 py-3">{d.production_request_no}</td>
                        <td className="px-3 py-3">{itemCount}</td>
                        <td className="px-3 py-3">{Number(totalDispatched).toFixed(2)}</td>
                        <td className="px-3 py-3">{Number(totalReceived).toFixed(2)}</td>
                        <td className="px-3 py-3">{Math.max(0, totalDispatched - totalReceived).toFixed(2)}</td>
                        <td className="px-3 py-3">₹{Number(totalValue).toFixed(2)}</td>
                        <td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${d.status === "In Transit" ? "bg-[#FFEAC2] text-[#FF9F43]" : d.status === "Received" ? "bg-[#DDF6E8] text-[#28C76F]" : d.status === "Partially Received" ? "bg-[#FCE7E7] text-[#EA5455]" : "bg-[#ECE8FD] text-[#7367F0]"}`}>{d.status}</span></td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleViewDispatch(d.id)} className={`rounded p-1.5 ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`} title="View"><Eye size={16} className="text-[#7367F0]" /></button>
                            {d.status === "Draft" && canCreateDispatch && (
                              <button onClick={() => handlePostDispatch(d.id)} className={`rounded p-1.5 ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`} title="Post"><Send size={16} className="text-[#28C76F]" /></button>
                            )}
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
        {renderNewDispatchModal()}
        {renderDispatchDetail()}
      </div>
    );
  };

  if (loading && !kitchenId) {
    return (
      <SectionCard isDark={isDark}>
        <div className="flex h-48 items-center justify-center">
          <LoadingSpinner size={28} isDark={isDark} />
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden p-1">
      <PageHeader
        title="Bakehouse"
        subtitle="Production planning, batch tracking and finished goods control"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select value={kitchenId} onChange={(e) => { const v = e.target.value; setKitchenId(v); if (typeof window !== "undefined" && v) localStorage.setItem(CENTRAL_KITCHEN_LOCATION_KEY, v); }} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
              <option value="">Select Bakehouse</option>
              {kitchens.map((k) => <option key={k.id} value={k.id}>{k.location_name}</option>)}
            </select>
            <button onClick={fetchAll} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[14px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}><RefreshCw size={16} /> Refresh</button>
          </div>
        }
        isDark={isDark}
      />

      {!kitchenId && <EmptyState isDark={isDark} title="Select a Bakehouse" subtitle="Choose a bakehouse from the dropdown to view production data." />}

      {kitchenId && (
        <>
          <div className={`sticky top-0 z-20 -mx-1 px-1 pb-1 pt-1 ${isDark ? "bg-[#25293C]" : "bg-[#F8F7FA]"}`}>
            <nav className={`inline-flex flex-wrap gap-1 rounded-xl border p-1 shadow-sm ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
              {visibleTabs.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.key;
                return (
                    <button key={t.key} onClick={() => selectTab(t.key)} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition ${active ? "bg-[#7367F0] text-white" : isDark ? "text-[#A5A8B6] hover:bg-[#3B405A]" : "text-[#6F6B7D] hover:bg-[#F3F2F7]"}`}>
                    <Icon size={16} /> {t.label}
                </button>
                  );
              })}
            </nav>
          </div>

          {loading ? (
            <div className="flex h-48 items-center justify-center"><LoadingSpinner size={28} isDark={isDark} /></div>
          ) : (
            <>
              {activeTab === "dashboard" && renderDashboard()}
              {activeTab === "requests" && (
                <RequestsTab requests={requests} kitchenId={kitchenId} outlets={outlets} materials={materials} units={units} isDark={isDark}
                  canCreate={requestPerms.can_create} canEdit={requestPerms.can_edit} onRefresh={fetchAll} />
              )}
              {activeTab === "plans" && (
                <PlanningTab plans={plans} kitchenId={kitchenId} materials={materials} units={units} recipes={recipes} isDark={isDark}
                  canCreate={planningPerms.can_create} canEdit={planningPerms.can_edit} onRefresh={fetchAll} />
              )}
              {activeTab === "batches" && (
                <BatchesTab batches={batches} kitchenId={kitchenId} materials={materials} units={units} recipes={recipes} isDark={isDark}
                  canCreate={batchPerms.can_create} canEdit={canEdit} onRefresh={fetchAll} />
              )}
              {activeTab === "wastage" && (
                <WastageTab wastage={wastage} kitchenId={kitchenId} batches={batches} materials={materials} units={units} isDark={isDark}
                  canCreate={wastagePerms.can_create} canEdit={wastagePerms.can_edit} onRefresh={fetchAll} />
              )}
              {activeTab === "variance" && <VarianceTab variance={variance} kitchenId={kitchenId} isDark={isDark} />}
              {activeTab === "dispatches" && renderDispatches()}
            </>
          )}
        </>
      )}
    </div>
  );
}

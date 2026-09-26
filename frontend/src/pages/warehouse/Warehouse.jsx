import { useEffect, useState } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { warehouseAPI, masterAPI, getStoredPermissions } from "../../services/api";
import { getThemeMode, getInputClass, PageHeader, LoadingSpinner } from "../../components/ui";
import { displayLabel } from "../../utils/displayLabels";
import { 
  LayoutDashboard, Package, ClipboardCheck, BookOpen, ClipboardList, ArrowRightLeft,
  RefreshCw, MapPin, Building2, Warehouse as WarehouseIcon, ChefHat, Store,
  Scale, SlidersHorizontal, Trash2, Truck, FileText, TrendingUp, AlertTriangle,
  Settings, ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import WarehouseDashboard from "./WarehouseDashboard";
import WarehouseCurrentStock from "./WarehouseCurrentStock";
import WarehouseGRN from "./WarehouseGRN";
import WarehouseLedger from "./WarehouseLedger";
import WarehouseRequisitions from "./WarehouseRequisitions";
import WarehouseTransfers from "./WarehouseTransfers";
import WarehousePhysicalStockCounts from "./WarehousePhysicalStockCounts";
import WarehouseStockAdjustments from "./WarehouseStockAdjustments";
import WarehouseWastage from "./WarehouseWastage";
import BatchExpiry from "./BatchExpiry";
import PurchaseReturns from "./PurchaseReturns";
import PurchaseOrders from "./PurchaseOrders";
import SupplierHistory from "./SupplierHistory";
import LowStockReorder from "./LowStockReorder";
import WarehouseReports from "./WarehouseReports";
import WarehouseSettings from "./WarehouseSettings";

const tabs = [
  { key: "dashboard", label: "Warehouse Overview", icon: LayoutDashboard, moduleKey: "warehouse_dashboard" },
  { key: "current-stock", label: "Current Stock", icon: Package, moduleKey: "warehouse_stock" },
  { key: "grn", label: "Goods Receipt Notes", icon: ClipboardCheck, moduleKey: "grn" },
  { key: "ledger", label: "Stock Movement Ledger", icon: BookOpen, moduleKey: "warehouse_ledger" },
  { key: "requisitions", label: "Outlet Purchase Orders", icon: ClipboardList, moduleKey: "warehouse_requisitions" },
  { key: "transfers", label: "Transfers", icon: ArrowRightLeft, moduleKey: "warehouse_transfers" },
  { key: "physical-stock-counts", label: "Physical Stock Count", icon: Scale, moduleKey: "physical_stock_counts" },
  { key: "stock-adjustments", label: "Stock Adjustments", icon: SlidersHorizontal, moduleKey: "stock_adjustments" },
  { key: "warehouse-wastage", label: "Warehouse Wastage", icon: Trash2, moduleKey: "warehouse_wastage" },
  { key: "batch-expiry", label: "Batch & Expiry", icon: Scale, moduleKey: "warehouse_batch_expiry" },
  { key: "purchase-returns", label: "Purchase Returns", icon: Truck, moduleKey: "warehouse_purchase_returns" },
  { key: "purchase-orders", label: "Warehouse Purchase Orders", icon: FileText, moduleKey: "warehouse_purchase_orders" },
  { key: "supplier-history", label: "Supplier Transaction History", icon: TrendingUp, moduleKey: "warehouse_supplier_history" },
  { key: "low-stock-reorder", label: "Low Stock & Reordering", icon: AlertTriangle, moduleKey: "warehouse_reorder" },
  { key: "reports", label: "Reports", icon: BookOpen, moduleKey: "warehouse_reports" },
  { key: "settings", label: "Settings", icon: Settings, moduleKey: "warehouse_settings" },
];

const LocationIcon = (type) => {
  if (type === "Central Warehouse") return WarehouseIcon;
  if (type === "Central Kitchen") return ChefHat;
  if (type === "Outlet") return Store;
  return Building2;
};

const WAREHOUSE_LOCATION_KEY = "bbc_warehouse_location_id";

export default function Warehouse() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(tab || "dashboard");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const isDark = getThemeMode() === "dark";
  const inputClass = getInputClass(isDark);

  // Global top-bar outlet selection (DashboardLayout <Outlet> context). A
  // specific outlet pins Warehouse to that outlet's inventory location; "all"
  // leaves the existing Warehouse location selector in charge. The layout
  // remounts this page on every outlet switch (key={selectedOutletId}), so
  // no stale-location handling is needed here.
  const { isOutletLocked = false, selectedOutletId = "all", availableOutlets = [] } = useOutletContext() || {};
  const outletSelected = selectedOutletId != null && String(selectedOutletId) !== "all" && String(selectedOutletId) !== "";

  useEffect(() => { setActiveTab(tab || "dashboard"); }, [tab]);

  const fetchMasters = async () => {
    setRefreshing(true);
    try {
      const [l, m, s, c, u] = await Promise.all([
        warehouseAPI.getLocations({ scope: "all" }),
        masterAPI.getRawMaterials(),
        masterAPI.getSuppliers(),
        masterAPI.getCategories(),
        masterAPI.getUnits(),
      ]);
      const locs = (l?.data?.data || []);
      setLocations(locs);
      const warehouseLocs = locs.filter((x) => x.location_type === "Central Warehouse" && x.is_active === 1 && x.is_inventory_location === 1);
      const saved = typeof window !== "undefined" ? localStorage.getItem(WAREHOUSE_LOCATION_KEY) : "";
      if (!outletSelected) {
        if (saved && warehouseLocs.some((w) => String(w.id) === saved)) {
          setLocationId(saved);
        } else if (warehouseLocs.length > 0) {
          const first = String(warehouseLocs[0].id);
          setLocationId(first);
          if (typeof window !== "undefined") localStorage.setItem(WAREHOUSE_LOCATION_KEY, first);
        }
      }
      setMaterials(m?.data?.data || m?.data || []);
      setSuppliers(s?.data?.data || s?.data || []);
      setCategories(c?.data?.data || c?.data || []);
      setUnits(u?.data?.data || u?.data || []);
    } catch (error) { toast.error("Failed to load warehouse masters"); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchMasters(); }, []);

  const warehouseLocations = locations.filter((x) => x.location_type === "Central Warehouse" && x.is_active === 1 && x.is_inventory_location === 1);
  const currentLocation = warehouseLocations.find((l) => String(l.id) === locationId);

  // Outlet -> inventory-location mapping. `locations` is already the
  // server-scoped accessible set (getLocations scope:"all"), so an outlet the
  // user cannot access simply yields no mapped location - never another
  // location's data.
  const mappedOutletLocation = outletSelected
    ? locations.find((l) => Number(l.outlet_id) === Number(selectedOutletId) && l.location_type === "Outlet" && l.is_active === 1 && l.is_inventory_location === 1)
    : null;
  const selectableLocations = outletSelected ? (mappedOutletLocation ? [mappedOutletLocation] : []) : warehouseLocations;
  const selectedOutletName = availableOutlets.find((o) => String(o.id) === String(selectedOutletId))?.outlet_name || "";

  useEffect(() => {
    if (!outletSelected) return;
    setLocationId(mappedOutletLocation ? String(mappedOutletLocation.id) : "");
  }, [outletSelected, mappedOutletLocation]);

  const permissions = getStoredPermissions();
  // Phase 7C2A2: outlet-locked users get warehouse_wastage.can_view for their
  // own scoped page (/outlet-dashboard/wastage); the Central-Warehouse-scoped
  // wastage tab must stay hidden for them or a direct
  // /warehouse/warehouse-wastage URL would render a dead CW page. The flag
  // comes from the layout's outlet context - no role check here.
  const visibleTabs = tabs.filter(
    (t) => permissions?.[t.moduleKey]?.can_view && !(t.key === "warehouse-wastage" && isOutletLocked)
  );

  // With the in-page tab strip removed (Phase 7A / Req 14) the page header is
  // the only thing telling the user which Warehouse section they are on, so it
  // now reflects the active section instead of always reading "Warehouse
  // Overview". Reuses the same `tabs` labels the sidebar mirrors.
  const activeTabMeta = tabs.find((t) => t.key === activeTab);

  // If the current tab isn't one this user has view access to (e.g. an
  // Outlet Admin landing on the default "dashboard" tab, which they don't
  // have), fall through to the first tab they actually can see instead of
  // silently rendering nothing.
  useEffect(() => {
    if (!visibleTabs.length) return;
    if (!visibleTabs.some((t) => t.key === activeTab)) {
      navigate(`/warehouse/${visibleTabs[0].key}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, visibleTabs.length]);

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[240px]">
        <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7367F0]" />
        <select value={locationId} onChange={(e) => { const v = e.target.value; setLocationId(v); if (typeof window !== "undefined" && v) localStorage.setItem(WAREHOUSE_LOCATION_KEY, v); }} disabled={outletSelected && !mappedOutletLocation} className={`h-11 w-full cursor-pointer appearance-none rounded-[10px] border pl-9 pr-9 text-[14px] outline-none transition hover:border-[#7367F0]/60 focus:border-[#7367F0] disabled:cursor-not-allowed disabled:opacity-60 ${inputClass}`}>
          <option value="">{outletSelected ? "No inventory location" : (warehouseLocations.length ? "Select Warehouse" : "No authorized warehouse")}</option>
          {selectableLocations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.location_name} — {displayLabel(loc.location_type)}
            </option>
          ))}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#A8AAAE]" />
      </div>
      <button onClick={fetchMasters} disabled={refreshing} className={`flex h-11 items-center gap-2 rounded-[10px] border px-4 text-[14px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6] hover:border-[#7367F0]/60" : "border-[#EBE9F1] bg-white text-[#5D596C] hover:border-[#7367F0]/60 hover:text-[#2F2B3D]"}`}>
        <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> {refreshing ? "Refreshing..." : "Refresh"}
      </button>
    </div>
  );

  const EmptyLocationState = () => (
    <div className={`rounded-xl border p-6 shadow-sm ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-full ${isDark ? "bg-[#3B405A] text-[#A5A8B6]" : "bg-[#F3F2F7] text-[#6F6B7D]"}`}>
            <WarehouseIcon size={20} />
          </div>
          <div>
            <h4 className={`text-[15px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{outletSelected ? "No inventory location configured" : "Select a Central Warehouse"}</h4>
            <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>{outletSelected ? `No inventory location is configured for ${selectedOutletName || "this outlet"}.` : "Warehouse inventory is scoped to the selected Central Warehouse."}</p>
          </div>
        </div>
        {!outletSelected && (
          <select value={locationId} onChange={(e) => { const v = e.target.value; setLocationId(v); if (typeof window !== "undefined" && v) localStorage.setItem(WAREHOUSE_LOCATION_KEY, v); }} className={`h-10 min-w-[220px] rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">{warehouseLocations.length ? "Select Warehouse" : "No authorized warehouse"}</option>
            {warehouseLocations.map((loc) => <option key={loc.id} value={loc.id}>{loc.location_name} — {displayLabel(loc.location_type)}</option>)}
          </select>
        )}
      </div>
      {!outletSelected && warehouseLocations.length === 0 && (
        <p className={`mt-3 border-t pt-3 text-[13px] ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
          No authorized Central Warehouse found. A permanent <strong>Central Warehouse</strong> location is required.
        </p>
      )}
    </div>
  );

  if (loading) return (
    <div className="flex h-64 w-full items-center justify-center">
      <LoadingSpinner size={32} />
    </div>
  );

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden p-1">
      <PageHeader
        title={activeTabMeta?.label || "Warehouse Overview"}
        subtitle="Inventory & Stock Control — Manage receipts, stock movements, outlet purchase orders, transfers and inventory reconciliation."
        actions={headerActions}
        isDark={isDark}
      />

      {!locationId && <EmptyLocationState />}

      {/* Phase 7A (Req 14): the repeated in-page Warehouse tab strip was removed -
          the main sidebar (DashboardLayout.jsx) is now the single canonical
          Warehouse navigation. The `tabs`/`visibleTabs` permission mapping above
          is deliberately RETAINED: it still drives the moduleKey access-control
          fallback that redirects a user off a tab they cannot view, so removing
          the buttons must never be read as removing route protection. */}

      {locationId && activeTab === "dashboard" && <WarehouseDashboard locationId={locationId} locations={locations} materials={materials} isDark={isDark} />}
      {locationId && activeTab === "current-stock" && <WarehouseCurrentStock locationId={locationId} locations={locations} categories={categories} materials={materials} isDark={isDark} />}
      {locationId && activeTab === "grn" && <WarehouseGRN locationId={locationId} locations={locations} materials={materials} suppliers={suppliers} isDark={isDark} />}
      {locationId && activeTab === "ledger" && <WarehouseLedger locationId={locationId} locations={locations} isDark={isDark} />}
      {locationId && activeTab === "requisitions" && <WarehouseRequisitions locationId={locationId} locations={locations} materials={materials} units={units} isDark={isDark} />}
      {locationId && activeTab === "transfers" && <WarehouseTransfers locationId={locationId} outletSelected={outletSelected} locations={locations} materials={materials} isDark={isDark} />}
      {locationId && activeTab === "physical-stock-counts" && <WarehousePhysicalStockCounts locationId={locationId} locations={locations} materials={materials} units={units} isDark={isDark} />}
      {locationId && activeTab === "stock-adjustments" && <WarehouseStockAdjustments locationId={locationId} locations={locations} materials={materials} units={units} isDark={isDark} />}
      {locationId && activeTab === "warehouse-wastage" && <WarehouseWastage locationId={locationId} locations={locations} materials={materials} units={units} isDark={isDark} />}
      {locationId && activeTab === "batch-expiry" && <BatchExpiry locationId={locationId} isDark={isDark} />}
      {locationId && activeTab === "purchase-returns" && <PurchaseReturns locationId={locationId} isDark={isDark} />}
      {locationId && activeTab === "purchase-orders" && <PurchaseOrders locationId={locationId} locations={locations} materials={materials} suppliers={suppliers} units={units} isDark={isDark} />}
      {locationId && activeTab === "supplier-history" && <SupplierHistory locationId={locationId} materials={materials} suppliers={suppliers} isDark={isDark} />}
      {locationId && activeTab === "low-stock-reorder" && <LowStockReorder locationId={locationId} materials={materials} suppliers={suppliers} categories={categories} isDark={isDark} />}
      {locationId && activeTab === "reports" && <WarehouseReports locationId={locationId} materials={materials} suppliers={suppliers} categories={categories} isDark={isDark} />}
      {locationId && activeTab === "settings" && <WarehouseSettings locationId={locationId} locations={locations} isDark={isDark} />}
    </div>
  );
}

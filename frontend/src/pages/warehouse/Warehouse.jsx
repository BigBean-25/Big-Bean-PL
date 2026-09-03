import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { warehouseAPI, masterAPI, getStoredPermissions } from "../../services/api";
import { getThemeMode, getInputClass, PageHeader, LoadingSpinner } from "../../components/ui";
import { displayLabel } from "../../utils/displayLabels";
import { 
  LayoutDashboard, Package, ClipboardCheck, BookOpen, ClipboardList, ArrowRightLeft,
  RefreshCw, MapPin, Building2, Warehouse as WarehouseIcon, ChefHat, Store,
  Scale, SlidersHorizontal, Trash2, Truck, FileText, TrendingUp, AlertTriangle,
  Settings,
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
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, moduleKey: "warehouse_dashboard" },
  { key: "current-stock", label: "Current Stock", icon: Package, moduleKey: "warehouse_stock" },
  { key: "grn", label: "Goods Receipt", icon: ClipboardCheck, moduleKey: "grn" },
  { key: "ledger", label: "Stock Ledger", icon: BookOpen, moduleKey: "warehouse_ledger" },
  { key: "requisitions", label: "Outlet Purchase Orders", icon: ClipboardList, moduleKey: "warehouse_requisitions" },
  { key: "transfers", label: "Transfers", icon: ArrowRightLeft, moduleKey: "warehouse_transfers" },
  { key: "physical-stock-counts", label: "Physical Stock Count", icon: Scale, moduleKey: "physical_stock_counts" },
  { key: "stock-adjustments", label: "Stock Adjustments", icon: SlidersHorizontal, moduleKey: "stock_adjustments" },
  { key: "warehouse-wastage", label: "Wastage", icon: Trash2, moduleKey: "warehouse_wastage" },
  { key: "batch-expiry", label: "Batch & Expiry", icon: Scale, moduleKey: "warehouse_batch_expiry" },
  { key: "purchase-returns", label: "Purchase Returns", icon: Truck, moduleKey: "warehouse_purchase_returns" },
  { key: "purchase-orders", label: "Warehouse Purchase Orders", icon: FileText, moduleKey: "warehouse_purchase_orders" },
  { key: "supplier-history", label: "Supplier History", icon: TrendingUp, moduleKey: "warehouse_supplier_history" },
  { key: "low-stock-reorder", label: "Low Stock / Reorder", icon: AlertTriangle, moduleKey: "warehouse_reorder" },
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
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const isDark = getThemeMode() === "dark";
  const inputClass = getInputClass(isDark);

  useEffect(() => { setActiveTab(tab || "dashboard"); }, [tab]);

  const fetchMasters = async () => {
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
      if (saved && warehouseLocs.some((w) => String(w.id) === saved)) {
        setLocationId(saved);
      } else if (warehouseLocs.length > 0) {
        const first = String(warehouseLocs[0].id);
        setLocationId(first);
        if (typeof window !== "undefined") localStorage.setItem(WAREHOUSE_LOCATION_KEY, first);
      }
      setMaterials(m?.data?.data || m?.data || []);
      setSuppliers(s?.data?.data || s?.data || []);
      setCategories(c?.data?.data || c?.data || []);
      setUnits(u?.data?.data || u?.data || []);
    } catch (error) { toast.error("Failed to load warehouse masters"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMasters(); }, []);

  const selectTab = (nextTab) => { navigate(`/warehouse/${nextTab}`); };

  const warehouseLocations = locations.filter((x) => x.location_type === "Central Warehouse" && x.is_active === 1 && x.is_inventory_location === 1);
  const currentLocation = warehouseLocations.find((l) => String(l.id) === locationId);

  const permissions = getStoredPermissions();
  const visibleTabs = tabs.filter((t) => permissions?.[t.moduleKey]?.can_view);

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
        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7367F0]" />
        <select value={locationId} onChange={(e) => { const v = e.target.value; setLocationId(v); if (typeof window !== "undefined" && v) localStorage.setItem(WAREHOUSE_LOCATION_KEY, v); }} className={`h-10 w-full rounded-lg border pl-9 pr-3 text-[14px] outline-none ${inputClass}`}>
          <option value="">{warehouseLocations.length ? "Select Warehouse" : "No authorized warehouse"}</option>
          {warehouseLocations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.location_name} — {displayLabel(loc.location_type)}
            </option>
          ))}
        </select>
      </div>
      <button onClick={fetchMasters} className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-[14px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#A5A8B6]" : "border-[#EBE9F1] bg-white text-[#6F6B7D]"}`}>
        <RefreshCw size={16} /> Refresh
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
            <h4 className={`text-[15px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Select a Central Warehouse</h4>
            <p className={`text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Warehouse inventory is scoped to the selected Central Warehouse.</p>
          </div>
        </div>
        <select value={locationId} onChange={(e) => { const v = e.target.value; setLocationId(v); if (typeof window !== "undefined" && v) localStorage.setItem(WAREHOUSE_LOCATION_KEY, v); }} className={`h-10 min-w-[220px] rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
          <option value="">{warehouseLocations.length ? "Select Warehouse" : "No authorized warehouse"}</option>
          {warehouseLocations.map((loc) => <option key={loc.id} value={loc.id}>{loc.location_name} — {displayLabel(loc.location_type)}</option>)}
        </select>
      </div>
      {warehouseLocations.length === 0 && (
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
        title="Warehouse"
        subtitle="Inventory & Stock Control — Manage receipts, stock movements, outlet purchase orders, transfers and inventory reconciliation."
        actions={headerActions}
        isDark={isDark}
      />

      {!locationId && <EmptyLocationState />}

      <div className={`sticky top-0 z-20 -mx-1 px-1 pb-1 pt-1 ${isDark ? "bg-[#25293C]" : "bg-[#F8F7FA]"}`}>
        <nav className={`inline-flex flex-wrap gap-1 rounded-xl border p-1 shadow-sm ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => selectTab(t.key)}
                disabled={!locationId}
                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition ${
                  active
                    ? "bg-[#7367F0] text-white shadow-sm"
                    : isDark
                      ? "text-[#A5A8B6] hover:bg-[#3B405A]"
                      : "text-[#6F6B7D] hover:bg-[#F3F2F7]"
                } ${!locationId ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {locationId && activeTab === "dashboard" && <WarehouseDashboard locationId={locationId} locations={locations} materials={materials} isDark={isDark} />}
      {locationId && activeTab === "current-stock" && <WarehouseCurrentStock locationId={locationId} locations={locations} categories={categories} materials={materials} isDark={isDark} />}
      {locationId && activeTab === "grn" && <WarehouseGRN locationId={locationId} locations={locations} materials={materials} suppliers={suppliers} isDark={isDark} />}
      {locationId && activeTab === "ledger" && <WarehouseLedger locationId={locationId} locations={locations} isDark={isDark} />}
      {locationId && activeTab === "requisitions" && <WarehouseRequisitions locationId={locationId} locations={locations} materials={materials} isDark={isDark} />}
      {locationId && activeTab === "transfers" && <WarehouseTransfers locationId={locationId} locations={locations} isDark={isDark} />}
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

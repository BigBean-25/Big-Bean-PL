import { useEffect, useState } from "react";
import { warehouseAPI, masterAPI, getSelectedOutletId } from "../../services/api";
import { useSelectedOutlet } from "../../hooks/useSelectedOutlet";
import { getThemeMode, getInputClass, PageHeader, LoadingSpinner } from "../../components/ui";
import { MapPin } from "lucide-react";
import toast from "react-hot-toast";
import WarehousePhase2c from "../warehouse/WarehousePhase2c";

// Phase 7C2A2 - outlet-facing wastage entry. Reuses the shared Phase 2C
// wastage page against the outlet's OWN inventory location (the Warehouse
// page itself is Central-Warehouse-scoped by design). getLocations already
// returns only the caller's allowed locations server-side; filtering to
// location_type 'Outlet' pins entry to the outlet's own locations - a
// Central Warehouse can never be selected here, and the backend's
// checkLocationAccess/isLocationAccessible rejects anything else anyway.
//
// List calls use omitListLocationFilter: applyLocationScope rejects non-CW
// location_id params on warehouse routes, so the list relies on the
// backend's own-location scoping (Phase 7C2A1). create still sends the
// resolved outlet location_id.
export default function OutletWastage() {
  const { selectedOutletId } = useSelectedOutlet();
  const outletLocked = Boolean(selectedOutletId && selectedOutletId !== "all");
  const isDark = getThemeMode() === "dark";
  const inputClass = getInputClass(isDark);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");
  const [materials, setMaterials] = useState([]);
  const [units, setUnits] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [l, m, u] = await Promise.all([
          warehouseAPI.getLocations({ scope: "all" }),
          masterAPI.getRawMaterials(),
          masterAPI.getUnits(),
        ]);
        const outletLocs = (l?.data?.data || []).filter(
          (x) => x.location_type === "Outlet" && x.is_active === 1 && x.is_inventory_location === 1
        );
        setLocations(outletLocs);
        const gid = getSelectedOutletId();
        const initial = gid !== "all" ? outletLocs.filter((x) => String(x.outlet_id) === gid) : outletLocs;
        setLocationId(String(initial[0]?.id || ""));
        setMaterials(m?.data?.data || m?.data || []);
        setUnits(u?.data?.data || u?.data || []);
      } catch {
        toast.error("Failed to load wastage data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const visibleLocations = outletLocked
    ? locations.filter((x) => String(x.outlet_id) === String(selectedOutletId))
    : locations;

  useEffect(() => {
    if (!outletLocked || !locations.length) return;
    const mapped = locations.filter((x) => String(x.outlet_id) === String(selectedOutletId));
    if (!mapped.some((x) => String(x.id) === String(locationId))) setLocationId(String(mapped[0]?.id || ""));
  }, [selectedOutletId, locations]);

  if (loading) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <LoadingSpinner size={32} />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden p-1">
      <PageHeader
        title="Wastage"
        subtitle="Record expired, damaged or counter/preparation wastage for your outlet. Submitted records are reviewed and posted by the accounts/warehouse team."
        isDark={isDark}
        actions={
          visibleLocations.length > 1 ? (
            <div className="relative min-w-[240px]">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7367F0]" />
              <select value={locationId} disabled={outletLocked && visibleLocations.length <= 1} onChange={(e) => setLocationId(e.target.value)} className={`h-10 w-full rounded-lg border pl-9 pr-3 text-[14px] outline-none disabled:cursor-not-allowed disabled:opacity-60 ${inputClass}`}>
                {visibleLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.location_name}</option>
                ))}
              </select>
            </div>
          ) : null
        }
      />
      {locationId ? (
        <WarehousePhase2c
          module="warehouse_wastage"
          locationId={locationId}
          locations={locations}
          materials={materials}
          units={units}
          isDark={isDark}
          omitListLocationFilter
        />
      ) : (
        <div className={`rounded-xl border p-6 text-[14px] shadow-sm ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#A5A8B6]" : "border-[#EBE9F1] bg-white text-[#6F6B7D]"}`}>
          {outletLocked
            ? "No inventory location is configured for this outlet."
            : "No outlet inventory location is mapped to your account. Contact your administrator."}
        </div>
      )}
    </div>
  );
}

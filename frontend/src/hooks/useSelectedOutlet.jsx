import { useEffect, useMemo, useRef, useState } from "react";
import useAuthStore from "../store/authStore";
import { getSelectedOutletId } from "../services/api";

export const getSelectedOutletLabel = (user, selectedOutletId = getSelectedOutletId()) => {
  if (selectedOutletId === "all") return "All Outlets";

  const outlets = user?.outlets || [];
  const outlet = outlets.find((item) => String(item.id || item.outlet_id) === String(selectedOutletId));

  return outlet?.outlet_name || outlet?.name || outlet?.outlet_code || "Selected Outlet";
};

export const useSelectedOutlet = (onChange) => {
  const { user } = useAuthStore();
  const [selectedOutletId, setSelectedOutletId] = useState(getSelectedOutletId());

  // DashboardLayout's bootstrap resolver effect can dispatch
  // bbc:selected-outlet-change several times during startup while the
  // outlet id itself never actually changes (permissions/user settling).
  // onChangeRef always holds the latest caller callback without making the
  // listener-registration effect depend on it - most callers pass a new
  // inline arrow function every render, which previously caused this effect
  // to tear down and re-add the listener on every render (listener churn),
  // occasionally leaving two instances briefly active at once and doubling
  // the effect of a single dispatch. lastOutletIdRef is the source of truth
  // for "did the outlet id actually change" so repeated same-value events
  // are ignored before they ever reach the caller's onChange.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastOutletIdRef = useRef(selectedOutletId);

  useEffect(() => {
    const handleOutletChange = (event) => {
      const nextOutletId = event.detail || getSelectedOutletId();
      if (String(nextOutletId) === String(lastOutletIdRef.current)) return;

      lastOutletIdRef.current = nextOutletId;
      setSelectedOutletId(nextOutletId);
      onChangeRef.current?.(nextOutletId);
    };

    window.addEventListener("bbc:selected-outlet-change", handleOutletChange);
    return () => window.removeEventListener("bbc:selected-outlet-change", handleOutletChange);
  }, []);

  const selectedOutletLabel = useMemo(
    () => getSelectedOutletLabel(user, selectedOutletId),
    [user, selectedOutletId]
  );

  return { selectedOutletId, selectedOutletLabel };
};

// Shared report-filter sync: pins a page's filters.outlet_id to the global
// selector and locks the local dropdown while a specific outlet is selected.
// allModeValue restores the page's ORIGINAL default when the global selector
// returns to "all" ("" for required-pick reports, "all" for aggregate reports).
// clearResult wipes stale rendered report state whenever the outlet target
// actually changes, so an old outlet's output can't linger under a new pick.
export const useReportOutletSync = ({ setFilters, allModeValue = "", clearResult } = {}) => {
  const { selectedOutletId } = useSelectedOutlet();
  const outletLocked = Boolean(selectedOutletId && String(selectedOutletId) !== "all" && String(selectedOutletId) !== "");

  useEffect(() => {
    const next = outletLocked ? String(selectedOutletId) : String(allModeValue);
    setFilters((prev) => {
      if (String(prev.outlet_id) === next) return prev;
      if (typeof clearResult === "function") clearResult();
      return { ...prev, outlet_id: next };
    });
  }, [selectedOutletId]);

  return { outletLocked, selectedOutletId };
};

export const OutletScopeBadge = ({ className = "" }) => {
  const { selectedOutletLabel } = useSelectedOutlet();

  return (
    <div className={`inline-flex rounded-md border border-[#DBDADE] bg-white px-3 py-2 text-[13px] font-medium text-[#6F6B7D] dark:border-[#3B405A] dark:bg-[#2F3349] dark:text-[#A5A8B6] ${className}`}>
      Showing data for: <span className="ml-1 font-semibold text-[#2F2B3D] dark:text-[#D0D2D6]">{selectedOutletLabel}</span>
    </div>
  );
};

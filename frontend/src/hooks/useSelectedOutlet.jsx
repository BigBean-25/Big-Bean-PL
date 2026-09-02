import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    const handleOutletChange = (event) => {
      const nextOutletId = event.detail || getSelectedOutletId();
      setSelectedOutletId(nextOutletId);
      if (typeof onChange === "function") onChange(nextOutletId);
    };

    window.addEventListener("bbc:selected-outlet-change", handleOutletChange);
    return () => window.removeEventListener("bbc:selected-outlet-change", handleOutletChange);
  }, [onChange]);

  const selectedOutletLabel = useMemo(
    () => getSelectedOutletLabel(user, selectedOutletId),
    [user, selectedOutletId]
  );

  return { selectedOutletId, selectedOutletLabel };
};

export const OutletScopeBadge = ({ className = "" }) => {
  const { selectedOutletLabel } = useSelectedOutlet();

  return (
    <div className={`inline-flex rounded-md border border-[#DBDADE] bg-white px-3 py-2 text-[13px] font-medium text-[#6F6B7D] dark:border-[#3B405A] dark:bg-[#2F3349] dark:text-[#A5A8B6] ${className}`}>
      Showing data for: <span className="ml-1 font-semibold text-[#2F2B3D] dark:text-[#D0D2D6]">{selectedOutletLabel}</span>
    </div>
  );
};

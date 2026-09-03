import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Building2, Tag, Truck, Package, Coffee, MapPin, FileText, Store,
} from "lucide-react";

const getPrimaryColor = () => { try { return localStorage.getItem("bbc_primary_color") || "#7367F0"; } catch { return "#7367F0"; } };
const getThemeMode = () => { try { const m = localStorage.getItem("bbc_theme_mode") || "light"; return m === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light") : m; } catch { return "light"; } };

const ITEMS = [
  { title: "Outlets", path: "/masters/outlets", group: "organization" },
  { title: "Location Management", path: "/masters/locations", group: "organization" },
  { title: "Categories", path: "/masters/categories", group: "catalog" },
  { title: "Raw Materials", path: "/masters/raw-materials", group: "catalog" },
  { title: "Menu Items", path: "/masters/menu-items", group: "catalog" },
  { title: "Suppliers", path: "/masters/suppliers", group: "vendors" },
  { title: "Third Party Vendors", path: "/masters/outlet-vendors", group: "vendors" },
];

const GROUPS = [
  { key: "organization", label: "Organization", icon: Building2, iconColor: "#7367F0", items: ITEMS.filter((i) => i.group === "organization") },
  { key: "catalog", label: "Catalog", icon: Package, iconColor: "#28C76F", items: ITEMS.filter((i) => i.group === "catalog") },
  { key: "vendors", label: "Vendors", icon: Truck, iconColor: "#FF9F43", items: ITEMS.filter((i) => i.group === "vendors") },
];

const ITEM_ICONS = {
  "/masters/outlets": Building2,
  "/masters/locations": MapPin,
  "/masters/categories": Tag,
  "/masters/raw-materials": Package,
  "/masters/menu-items": Coffee,
  "/masters/suppliers": Truck,
  "/masters/outlet-vendors": Store,
};

const MastersHub = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6]" : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const rowHover = isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F8F7FA]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

  const term = search.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!term) return GROUPS;
    return GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.title.toLowerCase().includes(term)) })).filter((g) => g.items.length > 0);
  }, [term]);

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Masters</h1>
          <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>The reference data every other module builds on.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${mutedCls}`} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a master"
            className={`h-10 w-full rounded-md border pl-9 pr-3 text-[14px] outline-none ${inputCls}`}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className={`flex flex-col items-center justify-center rounded-md border py-14 text-center ${cardCls}`}>
          <FileText size={26} className={mutedCls} />
          <p className={`mt-3 text-[15px] font-semibold ${mainCls}`}>No master matches "{search}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {groups.map((g) => {
            const GroupIcon = g.icon;
            return (
              <div key={g.key} className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
                <div className={`flex items-center gap-2 border-b px-4 py-3 ${borderCls}`}>
                  <GroupIcon size={16} style={{ color: g.iconColor }} />
                  <span className={`text-[13px] font-semibold uppercase tracking-wider ${mainCls}`}>{g.label}</span>
                </div>
                <div className="p-2">
                  {g.items.map((i) => {
                    const ItemIcon = ITEM_ICONS[i.path] || FileText;
                    return (
                      <button
                        key={i.path}
                        type="button"
                        onClick={() => navigate(i.path)}
                        className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[14px] transition ${mainCls} ${rowHover}`}
                      >
                        <ItemIcon size={15} style={{ color: primaryColor }} />
                        {i.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MastersHub;

import { useCallback, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  Search, Building2, Tag, Truck, Package, Coffee, MapPin, FileText, Store, ChevronRight,
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
  { title: "Marketing Subcategories", path: "/masters/marketing-subcategories", group: "accounts" },
];

const GROUPS = [
  { key: "organization", label: "Organization", icon: Building2, tone: "violet", items: ITEMS.filter((i) => i.group === "organization") },
  { key: "catalog", label: "Catalog", icon: Package, tone: "green", items: ITEMS.filter((i) => i.group === "catalog") },
  { key: "vendors", label: "Vendors", icon: Truck, tone: "amber", items: ITEMS.filter((i) => i.group === "vendors") },
  { key: "accounts", label: "Accounts", icon: FileText, tone: "cyan", items: ITEMS.filter((i) => i.group === "accounts") },
];

const GROUP_TONES = {
  violet: { badge: "bg-[#EFECFF] text-[#7367F0]", badgeDark: "bg-[#7367F0]/15 text-[#A5A0FF]", accent: "#7367F0" },
  green:  { badge: "bg-[#E9F9EF] text-[#28C76F]", badgeDark: "bg-[#28C76F]/15 text-[#5EDDA0]", accent: "#28C76F" },
  amber:  { badge: "bg-[#FFF4E5] text-[#FF9F43]", badgeDark: "bg-[#FF9F43]/15 text-[#FFB976]", accent: "#FF9F43" },
  cyan:   { badge: "bg-[#E6FAFD] text-[#00CFE8]", badgeDark: "bg-[#00CFE8]/15 text-[#5FDDF0]", accent: "#00CFE8" },
};

const ITEM_ICONS = {
  "/masters/outlets": Building2,
  "/masters/locations": MapPin,
  "/masters/categories": Tag,
  "/masters/raw-materials": Package,
  "/masters/menu-items": Coffee,
  "/masters/suppliers": Truck,
  "/masters/outlet-vendors": Store,
  "/masters/marketing-subcategories": FileText,
};

const ITEM_MODULES = {
  "/masters/outlets": "outlets",
  "/masters/categories": "categories",
  "/masters/suppliers": "suppliers",
  "/masters/outlet-vendors": "outlet_vendors",
  "/masters/raw-materials": "raw_materials",
  "/masters/menu-items": "menu_items",
  "/masters/locations": "locations",
  "/masters/marketing-subcategories": "masters",
};

const EASE = [0.22, 1, 0.36, 1];

const MastersHub = () => {
  const navigate = useNavigate();
  const { permissions = {}, canAccessMasterRoute } = useOutletContext() || {};
  const [search, setSearch] = useState("");
  const reduceMotion = useReducedMotion();

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white";
  const inputCls = isDark ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6]" : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";
  const rowHover = isDark ? "hover:bg-[#3B405A] focus-visible:bg-[#3B405A]" : "hover:bg-[#F8F7FA] focus-visible:bg-[#F8F7FA]";

  const canAccessItem = useCallback((path) => {
    const moduleKey = ITEM_MODULES[path];
    if (!moduleKey) return false;

    if (typeof canAccessMasterRoute === "function") {
      return canAccessMasterRoute(moduleKey);
    }

    if (moduleKey === "outlet_vendors" || moduleKey === "locations") {
      return Boolean(permissions?.[moduleKey]?.can_view);
    }

    return Boolean(permissions?.[moduleKey]?.can_view || permissions?.canManageMasters);
  }, [canAccessMasterRoute, permissions]);
  const term = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const filtered = GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => canAccessItem(i.path) && (!term || i.title.toLowerCase().includes(term))
      ),
    })).filter((g) => g.items.length > 0);

    return filtered;
  }, [term, canAccessItem]);

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="space-y-5 sm:space-y-6"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${mutedCls}`}>Master Data</p>
          <h1 className={`mt-1 text-2xl font-bold tracking-tight sm:text-[26px] ${mainCls}`}>Masters</h1>
          <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>
            Manage the reference data used across operations, inventory, accounts and outlet workflows.
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search size={16} className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 ${mutedCls}`} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search master data..."
            className={`h-11 w-full rounded-xl border pl-10 pr-3 text-[14px] outline-none transition focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.16)] ${inputCls}`}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className={`flex flex-col items-center justify-center rounded-2xl border py-16 text-center ${cardCls}`}>
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isDark ? "bg-[#3B405A]" : "bg-[#F3F2F7]"}`}>
            <Search size={20} className={mutedCls} />
          </div>
          <p className={`mt-4 text-[15px] font-semibold ${mainCls}`}>No master data found</p>
          <p className={`mt-1 text-[13px] ${mutedCls}`}>Try a different search term.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((g, gi) => {
            const GroupIcon = g.icon;
            const tone = GROUP_TONES[g.tone] || GROUP_TONES.violet;
            return (
              <motion.section
                key={g.key}
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: reduceMotion ? 0 : 0.06 + gi * 0.06, ease: EASE }}
                whileHover={reduceMotion ? undefined : { y: -2 }}
                className={`rounded-2xl border shadow-[0_2px_12px_rgba(47,43,61,0.06)] transition-shadow duration-200 hover:shadow-[0_8px_24px_rgba(47,43,61,0.10)] ${cardCls}`}
              >
                <div className={`flex items-center gap-3 border-b px-5 py-4 ${borderCls}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${isDark ? tone.badgeDark : tone.badge}`}>
                    <GroupIcon size={17} />
                  </span>
                  <div>
                    <h2 className={`text-[13px] font-semibold uppercase tracking-wider ${mainCls}`}>{g.label}</h2>
                    <p className={`text-[11px] ${mutedCls}`}>{g.items.length} {g.items.length === 1 ? "item" : "items"}</p>
                  </div>
                </div>
                <div className="space-y-0.5 p-2.5">
                  {g.items.map((i) => {
                    const ItemIcon = ITEM_ICONS[i.path] || FileText;
                    return (
                      <motion.button
                        key={i.path}
                        type="button"
                        onClick={() => navigate(i.path)}
                        whileHover={reduceMotion ? undefined : { x: 3 }}
                        whileFocus={reduceMotion ? undefined : { x: 3 }}
                        transition={{ duration: 0.15, ease: EASE }}
                        className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#7367F0]/40 ${mainCls} ${rowHover}`}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-150 group-hover:scale-105 ${isDark ? "bg-[#3B405A] text-[#A5A8B6] group-hover:text-[#D0D2D6]" : "bg-[#F3F2F7] text-[#6F6B7D] group-hover:text-[#2F2B3D]"}`}>
                          <ItemIcon size={15} style={{ color: primaryColor }} />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{i.title}</span>
                        <ChevronRight size={15} className={`shrink-0 opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100 ${mutedCls}`} />
                      </motion.button>
                    );
                  })}
                </div>
              </motion.section>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default MastersHub;

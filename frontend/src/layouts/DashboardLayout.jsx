import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
  LogOut,
  User,
  Menu,
  X,
  Package,
  Users,
  ShoppingCart,
  FileText,
  TrendingUp,
  DollarSign,
  ClipboardList,
  Coffee,
  Settings,
  Wallet,
  Search,
  Bell,
  Languages,
  Sun,
  Moon,
  Monitor,
  Circle,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  CalendarDays,
  Grid3X3,
  ClipboardCheck,
  BookOpen,
  ArrowRightLeft,
  Scale,
  Truck,
  ChefHat,
  Trash2,
  BarChart3,
  PackageCheck,
  SlidersHorizontal,
  AlertTriangle,
} from "lucide-react";
import useAuthStore from "../store/authStore";
import { authAPI, masterAPI, notificationAPI } from "../services/api";
import toast from "react-hot-toast";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { displayLabel } from "../utils/displayLabels";

const LOGO_SRC = "/logo.webp";

// Sidebar motion settings adapted from the Animate UI spring/highlight feel.
// Kept intentionally subtle for the Big Bean Café ERP.
const SIDEBAR_SPRING = {
  type: "spring",
  stiffness: 350,
  damping: 35,
  mass: 0.9,
};

const MENU_HIGHLIGHT_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 32,
  mass: 0.8,
};

const SUBMENU_TRANSITION = {
  duration: 0.2,
  ease: [0.25, 0.1, 0.25, 1],
};

const CHEVRON_TRANSITION = {
  duration: 0.18,
  ease: "easeInOut",
};

const normalizeRole = (role = "") => role.trim();

const ALL_OUTLET_ROLES = [
  "Technical Admin",
  "Super Admin",
  "Admin",
  "Developer",
  "Accountant",
  "Warehouse Admin",
  "Central Kitchen Admin",
  "Viewer / Auditor",
  "Viewer Auditor",
  "Viewer",
];

const LOCKED_OUTLET_ROLES = ["Outlet Manager", "Outlet Admin", "Outlet Staff"];

const buildPermissions = (roleName = "User") => {
  const role = normalizeRole(roleName);
  const isTechnical = role === "Technical Admin";
  const isSuper = role === "Super Admin";
  const isLegacyAdmin = role === "Admin" || role === "Developer";
  const isAccountant = role === "Accountant";
  const isWarehouseAdmin = role === "Warehouse Admin";
  const isCentralKitchenAdmin = role === "Central Kitchen Admin";
  const isManager = role === "Outlet Manager" || role === "Outlet Admin";
  const isStaff = role === "Outlet Staff";
  const isViewer = role === "Viewer / Auditor" || role === "Viewer Auditor" || role === "Viewer";
  const canAccessAllOutlets = ALL_OUTLET_ROLES.includes(role);
  const isReadOnly = isViewer;

  return {
    roleName: role,
    canAccessAllOutlets,
    isOutletLocked: LOCKED_OUTLET_ROLES.includes(role) || role === "Outlet Admin",
    isReadOnly,
    canManageUsers: isSuper || isLegacyAdmin || isTechnical,
    canManageRoles: isSuper || isLegacyAdmin || isTechnical,
    canManageOutlets: isSuper || isLegacyAdmin || isTechnical,
    canManageMasters: isSuper || isLegacyAdmin || isTechnical || isWarehouseAdmin,
    canDeleteMaster: isSuper,
    canCreateCashbook: isSuper || isLegacyAdmin || isManager,
    canSubmitCashbook: isSuper || isLegacyAdmin || isManager,
    canVerifyCashbook: isSuper || isLegacyAdmin || isAccountant,
    canCreateExpense: isSuper || isLegacyAdmin || isManager || isStaff,
    canSubmitExpense: isSuper || isLegacyAdmin || isManager,
    canApproveExpense: isSuper || isLegacyAdmin || isAccountant,
    canRejectExpense: isSuper || isLegacyAdmin || isAccountant,
    canUploadStock: isSuper || isLegacyAdmin || isTechnical || isManager,
    canUploadPurchase: isSuper || isLegacyAdmin || isTechnical || isManager,
    canUploadSales: isSuper || isLegacyAdmin || isTechnical,
    canViewPayroll: isSuper || isLegacyAdmin || isTechnical || isAccountant || isManager || isViewer,
    canCreatePayroll: isSuper || isLegacyAdmin || isAccountant,
    canSubmitPayroll: isSuper || isLegacyAdmin || isManager,
    canVerifyPayroll: isSuper || isLegacyAdmin || isAccountant,
    canApprovePayroll: isSuper || isLegacyAdmin,
    canViewPayouts: isSuper || isLegacyAdmin || isTechnical || isAccountant || isManager || isViewer,
    canManagePayouts: isSuper || isLegacyAdmin || isAccountant,
    canViewReports: !isStaff,
    canViewPL: !isStaff && (isSuper || isLegacyAdmin || isTechnical || isAccountant || isManager || isViewer),
    canViewCompanyPL: isSuper || isLegacyAdmin || isTechnical || isAccountant || isViewer,
    canLockDay: isSuper || isLegacyAdmin,
    canLockMonth: isSuper || isLegacyAdmin || isAccountant,
    canEmergencyCorrect: isTechnical,
    isWarehouseAdmin,
    isCentralKitchenAdmin,
  };
};

const defaultOutlets = [
  { id: "rr-nagar", outlet_name: "RR Nagar", outlet_code: "RR" },
  { id: "koramangala", outlet_name: "Koramangala", outlet_code: "KOR" },
  { id: "m5-ecity", outlet_name: "M5 E-City", outlet_code: "M5" },
  { id: "hsr-layout", outlet_name: "HSR Layout", outlet_code: "HSR" },
  { id: "jayanagar", outlet_name: "Jayanagar", outlet_code: "JYN" },
  { id: "indiranagar", outlet_name: "Indiranagar", outlet_code: "IND" },
  { id: "kammanahalli", outlet_name: "Kammanahalli", outlet_code: "KAM" },
];

const PRIMARY_COLORS = [
  { name: "Purple", value: "#7367F0" },
  { name: "Teal", value: "#00A39A" },
  { name: "Orange", value: "#FF9F43" },
  { name: "Rose", value: "#EA5455" },
  { name: "Blue", value: "#2096F3" },
];

const LANGUAGES = {
  en: {
    name: "English",
    dashboard: "Dashboard",
    users: "User Management",
    masters: "Masters",
    outlets: "Outlets",
    categories: "Categories",
    suppliers: "Suppliers",
    outletVendors: "Third Party Vendors",
    rawMaterials: "Raw Materials",
    menuItems: "Menu Items",
    locationManagement: "Location Management",
    dailyAccounts: "Daily Outlet Accounts",
    cashbook: "Daily Cashbook",
    expenses: "Daily Cash Expenses",
    bankDeposits: "Bank Deposits",
    dayClosing: "Day Closing",
    checklist: "Daily Checklist",
    vendorPurchases: "Third Party Purchases",
    payroll: "Payroll & Fixed Costs",
    employeeSalary: "Employee Salary",
    utilityBills: "Utility Bills",
    fixedCosts: "Fixed Costs",
    stock: "Stock",
    openingStock: "Opening Stock Upload",
    closingStock: "Closing Stock Upload",
    purchases: "Purchases",
    materialPurchase: "Material Purchase Upload",
    supplierPayments: "Supplier Payments",
    sales: "Sales",
    itemSales: "Item-wise Sales Upload",
    dailySalesUpload: "Daily Sales Upload",
    monthlySalesUpload: "Monthly Sales Upload",
    itemTaxUpload: "Item Tax Report",
    recipe: "Recipe / SOP",
    recipeList: "Recipe List",
    addRecipe: "Add Recipe",
    payouts: "Month-End Entries",
    onlinePayouts: "Online Order Payouts",
    dineInPayouts: "Dine-in Portal Payouts",
    reports: "Reports",
    dailyCashbookReport: "Daily Cashbook Report",
    expenseReport: "Expense Report",
    actualConsumption: "Actual Consumption Report",
    theoreticalConsumption: "Theoretical Consumption Report",
    supplierPending: "Supplier Outstanding Report",
    consumptionVariance: "Consumption Variance Report",
    purchaseGST: "Purchase GST Report",
    salesGST: "Sales GST Report",
    gstr1: "GSTR-1 Report",
    outletComparison: "Outlet Comparison Report",
    monthlyPL: "Monthly Outlet P&L",
    warehouse: "Warehouse",
    warehouseDashboard: "Dashboard",
    warehouseCurrentStock: "Current Stock",
    warehouseGRN: "Goods Receipt",
    warehouseLedger: "Stock Ledger",
    warehouseBatchExpiry: "Batch & Expiry",
    warehousePurchaseReturns: "Purchase Returns",
    warehouseRequisitions: "Outlet Purchase Orders",
    warehouseTransfers: "Transfers",
    warehousePhysicalCount: "Physical Stock Count",
    warehouseAdjustments: "Stock Adjustments",
    warehouseWastage: "Wastage & Damage",
    warehousePurchaseOrders: "Warehouse Purchase Orders",
    warehouseSupplierHistory: "Supplier History",
    warehouseReorder: "Low Stock / Reorder",
    warehouseReports: "Reports",
    warehouseSettings: "Settings",
    centralKitchen: "Bakehouse",
    centralKitchenDashboard: "Dashboard",
    centralKitchenRequests: "Requests",
    centralKitchenPlanning: "Planning",
    centralKitchenBatches: "Batches",
    centralKitchenWastage: "Wastage",
    centralKitchenVariance: "Variance",
    centralKitchenDispatches: "Dispatches",
    centralKitchenFinishedStock: "Finished Stock",
    receiveDispatch: "Receive Dispatch",
    search: "Search ⌘K",
    popularSearches: "Popular Searches",
    apps: "Apps",
    pages: "Pages",
    reportsLabel: "Reports",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    profile: "My Profile",
    settings: "Settings",
    logout: "Logout",
    themeCustomizer: "Theme Customizer",
    customizePreview: "Customize & Preview in Real Time",
    theming: "Theming",
    primaryColor: "Primary Color",
    mode: "Mode",
    skin: "Skin",
    defaultSkin: "Default",
    borderedSkin: "Bordered",
    semiDark: "Semi Dark",
    layout: "Layout",
    layouts: "Layouts",
    vertical: "Vertical",
    collapsed: "Collapsed",
    horizontal: "Horizontal",
    content: "Content",
    compact: "Compact",
    wide: "Wide",
  },
};

const getStored = () => ({
  language: localStorage.getItem("bbc_language") || "en",
  primaryColor: localStorage.getItem("bbc_primary_color") || "#7367F0",
  themeMode: localStorage.getItem("bbc_theme_mode") || "light",
  skin: localStorage.getItem("bbc_skin") || "default",
  semiDark: localStorage.getItem("bbc_semi_dark") === "true",
  layout: localStorage.getItem("bbc_layout") || "vertical",
  content: localStorage.getItem("bbc_content") || "compact",
});

const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)   return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

const DashboardLayout = () => {
  const stored = getStored();
  const prefersReducedSidebarMotion = useReducedMotion();

  const [language, setLanguage] = useState(stored.language);
  const [primaryColor, setPrimaryColor] = useState(stored.primaryColor);
  const [themeMode, setThemeMode] = useState(stored.themeMode);
  const [skin, setSkin] = useState(stored.skin);
  const [semiDark, setSemiDark] = useState(stored.semiDark);
  const [layout, setLayout] = useState(stored.layout);
  const [content, setContent] = useState(stored.content);

  const [expandedMenus, setExpandedMenus] = useState({});
  const [languageOpen, setLanguageOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileModelOpen, setProfileModelOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [outlets, setOutlets] = useState(defaultOutlets);
  const [selectedOutletId, setSelectedOutletId] = useState(
    localStorage.getItem("bbc_selected_outlet_id") || "all"
  );

  const sidebarNavRef = useRef(null);
  const stableScrollRef = useRef({
    pageTop: 0,
    pageLeft: 0,
    sidebarTop: 0,
  });

  const getWindowScrollTop = () =>
    window.scrollY ||
    window.pageYOffset ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0;

  const saveStableScroll = () => {
    stableScrollRef.current = {
      pageTop: getWindowScrollTop(),
      pageLeft: window.scrollX || window.pageXOffset || 0,
      sidebarTop: sidebarNavRef.current?.scrollTop || 0,
    };

    try {
      sessionStorage.setItem(
        "bbc_layout_scroll_snapshot",
        JSON.stringify(stableScrollRef.current)
      );
    } catch {
      // ignore storage issues
    }
  };

  const restoreStableScroll = () => {
    let snapshot = stableScrollRef.current;

    try {
      const saved = sessionStorage.getItem("bbc_layout_scroll_snapshot");
      if (saved) {
        snapshot = { ...snapshot, ...JSON.parse(saved) };
      }
    } catch {
      // ignore storage issues
    }

    const applyScroll = () => {
      if (sidebarNavRef.current) {
        sidebarNavRef.current.scrollTop = snapshot.sidebarTop || 0;
      }
    };

    requestAnimationFrame(() => {
      applyScroll();
      requestAnimationFrame(() => {
        applyScroll();
        setTimeout(applyScroll, 80);
      });
    });
  };

  const runWithoutScrollJump = (callback) => {
    saveStableScroll();
    callback?.();
    restoreStableScroll();
  };

  const [prefersDark, setPrefersDark] = useState(
    window.matchMedia?.("(prefers-color-scheme: dark)")?.matches || false
  );

  const { user, logout, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  const t = LANGUAGES[language] || LANGUAGES.en;

  const isDark = themeMode === "dark" || (themeMode === "system" && prefersDark);
  const isBordered = skin === "bordered";
  const isHorizontal = layout === "horizontal";
  const sidebarOpen = layout !== "collapsed";
  const effectiveSidebarDark = isDark || semiDark;

  const roleName = user?.role_name || user?.role || "User";
  const dbPermissions = user?.permissions || {};
  const legacyPermissions = useMemo(() => buildPermissions(roleName), [roleName]);
  const permissions = useMemo(
    () => ({
      ...legacyPermissions,
      ...dbPermissions,
      canAccessAllOutlets: legacyPermissions.canAccessAllOutlets,
      isOutletLocked: legacyPermissions.isOutletLocked,
      isReadOnly: legacyPermissions.isReadOnly || Object.values(dbPermissions).some((item) => item?.is_read_only),
    }),
    [dbPermissions, legacyPermissions]
  );
  const canView = (moduleKey) => Boolean(dbPermissions?.[moduleKey]?.can_view);
  const legacyCanView = (moduleKey, fallback = false) =>
    legacyPermissions?.[moduleKey]?.can_view ?? fallback;
  const fullName = user?.full_name || user?.name || "Big Bean User";
  const email = user?.email || "admin@bigbean.local";
  const phone = user?.phone || user?.mobile || "-";
  const initial = fullName?.charAt(0)?.toUpperCase() || "U";
  const outletName =
    user?.outlet_name ||
    user?.outlets?.[0]?.outlet_name ||
    user?.assigned_outlet ||
    "All Outlets";

  const appClass = isDark
    ? "bg-[#25293C] text-[#D0D2D6]"
    : "bg-[#F8F7FA] text-[#2F2B3D]";

  const cardClass = isDark
    ? "bg-[#2F3349] border-[#3B405A] text-[#D0D2D6]"
    : "bg-white border-[#DBDADE] text-[#2F2B3D]";

  const sideClass = effectiveSidebarDark
    ? "bg-[#2F3349] border-[#3B405A]"
    : "bg-white border-[#DBDADE]";

  const textMuted = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const textMain = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const contentWidthClass = content === "compact" ? "max-w-[1440px]" : "max-w-none";

  const unreadCount = notifications.filter((item) => !item.is_read).length;

  const assignedOutlets = Array.isArray(user?.outlets)
    ? user.outlets.map((item) =>
        typeof item === "object"
          ? item
          : { id: item, outlet_name: user?.outlet_name || `Outlet ${item}` }
      )
    : [];

  const availableOutlets = permissions.canAccessAllOutlets ? outlets : assignedOutlets;

  const selectedOutlet =
    selectedOutletId === "all"
      ? { id: "all", outlet_name: "All Outlets" }
      : [...availableOutlets, ...outlets].find(
          (item) => String(item.id) === String(selectedOutletId)
        );

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return undefined;

    const handler = (event) => setPrefersDark(event.matches);
    media.addEventListener?.("change", handler);

    return () => media.removeEventListener?.("change", handler);
  }, []);

  useEffect(() => {
    localStorage.setItem("bbc_language", language);
    localStorage.setItem("bbc_primary_color", primaryColor);
    localStorage.setItem("bbc_theme_mode", themeMode);
    localStorage.setItem("bbc_skin", skin);
    localStorage.setItem("bbc_semi_dark", String(semiDark));
    localStorage.setItem("bbc_layout", layout);
    localStorage.setItem("bbc_content", content);
  }, [language, primaryColor, themeMode, skin, semiDark, layout, content]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const fetchNotifications = async () => {
    try {
      setNotificationsLoading(true);
      const res = await notificationAPI.getNotifications({ limit: 50 });
      if (res.data?.success) setNotifications(res.data.data || []);
    } catch {
      // silent — bell stays empty on error
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncUser = async () => {
      try {
        const response = await authAPI.me();
        const nextUser = response.data?.user || response.data?.data;
        if (nextUser) {
          updateUser(nextUser);
        }
      } catch {
        return undefined;
      }
    };

    syncUser();
  }, [updateUser]);

  useEffect(() => {
    localStorage.setItem("bbc_permissions", JSON.stringify(permissions));
    window.dispatchEvent(
      new CustomEvent("bbc:permissions-change", {
        detail: permissions,
      })
    );
  }, [permissions]);

  useEffect(() => {
    const loadOutlets = async () => {
      try {
        const response = await masterAPI.getOutlets();
        const apiOutlets = response.data?.data || response.data?.outlets || response.data || [];
        if (Array.isArray(apiOutlets) && apiOutlets.length > 0) {
          setOutlets(apiOutlets);
        }
      } catch {
        setOutlets(defaultOutlets);
      }
    };

    loadOutlets();
  }, []);

  useEffect(() => {
    let nextOutletId = selectedOutletId;
    if (permissions.isOutletLocked) {
      nextOutletId = user?.outlets?.[0]?.id || user?.outlets?.[0] || user?.outlet_id || "";
    } else if (!nextOutletId) {
      nextOutletId = "all";
    }

    if (nextOutletId && String(nextOutletId) !== String(selectedOutletId)) {
      setSelectedOutletId(nextOutletId);
      return;
    }

    if (nextOutletId) {
      localStorage.setItem("bbc_selected_outlet_id", nextOutletId);
      window.dispatchEvent(
        new CustomEvent("bbc:selected-outlet-change", {
          detail: nextOutletId,
        })
      );
    }
  }, [permissions.isOutletLocked, selectedOutletId, user]);

  useEffect(() => {
    const keyHandler = (event) => {
      const isSearchKey =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";

      if (isSearchKey) {
        event.preventDefault();
        setSearchOpen(true);
      }

      if (event.key === "Escape") {
        setSearchOpen(false);
        setLanguageOpen(false);
        setThemeOpen(false);
        setProfileOpen(false);
        setProfileModelOpen(false);
        setNotificationOpen(false);
        setCustomizerOpen(false);
      }
    };

    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, []);

  const menuItems = useMemo(() => {
    const items = [
      {
        key: "dashboard",
        title: t.dashboard,
        icon: LayoutDashboard,
        path: "/",
        section: "Overview",
        show: canView("dashboard", legacyCanView("dashboard", true)),
      },
      {
        key: "users",
        title: "User Management",
        icon: Users,
        section: "Administration",
        show: canView("users", permissions.canManageUsers) || canView("role_access", false),
        submenu: [
          ...(canView("users", permissions.canManageUsers) ? [{ title: t.users, path: "/users" }] : []),
          ...(canView("role_access", roleName === "Super Admin" || roleName === "Technical Admin") ? [{ title: "Role Access", path: "/role-access" }] : []),
        ],
      },
      {
        key: "masters",
        title: t.masters,
        icon: Settings,
        section: "Administration",
        show: canView("outlets") || canView("categories") || canView("suppliers") || canView("outlet_vendors") || canView("raw_materials") || canView("menu_items") || canView("locations"),
        submenu: [
          ...((canView("outlets") || canView("categories") || canView("suppliers") || canView("outlet_vendors") || canView("raw_materials") || canView("menu_items") || canView("locations")) ? [{ title: "All Masters", path: "/masters" }] : []),
          ...(canView("outlets", legacyCanView("outlets", permissions.canManageMasters)) ? [{ title: t.outlets, path: "/masters/outlets" }] : []),
          ...(canView("categories", legacyCanView("categories", permissions.canManageMasters)) ? [{ title: t.categories, path: "/masters/categories" }] : []),
          ...(canView("suppliers", legacyCanView("suppliers", permissions.canManageMasters)) ? [{ title: t.suppliers, path: "/masters/suppliers" }] : []),
          ...(canView("outlet_vendors") ? [{ title: t.outletVendors, path: "/masters/outlet-vendors" }] : []),
          ...(canView("raw_materials", legacyCanView("raw_materials", permissions.canManageMasters)) ? [{ title: t.rawMaterials, path: "/masters/raw-materials" }] : []),
          ...(canView("menu_items", legacyCanView("menu_items", permissions.canManageMasters)) ? [{ title: t.menuItems, path: "/masters/menu-items" }] : []),
          ...(canView("locations") ? [{ title: t.locationManagement, path: "/masters/locations" }] : []),
        ],
      },
      {
        key: "daily",
        title: t.dailyAccounts,
        icon: ClipboardList,
        section: "Daily Operations",
        show: canView("daily_cashbook", legacyCanView("daily_cashbook", permissions.canCreateCashbook)) || canView("daily_expenses", legacyCanView("daily_expenses", permissions.canCreateExpense)) || canView("bank_deposits", false) || canView("day_closing", legacyCanView("day_closing", permissions.canSubmitCashbook)) || canView("daily_checklist", legacyCanView("daily_checklist", false)) || canView("outlet_vendors"),
        submenu: [
          ...(canView("daily_cashbook", legacyCanView("daily_cashbook", permissions.canCreateCashbook)) ? [{ title: t.cashbook, path: "/daily-accounts/cashbook" }] : []),
          ...(canView("daily_expenses", legacyCanView("daily_expenses", permissions.canCreateExpense)) ? [{ title: t.expenses, path: "/daily-accounts/expenses" }] : []),
          ...(canView("bank_deposits", false) ? [{ title: t.bankDeposits, path: "/daily-accounts/bank-deposits" }] : []),
          ...(canView("day_closing", legacyCanView("day_closing", permissions.canSubmitCashbook)) ? [{ title: t.dayClosing, path: "/daily-accounts/day-closing" }] : []),
          ...(canView("daily_checklist", legacyCanView("daily_checklist", false)) ? [{ title: t.checklist, path: "/daily-accounts/checklist" }] : []),
          ...(canView("outlet_vendors") ? [{ title: t.vendorPurchases, path: "/daily-accounts/vendor-purchases" }] : []),
        ],
      },
      {
        key: "payroll",
        title: t.payroll,
        icon: Wallet,
        section: "Finance",
        show: canView("payroll", permissions.canViewPayroll) || canView("utility_bills", false) || canView("fixed_costs", false),
        submenu: [
          ...(canView("payroll", permissions.canViewPayroll) ? [{ title: t.employeeSalary, path: "/payroll/employee-salary" }] : []),
          ...(canView("utility_bills", false) ? [{ title: t.utilityBills, path: "/month-end/utility-bills" }] : []),
          ...(canView("fixed_costs", false) ? [{ title: t.fixedCosts, path: "/month-end/fixed-costs" }] : []),
        ],
      },
      {
        key: "stock",
        title: t.stock,
        icon: Package,
        section: "Daily Operations",
        show: canView("opening_stock", permissions.canUploadStock || roleName === "Outlet Manager" || roleName === "Outlet Admin" || permissions.isReadOnly) || canView("closing_stock", false),
        submenu: [
          ...(canView("opening_stock", legacyCanView("opening_stock", permissions.canUploadStock || permissions.isReadOnly)) ? [{ title: t.openingStock, path: "/stock/opening-stock" }] : []),
          ...(canView("closing_stock", legacyCanView("closing_stock", permissions.canUploadStock || permissions.isReadOnly)) ? [{ title: t.closingStock, path: "/stock/closing-stock" }] : []),
        ],
      },
      {
        key: "purchases",
        title: t.purchases,
        icon: ShoppingCart,
        section: "Daily Operations",
        show: canView("material_purchase", permissions.canUploadPurchase || roleName === "Outlet Manager" || roleName === "Outlet Admin" || permissions.isReadOnly) || canView("supplier_payments", false),
        submenu: [
          ...(canView("material_purchase") ? [{ title: t.materialPurchase, path: "/purchases/material-purchase" }] : []),
          ...(canView("supplier_payments") ? [{ title: t.supplierPayments, path: "/purchases/supplier-payments" }] : []),
        ],
      },
      {
        key: "sales",
        title: t.sales,
        icon: TrendingUp,
        section: "Daily Operations",
        show: canView("item_sales") || canView("item_sales_daily") || canView("item_sales_monthly") || canView("item_sales_tax"),
        submenu: [
          ...(canView("item_sales") ? [{ title: t.itemSales, path: "/sales/item-sales" }] : []),
          ...(canView("item_sales_daily") ? [{ title: t.dailySalesUpload, path: "/sales/daily-upload" }] : []),
          ...(canView("item_sales_monthly") ? [{ title: t.monthlySalesUpload, path: "/sales/monthly-upload" }] : []),
          ...(canView("item_sales_tax") ? [{ title: t.itemTaxUpload, path: "/sales/item-tax-upload" }] : []),
        ],
      },
      {
        key: "recipe",
        title: t.recipe,
        icon: Coffee,
        section: "Inventory & Production",
        show: canView("recipe_list", roleName !== "Outlet Staff" && roleName !== "Outlet Manager" && roleName !== "Outlet Admin"),
        submenu: [
          ...(canView("recipe_list", legacyCanView("recipe_list", roleName !== "Outlet Staff")) ? [{ title: t.recipeList, path: "/recipes" }] : []),
          ...(canView("add_recipe", !permissions.isReadOnly) ? [{ title: t.addRecipe, path: "/recipes/new" }] : []),
        ],
      },
      {
        key: "payouts",
        title: t.payouts,
        icon: DollarSign,
        section: "Finance",
        show: canView("online_payouts", permissions.canViewPayouts) || canView("dine_in_payouts", permissions.canViewPayouts),
        submenu: [
          ...(canView("online_payouts", legacyCanView("online_payouts", permissions.canViewPayouts)) ? [{ title: t.onlinePayouts, path: "/payouts/online" }] : []),
          ...(canView("dine_in_payouts", legacyCanView("dine_in_payouts", permissions.canViewPayouts)) ? [{ title: t.dineInPayouts, path: "/payouts/dine-in" }] : []),
        ],
      },
      {
        key: "reports",
        title: t.reports,
        icon: FileText,
        section: "Finance",
        show: canView("reports", legacyCanView("reports", permissions.canViewReports)) || canView("monthly_pl", legacyCanView("monthly_pl", permissions.canViewPL)),
        submenu: [
          ...(canView("reports", legacyCanView("reports", permissions.canViewReports)) || canView("monthly_pl", legacyCanView("monthly_pl", permissions.canViewPL)) ? [{ title: "All Reports", path: "/reports" }] : []),
          ...(canView("reports", legacyCanView("reports", permissions.canViewReports)) ? [{ title: t.dailyCashbookReport, path: "/reports/daily-cashbook" }] : []),
          ...(canView("reports", legacyCanView("reports", permissions.canViewReports)) ? [{ title: t.expenseReport, path: "/reports/expense-report" }] : []),
          ...(canView("reports", legacyCanView("reports", permissions.canViewReports)) ? [{ title: t.actualConsumption, path: "/reports/actual-consumption" }] : []),
          ...(canView("reports", legacyCanView("reports", permissions.canViewReports)) ? [{ title: t.theoreticalConsumption, path: "/reports/theoretical-consumption" }] : []),
          ...(canView("reports", legacyCanView("reports", permissions.canViewReports)) ? [{ title: t.supplierPending, path: "/reports/supplier-pending" }] : []),
          ...(canView("reports", legacyCanView("reports", permissions.canViewReports)) ? [{ title: t.purchaseGST, path: "/reports/purchase-gst" }] : []),
          ...(canView("reports", legacyCanView("reports", permissions.canViewReports)) ? [{ title: t.salesGST, path: "/reports/sales-gst" }] : []),
          ...(canView("reports", legacyCanView("reports", permissions.canViewReports)) ? [{ title: t.gstr1, path: "/reports/gstr1" }] : []),
          ...(canView("reports", legacyCanView("reports", permissions.canViewReports)) ? [{ title: t.consumptionVariance, path: "/reports/consumption-variance" }] : []),
          ...(canView("monthly_pl", permissions.canViewPL) ? [{ title: t.monthlyPL, path: "/reports/monthly-pl" }] : []),
          ...(canView("monthly_pl", permissions.canViewPL) ? [{ title: t.outletComparison, path: "/reports/outlet-comparison" }] : []),
        ],
      },
      {
        key: "warehouse",
        title: t.warehouse,
        icon: Package,
        section: "Inventory & Production",
        show: canView("warehouse_dashboard") || canView("warehouse_stock") || canView("grn") || canView("warehouse_requisitions") || canView("warehouse_transfers"),
        submenu: [
          ...(canView("warehouse_dashboard") ? [{ title: t.warehouseDashboard, path: "/warehouse/dashboard", icon: LayoutDashboard }] : []),
          ...(canView("warehouse_stock") ? [{ title: t.warehouseCurrentStock, path: "/warehouse/current-stock", icon: Package }] : []),
          ...(canView("grn") ? [{ title: t.warehouseGRN, path: "/warehouse/grn", icon: ClipboardCheck }] : []),
          ...(canView("warehouse_ledger") ? [{ title: t.warehouseLedger, path: "/warehouse/ledger", icon: BookOpen }] : []),
          ...(canView("warehouse_requisitions") ? [{ title: t.warehouseRequisitions, path: "/warehouse/requisitions", icon: ClipboardList }] : []),
          ...(canView("warehouse_transfers") ? [{ title: t.warehouseTransfers, path: "/warehouse/transfers", icon: ArrowRightLeft }] : []),
          ...(canView("warehouse_batch_expiry") ? [{ title: t.warehouseBatchExpiry, path: "/warehouse/batch-expiry", icon: Scale }] : []),
          ...(canView("warehouse_purchase_returns") ? [{ title: t.warehousePurchaseReturns, path: "/warehouse/purchase-returns", icon: Truck }] : []),
          ...(canView("physical_stock_counts") ? [{ title: t.warehousePhysicalCount, path: "/warehouse/physical-stock-counts", icon: Scale }] : []),
          ...(canView("stock_adjustments") ? [{ title: t.warehouseAdjustments, path: "/warehouse/stock-adjustments", icon: SlidersHorizontal }] : []),
          ...(canView("warehouse_wastage") ? [{ title: t.warehouseWastage, path: "/warehouse/warehouse-wastage", icon: Trash2 }] : []),
          ...(canView("warehouse_purchase_orders") ? [{ title: t.warehousePurchaseOrders, path: "/warehouse/purchase-orders", icon: FileText }] : []),
          ...(canView("warehouse_supplier_history") ? [{ title: t.warehouseSupplierHistory, path: "/warehouse/supplier-history", icon: TrendingUp }] : []),
          ...(canView("warehouse_reorder") ? [{ title: t.warehouseReorder, path: "/warehouse/low-stock-reorder", icon: AlertTriangle }] : []),
          ...(canView("warehouse_reports") ? [{ title: t.warehouseReports, path: "/warehouse/reports", icon: BookOpen }] : []),
          ...(canView("warehouse_settings") ? [{ title: t.warehouseSettings, path: "/warehouse/settings", icon: Settings }] : []),
        ],
      },
      {
        key: "central-kitchen",
        title: t.centralKitchen,
        icon: ChefHat,
        section: "Inventory & Production",
        show: canView("production_dashboard") || canView("production_requests") || canView("production_planning") || canView("production_batches") || canView("production_wastage") || canView("production_variance") || canView("production_dispatch"),
        submenu: [
          ...(canView("production_dashboard") ? [{ title: t.centralKitchenDashboard, path: "/central-kitchen/dashboard", icon: LayoutDashboard }] : []),
          ...(canView("production_requests") ? [{ title: t.centralKitchenRequests, path: "/central-kitchen/requests", icon: ClipboardList }] : []),
          ...(canView("production_planning") ? [{ title: t.centralKitchenPlanning, path: "/central-kitchen/plans", icon: ChefHat }] : []),
          ...(canView("production_batches") ? [{ title: t.centralKitchenBatches, path: "/central-kitchen/batches", icon: Package }] : []),
          ...(canView("production_wastage") ? [{ title: t.centralKitchenWastage, path: "/central-kitchen/wastage", icon: Trash2 }] : []),
          ...(canView("production_variance") ? [{ title: t.centralKitchenVariance, path: "/central-kitchen/variance", icon: BarChart3 }] : []),
          ...(canView("production_dispatch") ? [{ title: t.centralKitchenDispatches, path: "/central-kitchen/dispatches", icon: Truck }] : []),
        ],
      },
      {
        key: "receive-dispatch",
        title: t.receiveDispatch,
        icon: PackageCheck,
        path: "/central-kitchen-receive",
        section: "Inventory & Production",
        // Standalone (not nested under Central Kitchen) so outlet staff who only have
        // production_dispatch access - not the CK dashboard/planning modules - still see it.
        show: canView("production_dispatch"),
      },
    ];

    // Group into PetPooja-style labeled clusters: same-section items must sit
    // adjacent to each other, or the sidebar re-prints the section label every
    // time it reappears instead of once per cluster. Array.prototype.sort is
    // stable, so relative order within a section is preserved.
    const SECTION_ORDER = ["Overview", "Daily Operations", "Inventory & Production", "Finance", "Administration"];
    return items.slice().sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section));
  }, [permissions, roleName, t]);

  useEffect(() => {
    const activeMenus = {};
    menuItems.forEach((item) => {
      if (item.submenu?.some((sub) => sub.path === location.pathname)) {
        activeMenus[item.key] = true;
      }
    });

    setExpandedMenus((prev) => ({ ...prev, ...activeMenus }));
  }, [location.pathname, menuItems]);

  useLayoutEffect(() => {
    restoreStableScroll();
  }, [location.pathname]);

  useEffect(() => {
    restoreStableScroll();
  }, [expandedMenus]);

  const hasAccess = (roles = []) => {
    if (roles.includes("all")) return true;
    return roles.includes(roleName);
  };

  const canShowMenu = (item) => item.show !== false && hasAccess(item.roles || ["all"]);

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname === path;
  };

  const isParentActive = (item) => {
    if (item.path) return isActive(item.path);
    return item.submenu?.some((sub) => isActive(sub.path));
  };

  const routeModuleMap = {
    "/": "dashboard",
    "/users": "users",
    "/role-access": "role_access",
    "/masters/outlets": "outlets",
    "/masters/categories": "categories",
    "/masters/suppliers": "suppliers",
    "/masters/raw-materials": "raw_materials",
    "/masters/menu-items": "menu_items",
    "/daily-accounts/cashbook": "daily_cashbook",
    "/daily-accounts/expenses": "daily_expenses",
    "/daily-accounts/bank-deposits": "bank_deposits",
    "/daily-accounts/day-closing": "day_closing",
    "/daily-accounts/checklist": "daily_checklist",
    "/payroll/employee-salary": "payroll",
    "/month-end/utility-bills": "utility_bills",
    "/month-end/fixed-costs": "fixed_costs",
    "/stock/opening-stock": "opening_stock",
    "/stock/closing-stock": "closing_stock",
    "/purchases/material-purchase": "material_purchase",
    "/purchases/supplier-payments": "supplier_payments",
    "/sales/item-sales": "item_sales",
    "/sales/daily-upload": "item_sales_daily",
    "/sales/monthly-upload": "item_sales_monthly",
    "/sales/item-tax-upload": "item_sales_tax",
    "/recipes": "recipe_list",
    "/recipes/new": "add_recipe",
    "/payouts/online": "online_payouts",
    "/payouts/dine-in": "dine_in_payouts",
    "/reports/daily-cashbook": "reports",
    "/reports/expense-report": "reports",
    "/reports/actual-consumption": "reports",
    "/reports/theoretical-consumption": "reports",
    "/reports/supplier-pending": "reports",
    "/reports/purchase-gst": "reports",
    "/reports/sales-gst": "reports",
    "/reports/gstr1": "reports",
    "/reports/consumption-variance": "reports",
    "/reports/monthly-pl": "monthly_pl",
    "/reports/outlet-comparison": "monthly_pl",
    "/warehouse": "warehouse_dashboard",
  };

  useEffect(() => {
    const moduleKey = routeModuleMap[location.pathname];
    if (moduleKey && !canView(moduleKey)) {
      navigate("/", { replace: true });
    }
  }, [location.pathname, dbPermissions]);

  const searchItems = useMemo(() => {
    const items = [];

    menuItems.forEach((item) => {
      if (!canShowMenu(item)) return;

      if (item.path) {
        items.push({
          title: item.title,
          group: "Main",
          path: item.path,
          icon: item.icon,
        });
      }

      item.submenu?.forEach((sub) => {
        items.push({
          title: sub.title,
          group: item.title,
          path: sub.path,
          icon: item.icon,
        });
      });
    });

    return items;
  }, [menuItems, roleName]);

  const filteredSearch = useMemo(() => {
    if (!query.trim()) return searchItems.slice(0, 12);

    return searchItems
      .filter((item) =>
        `${item.title} ${item.group}`.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 12);
  }, [query, searchItems]);

  const markNotificationAsRead = async (id, navPath) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, is_read: 1 } : item))
    );
    try { await notificationAPI.markAsRead(id); } catch { /* ignore */ }
    if (navPath) navigate(navPath);
  };

  const markAllNotificationsRead = async () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: 1 })));
    try {
      await notificationAPI.markAllAsRead();
      toast.success("All notifications marked as read");
    } catch { /* ignore */ }
  };

  const getNotificationIcon = (type) => {
    if (type === "success") return CheckCircle2;
    if (type === "warning") return AlertCircle;
    if (type === "danger")  return AlertCircle;
    return Bell;
  };

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    navigate("/login", { replace: true });
  };

  const goTo = (path) => {
    saveStableScroll();

    navigate(path, {
      preventScrollReset: true,
    });

    setSearchOpen(false);
    setQuery("");
    setMobileOpen(false);

    setTimeout(restoreStableScroll, 0);
  };

  const selectOutlet = (nextOutletId) => {
    setSelectedOutletId(nextOutletId);
    localStorage.setItem("bbc_selected_outlet_id", nextOutletId);
    window.dispatchEvent(
      new CustomEvent("bbc:selected-outlet-change", {
        detail: nextOutletId,
      })
    );
  };

  const handleOutletChange = (event) => {
    selectOutlet(event.target.value);
  };

  const resetCustomizer = () => {
    setLanguage("en");
    setPrimaryColor("#7367F0");
    setThemeMode("light");
    setSkin("default");
    setSemiDark(false);
    setLayout("vertical");
    setContent("compact");
    toast.success("Theme settings reset");
  };

  const activeStyle = {
    backgroundColor: primaryColor,
    color: "#fff",
    boxShadow: `0 3px 12px ${primaryColor}55`,
  };

  const subActiveStyle = {
    backgroundColor: `${primaryColor}18`,
    color: primaryColor,
  };

  const closeTopDropdowns = () => {
    setLanguageOpen(false);
    setThemeOpen(false);
    setProfileOpen(false);
    setNotificationOpen(false);
  };

  const OptionCard = ({ active, title, children, onClick }) => (
    <button type="button" onClick={onClick} className="text-left">
      <div
        className="flex h-[68px] w-[135px] items-center justify-center rounded-md border bg-[#F8F7FA] transition"
        style={{
          borderColor: active ? primaryColor : "#DBDADE",
          borderWidth: active ? 2 : 1,
          color: active ? primaryColor : "#5D596C",
        }}
      >
        {children}
      </div>
      <p className="mt-1 text-[15px] text-[#6F6B7D]">{title}</p>
    </button>
  );

  const MiniPreview = ({ active, title, onClick, type = "vertical" }) => (
    <button type="button" onClick={onClick} className="text-left">
      <div
        className="h-[68px] w-[135px] rounded-md border bg-[#F8F7FA] p-2 transition"
        style={{
          borderColor: active ? primaryColor : "#DBDADE",
          borderWidth: active ? 2 : 1,
        }}
      >
        {type === "horizontal" ? (
          <>
            <div className="mb-2 h-2 w-full rounded bg-[#D9D9DE]" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-5 rounded bg-[#ECECEF]" />
              <div className="h-5 rounded bg-[#E5E5E9]" />
            </div>
            <div className="mt-2 h-4 rounded bg-[#ECECEF]" />
          </>
        ) : (
          <div className="flex h-full gap-2">
            <div className="w-7 rounded bg-[#E1E1E6]">
              <div className="m-1 h-1.5 rounded bg-[#C8C8CE]" />
              <div className="m-1 h-1.5 rounded bg-[#C8C8CE]" />
              <div className="m-1 h-1.5 rounded bg-[#C8C8CE]" />
            </div>
            <div className="flex-1">
              <div className="mb-2 h-2 rounded bg-[#D9D9DE]" />
              <div className="mb-2 h-5 rounded bg-[#ECECEF]" />
              <div className="h-5 rounded bg-[#E5E5E9]" />
            </div>
          </div>
        )}
      </div>
      <p className="mt-1 text-[15px] text-[#6F6B7D]">{title}</p>
    </button>
  );

  const ProfileAvatar = ({ size = "small" }) => {
    const sizeClass =
      size === "large"
        ? "h-[150px] w-[150px] text-[54px]"
        : "h-12 w-12 text-lg";

    return (
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border-4 border-white font-bold text-white shadow-lg ${sizeClass}`}
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, #9E95F5)`,
        }}
      >
        {user?.avatar_url || user?.photo_url ? (
          <img
            src={user.avatar_url || user.photo_url}
            alt={fullName}
            className="h-full w-full object-cover"
          />
        ) : (
          initial
        )}
      </div>
    );
  };

  const ProfileModel = () => {
    const totalModules = searchItems.length;
    const profileStats = [
      { label: "Accessible Modules", value: totalModules, icon: Grid3X3 },
      { label: "Role", value: displayLabel(roleName), icon: CheckCircle2 },
      { label: "Outlet", value: outletName, icon: Coffee },
    ];

    return (
      <div className="fixed inset-0 z-[120000] overflow-y-auto bg-[#2F2B3D]/50 px-4 py-8 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-[1280px]">
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={() => setProfileModelOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#2F2B3D] shadow-xl"
            >
              <X size={22} />
            </button>
          </div>

          <div className={`overflow-hidden rounded-md border shadow-2xl ${cardClass}`}>
            <div
              className="relative h-[285px] rounded-t-md"
              style={{
                background:
                  "linear-gradient(120deg, #E98BD5 0%, #A67AF4 48%, #48C6EF 100%)",
              }}
            >
              <div className="absolute inset-0 bg-white/5" />
            </div>

            <div className="relative px-8 pb-8">
              <div className="-mt-[85px] flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                <div className="flex flex-col gap-6 md:flex-row md:items-end">
                  <ProfileAvatar size="large" />

                  <div className="pb-3">
                    <h2 className={`text-[30px] font-semibold ${textMain}`}>
                      {fullName}
                    </h2>

                    <div className={`mt-4 flex flex-wrap gap-6 text-[16px] ${textMuted}`}>
                      <span className="flex items-center gap-2">
                        <Coffee size={21} />
                        {displayLabel(roleName)}
                      </span>

                      <span className="flex items-center gap-2">
                        <Circle size={18} />
                        {outletName}
                      </span>

                      <span className="flex items-center gap-2">
                        <CalendarDays size={21} />
                        {user?.created_at
                          ? new Date(user.created_at).toLocaleDateString("en-IN", {
                              month: "short",
                              year: "numeric",
                            })
                          : "April 2026"}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-md px-7 py-3 text-[16px] font-semibold text-white shadow-lg"
                  style={{ backgroundColor: primaryColor }}
                >
                  <User size={18} />
                  Connected
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-4">
            {[
              { label: "Profile", icon: User },
              { label: "Teams", icon: Users },
              { label: "Projects", icon: Grid3X3 },
              { label: "Connections", icon: ChevronRight },
            ].map((tab, index) => {
              const Icon = tab.icon;
              const active = index === 0;

              return (
                <button
                  key={tab.label}
                  type="button"
                  className={`flex items-center gap-2 rounded-md px-6 py-3 text-[16px] font-semibold shadow-sm ${
                    active ? "text-white" : cardClass
                  }`}
                  style={active ? { backgroundColor: primaryColor } : undefined}
                >
                  <Icon size={19} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[410px_1fr]">
            <div className={`rounded-md border p-7 shadow-sm ${cardClass}`}>
              <h3 className={`text-[14px] uppercase tracking-wide ${textMuted}`}>
                About
              </h3>

              <div className="mt-6 space-y-5">
                <div className="flex items-center gap-4">
                  <User size={22} className={textMuted} />
                  <p className={`text-[16px] ${textMuted}`}>
                    Full Name:{" "}
                    <span className={`font-semibold ${textMain}`}>{fullName}</span>
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <CheckCircle2 size={22} className={textMuted} />
                  <p className={`text-[16px] ${textMuted}`}>
                    Status:{" "}
                    <span className={`font-semibold ${textMain}`}>
                      {user?.is_active === 0 ? "Inactive" : "Active"}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <Coffee size={22} className={textMuted} />
                  <p className={`text-[16px] ${textMuted}`}>
                    Role:{" "}
                    <span className={`font-semibold ${textMain}`}>{displayLabel(roleName)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <Circle size={22} className={textMuted} />
                  <p className={`text-[16px] ${textMuted}`}>
                    Outlet:{" "}
                    <span className={`font-semibold ${textMain}`}>{outletName}</span>
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <Bell size={22} className={textMuted} />
                  <p className={`text-[16px] ${textMuted}`}>
                    Email:{" "}
                    <span className={`font-semibold ${textMain}`}>{email}</span>
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <Wallet size={22} className={textMuted} />
                  <p className={`text-[16px] ${textMuted}`}>
                    Phone:{" "}
                    <span className={`font-semibold ${textMain}`}>{phone}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                {profileStats.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className={`rounded-md border p-6 shadow-sm ${cardClass}`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-md"
                          style={{
                            color: primaryColor,
                            backgroundColor: `${primaryColor}18`,
                          }}
                        >
                          <Icon size={24} />
                        </div>

                        <div>
                          <p className={`text-[13px] ${textMuted}`}>{item.label}</p>
                          <p className={`mt-1 text-[19px] font-semibold ${textMain}`}>
                            {item.value}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={`rounded-md border p-7 shadow-sm ${cardClass}`}>
                <h3 className={`text-[22px] font-semibold ${textMain}`}>
                  Activity Timeline
                </h3>

                <div className="mt-7 space-y-7">
                  {[
                    {
                      title: "Logged into ERP dashboard",
                      desc: "User session is active and secure.",
                      time: "Now",
                      icon: CheckCircle2,
                      color: "#28C76F",
                    },
                    {
                      title: "Outlet access enabled",
                      desc: `${outletName} outlet data access is available based on role permission.`,
                      time: "Today",
                      icon: Coffee,
                      color: "#7367F0",
                    },
                    {
                      title: "Notifications available",
                      desc: `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"} pending.`,
                      time: "Today",
                      icon: Bell,
                      color: "#FF9F43",
                    },
                  ].map((item, index) => {
                    const Icon = item.icon;

                    return (
                      <div key={item.title} className="flex gap-5">
                        <div className="flex flex-col items-center">
                          <span
                            className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                            style={{ backgroundColor: item.color }}
                          >
                            <Icon size={19} />
                          </span>

                          {index !== 2 && (
                            <span className="mt-2 h-12 w-px bg-[#DBDADE]" />
                          )}
                        </div>

                        <div className="flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h4 className={`text-[17px] font-semibold ${textMain}`}>
                              {item.title}
                            </h4>
                            <span className={`text-[13px] ${textMuted}`}>
                              {item.time}
                            </span>
                          </div>

                          <p className={`mt-1 text-[15px] ${textMuted}`}>
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setProfileModelOpen(false);
                    setCustomizerOpen(true);
                  }}
                  className="mt-8 rounded-md px-6 py-3 text-[15px] font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  Open Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const NotificationDropdown = () => {
    const [isExpanded, setIsExpanded] = useState(false);
    const prefersReduced = useReducedMotion();

    const borderColor = isDark ? "border-[#3B405A]" : "border-[#DBDADE]";
    const unreadRowBg = isDark ? "bg-[#3B405A]/40" : "bg-[#F8F7FA]";
    const hoverBg    = isDark ? "hover:bg-[#3B405A]/60" : "hover:bg-[#F3F2F7]";
    const iconColors = {
      success: { bg: "#E9F9EF", fg: "#28C76F" },
      warning: { bg: "#FFF4E5", fg: "#FF9F43" },
      danger:  { bg: "#FDEAEA", fg: "#EA5455" },
      info:    { bg: `${primaryColor}18`, fg: primaryColor },
    };

    const STACK = 3;
    const peekCount = Math.max(0, Math.min(STACK, notifications.length) - 1);
    const spring = prefersReduced
      ? { duration: 0 }
      : { type: "spring", stiffness: 360, damping: 26, mass: 0.8 };
    const fade = prefersReduced ? { duration: 0 } : { duration: 0.13 };

    return (
      <motion.div
        layout="size"
        className={`absolute right-0 top-14 z-50 w-[calc(100vw-2rem)] max-w-[380px] overflow-hidden rounded-md border shadow-xl dropdown-enter ${cardClass}`}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
        transition={spring}
      >
        {/* ── Header ── */}
        <div className={`flex items-center justify-between border-b ${borderColor} px-5 py-4`}>
          <div>
            <p className={`text-[17px] font-semibold ${textMain}`}>Notifications</p>
            <p className={`text-[13px] ${textMuted}`}>
              {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button type="button" onClick={markAllNotificationsRead} className="text-[13px] font-semibold" style={{ color: primaryColor }}>
              Mark all read
            </button>
          )}
        </div>

        {/* ── Body ── */}
        {notificationsLoading && notifications.length === 0 ? (
          <div className="flex items-center justify-center px-5 py-10">
            <RefreshCw size={24} className="animate-spin text-[#A8AAAE]" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Bell size={34} className="mx-auto text-[#A8AAAE]" />
            <p className={`mt-3 text-[15px] font-semibold ${textMain}`}>No notifications</p>
            <p className={`mt-1 text-[13px] ${textMuted}`}>New alerts will appear here.</p>
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {!isExpanded ? (
              /* ── STACKED (collapsed) view ── */
              <motion.div
                key="stacked"
                initial={prefersReduced ? {} : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={prefersReduced ? {} : { opacity: 0 }}
                transition={fade}
                className="relative cursor-pointer select-none"
                style={{ paddingBottom: peekCount * 8 }}
                onClick={() => setIsExpanded(true)}
              >
                {/* Front card – in normal flow so it sets the container height */}
                {(() => {
                  const item = notifications[0];
                  const Icon = getNotificationIcon(item.type);
                  const colors = iconColors[item.type] || iconColors.info;
                  return (
                    <div
                      className={`relative flex items-center gap-3 border-b ${borderColor} px-5 py-4 ${!item.is_read ? unreadRowBg : ""}`}
                      style={{ zIndex: STACK }}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: colors.bg, color: colors.fg }}>
                        <Icon size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[15px] font-semibold ${textMain}`}>{item.title}</p>
                        <p className={`mt-0.5 truncate text-[13px] ${textMuted}`}>{item.message}</p>
                      </div>
                      {!item.is_read && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#FF4C51]" />}
                    </div>
                  );
                })()}

                {/* Back cards – absolute, peek below front card */}
                {notifications.slice(1, STACK).map((item, i) => {
                  const stackIdx = i + 1;
                  const Icon = getNotificationIcon(item.type);
                  const colors = iconColors[item.type] || iconColors.info;
                  return (
                    <motion.div
                      key={item.id}
                      className={`absolute inset-x-0 top-0 flex items-center gap-3 border-b ${borderColor} px-5 py-4 ${!item.is_read ? unreadRowBg : ""}`}
                      style={{ zIndex: STACK - stackIdx, transformOrigin: "50% 0%" }}
                      animate={prefersReduced ? {} : {
                        y: stackIdx * 8,
                        scale: 1 - stackIdx * 0.03,
                        opacity: 1 - stackIdx * 0.22,
                      }}
                      transition={spring}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: colors.bg, color: colors.fg }}>
                        <Icon size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[15px] font-semibold ${textMain}`}>{item.title}</p>
                        <p className={`mt-0.5 truncate text-[13px] ${textMuted}`}>{item.message}</p>
                      </div>
                      {!item.is_read && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#FF4C51]" />}
                    </motion.div>
                  );
                })}
              </motion.div>
            ) : (
              /* ── EXPANDED view ── */
              <motion.div
                key="expanded"
                initial={prefersReduced ? {} : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={prefersReduced ? {} : { opacity: 0 }}
                transition={fade}
                className="max-h-[360px] overflow-y-auto"
              >
                {notifications.map((item) => {
                  const Icon = getNotificationIcon(item.type);
                  const colors = iconColors[item.type] || iconColors.info;
                  const isUnread = !item.is_read;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setNotificationOpen(false); markNotificationAsRead(item.id, item.nav_path); }}
                      className={`flex w-full gap-4 border-b ${borderColor} px-5 py-4 text-left transition ${hoverBg} ${isUnread ? unreadRowBg : ""}`}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: colors.bg, color: colors.fg }}>
                        <Icon size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className={`text-[15px] font-semibold ${textMain}`}>{item.title}</p>
                          {isUnread && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#FF4C51]" />}
                        </div>
                        <p className={`mt-1 text-[13px] ${textMuted}`}>{item.message}</p>
                        <div className="mt-2 flex items-center gap-2 text-[12px] font-medium text-[#A8AAAE]">
                          <span>{timeAgo(item.created_at)}</span>
                          {item.outlet_name && <><span>·</span><span>{item.outlet_name}</span></>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* ── Footer ── */}
        {notifications.length > 0 && (
          <div className={`border-t ${borderColor} px-5 py-3 text-center`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={isExpanded ? "viewall" : "notifs"}
                className={`text-[13px] font-medium ${textMuted}`}
                initial={prefersReduced ? {} : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReduced ? {} : { opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
              >
                {isExpanded ? "View all" : "Notifications"}
              </motion.p>
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    );
  };

  const OutletSelector = ({ variant = "desktop" }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const prefersReduced = useReducedMotion();
    const locked = permissions.isOutletLocked;

    useEffect(() => {
      if (!open) return undefined;
      const onDown = (event) => {
        if (ref.current && !ref.current.contains(event.target)) setOpen(false);
      };
      document.addEventListener("mousedown", onDown);
      return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    const options = [
      ...(permissions.canAccessAllOutlets
        ? [{ id: "all", outlet_name: "All Outlets" }]
        : []),
      ...availableOutlets.map((o) => ({
        id: o.id,
        outlet_name: o.outlet_name || o.name || o.outlet_code,
      })),
    ];

    const currentLabel =
      selectedOutlet?.outlet_name || outletName || "Select outlet";

    const panelTransition = prefersReduced
      ? { duration: 0 }
      : { type: "spring", stiffness: 420, damping: 32, mass: 0.7 };
    const chevronTransition = prefersReduced ? { duration: 0 } : { duration: 0.18 };

    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          disabled={locked}
          onClick={() => !locked && setOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={open}
          title={locked ? "Assigned outlet only" : "Select outlet"}
          className={`flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3 text-left outline-none ${
            variant === "mobile" ? "text-[14px]" : "text-[13px] md:text-[14px]"
          } ${locked ? "cursor-not-allowed opacity-70" : "cursor-pointer"} ${
            isDark
              ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
              : "border-[#DBDADE] bg-white text-[#2F2B3D]"
          }`}
        >
          <span className="truncate">{currentLabel}</span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={chevronTransition}
            className="shrink-0"
          >
            <ChevronDown size={16} />
          </motion.span>
        </button>

        <AnimatePresence>
          {open && !locked && (
            <motion.div
              role="listbox"
              initial={
                prefersReduced
                  ? { opacity: 0 }
                  : { opacity: 0, y: -6, scale: 0.98 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                prefersReduced
                  ? { opacity: 0 }
                  : { opacity: 0, y: -6, scale: 0.98 }
              }
              transition={panelTransition}
              style={{ transformOrigin: "top" }}
              className={`absolute left-0 z-50 mt-1 max-h-[280px] w-full min-w-[180px] overflow-y-auto rounded-md border shadow-xl ${cardClass}`}
            >
              {options.map((opt) => {
                const isSel = String(opt.id) === String(selectedOutletId);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => {
                      selectOutlet(opt.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[14px] transition ${
                      isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"
                    }`}
                    style={
                      isSel
                        ? { backgroundColor: `${primaryColor}18`, color: primaryColor }
                        : undefined
                    }
                  >
                    <span className="truncate">{opt.outlet_name}</span>
                    {isSel && <CheckCircle2 size={15} className="shrink-0" />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const Sidebar = ({ mobile = false }) => {
    const [hoveredMenuKey, setHoveredMenuKey] = useState(null);

    if (isHorizontal && !mobile) return null;

    const expandedView = mobile || sidebarOpen;
    const sidebarTransition = prefersReducedSidebarMotion
      ? { duration: 0 }
      : SIDEBAR_SPRING;
    const highlightTransition = prefersReducedSidebarMotion
      ? { duration: 0 }
      : MENU_HIGHLIGHT_SPRING;
    const submenuTransition = prefersReducedSidebarMotion
      ? { duration: 0 }
      : SUBMENU_TRANSITION;
    const chevronTransition = prefersReducedSidebarMotion
      ? { duration: 0 }
      : CHEVRON_TRANSITION;
    const highlightId = mobile
      ? "sidebar-active-highlight-mobile"
      : "sidebar-active-highlight-desktop";
    const subHighlightId = mobile
      ? "sidebar-sub-active-highlight-mobile"
      : "sidebar-sub-active-highlight-desktop";

    const toggleParentMenu = (item) => {
      runWithoutScrollJump(() => {
        // In collapsed desktop mode, clicking a parent icon first opens the
        // sidebar and keeps that submenu expanded so the interaction is useful.
        if (!mobile && !sidebarOpen) {
          setLayout("vertical");
          setExpandedMenus((prev) => ({ ...prev, [item.key]: true }));
          return;
        }

        setExpandedMenus((prev) => ({
          ...prev,
          [item.key]: !prev[item.key],
        }));
      });
    };

    const menuTextClass = effectiveSidebarDark
      ? "text-[#D0D2D6]"
      : "text-[#5D596C]";
    const menuHoverClass = effectiveSidebarDark
      ? "hover:bg-[#3B405A]"
      : "hover:bg-[#F3F2F7]";
    const subTextClass = effectiveSidebarDark
      ? "text-[#B6B8C7]"
      : "text-[#5D596C]";

    return (
      <motion.aside
        initial={false}
        animate={{ width: expandedView ? 300 : 82 }}
        transition={sidebarTransition}
        className={`relative flex h-full shrink-0 flex-col border-r ${sideClass}`}
      >
        {/* Brand / sidebar toggle */}
        <div
          className={`relative flex h-[72px] shrink-0 items-center ${
            expandedView ? "justify-between px-6" : "justify-center px-3"
          }`}
        >
          <Link
            to="/"
            preventScrollReset
            onClick={() => {
              saveStableScroll();
              if (mobile) setMobileOpen(false);
            }}
            className={`flex min-w-0 items-center ${expandedView ? "gap-3" : "justify-center"}`}
            aria-label="Big Bean Café Dashboard"
          >
            <motion.div
              layout
              transition={highlightTransition}
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl"
            >
              <img
                src={LOGO_SRC}
                alt="Big Bean Café"
                className="h-10 w-10 object-contain"
              />
            </motion.div>

            <AnimatePresence initial={false}>
              {expandedView && (
                <motion.div
                  key="sidebar-brand-text"
                  initial={prefersReducedSidebarMotion ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={prefersReducedSidebarMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                  transition={prefersReducedSidebarMotion ? { duration: 0 } : { duration: 0.16 }}
                  className="min-w-0"
                >
                  <h1
                    className={`truncate text-[22px] font-bold ${
                      effectiveSidebarDark ? "text-white" : textMain
                    }`}
                  >
                    Big Bean Cafe
                  </h1>
                  <p
                    className={`text-[11px] font-semibold ${
                      effectiveSidebarDark ? "text-[#A5A8B6]" : textMuted
                    }`}
                  >
                    Cafe ERP
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </Link>

          {expandedView ? (
            <motion.button
              type="button"
              onClick={() =>
                runWithoutScrollJump(() =>
                  mobile
                    ? setMobileOpen(false)
                    : setLayout(sidebarOpen ? "collapsed" : "vertical")
                )
              }
              whileHover={prefersReducedSidebarMotion ? undefined : { scale: 1.05 }}
              whileTap={prefersReducedSidebarMotion ? undefined : { scale: 0.94 }}
              transition={highlightTransition}
              className={`rounded-full p-2 ${
                effectiveSidebarDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"
              }`}
              aria-label={mobile ? "Close sidebar" : "Collapse sidebar"}
              title={mobile ? "Close sidebar" : "Collapse sidebar"}
            >
              {mobile ? <X size={20} /> : <Circle size={18} />}
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={() => runWithoutScrollJump(() => setLayout("vertical"))}
              whileHover={prefersReducedSidebarMotion ? undefined : { scale: 1.06 }}
              whileTap={prefersReducedSidebarMotion ? undefined : { scale: 0.94 }}
              transition={highlightTransition}
              className={`absolute -right-3 top-[22px] z-20 flex h-7 w-7 items-center justify-center rounded-full border shadow-md ${
                effectiveSidebarDark
                  ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6] hover:bg-[#3B405A]"
                  : "border-[#DBDADE] bg-white text-[#5D596C] hover:bg-[#F3F2F7]"
              }`}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <ChevronRight size={16} />
            </motion.button>
          )}
        </div>

        {/* Navigation */}
        <nav
          ref={sidebarNavRef}
          className={`flex-1 overflow-y-auto overflow-x-hidden pb-5 ${
            expandedView ? "px-4" : "px-3"
          }`}
          style={{ scrollbarGutter: "stable" }}
        >
          <div className="space-y-1">
            {(() => {
              let lastSection = null;
              return menuItems.flatMap((item) => {
                if (!canShowMenu(item)) return null;

                const showSectionHeader = expandedView && item.section && item.section !== lastSection;
                if (item.section) lastSection = item.section;
                const sectionHeader = showSectionHeader ? (
                  <div
                    key={`section-${item.section}`}
                    className={`mb-1.5 mt-4 px-4 text-[11px] font-semibold uppercase tracking-wider first:mt-0 ${
                      effectiveSidebarDark ? "text-[#6B7094]" : "text-[#A8AAAE]"
                    }`}
                  >
                    {item.section}
                  </div>
                ) : null;

              const Icon = item.icon;
              const active = isParentActive(item);
              const expanded = expandedMenus[item.key];
              const itemKey = item.key || item.path;
              const hovered = hoveredMenuKey === itemKey;

              if (item.submenu) {
                return [sectionHeader, (
                  <div key={item.key} className="relative">
                    <motion.button
                      type="button"
                      onMouseEnter={() => setHoveredMenuKey(itemKey)}
                      onMouseLeave={() => setHoveredMenuKey(null)}
                      onClick={() => toggleParentMenu(item)}
                      whileTap={prefersReducedSidebarMotion ? undefined : { scale: 0.985 }}
                      transition={highlightTransition}
                      aria-expanded={Boolean(expanded)}
                      aria-label={item.title}
                      title={!expandedView ? item.title : undefined}
                      className={`group relative flex w-full items-center overflow-hidden rounded-md py-2.5 text-[15px] ${
                        expandedView ? "justify-between px-4" : "justify-center px-0"
                      } ${active ? "text-white" : `${menuTextClass} ${menuHoverClass}`}`}
                    >
                      {active && (
                        <motion.span
                          layoutId={highlightId}
                          className="absolute inset-0 rounded-md"
                          style={{
                            backgroundColor: primaryColor,
                            boxShadow: `0 3px 12px ${primaryColor}55`,
                          }}
                          transition={highlightTransition}
                        />
                      )}

                      {!active && hovered && !prefersReducedSidebarMotion && (
                        <motion.span
                          layoutId={`${highlightId}-hover`}
                          className={`pointer-events-none absolute inset-0 rounded-md ${
                            effectiveSidebarDark ? "bg-[#3B405A]/70" : "bg-[#F3F2F7]"
                          }`}
                          transition={highlightTransition}
                        />
                      )}

                      <div
                        className={`relative z-10 flex min-w-0 items-center ${
                          expandedView ? "gap-3" : "justify-center"
                        }`}
                      >
                        <motion.span
                          layout
                          className="flex shrink-0 items-center justify-center"
                          transition={highlightTransition}
                        >
                          <Icon size={20} />
                        </motion.span>

                        <AnimatePresence initial={false}>
                          {expandedView && (
                            <motion.span
                              key={`${item.key}-label`}
                              initial={prefersReducedSidebarMotion ? false : { opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={prefersReducedSidebarMotion ? { opacity: 0 } : { opacity: 0, x: -6 }}
                              transition={prefersReducedSidebarMotion ? { duration: 0 } : { duration: 0.14 }}
                              className="truncate font-medium"
                            >
                              {item.title}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>

                      <AnimatePresence initial={false}>
                        {expandedView && (
                          <motion.span
                            key={`${item.key}-chevron`}
                            className="relative z-10 flex shrink-0 items-center justify-center"
                            initial={prefersReducedSidebarMotion ? false : { opacity: 0 }}
                            animate={{ opacity: 1, rotate: expanded ? 180 : 0 }}
                            exit={{ opacity: 0 }}
                            transition={chevronTransition}
                          >
                            <ChevronDown size={18} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>

                    <AnimatePresence initial={false}>
                      {expanded && expandedView && (
                        <motion.div
                          key={`${item.key}-submenu`}
                          initial={
                            prefersReducedSidebarMotion
                              ? false
                              : { height: 0, opacity: 0, y: -4 }
                          }
                          animate={{ height: "auto", opacity: 1, y: 0 }}
                          exit={
                            prefersReducedSidebarMotion
                              ? { opacity: 0 }
                              : { height: 0, opacity: 0, y: -4 }
                          }
                          transition={submenuTransition}
                          className="overflow-hidden"
                        >
                          <div className="mt-1 space-y-1 pl-3">
                            {item.submenu.map((sub) => {
                              const subActive = isActive(sub.path);

                              return (
                                <motion.button
                                  key={sub.path}
                                  type="button"
                                  onClick={() => goTo(sub.path)}
                                  whileHover={
                                    prefersReducedSidebarMotion ? undefined : { x: 3 }
                                  }
                                  whileTap={
                                    prefersReducedSidebarMotion
                                      ? undefined
                                      : { scale: 0.985 }
                                  }
                                  transition={highlightTransition}
                                  className={`relative flex w-full items-center gap-3 overflow-hidden rounded-md px-4 py-2.5 text-left text-[15px] ${
                                    subActive
                                      ? ""
                                      : `${subTextClass} ${menuHoverClass}`
                                  }`}
                                  style={subActive ? { color: primaryColor } : undefined}
                                >
                                  {subActive && (
                                    <motion.span
                                      layoutId={subHighlightId}
                                      className="absolute inset-0 rounded-md"
                                      style={{ backgroundColor: `${primaryColor}18` }}
                                      transition={highlightTransition}
                                    />
                                  )}
                                  {sub.icon ? (
                                    <sub.icon size={16} className="relative z-10 shrink-0" />
                                  ) : (
                                    <Circle size={9} className="relative z-10 shrink-0" />
                                  )}
                                  <span className="relative z-10 truncate">{sub.title}</span>
                                </motion.button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )].filter(Boolean);
              }

              return [sectionHeader, (
                <motion.button
                  key={item.path}
                  type="button"
                  onMouseEnter={() => setHoveredMenuKey(itemKey)}
                  onMouseLeave={() => setHoveredMenuKey(null)}
                  onClick={() => goTo(item.path)}
                  whileTap={prefersReducedSidebarMotion ? undefined : { scale: 0.985 }}
                  transition={highlightTransition}
                  aria-label={item.title}
                  title={!expandedView ? item.title : undefined}
                  className={`group relative flex w-full items-center overflow-hidden rounded-md py-2.5 text-left text-[15px] ${
                    expandedView ? "gap-3 px-4" : "justify-center px-0"
                  } ${active ? "text-white" : `${menuTextClass} ${menuHoverClass}`}`}
                >
                  {active && (
                    <motion.span
                      layoutId={highlightId}
                      className="absolute inset-0 rounded-md"
                      style={{
                        backgroundColor: primaryColor,
                        boxShadow: `0 3px 12px ${primaryColor}55`,
                      }}
                      transition={highlightTransition}
                    />
                  )}

                  {!active && hovered && !prefersReducedSidebarMotion && (
                    <motion.span
                      layoutId={`${highlightId}-hover`}
                      className={`pointer-events-none absolute inset-0 rounded-md ${
                        effectiveSidebarDark ? "bg-[#3B405A]/70" : "bg-[#F3F2F7]"
                      }`}
                      transition={highlightTransition}
                    />
                  )}

                  <motion.span
                    layout
                    className="relative z-10 flex shrink-0 items-center justify-center"
                    transition={highlightTransition}
                  >
                    <Icon size={20} />
                  </motion.span>

                  <AnimatePresence initial={false}>
                    {expandedView && (
                      <motion.span
                        key={`${itemKey}-label`}
                        initial={prefersReducedSidebarMotion ? false : { opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={prefersReducedSidebarMotion ? { opacity: 0 } : { opacity: 0, x: -6 }}
                        transition={prefersReducedSidebarMotion ? { duration: 0 } : { duration: 0.14 }}
                        className="relative z-10 truncate font-medium"
                      >
                        {item.title}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              )].filter(Boolean);
              });
            })()}
          </div>
        </nav>
      </motion.aside>
    );
  };

  return (
    <div
      className={`min-h-screen w-full min-w-0 overflow-x-hidden ${appClass}`}
      style={{
        fontFamily:
          '"Public Sans", "Inter", "Noto Sans Kannada", system-ui, sans-serif',
      }}
    >
      <AnimatePresence initial={false}>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-50 lg:hidden"
            initial={prefersReducedSidebarMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedSidebarMotion ? { duration: 0 } : { duration: 0.16 }}
          >
            <motion.button
              type="button"
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              initial={prefersReducedSidebarMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={prefersReducedSidebarMotion ? { duration: 0 } : { duration: 0.16 }}
            />
            <motion.div
              className="relative h-full w-[300px]"
              initial={prefersReducedSidebarMotion ? false : { x: -320 }}
              animate={{ x: 0 }}
              exit={prefersReducedSidebarMotion ? { x: 0 } : { x: -320 }}
              transition={prefersReducedSidebarMotion ? { duration: 0 } : SIDEBAR_SPRING}
            >
              <Sidebar mobile />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden">
        {!isHorizontal && (
          <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
            <Sidebar />
          </div>
        )}

        <div
          className={`flex min-h-screen min-w-0 flex-1 flex-col transition-[padding-left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            !isHorizontal ? (sidebarOpen ? "lg:pl-[300px]" : "lg:pl-[82px]") : ""
          }`}
        >
          <header className={`fixed left-0 right-0 top-0 z-30 min-w-0 px-3 pt-3 md:px-6 md:pt-5 ${!isHorizontal ? (sidebarOpen ? "lg:left-[300px]" : "lg:left-[82px]") : ""} ${isDark ? "bg-[#25293C]" : "bg-[#F8F7FA]"}`}>
            <div className="w-full min-w-0">
              <div
                className={`flex min-h-[76px] items-center justify-between gap-3 rounded-md border px-3 py-3 shadow-[0_2px_12px_rgba(47,43,61,0.12)] md:px-6 ${cardClass} ${
                  isBordered ? "border-2" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    className="flex h-10 w-10 items-center justify-center lg:hidden"
                    aria-label="Toggle sidebar menu"
                    title="Toggle sidebar menu"
                  >
                    <Menu size={24} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="hidden w-[180px] max-w-[240px] shrink-0 items-center gap-3 text-left sm:flex xl:w-[240px] md:gap-4"
                  >
                    <Search size={25} className={textMain} />
                    <span className={`hidden text-[16px] ${textMuted} md:inline`}>{t.search}</span>
                  </button>

                  <div className="hidden w-[200px] max-w-[220px] shrink-0 sm:block xl:w-[220px]">
                    <OutletSelector variant="desktop" />
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 whitespace-nowrap md:gap-4">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setLanguageOpen((prev) => !prev);
                        setThemeOpen(false);
                        setProfileOpen(false);
                        setNotificationOpen(false);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-[#F3F2F7]"
                      aria-label="Change language"
                      title="Change language"
                    >
                      <Languages size={22} />
                    </button>

                    {languageOpen && (
                      <div
                        className={`absolute right-0 top-12 z-50 w-[210px] rounded-md border p-2 shadow-xl dropdown-enter ${cardClass}`}
                      >
                        {Object.entries(LANGUAGES).map(([code, item]) => (
                          <button
                            key={code}
                            type="button"
                            onClick={() => {
                              setLanguage(code);
                              setLanguageOpen(false);
                            }}
                            className="flex w-full items-center justify-between rounded-md px-4 py-3 text-[15px] transition hover:bg-[#F8F7FA]"
                            style={
                              language === code
                                ? {
                                    backgroundColor: `${primaryColor}18`,
                                    color: primaryColor,
                                  }
                                : undefined
                            }
                          >
                            {item.name}
                            {language === code && <CheckCircle2 size={16} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setThemeOpen((prev) => !prev);
                        setLanguageOpen(false);
                        setProfileOpen(false);
                        setNotificationOpen(false);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-[#F3F2F7]"
                      aria-label="Toggle dark mode"
                      title="Toggle dark mode"
                    >
                      {isDark ? <Moon size={23} /> : <Sun size={23} />}
                    </button>

                    {themeOpen && (
                      <div
                        className={`absolute right-0 top-12 z-50 w-[210px] rounded-md border p-2 shadow-xl dropdown-enter ${cardClass}`}
                      >
                        {[
                          { value: "light", label: t.themeLight, icon: Sun },
                          { value: "dark", label: t.themeDark, icon: Moon },
                          { value: "system", label: t.themeSystem, icon: Monitor },
                        ].map((item) => {
                          const Icon = item.icon;

                          return (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => {
                                setThemeMode(item.value);
                                setThemeOpen(false);
                              }}
                              className="flex w-full items-center gap-4 rounded-md px-4 py-3 text-[15px] transition hover:bg-[#F8F7FA]"
                              style={
                                themeMode === item.value
                                  ? {
                                      backgroundColor: `${primaryColor}18`,
                                      color: primaryColor,
                                    }
                                  : undefined
                              }
                            >
                              <Icon size={22} />
                              {item.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      closeTopDropdowns();
                      setCustomizerOpen(true);
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-[#F3F2F7]"
                    aria-label="Open theme settings"
                    title="Open theme settings"
                  >
                    <Settings size={23} />
                  </button>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        const opening = !notificationOpen;
                        setNotificationOpen(opening);
                        setLanguageOpen(false);
                        setThemeOpen(false);
                        setProfileOpen(false);
                        if (opening) fetchNotifications();
                      }}
                      className="relative flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-[#F3F2F7]"
                      aria-label="View notifications"
                      title="View notifications"
                    >
                      <Bell size={23} />

                      {unreadCount > 0 && (
                        <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF4C51] px-1 text-[11px] font-bold text-white">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </button>

                    {notificationOpen && <NotificationDropdown />}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen((prev) => !prev);
                        setLanguageOpen(false);
                        setThemeOpen(false);
                        setNotificationOpen(false);
                      }}
                      aria-label="Open account menu"
                      title="Open account menu"
                    >
                      <div
                        className="relative flex h-11 w-11 items-center justify-center rounded-full text-[17px] font-bold text-white"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {user?.avatar_url || user?.photo_url ? (
                          <img
                            src={user.avatar_url || user.photo_url}
                            alt={fullName}
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          initial
                        )}
                        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#28C76F]" />
                      </div>
                    </button>

                    {profileOpen && (
                      <div
                        className={`absolute right-0 top-14 z-50 w-[85vw] max-w-[290px] overflow-hidden rounded-md border shadow-xl dropdown-enter ${cardClass}`}
                      >
                        <div className="flex items-center gap-3 border-b border-[#DBDADE] px-5 py-4">
                          <ProfileAvatar />

                          <div className="min-w-0">
                            <p className={`truncate text-[16px] font-semibold ${textMain}`}>
                              {fullName}
                            </p>
                            <p className={`truncate text-[14px] ${textMuted}`}>
                              {email}
                            </p>
                            <p className={`truncate text-[12px] ${textMuted}`}>
                              {displayLabel(roleName)}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-1 p-3">
                          <button
                            type="button"
                            onClick={() => {
                              setProfileOpen(false);
                              setProfileModelOpen(true);
                            }}
                            className="flex w-full items-center gap-4 rounded-md px-4 py-3 text-[15px] hover:bg-[#F8F7FA]"
                          >
                            <User size={22} />
                            {t.profile}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setCustomizerOpen(true);
                              setProfileOpen(false);
                            }}
                            className="flex w-full items-center gap-4 rounded-md px-4 py-3 text-[15px] hover:bg-[#F8F7FA]"
                          >
                            <Settings size={22} />
                            {t.settings}
                          </button>

                          <button
                            type="button"
                            onClick={handleLogout}
                            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-[#FF4C51] px-4 py-3 text-[15px] font-semibold text-white hover:bg-[#E64449]"
                          >
                            {t.logout}
                            <LogOut size={17} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="block sm:hidden pb-2 pt-0">
                <OutletSelector variant="mobile" />
              </div>
            </div>
          </header>

          <main className="min-w-0 w-full flex-1 overflow-x-hidden px-3 pt-[100px] pb-3 sm:px-4 sm:pt-[104px] sm:pb-4 md:px-6 md:pt-[120px] md:pb-6">
            <div className={`${contentWidthClass} mx-auto w-full min-w-0 space-y-4`}>
              {location.pathname.startsWith('/warehouse') ? (
                <div className={`inline-flex rounded-md border px-3 py-2 text-[13px] font-medium ${cardClass}`}>
                  Warehouse inventory uses the selected warehouse location.
                </div>
              ) : (
                <div className={`inline-flex rounded-md border px-3 py-2 text-[13px] font-medium ${cardClass}`}>
                  Showing data for:
                  <span className={`ml-1 font-semibold ${textMain}`}>
                    {selectedOutlet?.outlet_name || outletName}
                  </span>
                </div>
              )}
              <Outlet
                key={selectedOutletId}
                context={{
                  selectedOutletId,
                  availableOutlets,
                  isOutletLocked: permissions.isOutletLocked,
                }}
              />
            </div>
          </main>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          closeTopDropdowns();
          setCustomizerOpen(true);
        }}
        className="fixed right-0 top-1/2 z-[99999] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-l-md text-white shadow-2xl transition hover:scale-105"
        style={{ backgroundColor: primaryColor }}
        title="Theme Customizer"
      >
        <Settings size={24} />
      </button>

      {profileModelOpen && <ProfileModel />}

      {customizerOpen && (
        <div className="fixed inset-0 z-[100000] flex justify-end bg-black/20">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setCustomizerOpen(false)}
          />

          <aside
            className={`relative h-full w-[500px] max-w-[95vw] overflow-y-auto border-l shadow-2xl ${cardClass}`}
          >
            <div
              className={`sticky top-0 z-10 flex items-start justify-between border-b px-8 py-6 ${cardClass}`}
            >
              <div>
                <h2 className="text-[22px] font-semibold">{t.themeCustomizer}</h2>
                <p className={`mt-1 text-[15px] ${textMuted}`}>
                  {t.customizePreview}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <button type="button" onClick={resetCustomizer}>
                  <RefreshCw size={24} />
                </button>
                <button type="button" onClick={() => setCustomizerOpen(false)}>
                  <X size={26} />
                </button>
              </div>
            </div>

            <div className="space-y-10 px-8 py-8">
              <div>
                <span
                  className="rounded px-3 py-1.5 text-[15px] font-medium"
                  style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}
                >
                  {t.theming}
                </span>

                <h3 className="mt-8 text-[20px] font-semibold">{t.primaryColor}</h3>
                <div className="mt-4 flex flex-wrap gap-3">
                  {PRIMARY_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setPrimaryColor(color.value)}
                      className="flex h-[64px] w-[64px] items-center justify-center rounded-md border"
                      style={{
                        borderColor:
                          primaryColor === color.value ? color.value : "#DBDADE",
                        borderWidth: primaryColor === color.value ? 2 : 1,
                      }}
                    >
                      <span
                        className="h-10 w-10 rounded-md"
                        style={{ backgroundColor: color.value }}
                      />
                    </button>
                  ))}
                </div>

                <h3 className="mt-8 text-[20px] font-semibold">{t.mode}</h3>
                <div className="mt-4 grid grid-cols-3 gap-5">
                  <OptionCard
                    title={t.themeLight}
                    active={themeMode === "light"}
                    onClick={() => setThemeMode("light")}
                  >
                    <Sun size={32} />
                  </OptionCard>

                  <OptionCard
                    title={t.themeDark}
                    active={themeMode === "dark"}
                    onClick={() => setThemeMode("dark")}
                  >
                    <Moon size={32} />
                  </OptionCard>

                  <OptionCard
                    title={t.themeSystem}
                    active={themeMode === "system"}
                    onClick={() => setThemeMode("system")}
                  >
                    <Monitor size={32} />
                  </OptionCard>
                </div>

                <h3 className="mt-8 text-[20px] font-semibold">{t.skin}</h3>
                <div className="mt-4 grid grid-cols-2 gap-5">
                  <MiniPreview
                    title={t.defaultSkin}
                    active={skin === "default"}
                    onClick={() => setSkin("default")}
                  />

                  <MiniPreview
                    title={t.borderedSkin}
                    active={skin === "bordered"}
                    onClick={() => setSkin("bordered")}
                    type="horizontal"
                  />
                </div>

                <div className="mt-8 flex items-center justify-between border-b border-[#DBDADE] pb-8">
                  <h3 className="text-[20px] font-semibold">{t.semiDark}</h3>
                  <button
                    type="button"
                    onClick={() => setSemiDark((prev) => !prev)}
                    className={`relative h-6 w-11 rounded-full transition ${
                      semiDark ? "" : "bg-[#DBDADE]"
                    }`}
                    style={semiDark ? { backgroundColor: primaryColor } : undefined}
                  >
                    <span
                      className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
                        semiDark ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                <span
                  className="mt-8 inline-block rounded px-3 py-1.5 text-[15px] font-medium"
                  style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}
                >
                  {t.layout}
                </span>

                <h3 className="mt-8 text-[20px] font-semibold">{t.layouts}</h3>
                <div className="mt-4 grid grid-cols-3 gap-5">
                  <MiniPreview
                    title={t.vertical}
                    active={layout === "vertical"}
                    onClick={() => setLayout("vertical")}
                  />

                  <MiniPreview
                    title={t.collapsed}
                    active={layout === "collapsed"}
                    onClick={() => setLayout("collapsed")}
                  />

                  <MiniPreview
                    title={t.horizontal}
                    active={layout === "horizontal"}
                    onClick={() => setLayout("horizontal")}
                    type="horizontal"
                  />
                </div>

                <h3 className="mt-8 text-[20px] font-semibold">{t.content}</h3>
                <div className="mt-4 grid grid-cols-2 gap-5">
                  <OptionCard
                    title={t.compact}
                    active={content === "compact"}
                    onClick={() => setContent("compact")}
                  >
                    <Monitor size={32} />
                  </OptionCard>

                  <OptionCard
                    title={t.wide}
                    active={content === "wide"}
                    onClick={() => setContent("wide")}
                  >
                    <Monitor size={32} />
                  </OptionCard>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {searchOpen && (
        <div className="fixed inset-0 z-[70000] flex items-start justify-center bg-[#2F2B3D]/55 px-3 pt-[70px] sm:px-5 sm:pt-[85px] backdrop-blur-[1px] modal-overlay-enter">
          <div
            className={`w-full max-w-[850px] overflow-hidden rounded-md border shadow-2xl modal-enter ${cardClass}`}
          >
            <div className="flex h-[76px] items-center justify-between border-b border-[#DBDADE] px-6">
              <div className="flex flex-1 items-center gap-4">
                <Search size={26} />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoFocus
                  placeholder={t.search}
                  className={`w-full bg-transparent text-[18px] outline-none ${
                    isDark ? "text-white" : "text-[#2F2B3D]"
                  }`}
                />
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-[15px] ${textMuted}`}>[esc]</span>
                <button type="button" onClick={() => setSearchOpen(false)}>
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-10 p-9 md:grid-cols-2">
              <div>
                <p
                  className={`mb-5 text-[13px] uppercase tracking-[0.22em] ${textMuted}`}
                >
                  {t.popularSearches}
                </p>

                <div className="space-y-4">
                  {filteredSearch.slice(0, 6).map((item) => {
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => goTo(item.path)}
                        className="flex w-full items-center gap-4 text-left text-[18px]"
                      >
                        <Icon size={23} />
                        <span>{item.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p
                  className={`mb-5 text-[13px] uppercase tracking-[0.22em] ${textMuted}`}
                >
                  {t.reportsLabel}
                </p>

                <div className="space-y-4">
                  {filteredSearch.slice(6, 12).map((item) => {
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => goTo(item.path)}
                        className="flex w-full items-center gap-4 text-left text-[18px]"
                      >
                        <Icon size={23} />
                        <span>{item.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div
              className={`flex items-center gap-3 border-t px-6 py-3 text-[14px] ${textMuted} ${
                isDark ? "border-[#3B405A]" : "border-[#DBDADE]"
              }`}
            >
              <span className="rounded bg-[#F3F2F7] px-2 py-1">esc</span>
              <span>to close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardLayout;
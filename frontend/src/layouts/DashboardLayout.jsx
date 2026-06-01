import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import useAuthStore from "../store/authStore";
import { authAPI, masterAPI } from "../services/api";
import toast from "react-hot-toast";

const LOGO_SRC = "/logo.webp";

const normalizeRole = (role = "") => role.trim();

const ALL_OUTLET_ROLES = [
  "Technical Admin",
  "Super Admin",
  "Admin",
  "Developer",
  "HO Accounts Admin",
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
  const isHO = role === "HO Accounts Admin";
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
    canManageMasters: isSuper || isLegacyAdmin || isTechnical || isHO,
    canDeleteMaster: isSuper,
    canCreateCashbook: isSuper || isLegacyAdmin || isHO || isManager,
    canSubmitCashbook: isSuper || isLegacyAdmin || isHO || isManager,
    canVerifyCashbook: isSuper || isLegacyAdmin || isHO,
    canCreateExpense: isSuper || isLegacyAdmin || isHO || isManager || isStaff,
    canSubmitExpense: isSuper || isLegacyAdmin || isHO || isManager,
    canApproveExpense: isSuper || isLegacyAdmin || isHO,
    canRejectExpense: isSuper || isLegacyAdmin || isHO,
    canUploadStock: isSuper || isLegacyAdmin || isTechnical || isHO,
    canUploadPurchase: isSuper || isLegacyAdmin || isTechnical || isHO,
    canUploadSales: isSuper || isLegacyAdmin || isTechnical || isHO,
    canViewPayroll: isSuper || isLegacyAdmin || isTechnical || isHO || isManager || isViewer,
    canCreatePayroll: isSuper || isLegacyAdmin || isHO,
    canSubmitPayroll: isSuper || isLegacyAdmin || isHO || isManager,
    canVerifyPayroll: isSuper || isLegacyAdmin || isHO,
    canApprovePayroll: isSuper || isLegacyAdmin,
    canViewPayouts: isSuper || isLegacyAdmin || isTechnical || isHO || isManager || isViewer,
    canManagePayouts: isSuper || isLegacyAdmin || isHO,
    canViewReports: !isStaff,
    canViewPL: !isStaff && (isSuper || isLegacyAdmin || isTechnical || isHO || isManager || isViewer),
    canViewCompanyPL: isSuper || isLegacyAdmin || isTechnical || isHO || isViewer,
    canLockDay: isSuper || isLegacyAdmin,
    canLockMonth: isSuper || isLegacyAdmin,
    canEmergencyCorrect: isTechnical,
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
    rawMaterials: "Raw Materials",
    menuItems: "Menu Items",
    dailyAccounts: "Daily Outlet Accounts",
    cashbook: "Daily Cashbook",
    expenses: "Daily Cash Expenses",
    dayClosing: "Day Closing",
    checklist: "Daily Checklist",
    payroll: "Payroll",
    employeeSalary: "Employee Salary",
    stock: "Stock",
    openingStock: "Opening Stock Upload",
    closingStock: "Closing Stock Upload",
    purchases: "Purchases",
    materialPurchase: "Material Purchase Upload",
    sales: "Sales",
    itemSales: "Item-wise Sales Upload",
    recipe: "Recipe / BOM",
    recipeList: "Recipe List",
    addRecipe: "Add Recipe",
    payouts: "Payouts",
    onlinePayouts: "Online Order Payouts",
    dineInPayouts: "Dine-in Portal Payouts",
    reports: "Reports",
    dailyCashbookReport: "Daily Cashbook Report",
    expenseReport: "Expense Report",
    actualConsumption: "Actual Consumption Report",
    monthlyPL: "Monthly Outlet P&L",
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

const getStoredNotifications = () => {
  try {
    const saved = localStorage.getItem("bbc_notifications");
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }

  return [
    {
      id: 1,
      title: "Stock Upload Pending",
      message: "RR Nagar closing stock upload is pending.",
      type: "warning",
      time: "Today",
      read: false,
    },
    {
      id: 2,
      title: "Daily Cashbook Verification",
      message: "Today cashbook verification is required.",
      type: "info",
      time: "Today",
      read: false,
    },
    {
      id: 3,
      title: "Purchase Upload Completed",
      message: "Material purchase file processed successfully.",
      type: "success",
      time: "Yesterday",
      read: true,
    },
  ];
};

const DashboardLayout = () => {
  const stored = getStored();

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
  const [notifications, setNotifications] = useState(getStoredNotifications);
  const [outlets, setOutlets] = useState(defaultOutlets);
  const [selectedOutletId, setSelectedOutletId] = useState(
    localStorage.getItem("bbc_selected_outlet_id") || "all"
  );

  const [prefersDark, setPrefersDark] = useState(
    window.matchMedia?.("(prefers-color-scheme: dark)")?.matches || false
  );

  const { user, logout, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

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
  const canView = (moduleKey, fallback = false) =>
    permissions?.[moduleKey]?.can_view ?? fallback;
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

  const unreadCount = notifications.filter((item) => !item.read).length;

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
    localStorage.setItem("bbc_notifications", JSON.stringify(notifications));
  }, [notifications]);

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
          setOutlets(apiOutlets.slice(0, 7));
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
          detail: { outlet_id: nextOutletId },
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

  const menuItems = useMemo(
    () => [
      {
        key: "dashboard",
        title: t.dashboard,
        icon: LayoutDashboard,
        path: "/",
        show: canView("dashboard", true),
      },
      {
        key: "users",
        title: "User Management",
        icon: Users,
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
        show: canView("masters", permissions.canManageMasters || permissions.isReadOnly),
        submenu: [
          ...(canView("outlets", true) ? [{ title: t.outlets, path: "/masters/outlets" }] : []),
          ...(canView("categories", true) ? [{ title: t.categories, path: "/masters/categories" }] : []),
          ...(canView("suppliers", true) ? [{ title: t.suppliers, path: "/masters/suppliers" }] : []),
          ...(canView("raw_materials", true) ? [{ title: t.rawMaterials, path: "/masters/raw-materials" }] : []),
          ...(canView("menu_items", true) ? [{ title: t.menuItems, path: "/masters/menu-items" }] : []),
        ],
      },
      {
        key: "daily",
        title: t.dailyAccounts,
        icon: ClipboardList,
        show: canView("daily_cashbook", true) || canView("daily_expenses", true) || canView("day_closing", true) || canView("daily_checklist", true),
        submenu: [
          ...(canView("daily_cashbook", true) ? [{ title: t.cashbook, path: "/daily-accounts/cashbook" }] : []),
          ...(canView("daily_expenses", true) ? [{ title: t.expenses, path: "/daily-accounts/expenses" }] : []),
          ...(canView("day_closing", true) ? [{ title: t.dayClosing, path: "/daily-accounts/day-closing" }] : []),
          ...(canView("daily_checklist", true) ? [{ title: t.checklist, path: "/daily-accounts/checklist" }] : []),
        ],
      },
      {
        key: "payroll",
        title: t.payroll,
        icon: Wallet,
        show: canView("payroll", permissions.canViewPayroll),
        submenu: [{ title: t.employeeSalary, path: "/payroll/employee-salary" }],
      },
      {
        key: "stock",
        title: t.stock,
        icon: Package,
        show: canView("opening_stock", permissions.canUploadStock || roleName === "Outlet Manager" || roleName === "Outlet Admin" || permissions.isReadOnly) || canView("closing_stock", false),
        submenu: [
          ...(canView("opening_stock", true) ? [{ title: t.openingStock, path: "/stock/opening-stock" }] : []),
          ...(canView("closing_stock", true) ? [{ title: t.closingStock, path: "/stock/closing-stock" }] : []),
        ],
      },
      {
        key: "purchases",
        title: t.purchases,
        icon: ShoppingCart,
        show: canView("material_purchase", permissions.canUploadPurchase || roleName === "Outlet Manager" || roleName === "Outlet Admin" || permissions.isReadOnly),
        submenu: [{ title: t.materialPurchase, path: "/purchases/material-purchase" }],
      },
      {
        key: "sales",
        title: t.sales,
        icon: TrendingUp,
        show: canView("item_sales", permissions.canUploadSales || roleName === "Outlet Manager" || roleName === "Outlet Admin" || permissions.isReadOnly),
        submenu: [{ title: t.itemSales, path: "/sales/item-sales" }],
      },
      {
        key: "recipe",
        title: t.recipe,
        icon: Coffee,
        show: canView("recipe_list", roleName !== "Outlet Staff" && roleName !== "Outlet Manager" && roleName !== "Outlet Admin"),
        submenu: [
          ...(canView("recipe_list", true) ? [{ title: t.recipeList, path: "/recipes" }] : []),
          ...(canView("add_recipe", !permissions.isReadOnly) ? [{ title: t.addRecipe, path: "/recipes/new" }] : []),
        ],
      },
      {
        key: "payouts",
        title: t.payouts,
        icon: DollarSign,
        show: canView("online_payouts", permissions.canViewPayouts) || canView("dine_in_payouts", permissions.canViewPayouts),
        submenu: [
          ...(canView("online_payouts", true) ? [{ title: t.onlinePayouts, path: "/payouts/online" }] : []),
          ...(canView("dine_in_payouts", true) ? [{ title: t.dineInPayouts, path: "/payouts/dine-in" }] : []),
        ],
      },
      {
        key: "reports",
        title: t.reports,
        icon: FileText,
        show: canView("reports", permissions.canViewReports),
        submenu: [
          { title: t.dailyCashbookReport, path: "/reports/daily-cashbook" },
          { title: t.expenseReport, path: "/reports/expense-report" },
          { title: t.actualConsumption, path: "/reports/actual-consumption" },
          ...(canView("monthly_pl", permissions.canViewPL) ? [{ title: t.monthlyPL, path: "/reports/monthly-pl" }] : []),
        ],
      },
    ],
    [permissions, roleName, t]
  );

  useEffect(() => {
    const activeMenus = {};
    menuItems.forEach((item) => {
      if (item.submenu?.some((sub) => sub.path === location.pathname)) {
        activeMenus[item.key] = true;
      }
    });

    setExpandedMenus((prev) => ({ ...prev, ...activeMenus }));
  }, [location.pathname, menuItems]);

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

  const markNotificationAsRead = (id) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    toast.success("All notifications marked as read");
  };

  const clearNotifications = () => {
    setNotifications([]);
    toast.success("Notifications cleared");
  };

  const getNotificationIcon = (type) => {
    if (type === "success") return CheckCircle2;
    if (type === "warning") return AlertCircle;
    return Bell;
  };

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    navigate("/login", { replace: true });
  };

  const goTo = (path) => {
    navigate(path);
    setSearchOpen(false);
    setQuery("");
    setMobileOpen(false);
  };

  const handleOutletChange = (event) => {
    const nextOutletId = event.target.value;
    setSelectedOutletId(nextOutletId);
    localStorage.setItem("bbc_selected_outlet_id", nextOutletId);
    window.dispatchEvent(
      new CustomEvent("bbc:selected-outlet-change", {
        detail: { outlet_id: nextOutletId },
      })
    );
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
      { label: "Role", value: roleName, icon: CheckCircle2 },
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
                        {roleName}
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
                    <span className={`font-semibold ${textMain}`}>{roleName}</span>
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

  const NotificationDropdown = () => (
    <div
      className={`absolute right-0 top-14 z-50 w-[380px] overflow-hidden rounded-md border shadow-xl ${cardClass}`}
    >
      <div className="flex items-center justify-between border-b border-[#DBDADE] px-5 py-4">
        <div>
          <p className={`text-[17px] font-semibold ${textMain}`}>
            Notifications
          </p>
          <p className={`text-[13px] ${textMuted}`}>
            {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
          </p>
        </div>

        <button
          type="button"
          onClick={markAllNotificationsRead}
          className="text-[13px] font-semibold"
          style={{ color: primaryColor }}
        >
          Mark all read
        </button>
      </div>

      <div className="max-h-[360px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Bell size={34} className="mx-auto text-[#A8AAAE]" />
            <p className={`mt-3 text-[15px] font-semibold ${textMain}`}>
              No notifications
            </p>
            <p className={`mt-1 text-[13px] ${textMuted}`}>
              New alerts will appear here.
            </p>
          </div>
        ) : (
          notifications.map((item) => {
            const NotificationIcon = getNotificationIcon(item.type);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => markNotificationAsRead(item.id)}
                className={`flex w-full gap-4 border-b border-[#DBDADE] px-5 py-4 text-left transition hover:bg-[#F8F7FA] ${
                  !item.read ? "bg-[#F8F7FA]" : ""
                }`}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
                  style={{
                    backgroundColor:
                      item.type === "success"
                        ? "#E9F9EF"
                        : item.type === "warning"
                        ? "#FFF4E5"
                        : `${primaryColor}18`,
                    color:
                      item.type === "success"
                        ? "#28C76F"
                        : item.type === "warning"
                        ? "#FF9F43"
                        : primaryColor,
                  }}
                >
                  <NotificationIcon size={20} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className={`text-[15px] font-semibold ${textMain}`}>
                      {item.title}
                    </p>

                    {!item.read && (
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#FF4C51]" />
                    )}
                  </div>

                  <p className={`mt-1 text-[13px] ${textMuted}`}>
                    {item.message}
                  </p>

                  <p className="mt-2 text-[12px] font-medium text-[#A8AAAE]">
                    {item.time}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      {notifications.length > 0 && (
        <div className="border-t border-[#DBDADE] p-3">
          <button
            type="button"
            onClick={clearNotifications}
            className="flex w-full items-center justify-center rounded-md bg-[#FCEAEA] px-4 py-2.5 text-[14px] font-semibold text-[#EA5455]"
          >
            Clear Notifications
          </button>
        </div>
      )}
    </div>
  );

  const Sidebar = ({ mobile = false }) => {
    if (isHorizontal && !mobile) return null;

    return (
      <aside
        className={`flex h-full flex-col border-r ${sideClass} ${
          mobile ? "w-[300px]" : sidebarOpen ? "w-[300px]" : "w-[82px]"
        } transition-all duration-300`}
      >
        <div className="flex h-[72px] items-center justify-between px-6">
          <Link
            to="/"
            onClick={() => mobile && setMobileOpen(false)}
            className="flex min-w-0 items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl">
              <img
                src={LOGO_SRC}
                alt="Big Bean Café"
                className="h-10 w-10 object-contain"
              />
            </div>

            {(sidebarOpen || mobile) && (
              <div className="min-w-0">
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
              </div>
            )}
          </Link>

          <button
            type="button"
            onClick={() =>
              mobile
                ? setMobileOpen(false)
                : setLayout(sidebarOpen ? "collapsed" : "vertical")
            }
            className={`rounded-full p-2 transition ${
              effectiveSidebarDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"
            }`}
          >
            {mobile ? (
              <X size={20} />
            ) : sidebarOpen ? (
              <Circle size={18} />
            ) : (
              <Menu size={20} />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 pb-5">
          <div className="space-y-1">
            {menuItems.map((item) => {
              if (!canShowMenu(item)) return null;

              const Icon = item.icon;
              const active = isParentActive(item);
              const expanded = expandedMenus[item.key];

              if (item.submenu) {
                return (
                  <div key={item.key}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedMenus((prev) => ({
                          ...prev,
                          [item.key]: !prev[item.key],
                        }))
                      }
                      style={active ? activeStyle : undefined}
                      className={`flex w-full items-center justify-between rounded-md px-4 py-2.5 text-[15px] transition ${
                        active
                          ? ""
                          : effectiveSidebarDark
                          ? "text-[#D0D2D6] hover:bg-[#3B405A]"
                          : "text-[#5D596C] hover:bg-[#F3F2F7]"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Icon size={20} />
                        {(sidebarOpen || mobile) && (
                          <span className="truncate font-medium">{item.title}</span>
                        )}
                      </div>

                      {(sidebarOpen || mobile) && (
                        <ChevronDown
                          size={18}
                          className={`transition ${expanded ? "rotate-180" : ""}`}
                        />
                      )}
                    </button>

                    {expanded && (sidebarOpen || mobile) && (
                      <div className="mt-1 space-y-1 pl-3">
                        {item.submenu.map((sub) => {
                          const subActive = isActive(sub.path);

                          return (
                            <Link
                              key={sub.path}
                              to={sub.path}
                              onClick={() => mobile && setMobileOpen(false)}
                              className={`flex items-center gap-3 rounded-md px-4 py-2.5 text-[15px] transition ${
                                subActive
                                  ? ""
                                  : effectiveSidebarDark
                                  ? "text-[#B6B8C7] hover:bg-[#3B405A]"
                                  : "text-[#5D596C] hover:bg-[#F3F2F7]"
                              }`}
                              style={subActive ? subActiveStyle : undefined}
                            >
                              <Circle size={9} />
                              <span className="truncate">{sub.title}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => mobile && setMobileOpen(false)}
                  style={active ? activeStyle : undefined}
                  className={`flex items-center gap-3 rounded-md px-4 py-2.5 text-[15px] transition ${
                    active
                      ? ""
                      : effectiveSidebarDark
                      ? "text-[#D0D2D6] hover:bg-[#3B405A]"
                      : "text-[#5D596C] hover:bg-[#F3F2F7]"
                  }`}
                >
                  <Icon size={20} />
                  {(sidebarOpen || mobile) && (
                    <span className="truncate font-medium">{item.title}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>
    );
  };

  return (
    <div
      className={`min-h-screen ${appClass}`}
      style={{
        fontFamily:
          '"Public Sans", "Inter", "Noto Sans Kannada", system-ui, sans-serif',
      }}
    >
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full">
            <Sidebar mobile />
          </div>
        </div>
      )}

      <div className="flex min-h-screen">
        {!isHorizontal && (
          <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
            <Sidebar />
          </div>
        )}

        <div
          className={`flex min-h-screen flex-1 flex-col transition-all duration-300 ${
            !isHorizontal ? (sidebarOpen ? "lg:pl-[300px]" : "lg:pl-[82px]") : ""
          }`}
        >
          <header className="sticky top-0 z-30 px-6 pt-5">
            <div className={`${contentWidthClass} mx-auto`}>
              <div
                className={`flex h-[66px] items-center justify-between rounded-md border px-6 shadow-[0_2px_12px_rgba(47,43,61,0.12)] ${cardClass} ${
                  isBordered ? "border-2" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    className="lg:hidden"
                  >
                    <Menu size={24} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="flex min-w-[220px] items-center gap-4 text-left"
                  >
                    <Search size={25} className={textMain} />
                    <span className={`text-[16px] ${textMuted}`}>{t.search}</span>
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  <div className="hidden min-w-[190px] md:block">
                    <select
                      value={selectedOutletId}
                      onChange={handleOutletChange}
                      disabled={permissions.isOutletLocked}
                      className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${
                        permissions.isOutletLocked ? "cursor-not-allowed opacity-70" : ""
                      } ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#DBDADE] bg-white"}`}
                      title={permissions.isOutletLocked ? "Assigned outlet only" : "Select outlet"}
                    >
                      {permissions.canAccessAllOutlets && <option value="all">All Outlets</option>}
                      {availableOutlets.map((outlet) => (
                        <option key={outlet.id} value={outlet.id}>
                          {outlet.outlet_name || outlet.name || outlet.outlet_code}
                        </option>
                      ))}
                    </select>
                  </div>

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
                    >
                      <Languages size={22} />
                    </button>

                    {languageOpen && (
                      <div
                        className={`absolute right-0 top-12 z-50 w-[210px] rounded-md border p-2 shadow-xl ${cardClass}`}
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
                    >
                      {isDark ? <Moon size={23} /> : <Sun size={23} />}
                    </button>

                    {themeOpen && (
                      <div
                        className={`absolute right-0 top-12 z-50 w-[210px] rounded-md border p-2 shadow-xl ${cardClass}`}
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
                  >
                    <Settings size={23} />
                  </button>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationOpen((prev) => !prev);
                        setLanguageOpen(false);
                        setThemeOpen(false);
                        setProfileOpen(false);
                      }}
                      className="relative flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-[#F3F2F7]"
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
                        className={`absolute right-0 top-14 z-50 w-[290px] overflow-hidden rounded-md border shadow-xl ${cardClass}`}
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
                              {roleName}
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
            </div>
          </header>

          <main className="flex-1 px-6 py-6">
            <div className={`${contentWidthClass} mx-auto`}>
              <Outlet />
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
        <div className="fixed inset-0 z-[70000] flex items-start justify-center bg-[#2F2B3D]/55 px-5 pt-[85px] backdrop-blur-[1px]">
          <div
            className={`w-full max-w-[850px] overflow-hidden rounded-md border shadow-2xl ${cardClass}`}
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
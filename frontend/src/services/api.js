import axios from "axios";
import useAuthStore from "../store/authStore";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5001/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

const normalizeToken = (value) => {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;

  if (trimmed.startsWith("Bearer ")) {
    return trimmed.replace("Bearer ", "").trim();
  }

  return trimmed;
};

const isTokenLike = (value) => {
  const token = normalizeToken(value);
  if (!token) return false;

  // A real JWT is exactly 3 dot-separated segments (header.payload.signature).
  // The old check accepted ANY string over 25 characters, which meant any
  // unrelated JSON blob left in storage (e.g. bbc_permissions) could be
  // misread as a token and sent as a garbage Authorization header.
  return token.split(".").length === 3;
};

const findTokenDeep = (value, depth = 0) => {
  if (!value || depth > 5) return null;

  if (typeof value === "string") {
    const token = normalizeToken(value);
    return isTokenLike(token) ? token : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const token = findTokenDeep(item, depth + 1);
      if (token) return token;
    }
    return null;
  }

  if (typeof value === "object") {
    const priorityKeys = [
      "token",
      "accessToken",
      "authToken",
      "jwt",
      "access_token",
      "idToken",
      "id_token",
    ];

    for (const key of priorityKeys) {
      const token = findTokenDeep(value[key], depth + 1);
      if (token) return token;
    }

    for (const item of Object.values(value)) {
      const token = findTokenDeep(item, depth + 1);
      if (token) return token;
    }
  }

  return null;
};

const getStoredToken = () => {
  const directCandidates = [
    localStorage.getItem("token"),
    localStorage.getItem("authToken"),
    localStorage.getItem("accessToken"),
    localStorage.getItem("bbc_token"),
    sessionStorage.getItem("token"),
    sessionStorage.getItem("authToken"),
    sessionStorage.getItem("accessToken"),
    sessionStorage.getItem("bbc_token"),
  ];

  for (const item of directCandidates) {
    const token = normalizeToken(item);
    if (isTokenLike(token)) return token;
  }

  const knownStorageKeys = [
    "auth-storage",
    "authStore",
    "auth-store",
    "bigbean-auth",
    "bbc_auth_storage",
    "bbc-auth-storage",
    "user-storage",
  ];

  for (const key of knownStorageKeys) {
    try {
      const stored = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (!stored) continue;

      const parsed = JSON.parse(stored);
      const token = findTokenDeep(parsed);

      if (token) return token;
    } catch {
      // ignore invalid json
    }
  }

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      const value = localStorage.getItem(key);

      if (!value) continue;

      if (isTokenLike(value)) return normalizeToken(value);

      try {
        const parsed = JSON.parse(value);
        const token = findTokenDeep(parsed);
        if (token) return token;
      } catch {
        // ignore non-json value
      }
    }
  } catch {
    // ignore storage access issue
  }

  try {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      const value = sessionStorage.getItem(key);

      if (!value) continue;

      if (isTokenLike(value)) return normalizeToken(value);

      try {
        const parsed = JSON.parse(value);
        const token = findTokenDeep(parsed);
        if (token) return token;
      } catch {
        // ignore non-json value
      }
    }
  } catch {
    // ignore storage access issue
  }

  return null;
};

export const getSelectedOutletId = () =>
  localStorage.getItem("bbc_selected_outlet_id") || "all";

const shouldAppendOutletId = (config) => {
  const method = String(config.method || "get").toLowerCase();
  const url = String(config.url || "");

  if (method !== "get") return false;

  // Global/admin/master APIs should not receive selected outlet_id automatically.
  // This fixes User Management showing 0 users because /users was becoming /users?outlet_id=all.
  const skipUrls = [
    "/auth/login",
    "/auth/me",
    "/auth/change-password",

    "/users",
    "/users/",
    "/roles",
    "/role-access",
    "/role-access/roles",

    "/masters/outlets",
    "/masters/categories",
    "/masters/suppliers",
    "/masters/raw-materials",
    "/masters/menu-items",
    "/masters/units",
    "/masters/expense-heads",
    "/masters/payment-modes",
    "/masters/online-platforms",
    "/masters/dine-in-portals",

    "/notifications",
    "/notifications/",
  ];

  if (skipUrls.some((item) => url === item || url.startsWith(item))) {
    return false;
  }

  if (
    config.params &&
    Object.prototype.hasOwnProperty.call(config.params, "outlet_id")
  ) {
    return false;
  }

  return true;
};

api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (token && shouldAppendOutletId(config)) {
      config.params = {
        ...(config.params || {}),
        outlet_id: getSelectedOutletId(),
      };
    }

    return config;
  },
  (error) => Promise.reject(error)
);

const clearAuthStorage = () => {
  const keys = [
    "token",
    "authToken",
    "accessToken",
    "bbc_token",
    "user",
    "bbc_permissions",
    "auth-storage",
    "authStore",
    "auth-store",
    "bigbean-auth",
    "bbc_auth_storage",
    "bbc-auth-storage",
  ];

  keys.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401) {
      console.warn("Unauthorized. Please login again.");
      clearAuthStorage();
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (data) => api.post("/auth/login", data),
  me: () => api.get("/auth/me"),
  changePassword: (data) => api.post("/auth/change-password", data),
};

export const userAPI = {
  getUsers: (params) => api.get("/users", { params }),
  getUsersByOutlet: (outlet_id) => api.get(`/users/outlet/${outlet_id}`),
  getUserById: (id) => api.get(`/users/${id}`),
  createUser: (data) => api.post("/users", data),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
  deleteUser: (id) => api.delete(`/users/${id}`),
  assignUserToOutlet: (id, data) => api.post(`/users/${id}/assign-outlet`, data),
  toggleUserStatus: (id, data) => api.patch(`/users/${id}/toggle-status`, data),
};

export const roleAPI = {
  getRoles: () => api.get("/roles"),
  createRole: (data) => api.post("/roles", data),
};

export const roleAccessAPI = {
  getRoles: () => api.get("/role-access/roles"),
  getPermissions: (roleId) => api.get(`/role-access/${roleId}`),
  updatePermissions: (roleId, permissions) =>
    api.put(`/role-access/${roleId}`, { permissions }),
};

export const getStoredPermissions = () => {
  try {
    return JSON.parse(localStorage.getItem("bbc_permissions") || "{}");
  } catch {
    return {};
  }
};

export const dashboardAPI = {
  getSummary: (params = {}) =>
    api.get("/dashboard/summary", {
      params: { outlet_id: getSelectedOutletId(), ...params },
    }),
};

export const masterAPI = {
  getOutlets: (params) => api.get("/masters/outlets", { params }),
  createOutlet: (data) => api.post("/masters/outlets", data),
  updateOutlet: (id, data) => api.put(`/masters/outlets/${id}`, data),
  deleteOutlet: (id) => api.delete(`/masters/outlets/${id}`),

  getCategories: (params) => api.get("/masters/categories", { params }),
  createCategory: (data) => api.post("/masters/categories", data),
  updateCategory: (id, data) => api.put(`/masters/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/masters/categories/${id}`),

  getSuppliers: (params) => api.get("/masters/suppliers", { params }),
  createSupplier: (data) => api.post("/masters/suppliers", data),
  updateSupplier: (id, data) => api.put(`/masters/suppliers/${id}`, data),
  deleteSupplier: (id) => api.delete(`/masters/suppliers/${id}`),

  getRawMaterials: (params) => api.get("/masters/raw-materials", { params }),
  createRawMaterial: (data) => api.post("/masters/raw-materials", data),
  updateRawMaterial: (id, data) => api.put(`/masters/raw-materials/${id}`, data),
  deleteRawMaterial: (id) => api.delete(`/masters/raw-materials/${id}`),
  bulkUploadRawMaterials: (formData) =>
    api.post("/masters/raw-materials/bulk-upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  downloadRawMaterialsTemplate: () =>
    api.get("/masters/raw-materials/bulk-upload/template", { responseType: "blob" }),

  getRawMaterialRates: (params) => api.get("/masters/raw-material-rates", { params }),
  createRawMaterialRate: (data) => api.post("/masters/raw-material-rates", data),
  updateRawMaterialRate: (id, data) => api.put(`/masters/raw-material-rates/${id}`, data),
  deleteRawMaterialRate: (id) => api.delete(`/masters/raw-material-rates/${id}`),

  getMenuItems: (params) => api.get("/masters/menu-items", { params }),
  createMenuItem: (data) => api.post("/masters/menu-items", data),
  updateMenuItem: (id, data) => api.put(`/masters/menu-items/${id}`, data),
  deleteMenuItem: (id) => api.delete(`/masters/menu-items/${id}`),
  bulkUploadMenuItems: (formData) =>
    api.post("/masters/menu-items/bulk-upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  downloadMenuItemsTemplate: () =>
    api.get("/masters/menu-items/bulk-upload/template", { responseType: "blob" }),

  getUnits: (params) => api.get("/masters/units", { params }),
  getExpenseHeads: (params) => api.get("/masters/expense-heads", { params }),
  getPaymentModes: (params) => api.get("/masters/payment-modes", { params }),
  getOnlinePlatforms: (params) => api.get("/masters/online-platforms", { params }),
  getDineInPortals: (params) => api.get("/masters/dine-in-portals", { params }),
};

export const dailyAccountsAPI = {
  getCashbooks: (params) => api.get("/daily-accounts/cashbooks", { params }),
  getCashbookSummary: (params) =>
    api.get("/daily-accounts/cashbooks/summary", { params }),
  createCashbook: (data) => api.post("/daily-accounts/cashbooks", data),
  updateCashbook: (id, data) => api.put(`/daily-accounts/cashbooks/${id}`, data),
  deleteCashbook: (id) => api.delete(`/daily-accounts/cashbooks/${id}`),
  submitCashbook: (id) =>
    api.post(`/daily-accounts/cashbooks/${id}/submit`),
  verifyCashbook: (id, data) =>
    api.post(`/daily-accounts/cashbooks/${id}/verify`, data),
  lockCashbook: (id, data) =>
    api.post(`/daily-accounts/cashbooks/${id}/lock`, data),

  getExpenses: (params) => api.get("/daily-accounts/expenses", { params }),
  getExpenseById: (id) => api.get(`/daily-accounts/expenses/${id}`),
  createExpense: (formData) =>
    api.post("/daily-accounts/expenses", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  createExpensesBatch: (data) => api.post("/daily-accounts/expenses/batch", data),
  updateExpense: (id, formData) =>
    api.put(`/daily-accounts/expenses/${id}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  submitExpense: (id) =>
    api.post(`/daily-accounts/expenses/${id}/submit`),
  approveExpense: (id, data) =>
    api.post(`/daily-accounts/expenses/${id}/approve`, data),
  rejectExpense: (id, data) =>
    api.post(`/daily-accounts/expenses/${id}/reject`, data),
  deleteExpense: (id) => api.delete(`/daily-accounts/expenses/${id}`),

  getBankDeposits: (params) => api.get("/daily-accounts/bank-deposits", { params }),
  getBankDepositSummary: (params) => api.get("/daily-accounts/bank-deposits/summary", { params }),
  getBankDepositById: (id) => api.get(`/daily-accounts/bank-deposits/${id}`),
  createBankDeposit: (formData) =>
    api.post("/daily-accounts/bank-deposits", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  updateBankDeposit: (id, formData) =>
    api.put(`/daily-accounts/bank-deposits/${id}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  submitBankDeposit: (id) => api.post(`/daily-accounts/bank-deposits/${id}/submit`),
  verifyBankDeposit: (id) => api.post(`/daily-accounts/bank-deposits/${id}/verify`),
  rejectBankDeposit: (id, data) => api.post(`/daily-accounts/bank-deposits/${id}/reject`, data),
  deleteBankDeposit: (id) => api.delete(`/daily-accounts/bank-deposits/${id}`),

  getDayClosings: (params) => api.get("/daily-accounts/day-closing", { params }),
  getDayClosing: (id) => api.get(`/daily-accounts/day-closing/${id}`),
  getDayClosingSummary: (params) => api.get("/daily-accounts/day-closing/summary", { params }),
  createDayClosing: (data) => api.post("/daily-accounts/day-closing", data),
  updateDayClosing: (id, data) => api.put(`/daily-accounts/day-closing/${id}`, data),
  submitDayClosing: (id, data = {}) => api.post(`/daily-accounts/day-closing/${id}/submit`, data),
  verifyDayClosing: (id) => api.post(`/daily-accounts/day-closing/${id}/verify`, {}),
  rejectDayClosing: (id, data) => api.post(`/daily-accounts/day-closing/${id}/reject`, data),
  lockDayClosing: (id, data = {}) => api.post(`/daily-accounts/day-closing/${id}/lock`, data),
  deleteDayClosing: (id) => api.delete(`/daily-accounts/day-closing/${id}`),

  getDailyChecklists: (params) => api.get("/daily-accounts/daily-checklist", { params }),
  getDailyChecklistSummary: (params) => api.get("/daily-accounts/daily-checklist/summary", { params }),
  getDailyChecklist: (id) => api.get(`/daily-accounts/daily-checklist/${id}`),
  createDailyChecklist: (data) => api.post("/daily-accounts/daily-checklist", data),
  updateDailyChecklist: (id, data) => api.put(`/daily-accounts/daily-checklist/${id}`, data),
  submitDailyChecklist: (id) => api.post(`/daily-accounts/daily-checklist/${id}/submit`),
  verifyDailyChecklist: (id) => api.post(`/daily-accounts/daily-checklist/${id}/verify`),
  rejectDailyChecklist: (id, data) => api.post(`/daily-accounts/daily-checklist/${id}/reject`, data),
  deleteDailyChecklist: (id) => api.delete(`/daily-accounts/daily-checklist/${id}`),
};

export const uploadAPI = {
  uploadOpeningStock: (formData) =>
    api.post("/uploads/opening-stock", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  uploadClosingStock: (formData) =>
    api.post("/uploads/closing-stock", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  uploadMaterialPurchase: (formData) =>
    api.post("/uploads/material-purchase", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  uploadItemSales: (formData) =>
    api.post("/uploads/item-sales", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  getUploadHistory: (type, params) =>
    api.get(`/uploads/history/${type}`, { params }),
  getUploadErrors: (uploadId, uploadType) =>
    api.get(`/uploads/errors/${uploadId}`, { params: uploadType ? { upload_type: uploadType } : {} }),
  getItemSalesUploadById: (id) => api.get(`/uploads/item-sales/${id}`),
  downloadItemSalesTemplate: () =>
    api.get('/uploads/item-sales/template', { responseType: 'blob' }),
  deleteUpload: (id, type) => api.delete(`/uploads/${type}/${id}`),
  downloadOpeningStockOriginal: (id) =>
    api.get(`/uploads/opening_stock/${id}/download-original`, { responseType: "blob" }),
  downloadOpeningStockProcessed: (id) =>
    api.get(`/uploads/opening_stock/${id}/download-processed`, { responseType: "blob" }),
  downloadOpeningStockErrors: (id) =>
    api.get(`/uploads/opening_stock/${id}/download-errors`, { responseType: "blob" }),
  downloadOpeningStockTemplate: (params) =>
    api.get(`/uploads/opening_stock/template`, { params, responseType: "blob" }),
  downloadClosingStockOriginal: (id) =>
    api.get(`/uploads/closing_stock/${id}/download-original`, { responseType: "blob" }),
  downloadClosingStockProcessed: (id) =>
    api.get(`/uploads/closing_stock/${id}/download-processed`, { responseType: "blob" }),
  downloadClosingStockErrors: (id) =>
    api.get(`/uploads/closing_stock/${id}/download-errors`, { responseType: "blob" }),
  downloadClosingStockTemplate: (params) =>
    api.get(`/uploads/closing_stock/template`, { params, responseType: "blob" }),
  downloadMaterialPurchaseOriginal: (id) =>
    api.get(`/uploads/material_purchase/${id}/download-original`, { responseType: "blob" }),
  downloadMaterialPurchaseProcessed: (id) =>
    api.get(`/uploads/material_purchase/${id}/download-processed`, { responseType: "blob" }),
  downloadMaterialPurchaseErrors: (id) =>
    api.get(`/uploads/material_purchase/${id}/download-errors`, { responseType: "blob" }),
  downloadMaterialPurchaseTemplate: (params) =>
    api.get(`/uploads/material_purchase/template`, { params, responseType: "blob" }),
};

export const reportAPI = {
  getMonthlyPL: (params) => api.get("/reports/monthly-pl", { params }),
  finalizeMonthlyPL: (data) => api.post("/reports/monthly-pl/finalize", data),
  getOutletComparison: (params) => api.get("/reports/outlet-comparison", { params }),
  getActualConsumption: (params) =>
    api.get("/reports/actual-consumption", { params }),
  getTheoreticalConsumption: (params) =>
    api.get("/reports/theoretical-consumption", { params }),
  getDailyCashbook: (params) => api.get("/reports/daily-cashbook", { params }),
  getExpenseReport: (params) => api.get("/reports/expenses", { params }),
  getSupplierPending: (params) => api.get("/reports/supplier-pending", { params }),
  getConsumptionVariance: (params) => api.get("/reports/consumption-variance", { params }),
  getPurchaseGST: (params) => api.get("/reports/purchase-gst", { params }),
  getSalesGST: (params) => api.get("/reports/sales-gst", { params }),
  getGSTR1: (params) => api.get("/reports/gstr1", { params }),
};

export const recipeAPI = {
  getRecipes: (params) => api.get("/recipes", { params }),
  getRecipe: (id, params) => api.get(`/recipes/${id}`, { params }),
  createRecipe: (data) => api.post("/recipes", data),
  updateRecipe: (id, data) => api.put(`/recipes/${id}`, data),
  deleteRecipe: (id) => api.delete(`/recipes/${id}`),
  getUomConversion: (from, to) => api.get(`/recipes/uom-conversion/${from}/${to}`),
  getMaterialRate: (materialId, params) => api.get(`/recipes/material-rate/${materialId}`, { params }),
  getTheoreticalConsumption: (id, params) => api.get(`/recipes/${id}/theoretical-consumption`, { params }),
  getVersions: (id) => api.get(`/recipes/${id}/versions`),
  createNewVersion: (id) => api.post(`/recipes/${id}/new-version`),
  activateVersion: (id, data) => api.post(`/recipes/${id}/activate`, data),
};

export const payoutAPI = {
  getOnlinePayouts: (params) => api.get("/payouts/online", { params }),
  createOnlinePayout: (data) => api.post("/payouts/online", data),
  updateOnlinePayout: (id, data) => api.put(`/payouts/online/${id}`, data),
  deleteOnlinePayout: (id) => api.delete(`/payouts/online/${id}`),
  submitOnlinePayout: (id) => api.post(`/payouts/online/${id}/submit`),
  verifyOnlinePayout: (id) => api.post(`/payouts/online/${id}/verify`),
  rejectOnlinePayout: (id, reason) => api.post(`/payouts/online/${id}/reject`, { rejection_reason: reason }),

  getDineInPayouts: (params) => api.get("/payouts/dine-in", { params }),
  createDineInPayout: (data) => api.post("/payouts/dine-in", data),
  updateDineInPayout: (id, data) => api.put(`/payouts/dine-in/${id}`, data),
  deleteDineInPayout: (id) => api.delete(`/payouts/dine-in/${id}`),
  submitDineInPayout: (id) => api.post(`/payouts/dine-in/${id}/submit`),
  verifyDineInPayout: (id) => api.post(`/payouts/dine-in/${id}/verify`),
  rejectDineInPayout: (id, reason) => api.post(`/payouts/dine-in/${id}/reject`, { rejection_reason: reason }),
};

export const notificationAPI = {
  getNotifications: (params) => api.get("/notifications", { params }),
  getUnreadCount: ()        => api.get("/notifications/unread-count"),
  markAsRead:     (id)      => api.patch(`/notifications/${id}/read`),
  markAllAsRead:  ()        => api.patch("/notifications/read-all"),
};

export const deleteUtilityBill = (id) => api.delete(`/utility-bills/${id}`);

export const fixedCostsAPI = {
  getFixedCosts: (params) => api.get("/fixed-costs", { params }),
  createFixedCost: (data) => api.post("/fixed-costs", data),
  updateFixedCost: (id, data) => api.put(`/fixed-costs/${id}`, data),
  deleteFixedCost: (id) => api.delete(`/fixed-costs/${id}`),
  verifyFixedCost: (id, action) => api.post(`/fixed-costs/${id}/verify`, { action }),
};

export const warehouseAPI = {
  getLocations: (params) => api.get("/warehouse/locations", { params }),
  createLocation: (data) => api.post("/warehouse/locations", data),
  updateLocation: (id, data) => api.put(`/warehouse/locations/${id}`, data),
  getLocationSummary: (id) => api.get(`/warehouse/locations/${id}/summary`),
  getDashboard: (params) => api.get("/warehouse/dashboard", { params }),
  getStock: (params) => api.get("/warehouse/stock", { params }),
  getLedger: (params) => api.get("/warehouse/ledger", { params }),
  postOpening: (data) => api.post("/warehouse/opening", data),
  getGRNs: (params) => api.get("/warehouse/grn", { params }),
  getGRN: (id) => api.get(`/warehouse/grn/${id}`),
  createGRN: (data) => api.post("/warehouse/grn", data),
  postGRN: (id) => api.post(`/warehouse/grn/${id}/post`),
  getRequisitions: (params) => api.get("/warehouse/requisitions", { params }),
  getRequisition: (id) => api.get(`/warehouse/requisitions/${id}`),
  createRequisition: (data) => api.post("/warehouse/requisitions", data),
  submitRequisition: (id) => api.post(`/warehouse/requisitions/${id}/submit`),
  approveRequisition: (id, data) => api.post(`/warehouse/requisitions/${id}/approve`, data),
  dispatchRequisition: (id, data) => api.post(`/warehouse/requisitions/${id}/dispatch`, data),
  getTransfers: (params) => api.get("/warehouse/transfers", { params }),
  getTransfer: (id) => api.get(`/warehouse/transfers/${id}`),
  receiveTransfer: (id, data) => api.post(`/warehouse/transfers/${id}/receive`, data),

  getPhysicalStockCounts: (params) => api.get("/warehouse/physical-stock-counts", { params }),
  getPhysicalStockCount: (id) => api.get(`/warehouse/physical-stock-counts/${id}`),
  createPhysicalStockCount: (data) => api.post("/warehouse/physical-stock-counts", data),
  updatePhysicalStockCount: (id, data) => api.put(`/warehouse/physical-stock-counts/${id}`, data),
  deletePhysicalStockCount: (id) => api.delete(`/warehouse/physical-stock-counts/${id}`),
  submitPhysicalStockCount: (id) => api.post(`/warehouse/physical-stock-counts/${id}/submit`),
  verifyPhysicalStockCount: (id) => api.post(`/warehouse/physical-stock-counts/${id}/verify`),
  approvePhysicalStockCount: (id) => api.post(`/warehouse/physical-stock-counts/${id}/approve`),
  postPhysicalStockCount: (id) => api.post(`/warehouse/physical-stock-counts/${id}/post`),
  lockPhysicalStockCount: (id) => api.post(`/warehouse/physical-stock-counts/${id}/lock`),

  getStockAdjustments: (params) => api.get("/warehouse/stock-adjustments", { params }),
  getStockAdjustment: (id) => api.get(`/warehouse/stock-adjustments/${id}`),
  createStockAdjustment: (data) => api.post("/warehouse/stock-adjustments", data),
  updateStockAdjustment: (id, data) => api.put(`/warehouse/stock-adjustments/${id}`, data),
  deleteStockAdjustment: (id) => api.delete(`/warehouse/stock-adjustments/${id}`),
  submitStockAdjustment: (id) => api.post(`/warehouse/stock-adjustments/${id}/submit`),
  verifyStockAdjustment: (id) => api.post(`/warehouse/stock-adjustments/${id}/verify`),
  approveStockAdjustment: (id) => api.post(`/warehouse/stock-adjustments/${id}/approve`),
  postStockAdjustment: (id) => api.post(`/warehouse/stock-adjustments/${id}/post`),
  lockStockAdjustment: (id) => api.post(`/warehouse/stock-adjustments/${id}/lock`),

  getWarehouseWastages: (params) => api.get("/warehouse/warehouse-wastage", { params }),
  getWarehouseWastage: (id) => api.get(`/warehouse/warehouse-wastage/${id}`),
  createWarehouseWastage: (data) => api.post("/warehouse/warehouse-wastage", data),
  updateWarehouseWastage: (id, data) => api.put(`/warehouse/warehouse-wastage/${id}`, data),
  deleteWarehouseWastage: (id) => api.delete(`/warehouse/warehouse-wastage/${id}`),
  submitWarehouseWastage: (id) => api.post(`/warehouse/warehouse-wastage/${id}/submit`),
  verifyWarehouseWastage: (id) => api.post(`/warehouse/warehouse-wastage/${id}/verify`),
  approveWarehouseWastage: (id) => api.post(`/warehouse/warehouse-wastage/${id}/approve`),
  postWarehouseWastage: (id) => api.post(`/warehouse/warehouse-wastage/${id}/post`),
  lockWarehouseWastage: (id) => api.post(`/warehouse/warehouse-wastage/${id}/lock`),

  getBatches: (params) => api.get("/warehouse/batches", { params }),
  getAvailableBatches: (materialId, params) => api.get(`/warehouse/batches/${materialId}/available`, { params }),
  getFEFOAllocation: (materialId, params) => api.get(`/warehouse/batches/${materialId}/fefo`, { params }),
  getExpiryAlerts: (params) => api.get("/warehouse/expiry-alerts", { params }),

  getPurchaseReturns: (params) => api.get("/warehouse/purchase-returns", { params }),
  getPurchaseReturn: (id) => api.get(`/warehouse/purchase-returns/${id}`),
  createPurchaseReturn: (data) => api.post("/warehouse/purchase-returns", data),
  updatePurchaseReturn: (id, data) => api.put(`/warehouse/purchase-returns/${id}`, data),
  deletePurchaseReturn: (id) => api.delete(`/warehouse/purchase-returns/${id}`),
  submitPurchaseReturn: (id) => api.post(`/warehouse/purchase-returns/${id}/submit`),
  verifyPurchaseReturn: (id) => api.post(`/warehouse/purchase-returns/${id}/verify`),
  approvePurchaseReturn: (id) => api.post(`/warehouse/purchase-returns/${id}/approve`),
  rejectPurchaseReturn: (id, data) => api.post(`/warehouse/purchase-returns/${id}/reject`, data),
  postPurchaseReturn: (id) => api.post(`/warehouse/purchase-returns/${id}/post`),
  lockPurchaseReturn: (id) => api.post(`/warehouse/purchase-returns/${id}/lock`),
  getGRNsForReturn: (params) => api.get("/warehouse/purchase-returns/grns", { params }),
  getGRNItemsForReturn: (id) => api.get(`/warehouse/purchase-returns/grns/${id}/items`),
  getPurchaseReturnCreditsSummary: () => api.get("/warehouse/purchase-returns/credits-summary"),
  updatePurchaseReturnCreditStatus: (id, data) => api.put(`/warehouse/purchase-returns/credits/${id}/status`, data),

  getPurchaseOrders: (params) => api.get("/warehouse/purchase-orders", { params }),
  getPurchaseOrder: (id) => api.get(`/warehouse/purchase-orders/${id}`),
  createPurchaseOrder: (data) => api.post("/warehouse/purchase-orders", data),
  updatePurchaseOrder: (id, data) => api.put(`/warehouse/purchase-orders/${id}`, data),
  deletePurchaseOrder: (id) => api.delete(`/warehouse/purchase-orders/${id}`),
  submitPurchaseOrder: (id) => api.post(`/warehouse/purchase-orders/${id}/submit`),
  approvePurchaseOrder: (id) => api.post(`/warehouse/purchase-orders/${id}/approve`),
  rejectPurchaseOrder: (id, data) => api.post(`/warehouse/purchase-orders/${id}/reject`, data),
  sendPurchaseOrder: (id) => api.post(`/warehouse/purchase-orders/${id}/send`),
  closePurchaseOrder: (id, data) => api.post(`/warehouse/purchase-orders/${id}/close`, data),
  getPurchaseOrderReceiptSummary: (id) => api.get(`/warehouse/purchase-orders/${id}/receipt-summary`),
  getGRNPrefillFromPO: (id) => api.get(`/warehouse/purchase-orders/${id}/grn-prefill`),

  getSupplierHistory: (params) => api.get("/warehouse/supplier-history", { params }),
  getSupplierHistoryDetail: (id, params) => api.get(`/warehouse/supplier-history/${id}`, { params }),
  getSupplierHistoryMaterials: (id, params) => api.get(`/warehouse/supplier-history/${id}/materials`, { params }),
  getSupplierHistoryPriceMovement: (id, params) => api.get(`/warehouse/supplier-history/${id}/price-movement`, { params }),
  getSupplierHistoryTimeline: (id, params) => api.get(`/warehouse/supplier-history/${id}/timeline`, { params }),

  getReorderData: (params) => api.get("/warehouse/reorder", { params }),
  updateReorderSettings: (id, data) => api.put(`/warehouse/reorder/${id}/settings`, data),
  createDraftPOFromReorder: (data) => api.post("/warehouse/reorder/create-po", data),

  getWarehouseReportSummary: (locationId) => api.get("/warehouse/reports/summary", { params: { location_id: locationId } }),
  getWarehouseReport: (type, params) => api.get(`/warehouse/reports/${type}`, { params }),
  getWarehouseReportPack: (params) => api.get("/warehouse/reports/pack/export", { params, responseType: "blob" }),

  getWarehouseSettings: (locationId) => api.get("/warehouse/settings", { params: { location_id: locationId } }),
  updateWarehouseSettings: (data) => api.put("/warehouse/settings", data),
};

export const productionAPI = {
  getCentralKitchens: () => api.get("/production/central-kitchens"),
  getDashboard: (id) => api.get(`/production/dashboard/${id}`),
  getFinishedGoodsStock: (id) => api.get(`/production/finished-stock/${id}`),
  getProductionRequests: (id) => api.get("/production/requests", { params: { central_kitchen_id: id } }),
  getProductionRequest: (id) => api.get(`/production/requests/${id}`),
  createProductionRequest: (data) => api.post("/production/requests", data),
  updateRequestStatus: (id, data) => api.patch(`/production/requests/${id}/status`, data),
  getProductionPlans: (id) => api.get("/production/plans", { params: { central_kitchen_id: id } }),
  getProductionPlan: (id) => api.get(`/production/plans/${id}`),
  createProductionPlan: (data) => api.post("/production/plans", data),
  updatePlanStatus: (id, status) => api.patch(`/production/plans/${id}/status`, { status }),
  getProductionBatches: (id) => api.get("/production/batches", { params: { central_kitchen_id: id } }),
  getProductionBatch: (id) => api.get(`/production/batches/${id}`),
  createProductionBatch: (data) => api.post("/production/batches", data),
  getBatchAvailability: (id) => api.get(`/production/batches/${id}/availability`),
  postProductionBatch: (id) => api.post(`/production/batches/${id}/post`),
  setBatchMaterials: (id, data) => api.put(`/production/batches/${id}/materials`, data),
  setBatchActualQty: (id, data) => api.patch(`/production/batches/${id}/actual-qty`, data),
  getWastageKPIs: (id) => api.get(`/production/variance-kpis/${id}`),
  getProductionWastages: (params) => api.get("/production/wastage", { params }),
  getProductionWastage: (id) => api.get(`/production/wastage/${id}`),
  createProductionWastage: (data) => api.post("/production/wastage", data),
  updateProductionWastage: (id, data) => api.put(`/production/wastage/${id}`, data),
  submitProductionWastage: (id) => api.post(`/production/wastage/${id}/submit`),
  verifyProductionWastage: (id) => api.post(`/production/wastage/${id}/verify`),
  approveProductionWastage: (id) => api.post(`/production/wastage/${id}/approve`),
  rejectProductionWastage: (id) => api.post(`/production/wastage/${id}/reject`),
  postProductionWastage: (id) => api.post(`/production/wastage/${id}/post`),
  lockProductionWastage: (id) => api.post(`/production/wastage/${id}/lock`),
  exportProductionWastage: (params) => api.get("/production/wastage-export", { params, responseType: "blob" }),
  getProductionVariance: (params) => api.get("/production/variance", { params }),
  getProductionVarianceByBatch: (id) => api.get(`/production/variance/${id}`),
  exportProductionVariance: (params) => api.get("/production/variance-export", { params, responseType: "blob" }),
  getProductionDispatches: (params) => api.get("/production/dispatch", { params }),
  getProductionDispatchKPIs: (params) => api.get("/production/dispatch-kpis", { params }),
  getProductionProfitReport: (params) => api.get("/production/profit", { params }),
  getProductionDispatch: (id) => api.get(`/production/dispatch/${id}`),
  getPendingRequestItems: (requestId) => api.get(`/production/dispatch/pending-items/${requestId}`),
  createProductionDispatch: (data) => api.post("/production/dispatch", data),
  postProductionDispatch: (id) => api.post(`/production/dispatch/${id}/post`),
  receiveProductionDispatch: (id, data) => api.post(`/production/dispatch/${id}/receive`, data),
  exportProductionDispatches: (params) => api.get("/production/dispatch-export", { params, responseType: "blob" }),
};

export const outletVendorAPI = {
  getVendors: (params) => api.get("/outlet-vendors", { params }),
  getVendor: (id) => api.get(`/outlet-vendors/${id}`),
  createVendor: (data) => api.post("/outlet-vendors", data),
  updateVendor: (id, data) => api.put(`/outlet-vendors/${id}`, data),
  deleteVendor: (id) => api.delete(`/outlet-vendors/${id}`),
  getOutstandingReport: (params) => api.get("/outlet-vendors/outstanding-report", { params }),
  getLedger: (params) => api.get("/outlet-vendors/ledger", { params }),
  getPurchases: (params) => api.get("/outlet-vendors/purchases/list", { params }),
  createPurchase: (data) => api.post("/outlet-vendors/purchases", data),
  createPurchasesBatch: (data) => api.post("/outlet-vendors/purchases/batch", data),
  deletePurchase: (id) => api.delete(`/outlet-vendors/purchases/${id}`),
  getPayments: (params) => api.get("/outlet-vendors/payments/list", { params }),
  createPayment: (data) => api.post("/outlet-vendors/payments", data),
};

export default api;
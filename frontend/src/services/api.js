import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5001/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Get token safely from different possible storage formats
const getStoredToken = () => {
  const directToken =
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    sessionStorage.getItem("token");

  if (directToken) return directToken;

  const possibleKeys = ["auth-storage", "authStore", "bigbean-auth"];

  for (const key of possibleKeys) {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) continue;

      const parsed = JSON.parse(stored);

      const token =
        parsed?.state?.token ||
        parsed?.state?.user?.token ||
        parsed?.token ||
        parsed?.user?.token;

      if (token) return token;
    } catch {
      // ignore invalid json
    }
  }

  return null;
};

export const getSelectedOutletId = () =>
  localStorage.getItem("bbc_selected_outlet_id") || "all";

const shouldAppendOutletId = (config) => {
  const method = String(config.method || "get").toLowerCase();
  const url = String(config.url || "");

  if (method !== "get") return false;
  if (url.includes("/auth/login") || url.includes("/auth/me")) return false;
  if (config.params && Object.prototype.hasOwnProperty.call(config.params, "outlet_id")) return false;

  return true;
};

api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (token && shouldAppendOutletId(config)) {
      config.params = {
        ...(config.params || {}),
        outlet_id: getSelectedOutletId()
      };
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn("Unauthorized. Please login again.");
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (data) => api.post("/auth/login", data),
  me: () => api.get("/auth/me"),
  changePassword: (data) => api.post("/auth/change-password", data)
};

export const userAPI = {
  getUsers: (params) => api.get("/users", { params }),
  getUsersByOutlet: (outlet_id) => api.get(`/users/outlet/${outlet_id}`),
  getUserById: (id) => api.get(`/users/${id}`),
  createUser: (data) => api.post("/users", data),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
  deleteUser: (id) => api.delete(`/users/${id}`),
  assignUserToOutlet: (id, data) => api.post(`/users/${id}/assign-outlet`, data),
  toggleUserStatus: (id) => api.patch(`/users/${id}/toggle-status`)
};

export const roleAPI = {
  getRoles: () => api.get("/roles")
};

export const roleAccessAPI = {
  getRoles: () => api.get("/role-access/roles"),
  getPermissions: (roleId) => api.get(`/role-access/${roleId}`),
  updatePermissions: (roleId, permissions) =>
    api.put(`/role-access/${roleId}`, { permissions })
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
      params: { outlet_id: getSelectedOutletId(), ...params }
    })
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

  getMenuItems: (params) => api.get("/masters/menu-items", { params }),
  createMenuItem: (data) => api.post("/masters/menu-items", data),
  updateMenuItem: (id, data) => api.put(`/masters/menu-items/${id}`, data),
  deleteMenuItem: (id) => api.delete(`/masters/menu-items/${id}`),

  getUnits: (params) => api.get("/masters/units", { params }),
  getExpenseHeads: (params) => api.get("/masters/expense-heads", { params }),
  getPaymentModes: (params) => api.get("/masters/payment-modes", { params }),
  getOnlinePlatforms: (params) => api.get("/masters/online-platforms", { params }),
  getDineInPortals: (params) => api.get("/masters/dine-in-portals", { params })
};

export const dailyAccountsAPI = {
  getCashbooks: (params) => api.get('/daily-accounts/cashbooks', { params }),
  createCashbook: (data) => api.post('/daily-accounts/cashbooks', data),
  updateCashbook: (id, data) => api.put(`/daily-accounts/cashbooks/${id}`, data),
  verifyCashbook: (id, data) => api.post(`/daily-accounts/cashbooks/${id}/verify`, data),
  
  getExpenses: (params) => api.get('/daily-accounts/expenses', { params }),
  createExpense: (formData) => api.post('/daily-accounts/expenses', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  approveExpense: (id, data) => api.post(`/daily-accounts/expenses/${id}/approve`, data),
  
  createBankDeposit: (formData) => api.post('/daily-accounts/bank-deposits', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  
  getDayClosings: (params) => api.get('/daily-accounts/day-closing', { params }),
  createDayClosing: (data) => api.post('/daily-accounts/day-closing', data),
  verifyDayClosing: (id, data) => api.post(`/daily-accounts/day-closing/${id}/verify`, data)
};

export const uploadAPI = {
  uploadOpeningStock: (formData) => api.post('/uploads/opening-stock', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  uploadClosingStock: (formData) => api.post('/uploads/closing-stock', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  uploadMaterialPurchase: (formData) => api.post('/uploads/material-purchase', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  uploadItemSales: (formData) => api.post('/uploads/item-sales', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getUploadHistory: (type, params) => api.get(`/uploads/history/${type}`, { params }),
  getUploadErrors: (uploadId) => api.get(`/uploads/errors/${uploadId}`)
};

export const reportAPI = {
  getMonthlyPL: (params) => api.get('/reports/monthly-pl', { params }),
  getActualConsumption: (params) => api.get('/reports/actual-consumption', { params }),
  getTheoreticalConsumption: (params) => api.get('/reports/theoretical-consumption', { params }),
  getDailyCashbook: (params) => api.get('/reports/daily-cashbook', { params }),
  getExpenseReport: (params) => api.get('/reports/expenses', { params })
};

export const recipeAPI = {
  getRecipes: (params) => api.get('/recipes', { params }),
  getRecipe: (id) => api.get(`/recipes/${id}`),
  createRecipe: (data) => api.post('/recipes', data),
  updateRecipe: (id, data) => api.put(`/recipes/${id}`, data),
  deleteRecipe: (id) => api.delete(`/recipes/${id}`)
};

export const payoutAPI = {
  getOnlinePayouts: (params) => api.get('/payouts/online', { params }),
  createOnlinePayout: (data) => api.post('/payouts/online', data),
  updateOnlinePayout: (id, data) => api.put(`/payouts/online/${id}`, data),
  deleteOnlinePayout: (id) => api.delete(`/payouts/online/${id}`),
  
  getDineInPayouts: (params) => api.get('/payouts/dine-in', { params }),
  createDineInPayout: (data) => api.post('/payouts/dine-in', data),
  updateDineInPayout: (id, data) => api.put(`/payouts/dine-in/${id}`, data),
  deleteDineInPayout: (id) => api.delete(`/payouts/dine-in/${id}`)
};

export default api;
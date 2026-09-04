import { create } from 'zustand';

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  
  login: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    set({ user, token, isAuthenticated: true });
  },
  
  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    // bbc_permissions holds the full permissions matrix (several KB of JSON) -
    // if left behind, api.js's getStoredToken() fallback scanner can mistake
    // it for an auth token on the next request and attach it as a garbage
    // Authorization header, breaking the very next login.
    localStorage.removeItem('bbc_permissions');
    // The selected outlet/warehouse-location survives logout by design (it's
    // read directly from localStorage, not this store) - on a shared browser,
    // the next person to log in inherits whatever the previous user last had
    // selected. For an outlet-locked role that's a different outlet than
    // their own, api.js's request interceptor auto-attaches that stale id to
    // their very first request, and applyOutletScope correctly 403s it - no
    // data ever leaks, but the new user sees a "you do not have access"
    // error on login through no fault of their own, before the UI
    // self-corrects to their real outlet a moment later. Clearing both here
    // means every login starts from a clean, unscoped selection instead.
    localStorage.removeItem('bbc_selected_outlet_id');
    localStorage.removeItem('bbc_warehouse_location_id');
    set({ user: null, token: null, isAuthenticated: false });
  },
  
  updateUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user));
    set({ user });
  }
}));

export default useAuthStore;

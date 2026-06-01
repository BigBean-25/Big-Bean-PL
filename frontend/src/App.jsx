import { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
  Link,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import {
  Home,
  LockKeyhole,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

import useAuthStore from "./store/authStore";

import Login from "./pages/Login";
import DashboardLayout from "./layouts/DashboardLayout";
import Dashboard from "./pages/Dashboard";

import Outlets from "./pages/masters/Outlets";
import Categories from "./pages/masters/Categories";
import Suppliers from "./pages/masters/Suppliers";
import RawMaterials from "./pages/masters/RawMaterials";
import MenuItems from "./pages/masters/MenuItems";

import DailyCashbook from "./pages/daily-accounts/DailyCashbook";
import DailyCashExpenses from "./pages/daily-accounts/DailyCashExpenses";
import DayClosing from "./pages/daily-accounts/DayClosing";
import DayClosingChecklist from "./pages/daily-accounts/DayClosingChecklist";

import OpeningStockUpload from "./pages/stock/OpeningStockUpload";
import ClosingStockUpload from "./pages/stock/ClosingStockUpload";

import MaterialPurchaseUpload from "./pages/purchases/MaterialPurchaseUpload";

import ItemSalesUpload from "./pages/sales/ItemSalesUpload";

import RecipeList from "./pages/recipe/RecipeList";
import RecipeForm from "./pages/recipe/RecipeForm";

import OnlinePayouts from "./pages/payouts/OnlinePayouts";
import DineInPayouts from "./pages/payouts/DineInPayouts";

import MonthlyPLReport from "./pages/reports/MonthlyPLReport";
import ActualConsumptionReport from "./pages/reports/ActualConsumptionReport";
import DailyCashbookReport from "./pages/reports/DailyCashbookReport";
import ExpenseReport from "./pages/reports/ExpenseReport";

import UserManagement from "./pages/users/UserManagement";
import RoleAccess from "./pages/users/RoleAccess";

import EmployeeSalary from "./pages/payroll/EmployeeSalary";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [pathname]);

  return null;
}

function PrivateRoute({ children }) {
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

function PublicRoute({ children }) {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function NotFound() {
  return (
    <div className="min-h-[75vh] bg-slate-50 px-4 py-10">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-center text-center">
        <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-8 shadow-2xl shadow-slate-200 sm:p-12">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-slate-900/10 blur-3xl" />

          <div className="relative">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-950 text-amber-300 shadow-xl shadow-slate-200">
              <AlertTriangle size={34} />
            </div>

            <p className="mt-6 text-sm font-black uppercase tracking-[0.25em] text-amber-600">
              Big Bean Café ERP
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              Page Not Found
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-sm font-medium leading-6 text-slate-500 sm:text-base">
              The page you are trying to open is not available or the route has
              not been added yet. Please go back to the dashboard.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-amber-300 shadow-xl shadow-slate-200 transition hover:bg-slate-800"
              >
                <Home size={18} />
                Go to Dashboard
              </Link>

              <button
                type="button"
                onClick={() => window.history.back()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft size={18} />
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProtectedAccessFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/10 p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-300 text-slate-950">
          <LockKeyhole size={28} />
        </div>

        <h1 className="mt-6 text-2xl font-black text-white">
          Secure Access Required
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-300">
          Please login to access the Big Bean Café management dashboard.
        </p>

        <Link
          to="/login"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-6 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200"
        >
          <ShieldCheck size={18} />
          Login Now
        </Link>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <ScrollToTop />

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: "18px",
            background: "#0f172a",
            color: "#fff",
            fontWeight: "700",
            boxShadow: "0 20px 60px rgba(15, 23, 42, 0.25)",
          },
          success: {
            iconTheme: {
              primary: "#facc15",
              secondary: "#0f172a",
            },
          },
          error: {
            iconTheme: {
              primary: "#ef4444",
              secondary: "#ffffff",
            },
          },
        }}
      />

      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        <Route
          path="/"
          element={
            <PrivateRoute>
              <DashboardLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Navigate to="/" replace />} />

          <Route path="users" element={<UserManagement />} />
          <Route path="role-access" element={<RoleAccess />} />

          <Route path="masters">
            <Route index element={<Navigate to="/masters/outlets" replace />} />
            <Route path="outlets" element={<Outlets />} />
            <Route path="categories" element={<Categories />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="raw-materials" element={<RawMaterials />} />
            <Route path="menu-items" element={<MenuItems />} />
          </Route>

          <Route path="daily-accounts">
            <Route
              index
              element={<Navigate to="/daily-accounts/cashbook" replace />}
            />
            <Route path="cashbook" element={<DailyCashbook />} />
            <Route path="expenses" element={<DailyCashExpenses />} />
            <Route path="day-closing" element={<DayClosing />} />
            <Route path="checklist" element={<DayClosingChecklist />} />
          </Route>

          <Route path="payroll">
            <Route
              index
              element={<Navigate to="/payroll/employee-salary" replace />}
            />
            <Route path="employee-salary" element={<EmployeeSalary />} />
          </Route>

          <Route path="stock">
            <Route
              index
              element={<Navigate to="/stock/opening-stock" replace />}
            />
            <Route path="opening-stock" element={<OpeningStockUpload />} />
            <Route path="closing-stock" element={<ClosingStockUpload />} />
          </Route>

          <Route path="purchases">
            <Route
              index
              element={<Navigate to="/purchases/material-purchase" replace />}
            />
            <Route
              path="material-purchase"
              element={<MaterialPurchaseUpload />}
            />
          </Route>

          <Route path="sales">
            <Route index element={<Navigate to="/sales/item-sales" replace />} />
            <Route path="item-sales" element={<ItemSalesUpload />} />
          </Route>

          <Route path="recipes">
            <Route index element={<RecipeList />} />
            <Route path="new" element={<RecipeForm />} />
            <Route path="edit/:id" element={<RecipeForm />} />
          </Route>

          <Route path="payouts">
            <Route index element={<Navigate to="/payouts/online" replace />} />
            <Route path="online" element={<OnlinePayouts />} />
            <Route path="dine-in" element={<DineInPayouts />} />
          </Route>

          <Route path="reports">
            <Route
              index
              element={<Navigate to="/reports/monthly-pl" replace />}
            />
            <Route path="monthly-pl" element={<MonthlyPLReport />} />
            <Route
              path="actual-consumption"
              element={<ActualConsumptionReport />}
            />
            <Route
              path="daily-cashbook"
              element={<DailyCashbookReport />}
            />
            <Route path="expense-report" element={<ExpenseReport />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="/secure-access" element={<ProtectedAccessFallback />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { authAPI } from "../services/api";
import useAuthStore from "../store/authStore";
import toast from "react-hot-toast";

const LOGO_SRC = "/logo.webp";
const ILLUSTRATION_SRC = "/login-illustration.png";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuthStore();

  const redirectTo = location.state?.from?.pathname || "/";

  useEffect(() => {
    const savedEmail = localStorage.getItem("bigbean_login_email");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const getLoginData = (response) => {
    const payload = response?.data?.data || response?.data || {};

    return {
      user: payload?.user || payload?.admin || payload?.profile || null,
      token: payload?.token || payload?.accessToken || payload?.jwt || null,
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Please enter email");
      return;
    }

    if (!password.trim()) {
      toast.error("Please enter password");
      return;
    }

    setLoading(true);

    try {
      const response = await authAPI.login({
        email: email.trim(),
        password,
      });

      const { user, token } = getLoginData(response);

      if (!user || !token) {
        throw new Error("Invalid login response from server");
      }

      login(user, token);

      if (rememberMe) {
        localStorage.setItem("bigbean_login_email", email.trim());
      } else {
        localStorage.removeItem("bigbean_login_email");
      }

      toast.success("Login successful");
      navigate(redirectTo, { replace: true });
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          error.message ||
          "Login failed. Please check email and password."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    toast("Please contact Super Admin to reset your password.");
  };

  return (
    <div
      className="min-h-screen overflow-hidden bg-[#F8F7FA] text-[#2F2B3D]"
      style={{
        fontFamily:
          '"Public Sans", "Inter", "Manrope", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[68%_32%]">
        <section className="relative hidden min-h-screen overflow-hidden bg-[#F8F7FA] lg:block">
          <div className="absolute left-8 top-6 z-20 flex items-center gap-3">
            <img
              src={LOGO_SRC}
              alt="Big Bean Café"
              className="h-12 w-12 object-contain"
            />
            <div>
              <h1 className="text-[22px] font-black leading-none tracking-tight text-[#2F2B3D]">
                Big Bean Café
              </h1>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#A8AAAE]">
                Coffee Roasters
              </p>
            </div>
          </div>

          <div className="absolute left-[-120px] top-[-120px] h-[360px] w-[360px] rounded-full bg-[#F0EEF8]" />
          <div className="absolute bottom-[-190px] left-[-100px] h-[430px] w-[430px] rounded-full bg-[#F0EEF8]" />
          <div className="absolute left-[29%] top-[7%] h-[570px] w-[570px] rounded-full border border-[#E4E2EC]" />
          <div className="absolute left-[33%] top-[12%] h-[455px] w-[455px] rounded-full bg-[#EEECF5]" />

          <div className="relative z-10 flex h-screen items-center justify-center px-8 pt-12">
            <img
              src={ILLUSTRATION_SRC}
              alt="Dashboard illustration"
              className="w-full max-w-[760px] object-contain"
              style={{
                maxHeight: "78vh",
              }}
            />
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center bg-white px-6 py-8">
          <div className="w-full max-w-[450px]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <img
                src={LOGO_SRC}
                alt="Big Bean Café"
                className="h-14 w-14 object-contain"
              />
              <div>
                <h1 className="text-2xl font-black leading-none text-[#2F2B3D]">
                  Big Bean Café
                </h1>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-[#A8AAAE]">
                  Coffee Roasters
                </p>
              </div>
            </div>

            <div className="mb-7">
              <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[#2F2B3D]">
                Welcome to Big Bean ERP!{" "}
                <span className="inline-block origin-bottom animate-pulse">
                  👋
                </span>
              </h2>

              <p className="mt-3 text-[15px] font-normal leading-7 text-[#6F6B7D]">
                Please sign in to your account and start managing outlet
                accounts, stock, sales and P&amp;L reports.
              </p>
            </div>

            <div className="mb-6 rounded-md bg-[#EFECFF] px-4 py-3 text-[14px] font-medium text-[#7367F0]">
              <div className="flex items-center gap-2">
                <ShieldCheck size={17} />
                <span>Authorized Big Bean Café staff login only</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-[14px] font-medium text-[#7367F0]">
                  Email
                </label>

                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]"
                  />

                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    placeholder="Enter your email"
                    autoComplete="email"
                    className="h-[44px] w-full rounded-md border border-[#7367F0] bg-white pl-11 pr-4 text-[15px] font-normal text-[#2F2B3D] outline-none transition placeholder:text-[#A8AAAE] focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.18)]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[14px] font-medium text-[#5D596C]">
                  Password
                </label>

                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A8AAAE]"
                  />

                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="h-[44px] w-full rounded-md border border-[#DBDADE] bg-white pl-11 pr-12 text-[15px] font-normal text-[#2F2B3D] outline-none transition placeholder:text-[#A8AAAE] focus:border-[#7367F0] focus:shadow-[0_0_0_3px_rgba(115,103,240,0.18)]"
                    required
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    disabled={loading}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A8AAAE] transition hover:text-[#5D596C]"
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <label className="flex cursor-pointer items-center gap-3 text-[15px] font-normal text-[#5D596C]">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={loading}
                    className="h-[18px] w-[18px] rounded border-[#DBDADE] accent-[#7367F0]"
                  />
                  Remember me
                </label>

                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-[15px] font-medium text-[#7367F0] transition hover:text-[#5E50EE]"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex h-[46px] w-full items-center justify-center gap-2 rounded-md bg-[#7367F0] px-5 text-[15px] font-semibold text-white shadow-[0_4px_12px_rgba(115,103,240,0.4)] transition hover:bg-[#675DD8] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <Loader2 size={19} className="animate-spin" />
                    Logging in...
                  </>
                ) : (
                  "Login"
                )}
              </button>
            </form>

            <div className="mt-7 flex items-center justify-center gap-2 text-[14px] font-normal text-[#6F6B7D]">
              <CheckCircle2 size={17} className="text-emerald-500" />
              Secure outlet accounts and P&amp;L control system
            </div>

            <p className="mt-8 text-center text-[12px] font-medium text-[#A8AAAE]">
              © {new Date().getFullYear()} Big Bean Café Coffee Roasters. All
              rights reserved.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
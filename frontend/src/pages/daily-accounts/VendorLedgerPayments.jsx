import { useEffect, useMemo, useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Loader2,
  Wallet,
  RotateCcw,
  IndianRupee,
  CheckCircle2,
  Calendar,
  Building2,
  Truck,
  AlertTriangle,
} from "lucide-react";
import useAuthStore from "../../store/authStore";
import { outletVendorAPI, masterAPI } from "../../services/api";
import toast from "react-hot-toast";

const getPrimaryColor = () => {
  try {
    return localStorage.getItem("bbc_primary_color") || "#7367F0";
  } catch {
    return "#7367F0";
  }
};

const getThemeMode = () => {
  try {
    const m = localStorage.getItem("bbc_theme_mode") || "light";
    return m === "system"
      ? window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
        ? "dark"
        : "light"
      : m;
  } catch {
    return "light";
  }
};

const fmtINR = (n = 0) =>
  "₹" +
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const today = () => new Date().toISOString().slice(0, 10);

const formatDisplayDate = (value) => {
  if (!value) return "-";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  if (!y || !m || !d) return String(value).slice(0, 10);
  return `${d}-${m}-${y}`;
};

const toTs = (value) => {
  const n = new Date(value).getTime();
  return Number.isNaN(n) ? 0 : n;
};

const previousDay = (dateStr) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const statusBadge = (outstanding) => {
  if (outstanding > 0.005) {
    return { text: "Outstanding", color: "text-[#FF9F43]", bg: "bg-[#FFF4E5]" };
  }
  if (outstanding < -0.005) {
    return { text: "Credit / Overpaid", color: "text-[#00CFE8]", bg: "bg-[#E6FAFD]" };
  }
  return { text: "Settled", color: "text-[#28C76F]", bg: "bg-[#E9F9EF]" };
};

export default function VendorLedgerPayments() {
  const { user } = useAuthStore();
  const outletContext = useOutletContext() || {};
  const { selectedOutletId = "all", availableOutlets = [] } = outletContext;

  const primaryColor = getPrimaryColor();
  const isDark = getThemeMode() === "dark";
  const cardCls = isDark
    ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
    : "border-[#EBE9F1] bg-white text-[#2F2B3D]";
  const inputCls = isDark
    ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6]"
    : "border-[#DBDADE] bg-white text-[#2F2B3D]";
  const mutedCls = isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]";
  const mainCls = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";
  const borderCls = isDark ? "border-[#3B405A]" : "border-[#EBE9F1]";

  const isAdmin = ["Super Admin", "Admin", "Developer"].includes(user?.role_name);
  const userOutletIds = useMemo(
    () => (user?.outlets || []).map((o) => String(o.id || o.outlet_id)),
    [user]
  );

  const [outlets, setOutlets] = useState(availableOutlets);
  const [vendors, setVendors] = useState([]);
  const [paymentModes, setPaymentModes] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [payments, setPayments] = useState([]);
  const [currentLedger, setCurrentLedger] = useState(null);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);

  const [filters, setFilters] = useState({
    outlet_id: selectedOutletId || "",
    vendor_id: "",
    from_date: "",
    to_date: "",
  });

  const [payAmount, setPayAmount] = useState("");
  const [payModeId, setPayModeId] = useState("");
  const [payRef, setPayRef] = useState("");

  const visibleOutlets = useMemo(
    () => (isAdmin ? outlets : outlets.filter((o) => userOutletIds.includes(String(o.id)))),
    [outlets, userOutletIds, isAdmin]
  );

  useEffect(() => {
    setOutlets(availableOutlets);
  }, [availableOutlets]);

  useEffect(() => {
    setFilters((f) => ({ ...f, outlet_id: selectedOutletId || "" }));
  }, [selectedOutletId]);

  const fetchLookups = useCallback(async () => {
    try {
      const [v, pm] = await Promise.all([
        outletVendorAPI.getVendors({ is_active: 1 }),
        masterAPI.getPaymentModes(),
      ]);
      setVendors(v?.data?.data || []);
      setPaymentModes(Array.isArray(pm?.data?.data) ? pm.data.data : (pm?.data || []));
    } catch {
      toast.error("Failed to load lookups");
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!filters.outlet_id || !filters.vendor_id) {
      setPurchases([]);
      setPayments([]);
      setCurrentLedger(null);
      setOpeningBalance(0);
      return;
    }
    setLoading(true);
    try {
      const calls = [
        outletVendorAPI.getPurchases({
          outlet_id: filters.outlet_id,
          vendor_id: filters.vendor_id,
          from_date: filters.from_date || undefined,
          to_date: filters.to_date || undefined,
          limit: 1000,
        }),
        outletVendorAPI.getPayments({
          outlet_id: filters.outlet_id,
          vendor_id: filters.vendor_id,
          from_date: filters.from_date || undefined,
          to_date: filters.to_date || undefined,
          limit: 1000,
        }),
        outletVendorAPI.getLedger({
          outlet_id: filters.outlet_id,
          vendor_id: filters.vendor_id,
          date: today(),
        }),
      ];
      if (filters.from_date) {
        calls.push(
          outletVendorAPI.getLedger({
            outlet_id: filters.outlet_id,
            vendor_id: filters.vendor_id,
            date: previousDay(filters.from_date),
          })
        );
      }
      const [pRes, pmRes, curRes, openRes] = await Promise.all(calls);
      setPurchases(pRes?.data?.data || []);
      setPayments(pmRes?.data?.data || []);
      setCurrentLedger(curRes?.data?.data || null);
      setOpeningBalance(openRes?.data?.data?.current_outstanding || 0);
    } catch {
      toast.error("Failed to load ledger");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { timeline, totalPayable, totalPayments, outstanding } = useMemo(() => {
    const purchaseRows = (purchases || []).map((p) => ({
      id: `p-${p.id}`,
      type: "Purchase",
      date: p.purchase_date,
      created_at: p.created_at,
      reference: p.purchase_no,
      description: p.description,
      debit: p.paid_by === "Outlet" ? 0 : Number(p.amount || 0),
      credit: 0,
      notes: [
        p.paid_by === "Outlet" ? "Paid by outlet at purchase" : "",
        Number(p.is_emergency) === 1 ? "Emergency" : "",
        p.remarks,
      ]
        .filter(Boolean)
        .join(" • "),
    }));

    const paymentRows = (payments || []).map((p) => ({
      id: `pay-${p.id}`,
      type: "Payment",
      date: p.date,
      created_at: p.created_at,
      reference: p.reference_no || `PAY-${p.id}`,
      description: "Payment to vendor",
      debit: 0,
      credit: Number(p.paid_amount || 0),
      notes: p.remarks || "",
    }));

    const rows = [...purchaseRows, ...paymentRows].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const aTs = toTs(a.created_at);
      const bTs = toTs(b.created_at);
      if (aTs !== bTs) return aTs - bTs;
      if (a.type === "Purchase" && b.type === "Payment") return -1;
      if (a.type === "Payment" && b.type === "Purchase") return 1;
      return String(a.id).localeCompare(String(b.id));
    });

    let balance = openingBalance;
    const timeline = rows.map((r) => {
      balance += r.debit - r.credit;
      return { ...r, balance };
    });

    const totalPayable = purchaseRows.reduce((s, r) => s + r.debit, 0);
    const totalPayments = paymentRows.reduce((s, r) => s + r.credit, 0);
    const outstanding = openingBalance + totalPayable - totalPayments;

    return { timeline, totalPayable, totalPayments, outstanding };
  }, [purchases, payments, openingBalance]);

  const status = useMemo(() => statusBadge(outstanding), [outstanding]);
  const canPay = currentLedger && currentLedger.current_outstanding > 0.005;

  const handleRecordPayment = async () => {
    if (paying || !canPay) return;
    if (!payAmount || Number(payAmount) <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    if (Number(payAmount) > currentLedger.current_outstanding + 0.005) {
      toast.error(`Payment cannot exceed current outstanding of ${fmtINR(currentLedger.current_outstanding)}`);
      return;
    }
    setPaying(true);
    try {
      await outletVendorAPI.createPayment({
        outlet_id: filters.outlet_id,
        vendor_id: filters.vendor_id,
        date: today(),
        paid_amount: Number(payAmount),
        payment_mode_id: payModeId || null,
        reference_no: payRef || null,
      });
      toast.success("Payment recorded");
      setPayAmount("");
      setPayModeId("");
      setPayRef("");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to record payment");
    } finally {
      setPaying(false);
    }
  };

  const resetFilters = () =>
    setFilters({
      outlet_id: selectedOutletId || "",
      vendor_id: "",
      from_date: "",
      to_date: "",
    });

  const StatCard = ({ title, value, subtitle, icon: Icon, color, bg }) => (
    <div className={`rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:p-5 ${cardCls}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[13px] font-medium ${mutedCls}`}>{title}</p>
          <h3 className={`mt-1.5 text-[20px] font-semibold ${mainCls}`}>{value}</h3>
          <p className={`mt-1 text-[12px] ${mutedCls}`}>{subtitle}</p>
        </div>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: bg }}
        >
          <Icon size={20} style={{ color }} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl font-bold sm:text-2xl ${mainCls}`}>Vendor Ledger &amp; Payments</h1>
        <p className={`mt-1 text-[13px] sm:text-[14px] ${mutedCls}`}>
          Track purchases and payments for each outlet vendor, and record settlements.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {filters.from_date && (
          <StatCard title="Opening Balance" value={fmtINR(openingBalance)} subtitle={`As of ${formatDisplayDate(previousDay(filters.from_date))}`} icon={Calendar} color={primaryColor} bg={`${primaryColor}18`} />
        )}
        <StatCard title="Payable Purchases" value={fmtINR(totalPayable)} subtitle="Amount owed on purchases" icon={Truck} color={primaryColor} bg={`${primaryColor}18`} />
        <StatCard title="Total Payments" value={fmtINR(totalPayments)} subtitle="Settlements recorded" icon={Wallet} color="#28C76F" bg="#E9F9EF" />
        <StatCard title="Outstanding" value={fmtINR(outstanding)} subtitle="Current balance" icon={IndianRupee} color="#FF9F43" bg="#FFF4E5" />
        <StatCard title="Status" value={status.text} subtitle="Overall vendor position" icon={CheckCircle2} color={status.color.replace("text-", "")} bg={status.bg} />
      </div>

      <div className={`rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:p-5 ${cardCls}`}>
        <div className="mb-3 flex items-center gap-2">
          <Calendar size={16} style={{ color: primaryColor }} />
          <span className={`text-[12px] font-semibold uppercase tracking-wider ${mutedCls}`}>Filters</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <select
            value={filters.outlet_id}
            onChange={(e) => setFilters({ ...filters, outlet_id: e.target.value })}
            className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}
          >
            <option value="">Select outlet</option>
            {visibleOutlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.outlet_name}
              </option>
            ))}
          </select>
          <select
            value={filters.vendor_id}
            onChange={(e) => setFilters({ ...filters, vendor_id: e.target.value })}
            className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}
          >
            <option value="">Select vendor</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vendor_name} ({v.category})
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filters.from_date}
            onChange={(e) => setFilters({ ...filters, from_date: e.target.value })}
            className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}
          />
          <input
            type="date"
            value={filters.to_date}
            onChange={(e) => setFilters({ ...filters, to_date: e.target.value })}
            className={`h-10 w-full rounded-md border px-3 text-[13px] outline-none ${inputCls}`}
          />
          <button
            onClick={resetFilters}
            className={`flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-[13px] font-medium ${inputCls}`}
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {filters.outlet_id && filters.vendor_id && (
        <>
          <div className={`rounded-md border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] sm:p-5 ${cardCls}`}>
            <div className="mb-3 flex items-center gap-2">
              <Wallet size={16} style={{ color: primaryColor }} />
              <span className={`text-[12px] font-semibold uppercase tracking-wider ${mutedCls}`}>Record Payment</span>
            </div>

            {!canPay ? (
              <div className={`flex items-center gap-2 text-[13px] ${outstanding <= 0.005 ? "text-[#28C76F]" : mutedCls}`}>
                <CheckCircle2 size={15} />
                {outstanding <= 0.005
                  ? "Fully settled — no outstanding balance."
                  : "Loading ledger…"}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max={ledger.current_outstanding}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="Payment amount"
                  className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}
                />
                <select
                  value={payModeId}
                  onChange={(e) => setPayModeId(e.target.value)}
                  className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}
                >
                  <option value="">Payment mode</option>
                  {paymentModes.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.mode_name}
                    </option>
                  ))}
                </select>
                <input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="Reference no. (optional)"
                  className={`h-10 w-full rounded-md border px-3 text-[14px] outline-none ${inputCls}`}
                />
                <button
                  onClick={handleRecordPayment}
                  disabled={paying}
                  className="col-span-1 flex h-10 items-center justify-center gap-2 rounded-md px-4 text-[14px] font-semibold text-white disabled:opacity-70 sm:col-span-2"
                  style={{ backgroundColor: primaryColor }}
                >
                  {paying ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  {paying ? "Saving…" : "Record Payment"}
                </button>
              </div>
            )}
          </div>

          <div className={`rounded-md border shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${cardCls}`}>
            <div className={`border-b px-4 py-3 sm:px-6 ${borderCls}`}>
              <span className={`text-[12px] font-semibold uppercase tracking-wider ${mutedCls}`}>Ledger</span>
            </div>
            <div className="overflow-x-auto p-4 sm:p-5">
              <table className="min-w-full" style={{ minWidth: "900px" }}>
                <thead>
                  <tr>
                    {["Date", "Reference", "Entry Type", "Debit", "Credit", "Running Balance", "Notes"].map((h) => (
                      <th
                        key={h}
                        className={`whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider ${
                          isDark ? "bg-[#25293C] text-[#A5A8B6]" : "bg-[#F8F7FA] text-[#A8AAAE]"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${borderCls}`}>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center">
                        <Loader2 size={24} className="mx-auto animate-spin" style={{ color: primaryColor }} />
                      </td>
                    </tr>
                  ) : timeline.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center">
                        <span className={mutedCls}>No ledger entries for the selected filters</span>
                      </td>
                    </tr>
                  ) : (
                    timeline.map((r) => (
                      <tr key={r.id} className={isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F8F7FA]"}>
                        <td className={`px-3 py-2.5 text-[13px] ${mutedCls}`}>{formatDisplayDate(r.date)}</td>
                        <td className={`px-3 py-2.5 text-[13px] ${mainCls}`}>{r.reference}</td>
                        <td className={`px-3 py-2.5 text-[13px] ${mainCls}`}>{r.type}</td>
                        <td className={`px-3 py-2.5 text-[13px] font-semibold ${r.debit > 0 ? mainCls : mutedCls}`}>
                          {r.debit > 0 ? fmtINR(r.debit) : "-"}
                        </td>
                        <td className={`px-3 py-2.5 text-[13px] font-semibold ${r.credit > 0 ? mainCls : mutedCls}`}>
                          {r.credit > 0 ? fmtINR(r.credit) : "-"}
                        </td>
                        <td className={`px-3 py-2.5 text-[13px] font-semibold ${mainCls}`}>{fmtINR(r.balance)}</td>
                        <td className={`px-3 py-2.5 text-[13px] ${mutedCls}`}>{r.notes}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!filters.outlet_id || !filters.vendor_id ? (
        <div className={`rounded-md border p-6 text-center ${cardCls}`}>
          <Building2 size={28} className={`mx-auto ${mutedCls}`} />
          <p className={`mt-3 text-[14px] font-medium ${mainCls}`}>Select an outlet and a vendor to view the ledger</p>
        </div>
      ) : null}
    </div>
  );
}

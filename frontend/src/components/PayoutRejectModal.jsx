import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "./ui";

const monthName = (month) =>
  new Date(2000, Number(month || 1) - 1).toLocaleString("default", {
    month: "long",
  });

const formatINR = (value = 0) =>
  "₹" +
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const PayoutRejectModal = ({
  open,
  onClose,
  onConfirm,
  loading = false,
  isDark = false,
  type = "online",
  payout,
}) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setReason("");
      setError("");
      return;
    }

    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);

    return () => {
      clearTimeout(timer);
    };
  }, [open]);

  if (!open || !payout) return null;

  const cardClass = isDark
    ? "border-[#3B405A] bg-[#2F3349] text-[#D0D2D6]"
    : "border-[#EBE9F1] bg-white text-[#2F2B3D]";

  const inputClass = isDark
    ? "border-[#3B405A] bg-[#25293C] text-[#D0D2D6] placeholder:text-[#A5A8B6]"
    : "border-[#DBDADE] bg-white text-[#2F2B3D] placeholder:text-[#A8AAAE]";

  const mutedClass = isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]";
  const mainTextClass = isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]";

  const contextRows = [
    { label: "Outlet", value: payout.outlet_name || payout.outlet_id || "-" },
    {
      label: type === "dine-in" ? "Portal" : "Platform",
      value:
        (type === "dine-in" ? payout.portal_name : payout.platform_name) ||
        payout.platform_name ||
        payout.portal_name ||
        "-",
    },
    {
      label: "Period",
      value: `${monthName(payout.month)} ${payout.year || ""}`,
    },
    {
      label: type === "dine-in" ? "Net Received" : "Net Payout",
      value: formatINR(
        type === "dine-in" ? payout.net_received : payout.net_payout
      ),
    },
  ];

  const handleSubmit = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Rejection reason is required.");
      return;
    }
    if (trimmed.length < 3) {
      setError("Rejection reason must be at least 3 characters.");
      return;
    }
    setError("");
    onConfirm(trimmed);
  };

  const handleChange = (e) => {
    setReason(e.target.value);
    if (error) setError("");
  };

  const handleClose = () => {
    if (!loading) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      closeOnEsc={!loading}
      closeOnOverlay={!loading}
      title={
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FCEAEA] text-[#EA5455]">
            <AlertTriangle size={20} />
          </span>
          <span>
            <span className="block">Reject Payout</span>
            <span className={`mt-0.5 block text-[13px] font-normal ${mutedClass}`}>
              Please enter the reason for rejecting this payout.
            </span>
          </span>
        </span>
      }
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className={`rounded-md border px-5 py-2.5 text-[15px] font-medium transition disabled:cursor-not-allowed disabled:opacity-70 ${cardClass}`}
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handleSubmit}
            className="flex items-center justify-center gap-2 rounded-md bg-[#EA5455] px-5 py-2.5 text-[15px] font-semibold text-white transition hover:bg-[#D64545] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Rejecting...
              </>
            ) : (
              "Reject Payout"
            )}
          </button>
        </div>
      }
    >
      <div
        className={`mb-5 grid grid-cols-1 gap-3 rounded-md p-4 ${
          isDark ? "bg-[#25293C]" : "bg-[#F8F7FA]"
        }`}
      >
        {contextRows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className={`text-[13px] ${mutedClass}`}>{row.label}</span>
            <span className={`text-[14px] font-medium ${mainTextClass}`}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div>
        <label
          className={`mb-2 block text-[14px] font-medium ${mainTextClass}`}
        >
          Rejection Reason *
        </label>
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={handleChange}
          disabled={loading}
          placeholder="Enter a clear reason for rejection..."
          rows={4}
          className={`min-h-[100px] w-full resize-y rounded-md border px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-[#EA5455]/20 disabled:opacity-70 ${inputClass}`}
        />
        {error && (
          <p className="mt-2 text-[13px] font-medium text-[#EA5455]">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};

export default PayoutRejectModal;

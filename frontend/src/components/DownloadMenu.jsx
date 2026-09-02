import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Download,
  FileDown,
  FileSpreadsheet,
  FileWarning,
  Loader2,
} from "lucide-react";

const DownloadMenu = ({
  upload,
  open,
  onToggle,
  variant = "row",
  onOriginal,
  onProcessed,
  onErrors,
  downloadingKey,
  cardClass,
  primaryColor,
  mainTextClass,
  mutedClass,
}) => {
  const triggerRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  const originalKey = `${upload.id}-original`;
  const processedKey = `${upload.id}-processed`;
  const errorsKey = `${upload.id}-errors`;
  const isBusy =
    downloadingKey === originalKey ||
    downloadingKey === processedKey ||
    downloadingKey === errorsKey;
  const canDownloadProcessed = Number(upload.success_rows) > 0;
  const canDownloadErrors = Number(upload.failed_rows) > 0;

  useEffect(() => {
    const updatePosition = () => {
      if (open && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setCoords({
          top: rect.bottom + 8,
          right: window.innerWidth - rect.right,
        });
      }
    };

    const closeOnEsc = (event) => {
      if (event.key === "Escape" && open) onToggle();
    };

    if (open) {
      updatePosition();
      document.addEventListener("keydown", closeOnEsc);
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        document.removeEventListener("keydown", closeOnEsc);
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [open, onToggle]);

  const menuItemClass =
    "flex w-full items-center gap-2 px-4 py-2.5 text-left text-[14px] font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-inherit hover:bg-[#F0EEFF] hover:text-[#7367F0]";

  const spinnerClass = "ml-auto shrink-0";

  const menu = (
    <>
      <button
        type="button"
        aria-label="Close download menu"
        onClick={onToggle}
        className="fixed inset-0 z-[9998] cursor-default bg-transparent"
      />
      <div
        className="fixed z-[9999]"
        style={{ top: coords.top, right: coords.right }}
      >
        <div
          className={`min-w-[240px] w-[250px] max-w-[calc(100vw-1rem)] overflow-visible rounded-md border shadow-lg py-1 ${cardClass}`}
        >
          <button
            type="button"
            onClick={() => {
              onToggle();
              onOriginal();
            }}
            className={menuItemClass}
          >
            <FileSpreadsheet size={16} className="shrink-0" />
            <span className={mainTextClass}>Download Original</span>
            {downloadingKey === originalKey && (
              <Loader2 size={14} className={`${spinnerClass} animate-spin`} />
            )}
          </button>

          <button
            type="button"
            disabled={!canDownloadProcessed}
            onClick={() => {
              onToggle();
              onProcessed();
            }}
            title={!canDownloadProcessed ? "No successful rows to download" : ""}
            className={menuItemClass}
          >
            <FileDown size={16} className="shrink-0" />
            <span className={mainTextClass}>Download Processed</span>
            {downloadingKey === processedKey && (
              <Loader2 size={14} className={`${spinnerClass} animate-spin`} />
            )}
          </button>

          <button
            type="button"
            disabled={!canDownloadErrors}
            onClick={() => {
              onToggle();
              onErrors();
            }}
            title={!canDownloadErrors ? "No failed rows to download" : ""}
            className={menuItemClass}
          >
            <FileWarning size={16} className="shrink-0" />
            <span className={mainTextClass}>Download Error Report</span>
            {downloadingKey === errorsKey && (
              <Loader2 size={14} className={`${spinnerClass} animate-spin`} />
            )}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div
      ref={triggerRef}
      className={`relative inline-flex items-center overflow-visible ${
        variant === "row" ? "h-8 w-9" : "h-10"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={isBusy}
        className={
          variant === "row"
            ? `inline-flex h-8 w-9 items-center justify-center gap-0.5 rounded-md transition hover:bg-[#E9F9EF] hover:text-[#28C76F] disabled:cursor-not-allowed disabled:opacity-50 ${mutedClass}`
            : "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-[14px] font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        }
        style={variant === "modal" ? { backgroundColor: primaryColor } : undefined}
        title="Download"
      >
        {isBusy ? (
          <Loader2 size={variant === "row" ? 17 : 16} className="animate-spin" />
        ) : (
          <Download size={variant === "row" ? 18 : 16} />
        )}
        {variant === "modal" && <span>Download</span>}
        {variant === "row" && <ChevronDown size={variant === "row" ? 14 : 12} />}
      </button>
      {open && createPortal(menu, document.body)}
    </div>
  );
};

export default DownloadMenu;

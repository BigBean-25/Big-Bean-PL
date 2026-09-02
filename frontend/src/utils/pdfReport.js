import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { NOTO_SANS_REGULAR_BASE64 } from "../assets/fonts/notoSansRegularBase64";
import { NOTO_SANS_BOLD_BASE64 } from "../assets/fonts/notoSansBoldBase64";

const BRAND_NAME = "Big Bean Café";
const TEXT_DARK = "#2F2B3D";
const TEXT_MUTED = "#6E6B7B";
const BORDER = "#EBE9F1";
const FOOTER_MUTED = "#A8AAAE";
const FONT = "NotoSans";

// jsPDF's built-in fonts (Helvetica/Times/Courier) are the PDF Standard 14
// fonts, which use WinAnsi encoding and have no ₹ glyph at all - it silently
// drops or renders as a missing-glyph box. NotoSans (subset to printable
// ASCII + ₹ + en/em dash, ~55KB) is embedded so the rupee symbol actually
// renders correctly everywhere in the document.
const registerFont = (doc) => {
  doc.addFileToVFS("NotoSans-Regular.ttf", NOTO_SANS_REGULAR_BASE64);
  doc.addFont("NotoSans-Regular.ttf", FONT, "normal");
  doc.addFileToVFS("NotoSans-Bold.ttf", NOTO_SANS_BOLD_BASE64);
  doc.addFont("NotoSans-Bold.ttf", FONT, "bold");
};

let logoDataUrlPromise = null;

// jsPDF's addImage needs a decodable raster format it can read pixel data
// from. Rather than depend on jsPDF's own WEBP support (version-dependent),
// draw the source logo.webp onto a canvas once and reuse the resulting PNG
// data URL for every PDF - this works regardless of jsPDF version.
const getLogoDataUrl = () => {
  if (logoDataUrlPromise) return logoDataUrlPromise;

  logoDataUrlPromise = new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          resolve({ dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = "/logo.webp";
    } catch {
      resolve(null);
    }
  });

  return logoDataUrlPromise;
};

const getPrimaryColorRgb = () => {
  let hex = "#7367F0";
  try {
    hex = localStorage.getItem("bbc_primary_color") || hex;
  } catch {
    // ignore storage access issues
  }
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 6 ? clean : "7367F0", 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
};

/**
 * Generates and downloads a branded PDF report.
 *
 * @param {Object} opts
 * @param {string} opts.title - Report title, e.g. "Monthly P&L Report"
 * @param {string} [opts.outletName] - Outlet name, or omitted/"All Outlets" for company-wide
 * @param {string} [opts.dateRangeLabel] - e.g. "01 Aug 2026 - 31 Aug 2026" or "August 2026"
 * @param {string[]} opts.columns - Table column headers
 * @param {Array<Array<string|number>>} opts.rows - Table row data
 * @param {string[]} [opts.summaryLines] - Extra lines rendered below the table (e.g. totals)
 * @param {string} opts.fileName - Download filename, should end in .pdf
 */
export const exportReportPDF = async ({
  title,
  outletName,
  dateRangeLabel,
  columns,
  rows,
  summaryLines = [],
  fileName,
}) => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  registerFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const [r, g, b] = getPrimaryColorRgb();

  const logo = await getLogoDataUrl();
  let headerY = margin;
  const logoSize = 34;

  if (logo?.dataUrl) {
    const aspect = logo.width / logo.height || 1;
    const h = logoSize;
    const w = h * aspect;
    doc.addImage(logo.dataUrl, "PNG", margin, headerY - 6, w, h);
    headerY += 0;
  }

  const textX = logo?.dataUrl ? margin + logoSize * ((logo.width / logo.height) || 1) + 12 : margin;

  doc.setFont(FONT, "bold");
  doc.setFontSize(15);
  doc.setTextColor(TEXT_DARK);
  doc.text(BRAND_NAME, textX, headerY + 8);

  doc.setFont(FONT, "normal");
  doc.setFontSize(10);
  doc.setTextColor(TEXT_MUTED);
  doc.text(title, textX, headerY + 24);

  const genLabel = `Generated: ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`;
  doc.setFontSize(8);
  doc.text(genLabel, pageWidth - margin, headerY + 8, { align: "right" });

  let y = margin + 46;
  doc.setDrawColor(BORDER);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  doc.setFont(FONT, "bold");
  doc.setFontSize(10);
  doc.setTextColor(TEXT_DARK);
  doc.text("Outlet:", margin, y);
  doc.setFont(FONT, "normal");
  doc.text(outletName || "All Outlets", margin + 42, y);

  if (dateRangeLabel) {
    doc.setFont(FONT, "bold");
    doc.text("Period:", margin + 230, y);
    doc.setFont(FONT, "normal");
    doc.text(dateRangeLabel, margin + 270, y);
  }

  y += 18;

  autoTable(doc, {
    startY: y,
    head: [columns],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: "bold", fontSize: 9, font: FONT },
    bodyStyles: { fontSize: 9, textColor: [47, 43, 61], font: FONT },
    alternateRowStyles: { fillColor: [248, 247, 250] },
    styles: { font: FONT, cellPadding: 6, lineColor: [235, 233, 241], lineWidth: 0.5 },
    margin: { left: margin, right: margin },
  });

  if (summaryLines.length) {
    let sy = doc.lastAutoTable.finalY + 22;
    doc.setDrawColor(BORDER);
    doc.line(margin, sy - 12, pageWidth - margin, sy - 12);
    summaryLines.forEach((line, idx) => {
      doc.setFont(FONT, idx === summaryLines.length - 1 ? "bold" : "normal");
      doc.setFontSize(idx === summaryLines.length - 1 ? 11 : 10);
      doc.setTextColor(TEXT_DARK);
      doc.text(line, margin, sy);
      sy += 16;
    });
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont(FONT, "normal");
    doc.setFontSize(8);
    doc.setTextColor(FOOTER_MUTED);
    doc.text(`${BRAND_NAME} · Confidential`, margin, pageHeight - 24);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 24, { align: "right" });
  }

  doc.save(fileName);
};

import ExcelJS from "exceljs";

const MONTHS = [
  ["Jan", "January"],
  ["Feb", "February"],
  ["Mar", "March"],
  ["Apr", "April"],
  ["May", "May"],
  ["Jun", "June"],
  ["Jul", "July"],
  ["Aug", "August"],
  ["Sep", "September", "Sept"],
  ["Oct", "October"],
  ["Nov", "November"],
  ["Dec", "December"],
];

const monthIndex = (month) => {
  const m = String(month).toLowerCase();
  for (let i = 0; i < MONTHS.length; i++) {
    for (const variant of MONTHS[i]) {
      if (m === variant.toLowerCase()) return i;
    }
  }
  return -1;
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[₹,\s]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

const parseDateTime = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  const s = String(value).trim();
  if (!s) return null;

  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] || 0)
    );
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
};

const parseDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = value.getMonth();
    const d = value.getDate();
    return new Date(y, m, d);
  }
  const s = String(value).trim();
  if (!s) return null;

  // ISO-ish: 2026-08-30 or 2026/08/30
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  // 30 Aug 2026, 01 Sept 2027, etc.
  m = s.match(/^(\d{1,2})[\s\-]+([A-Za-z]+)[\s\-]+(\d{4})$/);
  if (m) {
    const mi = monthIndex(m[2]);
    if (mi >= 0) {
      return new Date(Number(m[3]), mi, Number(m[1]));
    }
  }

  // Try Date.parse only if it won't mangle the day; prefer naive parser fallback
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = d.getMonth();
    const da = d.getDate();
    return new Date(y, mo, da);
  }
  return null;
};

const formatExportedOn = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(now.getDate())} ${MONTHS[now.getMonth()][0]} ${now.getFullYear()} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}`;
};

const styleFill = (color) => ({
  patternType: "solid",
  fgColor: { rgb: color },
});

const baseBorder = {
  top: { style: "thin", color: { rgb: "DDDDDD" } },
  bottom: { style: "thin", color: { rgb: "DDDDDD" } },
  left: { style: "thin", color: { rgb: "DDDDDD" } },
  right: { style: "thin", color: { rgb: "DDDDDD" } },
};

const headerStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
  fill: styleFill("2F2B3D"),
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: baseBorder,
};

const cellStyle = (align = "left", wrap = false) => ({
  alignment: { horizontal: align, vertical: "center", wrapText: wrap },
  border: baseBorder,
});

const typeDefaults = {
  date: { width: 14, align: "center", numFmt: "dd mmm yyyy" },
  datetime: { width: 22, align: "center", numFmt: "dd mmm yyyy hh:mm AM/PM" },
  currency: { width: 14, align: "right", numFmt: '"₹"#,##0.00' },
  number: { width: 12, align: "right", numFmt: "0.00" },
  integer: { width: 10, align: "center", numFmt: "0" },
  boolean: { width: 10, align: "center", numFmt: "@" },
  text: { width: 24, align: "left", numFmt: "@" },
};

const defaultType = (label) => {
  const l = String(label).toLowerCase();
  if (l.includes("amount") || l.includes("salary") || l.includes("cost") || l.includes("value") || l.includes("payout") || l.includes("commission") || l.includes("sales") || l.includes("expenses") || l.includes("purchases") || l.includes("deposit") || l.includes("expected cash") || l.includes("actual cash") || l.includes("difference") || l.includes("net")) {
    return "currency";
  }
  if (l.includes("date")) return "date";
  if (l.includes("confirmed") || l.includes("uploaded")) return "boolean";
  return "text";
};

const normalizeColumns = (columnsProp, headers, types, widths) => {
  let columns = [];
  if (columnsProp) {
    columns = columnsProp.map((c) => ({
      label: c.label,
      type: c.type || defaultType(c.label),
      width: c.width || typeDefaults[c.type]?.width || typeDefaults[defaultType(c.label)].width,
      wrap: c.wrap ?? (c.type === "text" || defaultType(c.label) === "text"),
    }));
  } else if (headers) {
    columns = headers.map((h, i) => ({
      label: h,
      type: types?.[i] || defaultType(h),
      width: widths?.[i] || typeDefaults[types?.[i]]?.width || typeDefaults[defaultType(h)].width,
      wrap: (types?.[i] || defaultType(h)) === "text",
    }));
  } else {
    throw new Error("Either 'columns' or 'headers' must be provided.");
  }
  return columns;
};

const transformValue = (value, type) => {
  switch (type) {
    case "date": {
      const d = parseDateOnly(value);
      return d || value || "";
    }
    case "datetime": {
      const d = parseDateTime(value);
      return d || value || "";
    }
    case "currency":
    case "number":
    case "integer": {
      const n = toNumber(value);
      return n !== null ? n : value || "";
    }
    case "boolean": {
      const b =
        value === 1 ||
        value === "1" ||
        value === true ||
        String(value).toLowerCase() === "yes";
      return b ? "Yes" : "No";
    }
    default: {
      const text = value === null || value === undefined ? "" : String(value);
      return text.replace(/\\n/g, "\n");
    }
  }
};

export default async function exportToExcel({
  filename,
  reportTitle = "Report",
  sheetName,
  outletLabel = "",
  periodLabel = "",
  columns: columnsProp,
  headers,
  rows,
  types,
  widths,
  returnBuffer = false,
}) {
  if (!rows || rows.length === 0) {
    throw new Error("No data available to export.");
  }

  const columns = normalizeColumns(columnsProp, headers, types, widths);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Big Bean Cafe";
  workbook.created = new Date();

  const safeTitle = (sheetName || reportTitle).replace(/[\\/*?:\[\]]/g, "").slice(0, 31);
  const worksheet = workbook.addWorksheet(safeTitle);

  worksheet.columns = columns.map((c) => ({ width: c.width }));

  const titleRows = [
    ["BIG BEAN CAFE"],
    [reportTitle],
    [`Outlet: ${outletLabel || "All Outlets"}`],
    [`Period: ${periodLabel || "-"}`],
    [`Exported On: ${formatExportedOn()}`],
    [],
  ];

  titleRows.forEach((r) => worksheet.addRow(r));

  for (let i = 1; i <= 5; i++) {
    if (columns.length > 1) {
      worksheet.mergeCells(i, 1, i, columns.length);
    }
  }

  worksheet.getRow(1).getCell(1).font = { bold: true, size: 16, color: { argb: "FF2F2B3D" } };
  worksheet.getRow(2).getCell(1).font = { bold: true, size: 14, color: { argb: "FF2F2B3D" } };
  [3, 4, 5].forEach((rowIndex) => {
    const row = worksheet.getRow(rowIndex);
    row.getCell(1).font = { size: 12, color: { argb: "FF2F2B3D" } };
    row.getCell(1).alignment = { vertical: "middle" };
  });

  const headerRowIndex = 7;
  const headerRow = worksheet.getRow(headerRowIndex);
  headerRow.values = columns.map((c) => c.label);
  headerRow.height = 28;

  const headerFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2F2B3D" },
  };

  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = headerFill;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFDDDDDD" } },
      bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
      left: { style: "thin", color: { argb: "FFDDDDDD" } },
      right: { style: "thin", color: { argb: "FFDDDDDD" } },
    };
  });

  columns.forEach((c, idx) => {
    const col = worksheet.getColumn(idx + 1);
    const base = typeDefaults[c.type];
    col.style = {
      numFmt: c.type === "text" ? "" : base?.numFmt || "",
      alignment: {
        horizontal: base?.align || "left",
        vertical: "middle",
        wrapText: c.wrap || false,
      },
      border: {
        top: { style: "thin", color: { argb: "FFDDDDDD" } },
        bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
        left: { style: "thin", color: { argb: "FFDDDDDD" } },
        right: { style: "thin", color: { argb: "FFDDDDDD" } },
      },
    };
  });

  for (const row of rows) {
    const newRow = worksheet.addRow([]);
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const raw = Array.isArray(row) ? row[i] : row[col.key];
      const value = col.transform ? col.transform(raw) : raw;
      const cell = newRow.getCell(i + 1);
      cell.value = transformValue(value, col.type);

      const c = columns[i];
      const base = typeDefaults[c.type];
      const style = {};
      if (base?.numFmt) {
        style.numFmt = base.numFmt;
      }
      style.alignment = {
        horizontal: base?.align || "left",
        vertical: "middle",
        wrapText: c.wrap || false,
      };
      style.border = {
        top: { style: "thin", color: { argb: "FFDDDDDD" } },
        bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
        left: { style: "thin", color: { argb: "FFDDDDDD" } },
        right: { style: "thin", color: { argb: "FFDDDDDD" } },
      };
      cell.style = style;
    }
  }

  worksheet.views = [{ state: "frozen", ySplit: headerRowIndex }];

  const lastRow = headerRowIndex + rows.length;
  worksheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: lastRow, column: columns.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();

  if (returnBuffer) {
    return buffer;
  }

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

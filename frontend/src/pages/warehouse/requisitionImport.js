// Phase 7B3A - client-side bulk item entry for the Outlet Purchase Order form.
// Pure helpers (no React, no DOM) so the matching rules can be exercised with
// fixtures without a browser or database. The UI parses a spreadsheet into raw
// rows and feeds them through evaluateImportRow(); only rows it marks "Valid"
// may be appended to form.items. No raw_material_id / unit_id is ever invented
// here - both come straight from the existing material master and the same
// valid-UOM list the backend create validator uses.

export const IMPORT_MAX_ROWS = 500;

export const norm = (v) => String(v ?? "").trim().toLowerCase();

// Minimal RFC-4180 CSV reader (quoted fields, escaped quotes, CRLF). ExcelJS's
// csv reader wants a stream, which is awkward in the browser - for a 4-column
// item list a small parser is simpler and has zero new dependencies.
export const parseCsvText = (text) => {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
};

// ExcelJS cell values can be scalars or objects ({text, richText, formula +
// result, hyperlink, Date}) - flatten to a display/comparison string.
export const cellText = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if (v.text != null) return cellText(v.text);
    if (v.result != null) return cellText(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text || "").join("");
    if (v.hyperlink) return String(v.hyperlink);
    return "";
  }
  return String(v);
};

// Header aliases -> column keys. The first spreadsheet row is always treated
// as the header row; the downloadable template writes these names.
const HEADER_ALIASES = {
  code: ["materialcode", "code", "itemcode", "rmcode"],
  name: ["materialname", "name", "itemname", "material"],
  qty: ["quantity", "qty", "requestedqty", "requestqty"],
  uom: ["uom", "unit", "unitname", "unitofmeasure"],
  remarks: ["remarks", "remark", "notes", "note", "itemremarks"],
};

export const IMPORT_TEMPLATE_HEADER = "Material Code,Material Name,Quantity,UOM,Remarks";

export const mapImportHeaders = (headerRow) => {
  const cols = {};
  (headerRow || []).forEach((h, i) => {
    const key = norm(h).replace(/[^a-z]/g, "");
    if (!key) return;
    for (const [col, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key) && cols[col] === undefined) cols[col] = i;
    }
  });
  if (cols.code === undefined && cols.name === undefined) throw new Error("Header row must contain a Material Code or Material Name column");
  if (cols.qty === undefined) throw new Error("Header row must contain a Quantity column");
  return cols;
};

export const buildMaterialIndex = (materials = []) => {
  const materialsByCode = new Map();
  const materialsByName = new Map();
  for (const m of materials) {
    if (m.material_code) materialsByCode.set(norm(m.material_code), m);
    const k = norm(m.material_name);
    if (k) {
      if (!materialsByName.has(k)) materialsByName.set(k, []);
      materialsByName.get(k).push(m);
    }
  }
  return { materialsByCode, materialsByName };
};

export const buildUnitIndex = (units = []) => {
  const byName = new Map();
  for (const u of units) {
    if (u.unit_name) byName.set(norm(u.unit_name), u);
    if (u.unit_symbol) byName.set(norm(u.unit_symbol), u);
  }
  return byName;
};

// Evaluates one data row against the same rules the form enforces:
//   material  - exact material_code preferred; exact material_name only when
//               unique (ambiguous names are rejected, never guessed)
//   quantity  - numeric and > 0
//   uom       - blank -> material base UOM; otherwise must appear in the
//               material's valid-UOM list (the same findConversionFactor-backed
//               list the backend validates with - unit_type alone is NOT
//               accepted). "Unknown UOM" vs "not valid for this material" is
//               distinguished via the full units master index.
//   duplicate - resolved material already on the form or on an earlier
//               imported row -> marked, never merged silently
// ctx: { materialsByCode, materialsByName, unitByName,
//        getValidUoms(matId) -> Promise<options[]|null>,
//        existingIds: Set, importedIds: Set }
export const evaluateImportRow = async (rec, ctx) => {
  const { rowNo, codeText, nameText, qtyText, uomText, remarks } = rec;
  const out = {
    rowNo, codeText, nameText, qtyText, uomText, remarks: remarks || "",
    material: null, qty: null, uomOption: null, status: "Invalid", reason: "",
  };

  const code = norm(codeText);
  const name = norm(nameText);
  let material = null;
  if (code) {
    material = ctx.materialsByCode.get(code) || null;
    if (!material) { out.reason = "Unknown material code"; return out; }
  } else if (name) {
    const matches = ctx.materialsByName.get(name) || [];
    if (matches.length > 1) { out.status = "Ambiguous"; out.reason = "Ambiguous material name"; return out; }
    if (matches.length === 0) { out.reason = "Unknown material name"; return out; }
    material = matches[0];
  } else {
    out.reason = "Material code or name required";
    return out;
  }
  out.material = material;

  const matKey = String(material.id);
  if (ctx.existingIds.has(matKey) || ctx.importedIds.has(matKey)) {
    out.status = "Duplicate";
    out.reason = ctx.existingIds.has(matKey) ? "Material is already on this Outlet PO" : "Duplicate material in file";
    return out;
  }
  // A resolved material counts as "seen" even if a later check fails this row -
  // the user fixes the file rather than us deciding which line wins.
  ctx.importedIds.add(matKey);

  const qty = Number(String(qtyText).trim());
  if (!Number.isFinite(qty) || qty <= 0) { out.reason = "Quantity must be greater than 0"; return out; }
  out.qty = qty;

  const options = await ctx.getValidUoms(material.id);
  if (!options) { out.reason = "Could not load valid UOMs for this material"; return out; }
  const uomKey = norm(uomText);
  if (!uomKey) {
    const base = options.find((o) => o.is_base);
    if (!base) { out.reason = "No base UOM available for this material"; return out; }
    out.uomOption = base;
  } else {
    // Collect EVERY valid option matching the token on unit_name or
    // unit_symbol, deduplicated by unit id - a unit hit by both its name and
    // its symbol still counts once. Two or more distinct units matching one
    // token is ambiguous and must be rejected, never first-match guessed.
    const matched = [...new Map(
      options
        .filter((o) => norm(o.unit_name) === uomKey || (o.unit_symbol && norm(o.unit_symbol) === uomKey))
        .map((o) => [String(o.id), o])
    ).values()];
    if (matched.length === 1) out.uomOption = matched[0];
    else if (matched.length > 1) {
      out.status = "Ambiguous";
      out.reason = `Ambiguous UOM "${String(uomText).trim()}" - matches multiple units`;
      return out;
    } else {
      out.reason = ctx.unitByName.has(uomKey) ? "UOM is not valid for this material" : "Unknown UOM";
      return out;
    }
  }
  out.status = "Valid";
  return out;
};

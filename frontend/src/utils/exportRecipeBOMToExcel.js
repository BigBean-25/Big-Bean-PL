import ExcelJS from "exceljs";

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[₹,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const formatNow = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} ${d.toLocaleString("en-IN", { month: "short" })} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const asText = (v) => (v === null || v === undefined ? "" : String(v));
const asCurrency = (v) => (toNumber(v) !== null ? toNumber(v) : "");
const asPercent = (v) => (toNumber(v) !== null ? toNumber(v) / 100 : "");
const asNum = (v) => (toNumber(v) !== null ? toNumber(v) : "");

const headerStyle = {
  font: { bold: true, color: { argb: "FFFFFFFF" }, size: 11 },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F2B3D" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: {
    top: { style: "thin", color: { argb: "FFDDDDDD" } },
    bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
    left: { style: "thin", color: { argb: "FFDDDDDD" } },
    right: { style: "thin", color: { argb: "FFDDDDDD" } },
  },
};

const cellBorder = {
  top: { style: "thin", color: { argb: "FFDDDDDD" } },
  bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
  left: { style: "thin", color: { argb: "FFDDDDDD" } },
  right: { style: "thin", color: { argb: "FFDDDDDD" } },
};

const addWorksheetTitle = (ws, title, outletLabel, periodLabel, filters, columns) => {
  ws.addRow(["BIG BEAN CAFE"]);
  ws.addRow([title]);
  ws.addRow([`Outlet: ${asText(outletLabel) || "All Outlets"}`]);
  ws.addRow([`Generated On: ${formatNow()}`]);
  ws.addRow([`Filters: ${filters || "-"}`]);
  ws.addRow([]);
  if (columns.length > 1) {
    for (let i = 1; i <= 5; i++) ws.mergeCells(i, 1, i, columns.length);
  }
  ws.getRow(1).getCell(1).font = { bold: true, size: 16, color: { argb: "FF2F2B3D" } };
  ws.getRow(2).getCell(1).font = { bold: true, size: 14, color: { argb: "FF2F2B3D" } };
  [3, 4, 5].forEach((ri) => {
    ws.getRow(ri).getCell(1).font = { size: 12, color: { argb: "FF2F2B3D" } };
    ws.getRow(ri).getCell(1).alignment = { vertical: "middle" };
  });
};

const writeTable = (ws, columns, rows) => {
  const headerRowIndex = 7;
  const headerRow = ws.getRow(headerRowIndex);
  headerRow.values = columns.map((c) => c.label);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.style = headerStyle;
  });
  ws.columns = columns.map((c) => ({ width: c.width || 14 }));

  for (const row of rows) {
    const r = ws.addRow([]);
    columns.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      cell.value = row[c.key] ?? "";
      cell.style = {
        alignment: { horizontal: c.align || "left", vertical: "middle", wrapText: c.wrap || false },
        border: cellBorder,
        numFmt: c.numFmt || "",
      };
    });
  }

  const lastRow = headerRowIndex + rows.length;
  ws.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: lastRow, column: columns.length },
  };
  ws.views = [{ state: "frozen", ySplit: headerRowIndex }];
};

export async function buildRecipeBOMWorkbook({
  recipes,
  versions = [],
  outletLabel,
  filters,
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Big Bean Cafe";
  wb.created = new Date();

  const completeCount = recipes.filter((r) => !r.hasMissingCost).length;
  const missingCount = recipes.filter((r) => r.hasMissingCost).length;
  const byType = (type) => recipes.filter((r) => r.recipe_type === type).length;

  // Sheet 1 — Recipe Summary
  const summaryWs = wb.addWorksheet("Recipe Summary");

  addWorksheetTitle(summaryWs, "Recipe / SOP Management Report", outletLabel, "", filters, []);
  summaryWs.addRow(["Total Recipes", recipes.length, "", "Active", recipes.filter((r) => r.status === "Active").length, "", "Draft", recipes.filter((r) => r.status === "Draft").length, "", "Inactive", recipes.filter((r) => r.status === "Inactive").length]);
  summaryWs.addRow(["Direct", byType("Direct"), "", "Batch", byType("Batch"), "", "Semi-Finished", byType("Semi-Finished"), "", "Production", byType("Production")]);
  summaryWs.addRow(["Complete Costing", completeCount, "", "Missing Rates", missingCount]);
  summaryWs.addRow([]);

  const summaryColumns = [
    { key: "sno", label: "S.No", width: 8, align: "center" },
    { key: "recipe_code", label: "Recipe Code", width: 16 },
    { key: "recipe_name", label: "Recipe Name", width: 28 },
    { key: "recipe_type", label: "Recipe Type", width: 14 },
    { key: "menu_output", label: "Menu Item / Output Material", width: 28 },
    { key: "category", label: "Category", width: 16 },
    { key: "outlet", label: "Outlet", width: 22 },
    { key: "version", label: "Version", width: 10, align: "center" },
    { key: "status", label: "Status", width: 12 },
    { key: "effective_from", label: "Effective From", width: 14 },
    { key: "effective_to", label: "Effective To", width: 14 },
    { key: "yield_qty", label: "Yield Qty", width: 12, align: "right", numFmt: "0.00" },
    { key: "yield_uom", label: "Yield UOM", width: 12 },
    { key: "ingredient_count", label: "Ingredient Count", width: 14, align: "center" },
    { key: "recipe_cost", label: "Recipe Cost", width: 14, align: "right", numFmt: '"₹"#,##0.00' },
    { key: "selling_price", label: "Selling Price", width: 14, align: "right", numFmt: '"₹"#,##0.00' },
    { key: "food_cost_pct", label: "Food Cost %", width: 14, align: "right", numFmt: "0.00%" },
    { key: "gross_margin", label: "Gross Margin", width: 14, align: "right", numFmt: '"₹"#,##0.00' },
    { key: "gross_margin_pct", label: "Gross Margin %", width: 16, align: "right", numFmt: "0.00%" },
    { key: "costing_status", label: "Costing Status", width: 14 },
  ];

  const summaryRows = recipes.map((r, idx) => ({
    sno: idx + 1,
    recipe_code: r.recipe_code || "",
    recipe_name: r.recipe_name || "",
    recipe_type: r.recipe_type || "",
    menu_output: r.menu_output || "",
    category: r.recipe_category || "",
    outlet: r.outlet_name || "",
    version: r.version_no || 1,
    status: r.status || "Draft",
    effective_from: r.effective_from || "",
    effective_to: r.effective_to || "",
    yield_qty: r.yield_qty,
    yield_uom: r.yield_unit_name || "",
    ingredient_count: r.items?.length || 0,
    recipe_cost: r.hasMissingCost ? "" : asCurrency(r.total_recipe_cost),
    selling_price: r.recipe_type === "Direct" ? asCurrency(r.selling_price) : "N/A",
    food_cost_pct: r.recipe_type === "Direct" && !r.hasMissingCost ? asPercent(r.food_cost_percentage) : "",
    gross_margin: r.recipe_type === "Direct" && !r.hasMissingCost ? asCurrency(r.gross_margin_amount) : "",
    gross_margin_pct: r.recipe_type === "Direct" && !r.hasMissingCost ? asPercent(r.gross_margin_percentage) : "",
    costing_status: r.hasMissingCost ? "Missing Rate" : "Complete",
  }));

  writeTable(summaryWs, summaryColumns, summaryRows);

  // Sheet 2 — Ingredient Details
  const ingredientWs = wb.addWorksheet("Ingredient Details");
  addWorksheetTitle(ingredientWs, "Recipe / SOP Ingredient Details", outletLabel, "", filters, []);
  const ingredientColumns = [
    { key: "sno", label: "S.No", width: 8, align: "center" },
    { key: "recipe_name", label: "Recipe Name", width: 28 },
    { key: "recipe_type", label: "Recipe Type", width: 14 },
    { key: "menu_output", label: "Menu Item / Output", width: 28 },
    { key: "outlet", label: "Outlet", width: 22 },
    { key: "version", label: "Version", width: 10, align: "center" },
    { key: "material", label: "Material", width: 24 },
    { key: "qty", label: "Recipe Qty", width: 14, align: "right", numFmt: "0.000" },
    { key: "uom", label: "Recipe UOM", width: 14 },
    { key: "conv", label: "Conversion Factor", width: 16, align: "right", numFmt: "0.000000" },
    { key: "base_qty", label: "Base Qty", width: 14, align: "right", numFmt: "0.0000" },
    { key: "base_uom", label: "Base UOM", width: 14 },
    { key: "waste_pct", label: "Waste %", width: 12, align: "right", numFmt: "0.00" },
    { key: "net_qty", label: "Net Qty", width: 14, align: "right", numFmt: "0.0000" },
    { key: "rate", label: "Rate", width: 14, align: "right", numFmt: '"₹"#,##0.0000' },
    { key: "cost", label: "Ingredient Cost", width: 16, align: "right", numFmt: '"₹"#,##0.0000' },
    { key: "notes", label: "Notes", width: 24 },
    { key: "costing_status", label: "Costing Status", width: 16 },
  ];
  const ingredientRows = [];
  recipes.forEach((r) => {
    (r.items || []).forEach((it, idx) => {
      ingredientRows.push({
        sno: ingredientRows.length + 1,
        recipe_name: r.recipe_name || "",
        recipe_type: r.recipe_type || "",
        menu_output: r.menu_output || "",
        outlet: r.outlet_name || "",
        version: r.version_no || 1,
        material: it.material_name || "",
        qty: asNum(it.qty_per_item),
        uom: it.recipe_unit_name || "",
        conv: asNum(it.conversion_factor),
        base_qty: asNum(it.base_qty),
        base_uom: it.base_unit_name || "",
        waste_pct: asNum(it.waste_percentage),
        net_qty: asNum(it.net_qty),
        rate: it.rate != null ? asCurrency(it.rate) : "",
        cost: it.ingredient_cost != null ? asCurrency(it.ingredient_cost) : "",
        notes: it.notes || "",
        costing_status: it.rate == null || it.ingredient_cost == null ? "Not Configured" : "Complete",
      });
    });
  });
  writeTable(ingredientWs, ingredientColumns, ingredientRows);

  // Sheet 3 — Version History
  const versionWs = wb.addWorksheet("Version History");
  addWorksheetTitle(versionWs, "Recipe / SOP Version History", outletLabel, "", filters, []);
  const versionColumns = [
    { key: "sno", label: "S.No", width: 8, align: "center" },
    { key: "recipe_name", label: "Recipe Name", width: 28 },
    { key: "menu_output", label: "Menu Item / Output", width: 28 },
    { key: "outlet", label: "Outlet", width: 22 },
    { key: "recipe_type", label: "Recipe Type", width: 14 },
    { key: "version", label: "Version", width: 10, align: "center" },
    { key: "current", label: "Current", width: 12, align: "center" },
    { key: "status", label: "Status", width: 12 },
    { key: "effective_from", label: "Effective From", width: 14 },
    { key: "effective_to", label: "Effective To", width: 14 },
    { key: "created_by", label: "Created By", width: 20 },
    { key: "created_at", label: "Created At", width: 22 },
  ];
  const versionRows = (versions.length ? versions : recipes.map((r) => ({
    recipe_name: r.recipe_name,
    menu_output: r.menu_output,
    outlet: r.outlet_name,
    recipe_type: r.recipe_type,
    version: r.version_no,
    current: "Yes",
    status: r.status,
    effective_from: r.effective_from,
    effective_to: r.effective_to,
    created_by: "",
    created_at: "",
  }))).map((v, i) => ({ ...v, sno: i + 1 }));
  writeTable(versionWs, versionColumns, versionRows);

  // Sheet 4 — Missing Rates
  const missingWs = wb.addWorksheet("Missing Rates");
  addWorksheetTitle(missingWs, "Recipe / SOP Missing Rates", outletLabel, "", filters, []);
  const missingColumns = [
    { key: "sno", label: "S.No", width: 8, align: "center" },
    { key: "recipe_name", label: "Recipe Name", width: 28 },
    { key: "recipe_type", label: "Recipe Type", width: 14 },
    { key: "outlet", label: "Outlet", width: 22 },
    { key: "material", label: "Material", width: 24 },
    { key: "uom", label: "Recipe UOM", width: 14 },
    { key: "base_uom", label: "Base UOM", width: 14 },
    { key: "effective_date", label: "Effective Date", width: 16 },
    { key: "rate_status", label: "Rate Status", width: 16 },
  ];
  const missingRows = [];
  recipes.forEach((r) => {
    (r.items || []).forEach((it) => {
      if (it.rate == null || it.ingredient_cost == null) {
        missingRows.push({
          sno: missingRows.length + 1,
          recipe_name: r.recipe_name || "",
          recipe_type: r.recipe_type || "",
          outlet: r.outlet_name || "",
          material: it.material_name || "",
          uom: it.recipe_unit_name || "",
          base_uom: it.base_unit_name || "",
          effective_date: r.effective_from || "",
          rate_status: "Not Configured",
        });
      }
    });
  });
  if (missingRows.length === 0) {
    missingWs.addRow([]);
    missingWs.addRow(["All recipe ingredients have applicable rates."]);
  } else {
    writeTable(missingWs, missingColumns, missingRows);
  }

  return wb;
}

export default async function exportRecipeBOMToExcel({
  filename,
  recipes,
  versions = [],
  outletLabel,
  filters,
}) {
  const wb = await buildRecipeBOMWorkbook({ recipes, versions, outletLabel, filters });
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

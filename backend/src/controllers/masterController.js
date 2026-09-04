import xlsx from 'xlsx';
import ExcelJS from 'exceljs';
import { query } from '../config/database.js';
import { logAudit } from '../utils/logger.js';
import { canAccessAllOutlets } from '../utils/roleAccess.js';
import { sanitizeString, parseNumber } from '../utils/helpers.js';
import { validateContactFields, assertSafeColumnNames } from '../utils/validators.js';

const db = { query };

const createMasterController = (tableName, itemName) => ({
  getAll: async (req, res) => {
    try {
      const { page = 1, limit = 100, search = '', is_active } = req.query;
      const offset = (page - 1) * limit;

      let whereClause = '1=1';
      const params = [];

      if (search) {
        whereClause += ` AND (${tableName === 'outlets' ? 'outlet_name' : tableName === 'suppliers' ? 'supplier_name' : tableName === 'raw_materials' ? 'material_name' : tableName === 'menu_items' ? 'item_name' : tableName === 'categories' ? 'category_name' : 'name'} LIKE ?)`;
        params.push(`%${search}%`);
      }

      if (is_active !== undefined) {
        whereClause += ' AND is_active = ?';
        params.push(is_active);
      }

      const items = await query(
        `SELECT * FROM ${tableName} WHERE ${whereClause} ORDER BY id DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
        params
      );

      const countResult = await query(
        `SELECT COUNT(*) as total FROM ${tableName} WHERE ${whereClause}`,
        params
      );

      res.status(200).json({
        success: true,
        data: items,
        pagination: {
          total: countResult[0].total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(countResult[0].total / limit)
        }
      });
    } catch (error) {
      console.error(`Get ${itemName} error:`, error);
      res.status(500).json({
        success: false,
        message: `Error fetching ${itemName}`
      });
    }
  },

  getById: async (req, res) => {
    try {
      const items = await query(`SELECT * FROM ${tableName} WHERE id = ?`, [req.params.id]);

      if (items.length === 0) {
        return res.status(404).json({
          success: false,
          message: `${itemName} not found`
        });
      }

      res.status(200).json({
        success: true,
        data: items[0]
      });
    } catch (error) {
      console.error(`Get ${itemName} by ID error:`, error);
      res.status(500).json({
        success: false,
        message: `Error fetching ${itemName}`
      });
    }
  },

  create: async (req, res) => {
    try {
      const contactError = validateContactFields(req.body);
      if (contactError) {
        return res.status(400).json({ success: false, message: contactError });
      }
      const fields = Object.keys(req.body);
      assertSafeColumnNames(fields);
      const values = Object.values(req.body);
      const placeholders = fields.map(() => '?').join(', ');

      const result = await query(
        `INSERT INTO ${tableName} (${fields.join(', ')}, created_at) VALUES (${placeholders}, NOW())`,
        values
      );

      await logAudit(req.user.id, 'CREATE', tableName, result.insertId, null, req.body, `Created ${itemName}`);

      res.status(201).json({
        success: true,
        message: `${itemName} created successfully`,
        data: { id: result.insertId, ...req.body }
      });
    } catch (error) {
      console.error(`Create ${itemName} error:`, error);
      res.status(500).json({
        success: false,
        message: error.code === 'ER_DUP_ENTRY' ? `${itemName} already exists` : `Error creating ${itemName}`
      });
    }
  },

  update: async (req, res) => {
    try {
      const oldData = await query(`SELECT * FROM ${tableName} WHERE id = ?`, [req.params.id]);

      if (oldData.length === 0) {
        return res.status(404).json({
          success: false,
          message: `${itemName} not found`
        });
      }

      const contactError = validateContactFields(req.body);
      if (contactError) {
        return res.status(400).json({ success: false, message: contactError });
      }
      const fields = Object.keys(req.body);
      assertSafeColumnNames(fields);
      const values = Object.values(req.body);
      const setClause = fields.map(f => `${f} = ?`).join(', ');

      await query(
        `UPDATE ${tableName} SET ${setClause}, updated_at = NOW() WHERE id = ?`,
        [...values, req.params.id]
      );

      await logAudit(req.user.id, 'UPDATE', tableName, req.params.id, oldData[0], req.body, `Updated ${itemName}`);

      res.status(200).json({
        success: true,
        message: `${itemName} updated successfully`
      });
    } catch (error) {
      console.error(`Update ${itemName} error:`, error);
      res.status(500).json({
        success: false,
        message: `Error updating ${itemName}`
      });
    }
  },

  delete: async (req, res) => {
    try {
      const oldData = await query(`SELECT * FROM ${tableName} WHERE id = ?`, [req.params.id]);

      if (oldData.length === 0) {
        return res.status(404).json({
          success: false,
          message: `${itemName} not found`
        });
      }

      await query(`DELETE FROM ${tableName} WHERE id = ?`, [req.params.id]);

      await logAudit(req.user.id, 'DELETE', tableName, req.params.id, oldData[0], null, `Deleted ${itemName}`);

      res.status(200).json({
        success: true,
        message: `${itemName} deleted successfully`
      });
    } catch (error) {
      console.error(`Delete ${itemName} error:`, error);
      res.status(500).json({
        success: false,
        message: error.code === 'ER_ROW_IS_REFERENCED_2' ? `Cannot delete ${itemName} - it is being used` : `Error deleting ${itemName}`
      });
    }
  }
});

// Outlets (the business entity: name, address, manager) and Locations (the
// warehouse-inventory graph node an outlet needs to receive stock) are
// separate tables for a real reason - Locations also covers the Central
// Warehouse/Kitchen, which aren't outlets at all. But nothing kept them in
// sync: creating an outlet never created its matching location, so an outlet
// could silently be invisible to Warehouse until someone remembered to add
// it separately in Location Management too. This keeps the outlet-type
// location's identity/address fields mirrored automatically. GSTIN is
// intentionally excluded - outlets don't have that field, it's location-only.
const syncOutletLocation = async (outletId, outlet) => {
  const shared = {
    location_name: outlet.outlet_name,
    address: outlet.address || null,
    city: outlet.city || null,
    state: outlet.state || null,
    pincode: outlet.pincode || null,
    phone: outlet.phone || null,
    email: outlet.email || null,
    is_active: outlet.is_active !== undefined ? Number(outlet.is_active) : 1,
  };

  const existing = await query('SELECT id FROM locations WHERE outlet_id = ? LIMIT 1', [outletId]);
  if (existing.length > 0) {
    await query(
      `UPDATE locations SET location_name = ?, address = ?, city = ?, state = ?, pincode = ?, phone = ?, email = ?, is_active = ? WHERE outlet_id = ?`,
      [shared.location_name, shared.address, shared.city, shared.state, shared.pincode, shared.phone, shared.email, shared.is_active, outletId]
    );
    return;
  }

  const baseCode = `LOC-${String(outlet.outlet_code || outletId).toUpperCase()}`;
  try {
    await query(
      `INSERT INTO locations (location_code, location_name, location_type, outlet_id, address, city, state, pincode, phone, email, is_inventory_location, is_active)
       VALUES (?, ?, 'Outlet', ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [baseCode, shared.location_name, outletId, shared.address, shared.city, shared.state, shared.pincode, shared.phone, shared.email, shared.is_active]
    );
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error;
    await query(
      `INSERT INTO locations (location_code, location_name, location_type, outlet_id, address, city, state, pincode, phone, email, is_inventory_location, is_active)
       VALUES (?, ?, 'Outlet', ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [`${baseCode}-${outletId}`, shared.location_name, outletId, shared.address, shared.city, shared.state, shared.pincode, shared.phone, shared.email, shared.is_active]
    );
  }
};

export const outletController = {
  getAll: async (req, res) => {
    try {
      const canSeeAll = canAccessAllOutlets(req.user?.role_name);
      const assignedOutletIds = (req.user?.outlet_ids || []).map((id) => Number(id)).filter(Boolean);

      if (!canSeeAll && assignedOutletIds.length === 0) {
        return res.status(200).json({
          success: true,
          message: "Outlets fetched successfully",
          data: [],
        });
      }

      const whereClause = canSeeAll
        ? ''
        : `WHERE id IN (${assignedOutletIds.map(() => '?').join(',')})`;

      const outlets = await db.query(`
        SELECT
          id,
          outlet_code,
          outlet_name,
          address,
          city,
          state,
          pincode,
          phone,
          email,
          manager_name,
          opening_date,
          is_active,
          created_at,
          updated_at
        FROM outlets
        ${whereClause}
        ORDER BY id ASC
      `, canSeeAll ? [] : assignedOutletIds);

      return res.status(200).json({
        success: true,
        message: "Outlets fetched successfully",
        data: outlets,
      });
    } catch (error) {
      console.error("GET OUTLETS ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch outlets",
        error: error.message,
      });
    }
  },
  
  getById: async (req, res) => {
    try {
      const items = await query(`SELECT * FROM outlets WHERE id = ?`, [req.params.id]);

      if (items.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Outlet not found'
        });
      }

      // getAll above already restricts locked roles to their own assigned
      // outlets - this route has no checkPermission at all (masterRoutes.js
      // wires it as protect-only), so without the same check here any
      // authenticated user, including Outlet Staff, could fetch any other
      // outlet's record directly by id.
      const canSeeAll = canAccessAllOutlets(req.user?.role_name);
      const assignedOutletIds = (req.user?.outlet_ids || []).map((id) => Number(id)).filter(Boolean);
      if (!canSeeAll && !assignedOutletIds.includes(Number(req.params.id))) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this outlet'
        });
      }

      res.status(200).json({
        success: true,
        data: items[0]
      });
    } catch (error) {
      console.error('Get outlet by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching outlet'
      });
    }
  },

  create: async (req, res) => {
    try {
      const contactError = validateContactFields(req.body);
      if (contactError) {
        return res.status(400).json({ success: false, message: contactError });
      }
      const fields = Object.keys(req.body);
      assertSafeColumnNames(fields);
      const values = Object.values(req.body);
      const placeholders = fields.map(() => '?').join(', ');

      const result = await query(
        `INSERT INTO outlets (${fields.join(', ')}, created_at) VALUES (${placeholders}, NOW())`,
        values
      );

      await logAudit(req.user.id, 'CREATE', 'outlets', result.insertId, null, req.body, 'Created Outlet');
      await syncOutletLocation(result.insertId, req.body);

      res.status(201).json({
        success: true,
        message: 'Outlet created successfully',
        data: { id: result.insertId, ...req.body }
      });
    } catch (error) {
      console.error('Create outlet error:', error);
      res.status(500).json({
        success: false,
        message: error.code === 'ER_DUP_ENTRY' ? 'Outlet already exists' : 'Error creating outlet'
      });
    }
  },

  update: async (req, res) => {
    try {
      const oldData = await query(`SELECT * FROM outlets WHERE id = ?`, [req.params.id]);

      if (oldData.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Outlet not found'
        });
      }

      const contactError = validateContactFields(req.body);
      if (contactError) {
        return res.status(400).json({ success: false, message: contactError });
      }
      const fields = Object.keys(req.body);
      assertSafeColumnNames(fields);
      const values = Object.values(req.body);
      const setClause = fields.map(f => `${f} = ?`).join(', ');

      await query(
        `UPDATE outlets SET ${setClause}, updated_at = NOW() WHERE id = ?`,
        [...values, req.params.id]
      );

      await logAudit(req.user.id, 'UPDATE', 'outlets', req.params.id, oldData[0], req.body, 'Updated Outlet');
      await syncOutletLocation(req.params.id, { ...oldData[0], ...req.body });

      res.status(200).json({
        success: true,
        message: 'Outlet updated successfully'
      });
    } catch (error) {
      console.error('Update outlet error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating outlet'
      });
    }
  },

  delete: async (req, res) => {
    try {
      const oldData = await query(`SELECT * FROM outlets WHERE id = ?`, [req.params.id]);

      if (oldData.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Outlet not found'
        });
      }

      await query(`DELETE FROM outlets WHERE id = ?`, [req.params.id]);

      await logAudit(req.user.id, 'DELETE', 'outlets', req.params.id, oldData[0], null, 'Deleted Outlet');

      res.status(200).json({
        success: true,
        message: 'Outlet deleted successfully'
      });
    } catch (error) {
      console.error('Delete outlet error:', error);
      res.status(500).json({
        success: false,
        message: error.code === 'ER_ROW_IS_REFERENCED_2' ? 'Cannot delete outlet - it is being used' : 'Error deleting outlet'
      });
    }
  }
};

export const categoryController = createMasterController('categories', 'Category');

// raw_materials.preferred_supplier_id has no FK constraint at all (just an
// indexed INT column - see database/warehouse_phase2h_migration.mjs), unlike
// purchase_orders.supplier_id, which is ON DELETE RESTRICT. So a supplier
// with no PO history yet (the only thing the generic delete's
// ER_ROW_IS_REFERENCED_2 handler would catch) can be deleted while still
// set as a raw material's preferred supplier - leaving a dangling id that
// warehouseReorderService.js's createDraftPOFromReorder later inserts
// straight into purchase_orders.supplier_id with no existence check,
// throwing a raw, uncaught FK error mid-loop the next time someone
// auto-generates a reorder PO for that material.
// purchase_returns.supplier_id and supplier_credits.supplier_id are both
// NOT NULL with no FK at all either (unlike grn/material_purchase_items,
// which are ON DELETE SET NULL for the same "just degrades to blank in a
// report" reason) - so a supplier with real return/credit-note history
// could otherwise be deleted with zero protection, leaving supplier_credits
// (real money - credit notes owed back to the outlet) untraceable to who
// issued them.
const genericSupplierController = createMasterController('suppliers', 'Supplier');
export const supplierController = {
  ...genericSupplierController,
  delete: async (req, res) => {
    try {
      const [inRawMaterials, inReturns, inCredits] = await Promise.all([
        query('SELECT id FROM raw_materials WHERE preferred_supplier_id = ? LIMIT 1', [req.params.id]),
        query('SELECT id FROM purchase_returns WHERE supplier_id = ? LIMIT 1', [req.params.id]),
        query('SELECT id FROM supplier_credits WHERE supplier_id = ? LIMIT 1', [req.params.id]),
      ]);
      if (inRawMaterials.length > 0) {
        return res.status(400).json({ success: false, message: 'Cannot delete Supplier - it is set as the preferred supplier for one or more raw materials' });
      }
      if (inReturns.length > 0 || inCredits.length > 0) {
        return res.status(400).json({ success: false, message: 'Cannot delete Supplier - it has purchase return or credit note history' });
      }
    } catch (error) {
      console.error('Check supplier usage error:', error);
      return res.status(500).json({ success: false, message: 'Error checking supplier usage' });
    }
    return genericSupplierController.delete(req, res);
  },
};
export const rawMaterialController = createMasterController('raw_materials', 'Raw Material');

// Raw materials get an auto-generated code (RM0001, RM0002, ...) so nobody
// has to invent one by hand - manual entry still works if the client sends
// material_code explicitly (e.g. the bulk-upload path already assigns its
// own codes), this only fills the gap for the single-item create form.
const generateNextMaterialCode = async () => {
  const rows = await query(
    `SELECT material_code FROM raw_materials WHERE material_code REGEXP '^RM[0-9]+$' ORDER BY CAST(SUBSTRING(material_code, 3) AS UNSIGNED) DESC LIMIT 1`
  );
  const lastNumber = rows.length > 0 ? parseInt(rows[0].material_code.slice(2), 10) : 0;
  return `RM${String(lastNumber + 1).padStart(4, '0')}`;
};

export const createRawMaterial = async (req, res) => {
  try {
    const contactError = validateContactFields(req.body);
    if (contactError) {
      return res.status(400).json({ success: false, message: contactError });
    }

    const body = { ...req.body };
    if (!body.material_code || !String(body.material_code).trim()) {
      body.material_code = await generateNextMaterialCode();
    }

    const fields = Object.keys(body);
    assertSafeColumnNames(fields);
    const values = Object.values(body);
    const placeholders = fields.map(() => '?').join(', ');

    const result = await query(
      `INSERT INTO raw_materials (${fields.join(', ')}, created_at) VALUES (${placeholders}, NOW())`,
      values
    );

    await logAudit(req.user.id, 'CREATE', 'raw_materials', result.insertId, null, body, 'Created Raw Material');

    res.status(201).json({
      success: true,
      message: 'Raw Material created successfully',
      data: { id: result.insertId, ...body }
    });
  } catch (error) {
    console.error('Create Raw Material error:', error);
    res.status(500).json({
      success: false,
      message: error.code === 'ER_DUP_ENTRY' ? 'Raw Material already exists' : 'Error creating Raw Material'
    });
  }
};
export const menuItemController = createMasterController('menu_items', 'Menu Item');

// raw_materials.unit_id is ON DELETE SET NULL (unlike recipe_items.unit_id,
// which has no ON DELETE clause and so already correctly blocks deletion via
// the default RESTRICT) - the generic factory's delete would silently
// succeed and null out every raw material's live base unit, breaking
// getMaterialBaseUnit() and every stock/costing calculation that depends on
// it. Checked at the application layer instead of a schema migration, since
// this only needs to stop the delete before it reaches the DB, not change
// what's already safely enforced elsewhere.
const genericUnitController = createMasterController('units', 'Unit');
export const unitController = {
  ...genericUnitController,
  delete: async (req, res) => {
    try {
      const inUse = await query('SELECT id FROM raw_materials WHERE unit_id = ? LIMIT 1', [req.params.id]);
      if (inUse.length > 0) {
        return res.status(400).json({ success: false, message: 'Cannot delete Unit - it is the base unit of one or more raw materials' });
      }
    } catch (error) {
      console.error('Check unit usage error:', error);
      return res.status(500).json({ success: false, message: 'Error checking unit usage' });
    }
    return genericUnitController.delete(req, res);
  },
};
export const expenseHeadController = createMasterController('expense_heads', 'Expense Head');
export const paymentModeController = createMasterController('payment_modes', 'Payment Mode');
export const onlinePlatformController = createMasterController('online_platforms', 'Online Platform');
export const dineInPortalController = createMasterController('dine_in_portals', 'Dine-in Portal');

const MAX_UPLOAD_ROWS = 5000;

const parseExcelFile = (filePath) => {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
  if (data.length > MAX_UPLOAD_ROWS) {
    throw new Error(`This file has ${data.length} rows, which exceeds the ${MAX_UPLOAD_ROWS}-row limit per upload. Please split it into smaller files.`);
  }
  return data;
};

const ITEM_TYPES = ['Raw Material', 'Packaging', 'Consumable', 'Asset', 'Other'];

// Masters bulk upload is an upsert-by-code import (not the reconciliation-style
// uploads under uploadController.js) - no approval workflow, no persistent
// upload-history record, just a per-row success/error summary returned inline.
export const bulkUploadRawMaterials = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const rows = parseExcelFile(req.file.path);
    const categories = await query('SELECT id, category_name FROM categories');
    const units = await query('SELECT id, unit_name FROM units');
    const categoryByName = new Map(categories.map((c) => [c.category_name.toLowerCase(), c.id]));
    const unitByName = new Map(units.map((u) => [u.unit_name.toLowerCase(), u.id]));

    let created = 0;
    let updated = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // header is row 1
      try {
        const materialCode = sanitizeString(row['Material Code']);
        const materialName = sanitizeString(row['Material Name']);
        if (!materialCode || !materialName) {
          throw new Error('Material Code and Material Name are required');
        }

        const categoryName = sanitizeString(row['Category']);
        const categoryId = categoryName ? categoryByName.get(categoryName.toLowerCase()) : null;
        if (categoryName && !categoryId) throw new Error(`Category not found: ${categoryName}`);

        const unitName = sanitizeString(row['Unit']);
        const unitId = unitName ? unitByName.get(unitName.toLowerCase()) : null;
        if (unitName && !unitId) throw new Error(`Unit not found: ${unitName}`);

        const itemType = sanitizeString(row['Item Type']) || 'Raw Material';
        if (!ITEM_TYPES.includes(itemType)) {
          throw new Error(`Invalid Item Type: ${itemType} (must be one of ${ITEM_TYPES.join(', ')})`);
        }

        const hsnCode = sanitizeString(row['HSN Code']) || null;
        const gstRateRaw = sanitizeString(row['GST Rate']);
        const gstRate = gstRateRaw ? parseNumber(gstRateRaw.toString().replace('%', '')) : null;
        const transferPriceRaw = sanitizeString(row['Warehouse Transfer Price'] || row['Transfer Price']);
        const transferPrice = transferPriceRaw ? parseNumber(transferPriceRaw) : null;
        const reorderLevel = row['Reorder Level'] ? parseNumber(row['Reorder Level']) : 0;
        const description = sanitizeString(row['Description']) || null;
        const statusText = sanitizeString(row['Status']).toLowerCase();
        const isActive = statusText === 'inactive' ? 0 : 1;

        const existing = await query('SELECT id FROM raw_materials WHERE material_code = ? LIMIT 1', [materialCode]);

        if (existing.length > 0) {
          await query(
            `UPDATE raw_materials SET material_name = ?, category_id = ?, unit_id = ?, item_type = ?, hsn_code = ?, gst_rate = ?, transfer_price = ?, reorder_level = ?, description = ?, is_active = ? WHERE id = ?`,
            [materialName, categoryId || null, unitId || null, itemType, hsnCode, gstRate, transferPrice, reorderLevel, description, isActive, existing[0].id]
          );
          await logAudit(req.user.id, 'UPDATE', 'raw_materials', existing[0].id, null, { materialCode }, 'Bulk upload update');
          updated++;
        } else {
          const result = await query(
            `INSERT INTO raw_materials (material_code, material_name, category_id, unit_id, item_type, hsn_code, gst_rate, transfer_price, reorder_level, description, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [materialCode, materialName, categoryId || null, unitId || null, itemType, hsnCode, gstRate, transferPrice, reorderLevel, description, isActive]
          );
          await logAudit(req.user.id, 'CREATE', 'raw_materials', result.insertId, null, { materialCode }, 'Bulk upload create');
          created++;
        }
      } catch (error) {
        errors.push({ row: rowNum, message: error.message });
      }
    }

    res.status(200).json({
      success: true,
      data: { total: rows.length, created, updated, failed: errors.length, errors }
    });
  } catch (error) {
    console.error('Bulk upload raw materials error:', error);
    res.status(error.message?.includes('row limit') ? 400 : 500).json({ success: false, message: error.message || 'Error processing bulk upload' });
  }
};

export const downloadRawMaterialsTemplate = async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Raw Materials');
  sheet.columns = [
    { header: 'Material Code', key: 'material_code', width: 18 },
    { header: 'Material Name', key: 'material_name', width: 28 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Unit', key: 'unit', width: 14 },
    { header: 'Item Type', key: 'item_type', width: 16 },
    { header: 'HSN Code', key: 'hsn_code', width: 14 },
    { header: 'GST Rate', key: 'gst_rate', width: 12 },
    { header: 'Warehouse Transfer Price', key: 'transfer_price', width: 20 },
    { header: 'Reorder Level', key: 'reorder_level', width: 14 },
    { header: 'Description', key: 'description', width: 28 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    material_code: 'RM-MILK-001', material_name: 'Milk', category: 'Dairy', unit: 'Litre',
    item_type: 'Raw Material', hsn_code: '0401', gst_rate: '5', transfer_price: 55,
    reorder_level: 20, description: 'Full cream milk', status: 'Active',
  });
  sheet.addRow({
    material_code: 'PK-CUP-001', material_name: 'Paper Cup 200ml', category: 'Packaging', unit: 'Piece',
    item_type: 'Packaging', hsn_code: '4823', gst_rate: '18', transfer_price: '',
    reorder_level: 500, description: '', status: 'Active',
  });
  sheet.getCell('A4').value = 'Material Code and Material Name are required. Existing codes are updated; new codes are created. Item Type must be one of: Raw Material, Packaging, Consumable, Asset, Other. Category and Unit must already exist in Masters. Warehouse Transfer Price is the price charged to outlets when dispatching from the warehouse (per base unit) - leave blank if not selling this material onward.';
  sheet.getCell('A4').font = { italic: true, size: 10, color: { argb: 'FF6F6B7D' } };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="raw-materials-upload-template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
};

export const bulkUploadMenuItems = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const rows = parseExcelFile(req.file.path);
    const categories = await query('SELECT id, category_name FROM categories');
    const categoryByName = new Map(categories.map((c) => [c.category_name.toLowerCase(), c.id]));

    let created = 0;
    let updated = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        const itemCode = sanitizeString(row['Item Code']);
        const itemName = sanitizeString(row['Item Name']);
        if (!itemCode || !itemName) {
          throw new Error('Item Code and Item Name are required');
        }

        const categoryName = sanitizeString(row['Category']);
        const categoryId = categoryName ? categoryByName.get(categoryName.toLowerCase()) : null;
        if (categoryName && !categoryId) throw new Error(`Category not found: ${categoryName}`);

        const sellingPrice = row['Selling Price'] ? parseNumber(row['Selling Price']) : 0;
        const hsnCode = sanitizeString(row['HSN Code']) || null;
        const gstRateRaw = sanitizeString(row['GST Rate']);
        const gstRate = gstRateRaw ? parseNumber(gstRateRaw.toString().replace('%', '')) : null;
        const description = sanitizeString(row['Description']) || null;
        const statusText = sanitizeString(row['Status']).toLowerCase();
        const isActive = statusText === 'inactive' ? 0 : 1;

        const existing = await query('SELECT id FROM menu_items WHERE item_code = ? LIMIT 1', [itemCode]);

        if (existing.length > 0) {
          await query(
            `UPDATE menu_items SET item_name = ?, category_id = ?, selling_price = ?, hsn_code = ?, gst_rate = ?, description = ?, is_active = ? WHERE id = ?`,
            [itemName, categoryId || null, sellingPrice, hsnCode, gstRate, description, isActive, existing[0].id]
          );
          await logAudit(req.user.id, 'UPDATE', 'menu_items', existing[0].id, null, { itemCode }, 'Bulk upload update');
          updated++;
        } else {
          const result = await query(
            `INSERT INTO menu_items (item_code, item_name, category_id, selling_price, hsn_code, gst_rate, description, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [itemCode, itemName, categoryId || null, sellingPrice, hsnCode, gstRate, description, isActive]
          );
          await logAudit(req.user.id, 'CREATE', 'menu_items', result.insertId, null, { itemCode }, 'Bulk upload create');
          created++;
        }
      } catch (error) {
        errors.push({ row: rowNum, message: error.message });
      }
    }

    res.status(200).json({
      success: true,
      data: { total: rows.length, created, updated, failed: errors.length, errors }
    });
  } catch (error) {
    console.error('Bulk upload menu items error:', error);
    res.status(error.message?.includes('row limit') ? 400 : 500).json({ success: false, message: error.message || 'Error processing bulk upload' });
  }
};

export const downloadMenuItemsTemplate = async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Menu Items');
  sheet.columns = [
    { header: 'Item Code', key: 'item_code', width: 18 },
    { header: 'Item Name', key: 'item_name', width: 28 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Selling Price', key: 'selling_price', width: 14 },
    { header: 'HSN Code', key: 'hsn_code', width: 14 },
    { header: 'GST Rate', key: 'gst_rate', width: 12 },
    { header: 'Description', key: 'description', width: 28 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    item_code: 'MI-CAPP-001', item_name: 'Cappuccino', category: 'Hot Beverages',
    selling_price: 150, hsn_code: '996331', gst_rate: '5', description: '', status: 'Active',
  });
  sheet.getCell('A3').value = 'Item Code and Item Name are required. Existing codes are updated; new codes are created. Category must already exist in Masters.';
  sheet.getCell('A3').font = { italic: true, size: 10, color: { argb: 'FF6F6B7D' } };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="menu-items-upload-template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
};

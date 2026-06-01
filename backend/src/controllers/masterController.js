import { query } from '../config/database.js';
import { logAudit } from '../utils/logger.js';

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
      const fields = Object.keys(req.body);
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

      const fields = Object.keys(req.body);
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

export const outletController = {
  getAll: async (req, res) => {
    try {
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
        ORDER BY id ASC
      `);

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
      const fields = Object.keys(req.body);
      const values = Object.values(req.body);
      const placeholders = fields.map(() => '?').join(', ');

      const result = await query(
        `INSERT INTO outlets (${fields.join(', ')}, created_at) VALUES (${placeholders}, NOW())`,
        values
      );

      await logAudit(req.user.id, 'CREATE', 'outlets', result.insertId, null, req.body, 'Created Outlet');

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

      const fields = Object.keys(req.body);
      const values = Object.values(req.body);
      const setClause = fields.map(f => `${f} = ?`).join(', ');

      await query(
        `UPDATE outlets SET ${setClause}, updated_at = NOW() WHERE id = ?`,
        [...values, req.params.id]
      );

      await logAudit(req.user.id, 'UPDATE', 'outlets', req.params.id, oldData[0], req.body, 'Updated Outlet');

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
export const supplierController = createMasterController('suppliers', 'Supplier');
export const rawMaterialController = createMasterController('raw_materials', 'Raw Material');
export const menuItemController = createMasterController('menu_items', 'Menu Item');
export const unitController = createMasterController('units', 'Unit');
export const expenseHeadController = createMasterController('expense_heads', 'Expense Head');
export const paymentModeController = createMasterController('payment_modes', 'Payment Mode');
export const onlinePlatformController = createMasterController('online_platforms', 'Online Platform');
export const dineInPortalController = createMasterController('dine_in_portals', 'Dine-in Portal');

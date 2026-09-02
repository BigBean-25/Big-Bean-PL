import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { canAccessAllOutlets, getRolePermissions, isKnownRole } from '../utils/roleAccess.js';

export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const users = await query(
        `SELECT u.*, r.role_name, r.permissions 
         FROM users u 
         LEFT JOIN roles r ON u.role_id = r.id 
         WHERE u.id = ? AND u.is_active = 1`,
        [decoded.id]
      );

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Your account no longer exists or is inactive. Please login again.'
        });
      }

      const outlets = await query(
        `SELECT uo.outlet_id, o.outlet_name, o.outlet_code
         FROM user_outlets uo
         LEFT JOIN outlets o ON o.id = uo.outlet_id
         WHERE uo.user_id = ?`,
        [decoded.id]
      );

      req.user = {
        ...users[0],
        outlet_ids: outlets.map((outlet) => outlet.outlet_id),
        outlets,
        permissions_object: getRolePermissions(users[0].role_name)
      };
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Token is invalid or expired'
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role_name)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role_name}' is not authorized to access this route`
      });
    }
    next();
  };
};

export const checkOutletAccess = async (req, res, next) => {
  try {
    const outletId = req.params.outletId || req.body.outlet_id || req.query.outlet_id;
    
    if (!outletId) {
      return next();
    }

    if (req.user.role_name === 'Super Admin' || req.user.role_name === 'Developer') {
      return next();
    }

    const access = await query(
      'SELECT * FROM user_outlets WHERE user_id = ? AND outlet_id = ?',
      [req.user.id, outletId]
    );

    if (access.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this outlet'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error checking outlet access'
    });
  }
};

export const requireRole = (...roles) => authorize(...roles);

export const requirePermission = (permission) => {
  return (req, res, next) => {
    const permissions = req.user.permissions_object || getRolePermissions(req.user.role_name);
    if (!permissions[permission]) {
      return res.status(403).json({
        success: false,
        message: `Permission '${permission}' required`
      });
    }
    next();
  };
};

export const applyOutletScope = (req, res, next) => {
  const roleName = req.user.role_name;
  const requestedOutletId = req.query.outlet_id || req.body.outlet_id || req.params.outlet_id;
  const assignedOutletIds = (req.user.outlet_ids || []).map((id) => Number(id)).filter(Boolean);

  if (!isKnownRole(roleName)) {
    return res.status(403).json({ success: false, message: 'Unknown role is not authorized' });
  }

  if (canAccessAllOutlets(roleName)) {
    if (requestedOutletId === 'all') {
      delete req.query.outlet_id;
      if (req.method === 'GET') delete req.body.outlet_id;
    }

    req.outletScope = {
      all: !requestedOutletId || requestedOutletId === 'all',
      outletIds: requestedOutletId && requestedOutletId !== 'all' ? [Number(requestedOutletId)] : [],
      requestedOutletId: requestedOutletId || 'all'
    };
    return next();
  }

  if (assignedOutletIds.length === 0) {
    return res.status(403).json({ success: false, message: 'No outlet assigned to this user' });
  }

  if (requestedOutletId && requestedOutletId !== 'all' && !assignedOutletIds.includes(Number(requestedOutletId))) {
    return res.status(403).json({ success: false, message: 'You do not have access to the requested outlet' });
  }

  req.outletScope = {
    all: false,
    outletIds: assignedOutletIds,
    requestedOutletId: assignedOutletIds[0]
  };
  req.query.outlet_id = assignedOutletIds[0];
  req.body.outlet_id = assignedOutletIds[0];
  next();
};

export const preventReadOnlyWrite = (req, res, next) => {
  const permissions = req.user.permissions_object || getRolePermissions(req.user.role_name);
  if (permissions.is_read_only && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(403).json({ success: false, message: 'Read-only users cannot modify data' });
  }
  next();
};

export const preventOwnApproval = (createdByField = 'created_by') => {
  return (req, res, next) => {
    if (!req.record || !req.record[createdByField]) return next();
    if (Number(req.record[createdByField]) === Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Users cannot approve or verify their own entries' });
    }
    next();
  };
};

export const preventLockedModification = (req, res, next) => {
  const permissions = req.user.permissions_object || getRolePermissions(req.user.role_name);
  if (req.record?.status === 'Locked' && !permissions.can_emergency_correct) {
    return res.status(403).json({ success: false, message: 'Locked records cannot be modified' });
  }
  next();
};

export const loadScopedRecord = (tableName, idParam = 'id') => {
  return async (req, res, next) => {
    try {
      const rows = await query(`SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`, [req.params[idParam]]);
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Record not found' });
      }

      const record = rows[0];
      const scope = req.outletScope;
      if (scope && !scope.all && record.outlet_id && !scope.outletIds.includes(Number(record.outlet_id))) {
        return res.status(403).json({ success: false, message: 'You do not have access to this record outlet' });
      }

      req.record = record;
      next();
    } catch (error) {
      console.error('Load scoped record error:', error);
      res.status(500).json({ success: false, message: 'Error loading record' });
    }
  };
};

export const auditLog = (moduleName, action) => {
  return async (req, res, next) => {
    try {
      await query(
        `INSERT INTO audit_logs
         (user_id, role_name, outlet_id, module_name, record_id, action, old_data, new_data, reason, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          req.user.role_name,
          req.body.outlet_id || req.query.outlet_id || null,
          moduleName,
          req.params.id || null,
          action,
          req.record ? JSON.stringify(req.record) : null,
          Object.keys(req.body || {}).length ? JSON.stringify(req.body) : null,
          req.body.reason || req.body.audit_reason || null,
          req.ip
        ]
      );
    } catch (error) {
      console.error('Audit log error:', error.message);
    }
    next();
  };
};

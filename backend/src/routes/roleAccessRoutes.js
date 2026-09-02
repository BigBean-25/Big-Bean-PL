import express from 'express';
import { getRoleAccessRoles, getRolePermissions, updateRolePermissions } from '../controllers/roleAccessController.js';
import { protect } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/roles', checkPermission('role_access', 'can_view'), getRoleAccessRoles);
router.get('/:roleId', checkPermission('role_access', 'can_view'), getRolePermissions);
router.put('/:roleId', checkPermission('role_access', 'can_edit'), updateRolePermissions);

export default router;

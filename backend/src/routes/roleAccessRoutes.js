import express from 'express';
import { getRoleAccessRoles, getRolePermissions, updateRolePermissions } from '../controllers/roleAccessController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/roles', getRoleAccessRoles);
router.get('/:roleId', getRolePermissions);
router.put('/:roleId', updateRolePermissions);

export default router;

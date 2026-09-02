import express from 'express';
import { protect, applyOutletScope } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  assignUserToOutlet,
  getUsersByOutlet
} from '../controllers/userController.js';

const router = express.Router();

// Get all users. applyOutletScope confines outlet-locked roles (Outlet
// Admin/Staff/Manager) to their own assigned outlet's users by default,
// instead of listing every outlet's users when no outlet_id filter is
// supplied by the client.
router.get('/', protect, checkPermission('users', 'can_view'), applyOutletScope, getUsers);

// Get users by outlet (Outlet Admin can see their outlet's users)
router.get('/outlet/:outlet_id', protect, getUsersByOutlet);

// Get single user
router.get('/:id', protect, checkPermission('users', 'can_view'), getUserById);

// Create new user
router.post('/', protect, checkPermission('users', 'can_create'), createUser);

// Update user
router.put('/:id', protect, checkPermission('users', 'can_edit'), updateUser);

// Toggle user active status
router.patch('/:id/toggle-status', protect, checkPermission('users', 'can_edit'), toggleUserStatus);

// Delete user
router.delete('/:id', protect, checkPermission('users', 'can_delete'), deleteUser);

// Assign user to outlet
router.post('/:id/assign-outlet', protect, checkPermission('users', 'can_edit'), assignUserToOutlet);

export default router;

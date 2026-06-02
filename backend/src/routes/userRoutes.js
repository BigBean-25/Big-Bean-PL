import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  assignUserToOutlet,
  getUsersByOutlet
} from '../controllers/userController.js';

const router = express.Router();

// Get all users (Super Admin, Admin only)
router.get('/', protect, authorize('Super Admin', 'Admin', 'Developer'), getUsers);

// Get users by outlet (Outlet Admin can see their outlet's users)
router.get('/outlet/:outlet_id', protect, getUsersByOutlet);

// Get single user
router.get('/:id', protect, getUserById);

// Create new user
router.post('/', protect, authorize('Super Admin', 'Admin', 'Developer'), createUser);

// Update user
router.put('/:id', protect, authorize('Super Admin', 'Admin', 'Developer'), updateUser);

// Delete user
router.delete('/:id', protect, authorize('Super Admin', 'Developer'), deleteUser);

// Assign user to outlet
router.post('/:id/assign-outlet', protect, authorize('Super Admin', 'Admin'), assignUserToOutlet);

export default router;

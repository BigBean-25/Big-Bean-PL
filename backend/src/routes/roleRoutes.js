import express from 'express';
import { protect } from '../middleware/auth.js';
import { query } from '../config/database.js';

const router = express.Router();

// Get all roles
router.get('/', protect, async (req, res) => {
  try {
    const roles = await query('SELECT id, role_name, permissions, description FROM roles ORDER BY id');
    
    res.status(200).json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching roles'
    });
  }
});

export default router;

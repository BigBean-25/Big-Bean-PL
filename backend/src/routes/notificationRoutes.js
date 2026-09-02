import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
} from '../controllers/notificationController.js';

const router = express.Router();

router.get('/',             protect, getNotifications);
router.get('/unread-count', protect, getUnreadCount);
router.patch('/read-all',   protect, markAllAsRead);
router.patch('/:id/read',   protect, markAsRead);

export default router;

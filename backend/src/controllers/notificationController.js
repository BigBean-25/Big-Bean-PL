import { query } from '../config/database.js';

/**
 * GET /api/notifications
 * Returns the most-recent 50 notifications for the authenticated user.
 * Each row is scoped by user_id — no outlet leak is possible.
 */
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit  = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const rows = await query(
      `SELECT n.id,
              n.type,
              n.title,
              n.message,
              n.reference_type,
              n.reference_id,
              n.nav_path,
              n.is_read,
              n.created_at,
              n.read_at,
              o.outlet_name
       FROM notifications n
       LEFT JOIN outlets o ON n.outlet_id = o.id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT ${limit}`,
      [userId]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('getNotifications error:', error);
    res.status(500).json({ success: false, message: 'Error fetching notifications' });
  }
};

/**
 * GET /api/notifications/unread-count
 */
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await query(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    res.json({ success: true, count: Number(rows[0].count) });
  } catch (error) {
    console.error('getUnreadCount error:', error);
    res.status(500).json({ success: false, message: 'Error fetching unread count' });
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read. Only affects the requesting user's own rows.
 */
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id }  = req.params;

    await query(
      'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('markAsRead error:', error);
    res.status(500).json({ success: false, message: 'Error marking notification as read' });
  }
};

/**
 * PATCH /api/notifications/read-all
 * Marks ALL unread notifications for the user as read.
 */
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await query(
      'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0',
      [userId]
    );

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('markAllAsRead error:', error);
    res.status(500).json({ success: false, message: 'Error marking notifications as read' });
  }
};

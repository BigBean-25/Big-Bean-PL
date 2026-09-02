import { query } from '../config/database.js';

/**
 * Insert one notification row.
 * Never throws — errors are logged and swallowed so the calling
 * controller always completes its own HTTP response.
 */
const insertNotification = async ({ userId, outletId, type, title, message, referenceType, referenceId, navPath }) => {
  try {
    if (referenceType && referenceId) {
      const dup = await query(
        `SELECT id FROM notifications
         WHERE user_id = ? AND reference_type = ? AND reference_id = ? AND type = ?
           AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
         LIMIT 1`,
        [userId, referenceType, String(referenceId), type || 'info']
      );
      if (dup.length > 0) return;
    }

    await query(
      `INSERT INTO notifications
         (user_id, outlet_id, type, title, message, reference_type, reference_id, nav_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        outletId  || null,
        type       || 'info',
        title,
        message,
        referenceType || null,
        referenceId   || null,
        navPath       || null
      ]
    );
  } catch (err) {
    console.error('[notificationService] insertNotification error:', err.message);
  }
};

/**
 * Resolve the user IDs that should receive a notification for an event
 * on a given outlet:
 *   – All active Super Admin / Admin / Developer users (all-outlet roles)
 *   – All active Outlet Admin users assigned to the specific outlet
 * The actor (the user who triggered the event) is excluded so they don't
 * receive a notification about their own action.
 */
const getAdminRecipients = async (outletId, excludeUserId) => {
  try {
    const excludeSQL = excludeUserId ? ' AND u.id != ?' : '';

    const adminRows = await query(
      `SELECT u.id
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE r.role_name IN ('Super Admin', 'Admin', 'Developer')
         AND u.is_active = 1${excludeSQL}`,
      excludeUserId ? [excludeUserId] : []
    );

    let outletAdminRows = [];
    if (outletId) {
      outletAdminRows = await query(
        `SELECT DISTINCT u.id
         FROM users u
         JOIN roles r       ON u.role_id  = r.id
         JOIN user_outlets uo ON u.id     = uo.user_id
         WHERE r.role_name = 'Outlet Admin'
           AND uo.outlet_id = ?
           AND u.is_active  = 1${excludeSQL}`,
        excludeUserId ? [outletId, excludeUserId] : [outletId]
      );
    }

    const ids = [...adminRows, ...outletAdminRows].map(r => r.id);
    return [...new Set(ids)];
  } catch (err) {
    console.error('[notificationService] getAdminRecipients error:', err.message);
    return [];
  }
};

/**
 * Notify all relevant admins/managers about a new submission or event.
 * Used when outlet staff / outlet admin creates or submits something.
 *
 * @param {object} opts
 * @param {number}  opts.actorId       – user who performed the action (excluded from recipients)
 * @param {number}  opts.outletId      – outlet the record belongs to
 * @param {string}  opts.type          – 'info' | 'success' | 'warning' | 'danger'
 * @param {string}  opts.title
 * @param {string}  opts.message
 * @param {string}  opts.referenceType – e.g. 'cashbook'
 * @param {number}  opts.referenceId   – PK of the record
 * @param {string}  opts.navPath       – frontend URL
 */
export const notifyAdmins = async ({ actorId, outletId, type = 'info', title, message, referenceType, referenceId, navPath }) => {
  const userIds = await getAdminRecipients(outletId, actorId);
  for (const userId of userIds) {
    await insertNotification({ userId, outletId, type, title, message, referenceType, referenceId, navPath });
  }
};

/**
 * Notify a single specific user (e.g. the original submitter when their
 * record is approved / rejected).
 *
 * @param {object} opts
 * @param {number}  opts.userId
 * @param {number}  opts.outletId
 * @param {string}  opts.type
 * @param {string}  opts.title
 * @param {string}  opts.message
 * @param {string}  opts.referenceType
 * @param {number}  opts.referenceId
 * @param {string}  opts.navPath
 */
export const notifyUser = async ({ userId, outletId, type = 'info', title, message, referenceType, referenceId, navPath }) => {
  if (!userId) return;
  await insertNotification({ userId, outletId, type, title, message, referenceType, referenceId, navPath });
};

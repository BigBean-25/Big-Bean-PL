import express from 'express';
import rateLimit from 'express-rate-limit';
import { login, getMe, changePassword } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// The global limiter in app.js (1000 req/15min/IP) covers the whole API and
// is far too loose to throttle repeated failed logins against one account -
// a credential-stuffing/brute-force run against /login would still sail
// through it. This limiter is scoped to just the login route and only counts
// failed attempts (successfulRequests are not counted), so legitimate users
// who log in successfully never get penalized by earlier failed tries.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' }
});

router.post('/login', loginLimiter, login);
router.get('/me', protect, getMe);
router.post('/change-password', protect, changePassword);

export default router;

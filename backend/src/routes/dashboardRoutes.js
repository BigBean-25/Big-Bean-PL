import express from 'express';
import { getDashboardSummary } from '../controllers/dashboardController.js';
import { applyOutletScope, protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/summary', protect, applyOutletScope, getDashboardSummary);

export default router;

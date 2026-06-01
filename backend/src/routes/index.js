import express from 'express';
import authRoutes from './authRoutes.js';
import masterRoutes from './masterRoutes.js';
import dailyAccountsRoutes from './dailyAccountsRoutes.js';
import uploadRoutes from './uploadRoutes.js';
import reportRoutes from './reportRoutes.js';
import recipeRoutes from './recipeRoutes.js';
import payoutRoutes from './payoutRoutes.js';
import userRoutes from './userRoutes.js';
import roleRoutes from './roleRoutes.js';
import payrollRoutes from './payrollRoutes.js';
import petpoojaSalesRoutes from './petpoojaSalesRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import roleAccessRoutes from './roleAccessRoutes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/roles', roleRoutes);
router.use('/users', userRoutes);
router.use('/masters', masterRoutes);
router.use('/daily-accounts', dailyAccountsRoutes);
router.use('/uploads', uploadRoutes);
router.use('/reports', reportRoutes);
router.use('/recipes', recipeRoutes);
router.use('/payouts', payoutRoutes);
router.use('/payroll', payrollRoutes);
router.use('/sales', petpoojaSalesRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/role-access', roleAccessRoutes);

export default router;

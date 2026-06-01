import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  getEmployeeSalaries,
  createEmployeeSalary,
  updateEmployeeSalary,
  deleteEmployeeSalary,
  verifyEmployeeSalary
} from '../controllers/payrollController.js';

const router = express.Router();

router.get('/employee-salary', protect, getEmployeeSalaries);
router.post('/employee-salary', protect, authorize('Admin', 'Super Admin'), createEmployeeSalary);
router.put('/employee-salary/:id', protect, authorize('Admin', 'Super Admin'), updateEmployeeSalary);
router.delete('/employee-salary/:id', protect, authorize('Super Admin'), deleteEmployeeSalary);
router.post('/employee-salary/:id/verify', protect, authorize('Admin', 'Super Admin'), verifyEmployeeSalary);

export default router;

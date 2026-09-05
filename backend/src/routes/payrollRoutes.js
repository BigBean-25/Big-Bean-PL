import express from 'express';
import { protect, authorize, applyOutletScope, loadScopedRecord, preventLockedModification } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import {
  getEmployeeSalaries,
  createEmployeeSalary,
  updateEmployeeSalary,
  deleteEmployeeSalary,
  verifyEmployeeSalary
} from '../controllers/payrollController.js';

const router = express.Router();

router.get('/employee-salary', protect, applyOutletScope, checkPermission('payroll', 'can_view'), getEmployeeSalaries);
router.post('/employee-salary', protect, applyOutletScope, checkPermission('payroll', 'can_create'), createEmployeeSalary);
router.put('/employee-salary/:id', protect, applyOutletScope, checkPermission('payroll', 'can_edit'), loadScopedRecord('employee_salary_monthly'), preventLockedModification, updateEmployeeSalary);
router.delete('/employee-salary/:id', protect, applyOutletScope, authorize('Super Admin'), loadScopedRecord('employee_salary_monthly'), preventLockedModification, deleteEmployeeSalary);
router.post('/employee-salary/:id/verify', protect, applyOutletScope, checkPermission('payroll', 'can_verify'), loadScopedRecord('employee_salary_monthly'), verifyEmployeeSalary);

export default router;

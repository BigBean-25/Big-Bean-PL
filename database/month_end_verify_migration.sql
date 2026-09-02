USE `bigbeancafe_db`;

-- employee_salary_monthly.status is a Draft/Submitted/Verified workflow
-- (payrollController.verifyEmployeeSalary), but the table was never given
-- verified_by/verified_at columns, so that endpoint has been failing with
-- ER_BAD_FIELD_ERROR since it was written. utility_bills needs the same pair
-- for its own verify workflow (utilityBillController.verifyUtilityBill).
ALTER TABLE employee_salary_monthly
  ADD COLUMN IF NOT EXISTS verified_by INT NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP NULL;

ALTER TABLE utility_bills
  ADD COLUMN IF NOT EXISTS verified_by INT NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP NULL;

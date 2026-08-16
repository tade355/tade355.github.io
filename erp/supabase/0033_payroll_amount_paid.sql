-- Regular staff payroll (payroll_lines) gets the same amount_paid field
-- dozer_payroll_lines already has, so a month's salary can be partially
-- paid (e.g. only part of what's due this period) without losing track of
-- the balance still owed — see erp/js/views/payroll.js's balanceOwed()/
-- salaryStatementRows() and the new "My Salary" self-service view
-- (erp/js/views/mySalary.js) that lets a staff member see and print their
-- own outstanding balance.

alter table payroll_lines add column if not exists amount_paid numeric not null default 0;

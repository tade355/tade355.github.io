-- Real per-tier database security, replacing the blanket "any signed-in
-- user, full access" policy every table has had since 006_require_
-- authenticated.sql. Until now, the four-tier access system (Admin /
-- Accounts / Supervisor / Staff) has been enforced only in the JS UI —
-- a Staff-tier login could read or write ANY table directly through the
-- Supabase API, even though the app's screens hide those modules from
-- them. This migration closes that off, table by table, matching each
-- module's tiers in erp/js/router.js's ROUTES array.
--
-- Scope: table-level tier gating only. It does NOT attempt to replicate
-- the finer row-level rules already enforced client-side — a
-- Supervisor's scoping to their own assigned project, a Staff member
-- only seeing their own fund/leave requests, "only Admin can set a fund
-- request's status." Those stay soft/UI-level for now; this pass's job
-- is closing off whole tables from tiers that have no legitimate reason
-- to touch them at all, which is the bulk of the real exposure.
--
-- Tables everyone already has a legitimate reason to read/write in full
-- (leave_requests, attendance_logs, fund_requests, fund_request_items —
-- every tier submits and manages their own) are left on their existing
-- open policy; nothing below touches them.

create or replace function current_employee_tier()
returns text
language sql stable security definer set search_path = public
as $$
  select access_tier from employees where auth_user_id = auth.uid() limit 1;
$$;

-- employees: every module resolves employee names for dropdowns/labels,
-- so read stays open to any signed-in user; only HR & Employees
-- (Admin-only) can add/edit/delete a record.
drop policy employees_anon_all on employees;
create policy employees_select on employees for select to authenticated using (true);
create policy employees_write on employees for all to authenticated
  using (current_employee_tier() = 'Admin')
  with check (current_employee_tier() = 'Admin');

-- inventory: read by Fleet Management, Purchasing, and Accounting's
-- expense-equipment dropdown (Admin/Accounts/Supervisor); written by
-- those same three modules (Fleet assets, Dozer Parts stock).
drop policy inventory_anon_all on inventory;
create policy inventory_all on inventory for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts', 'Supervisor'))
  with check (current_employee_tier() in ('Admin', 'Accounts', 'Supervisor'));

-- customers: read by Sales and Daily Operations' Client dropdown; only
-- Sales (Admin/Accounts) adds or edits one.
drop policy customers_anon_all on customers;
create policy customers_select on customers for select to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts', 'Supervisor'));
create policy customers_write on customers for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

-- suppliers: read by Purchasing and Fleet's diesel-receipt supplier
-- dropdown; only Purchasing (Admin/Accounts) adds or edits one.
drop policy suppliers_anon_all on suppliers;
create policy suppliers_select on suppliers for select to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts', 'Supervisor'));
create policy suppliers_write on suppliers for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

-- projects: read everywhere (site/project dropdowns appear on every
-- tier's screens, including Fund Requests and Leave & Attendance which
-- Staff can reach); only Admin/Accounts manage the project list itself.
drop policy projects_anon_all on projects;
create policy projects_select on projects for select to authenticated using (true);
create policy projects_write on projects for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

-- invoices / invoice_items: read by Sales, Accounting, and Profitability
-- (reachable by Supervisor via Projects too); only Sales (Admin/
-- Accounts) creates or edits one.
drop policy invoices_anon_all on invoices;
create policy invoices_select on invoices for select to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts', 'Supervisor'));
create policy invoices_write on invoices for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

drop policy invoice_items_anon_all on invoice_items;
create policy invoice_items_select on invoice_items for select to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts', 'Supervisor'));
create policy invoice_items_write on invoice_items for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

-- purchase_orders / purchase_order_items: Purchasing only (Admin/Accounts).
drop policy purchase_orders_anon_all on purchase_orders;
create policy purchase_orders_all on purchase_orders for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

drop policy purchase_order_items_anon_all on purchase_order_items;
create policy purchase_order_items_all on purchase_order_items for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

-- expenses: read by Accounting and Profitability (Supervisor via
-- Projects too); only Accounting (Admin/Accounts) adds or edits one.
drop policy expenses_anon_all on expenses;
create policy expenses_select on expenses for select to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts', 'Supervisor'));
create policy expenses_write on expenses for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

-- operations: read by Daily Operations, Fleet, Profitability, Dozer
-- Economics/Payroll, and the Projects Map/Gallery/Weekly Report tabs
-- (Admin/Accounts/Supervisor); only Daily Operations itself
-- (Admin/Supervisor) logs or edits a report.
drop policy operations_anon_all on operations;
create policy operations_select on operations for select to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts', 'Supervisor'));
create policy operations_write on operations for all to authenticated
  using (current_employee_tier() in ('Admin', 'Supervisor'))
  with check (current_employee_tier() in ('Admin', 'Supervisor'));

-- maintenance_logs: Fleet Management only (Admin/Supervisor) — not read
-- by any Accounts-reachable screen.
drop policy maintenance_logs_anon_all on maintenance_logs;
create policy maintenance_logs_all on maintenance_logs for all to authenticated
  using (current_employee_tier() in ('Admin', 'Supervisor'))
  with check (current_employee_tier() in ('Admin', 'Supervisor'));

-- diesel_receipts: read by Fleet's Diesel Tracking and by Profitability's
-- diesel-cost calculation (Admin/Accounts/Supervisor); only logged from
-- Fleet (Admin/Supervisor).
drop policy diesel_receipts_anon_all on diesel_receipts;
create policy diesel_receipts_select on diesel_receipts for select to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts', 'Supervisor'));
create policy diesel_receipts_write on diesel_receipts for all to authenticated
  using (current_employee_tier() in ('Admin', 'Supervisor'))
  with check (current_employee_tier() in ('Admin', 'Supervisor'));

-- diesel_stock_counts: Fleet Management only.
drop policy diesel_stock_counts_anon_all on diesel_stock_counts;
create policy diesel_stock_counts_all on diesel_stock_counts for all to authenticated
  using (current_employee_tier() in ('Admin', 'Supervisor'))
  with check (current_employee_tier() in ('Admin', 'Supervisor'));

-- fueling_vouchers: read by Fleet and the Approvals inbox
-- (Admin/Accounts/Supervisor); only created/decided from Fleet or
-- Approvals (Admin/Supervisor).
drop policy fueling_vouchers_anon_all on fueling_vouchers;
create policy fueling_vouchers_select on fueling_vouchers for select to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts', 'Supervisor'));
create policy fueling_vouchers_write on fueling_vouchers for all to authenticated
  using (current_employee_tier() in ('Admin', 'Supervisor'))
  with check (current_employee_tier() in ('Admin', 'Supervisor'));

-- payroll_runs / payroll_lines: HR & Employees is Admin-only.
drop policy payroll_runs_anon_all on payroll_runs;
create policy payroll_runs_all on payroll_runs for all to authenticated
  using (current_employee_tier() = 'Admin')
  with check (current_employee_tier() = 'Admin');

drop policy payroll_lines_anon_all on payroll_lines;
create policy payroll_lines_all on payroll_lines for all to authenticated
  using (current_employee_tier() = 'Admin')
  with check (current_employee_tier() = 'Admin');

-- financial_entries: Income & Expenditure is Admin/Accounts only.
drop policy financial_entries_anon_all on financial_entries;
create policy financial_entries_all on financial_entries for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

-- dozer_payroll_runs / dozer_payroll_lines: Operator Allowance, inside
-- HR & Employees — Admin-only.
drop policy dozer_payroll_runs_anon_all on dozer_payroll_runs;
create policy dozer_payroll_runs_all on dozer_payroll_runs for all to authenticated
  using (current_employee_tier() = 'Admin')
  with check (current_employee_tier() = 'Admin');

drop policy dozer_payroll_lines_anon_all on dozer_payroll_lines;
create policy dozer_payroll_lines_all on dozer_payroll_lines for all to authenticated
  using (current_employee_tier() = 'Admin')
  with check (current_employee_tier() = 'Admin');

-- dozer_owner_settlements: Dozer Economics, inside Fleet Management —
-- Admin/Supervisor.
drop policy dozer_owner_settlements_anon_all on dozer_owner_settlements;
create policy dozer_owner_settlements_all on dozer_owner_settlements for all to authenticated
  using (current_employee_tier() in ('Admin', 'Supervisor'))
  with check (current_employee_tier() in ('Admin', 'Supervisor'));

-- staff_memos: Memos & Notices / Query-Commendation, inside HR &
-- Employees — Admin-only.
drop policy staff_memos_anon_all on staff_memos;
create policy staff_memos_all on staff_memos for all to authenticated
  using (current_employee_tier() = 'Admin')
  with check (current_employee_tier() = 'Admin');

-- dozer_rate_history: read by Fleet's Rate History tab and by
-- Profitability/Dozer Economics' "rate as of a date" lookups
-- (Admin/Accounts/Supervisor); only logged from Fleet (Admin/Supervisor).
drop policy dozer_rate_history_anon_all on dozer_rate_history;
create policy dozer_rate_history_select on dozer_rate_history for select to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts', 'Supervisor'));
create policy dozer_rate_history_write on dozer_rate_history for all to authenticated
  using (current_employee_tier() in ('Admin', 'Supervisor'))
  with check (current_employee_tier() in ('Admin', 'Supervisor'));

-- project_rate_history: Projects' own Rate History tab is Admin/Accounts
-- only, and it's the only screen that reads this table.
drop policy project_rate_history_anon_all on project_rate_history;
create policy project_rate_history_all on project_rate_history for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

-- notice_board_posts: everyone reads the notice board; only Admin/
-- Accounts can post, edit, or remove a notice.
drop policy notice_board_posts_anon_all on notice_board_posts;
create policy notice_board_posts_select on notice_board_posts for select to authenticated using (true);
create policy notice_board_posts_write on notice_board_posts for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

-- fuel_credit_collections / fuel_credit_payments: Purchasing's Fuel
-- Credit tab — Admin/Accounts only, not read elsewhere.
drop policy fuel_credit_collections_anon_all on fuel_credit_collections;
create policy fuel_credit_collections_all on fuel_credit_collections for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

drop policy fuel_credit_payments_anon_all on fuel_credit_payments;
create policy fuel_credit_payments_all on fuel_credit_payments for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

-- dozer_part_withdrawals: Purchasing's Bulldozer Parts & Supplies tab —
-- Admin/Accounts only.
drop policy dozer_part_withdrawals_auth_all on dozer_part_withdrawals;
create policy dozer_part_withdrawals_all on dozer_part_withdrawals for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

-- assets: HR & Employees' Assets Tracker tab — Admin-only.
drop policy assets_auth_all on assets;
create policy assets_all on assets for all to authenticated
  using (current_employee_tier() = 'Admin')
  with check (current_employee_tier() = 'Admin');

-- Run after 0046. Remove legacy supervisor access to commercial and financial tables.
drop policy if exists customers_select on customers;
create policy customers_select on customers for select to authenticated
  using (current_employee_tier() in ('Admin','Accounts'));
drop policy if exists suppliers_select on suppliers;
create policy suppliers_select on suppliers for select to authenticated
  using (current_employee_tier() in ('Admin','Accounts'));
drop policy if exists invoices_select on invoices;
create policy invoices_select on invoices for select to authenticated
  using (current_employee_tier() in ('Admin','Accounts'));
drop policy if exists invoice_items_select on invoice_items;
create policy invoice_items_select on invoice_items for select to authenticated
  using (current_employee_tier() in ('Admin','Accounts'));
drop policy if exists expenses_select on expenses;
create policy expenses_select on expenses for select to authenticated
  using (current_employee_tier() in ('Admin','Accounts'));
drop policy if exists dozer_owner_settlements_all on dozer_owner_settlements;
create policy dozer_owner_settlements_all on dozer_owner_settlements for all to authenticated
  using (current_employee_tier() in ('Admin','Accounts'))
  with check (current_employee_tier() in ('Admin','Accounts'));
drop policy if exists dozer_rate_history_select on dozer_rate_history;
drop policy if exists dozer_rate_history_write on dozer_rate_history;
create policy dozer_rate_history_select on dozer_rate_history for select to authenticated
  using (current_employee_tier() in ('Admin','Accounts'));
create policy dozer_rate_history_write on dozer_rate_history for all to authenticated
  using (current_employee_tier() = 'Admin') with check (current_employee_tier() = 'Admin');
drop policy if exists inventory_withdrawals_all on inventory_withdrawals;
create policy inventory_withdrawals_all on inventory_withdrawals for all to authenticated
  using (current_employee_tier() in ('Admin','Accounts'))
  with check (current_employee_tier() in ('Admin','Accounts'));
drop policy if exists inventory_all on inventory;
create policy inventory_read on inventory for select to authenticated
  using (current_employee_tier() in ('Admin','Accounts') or
    (current_employee_tier() = 'Supervisor' and erp_project_allowed(current_project)));
create policy inventory_write on inventory for all to authenticated
  using (current_employee_tier() = 'Admin') with check (current_employee_tier() = 'Admin');
notify pgrst, 'reload schema';

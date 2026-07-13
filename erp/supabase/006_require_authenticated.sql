-- Now that real per-user logins exist, data access should require a
-- signed-in session instead of the anon key alone (which is embedded in
-- the page source and was only ever "safe" because nothing else gated
-- access). This switches every existing policy from the anon role to the
-- authenticated role — everything else about the policies (still
-- permissive to any signed-in user, matching the app's existing soft,
-- UI-only tier system) stays the same.
--
-- Run this AFTER 005_add_auth_columns.sql and AFTER the 32 staff accounts
-- have been provisioned — running it before staff have real accounts to
-- log in with would lock everyone out of the live app.

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'employees', 'inventory', 'customers', 'suppliers',
      'invoices', 'invoice_items', 'purchase_orders', 'purchase_order_items',
      'expenses', 'operations', 'maintenance_logs',
      'diesel_receipts', 'diesel_stock_counts',
      'leave_requests', 'attendance_logs', 'fueling_vouchers',
      'fund_requests', 'fund_request_items', 'payroll_runs', 'payroll_lines'
    ])
  loop
    execute format('alter policy %I on %I to authenticated;', t || '_anon_all', t);
  end loop;
end $$;

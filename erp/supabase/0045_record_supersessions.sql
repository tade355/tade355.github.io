-- Reversible duplicate archive. Original requests, payments and audit records stay intact.
begin;
create table if not exists record_supersessions (
 id text primary key, source_collection text not null check(source_collection in ('fundRequests','expenses')), source_id text not null,
 canonical_collection text not null check(canonical_collection in ('fundRequests','expenses')), canonical_id text not null, reason text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(source_collection,source_id), check(source_collection<>canonical_collection or source_id<>canonical_id)
);
alter table record_supersessions enable row level security;
create policy supersession_read on record_supersessions for select to authenticated using (
 (source_collection='fundRequests' and exists(select 1 from fund_requests r where r.id=source_id)) or
 (source_collection='expenses' and exists(select 1 from expenses e where e.id=source_id))
);
create policy supersession_admin_write on record_supersessions for all to authenticated using(current_employee_tier()='Admin') with check(current_employee_tier()='Admin');
create trigger trg_supersession_updated before update on record_supersessions for each row execute function set_updated_at();
create trigger trg_supersession_audit after insert or update or delete on record_supersessions for each row execute function audit_row();
create or replace function erp_save_mapping(p_table text) returns jsonb
language sql immutable set search_path = public as $$
  select case p_table
    when 'invoices' then '["invoice_items","invoice_id"]'::jsonb
    when 'purchase_orders' then '["purchase_order_items","purchase_order_id"]'::jsonb
    when 'fund_requests' then '["fund_request_items","fund_request_id"]'::jsonb
    when 'payroll_runs' then '["payroll_lines","payroll_run_id"]'::jsonb
    when 'dozer_payroll_runs' then '["dozer_payroll_lines","dozer_payroll_run_id"]'::jsonb
    when 'machine_status_reports' then '["machine_status_report_lines","report_id"]'::jsonb
    when 'employees' then '[]'::jsonb when 'inventory' then '[]'::jsonb when 'customers' then '[]'::jsonb
    when 'suppliers' then '[]'::jsonb when 'projects' then '[]'::jsonb when 'expenses' then '[]'::jsonb
    when 'operations' then '[]'::jsonb when 'maintenance_logs' then '[]'::jsonb when 'diesel_receipts' then '[]'::jsonb
    when 'diesel_stock_counts' then '[]'::jsonb when 'leave_requests' then '[]'::jsonb when 'attendance_logs' then '[]'::jsonb
    when 'fueling_vouchers' then '[]'::jsonb when 'financial_entries' then '[]'::jsonb when 'dozer_owner_settlements' then '[]'::jsonb
    when 'staff_memos' then '[]'::jsonb when 'dozer_rate_history' then '[]'::jsonb when 'project_rate_history' then '[]'::jsonb
    when 'notice_board_posts' then '[]'::jsonb when 'fuel_credit_collections' then '[]'::jsonb when 'fuel_credit_payments' then '[]'::jsonb
    when 'dozer_part_withdrawals' then '[]'::jsonb when 'assets' then '[]'::jsonb when 'inventory_withdrawals' then '[]'::jsonb
    when 'diesel_station_prepayments' then '[]'::jsonb when 'diesel_site_distributions' then '[]'::jsonb when 'invoice_payments' then '[]'::jsonb
    when 'loans' then '[]'::jsonb when 'loan_repayments' then '[]'::jsonb when 'training_submissions' then '[]'::jsonb
    when 'record_supersessions' then '[]'::jsonb when 'training_programs' then '[]'::jsonb else null end;
$$;
commit;

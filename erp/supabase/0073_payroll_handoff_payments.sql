-- 0073: regular payroll handoff and installment payment history.
-- Run once after the existing ERP migrations. Preserves legacy amount_paid values.

begin;

alter table payroll_runs drop constraint if exists payroll_runs_status_check;
alter table payroll_runs add constraint payroll_runs_status_check
  check (status in ('Draft','Submitted','Returned','Approved','PartiallyPaid','Paid'));
alter table payroll_runs add column if not exists comments text;
alter table payroll_runs add column if not exists submitted_by text references employees(id) on delete set null;
alter table payroll_runs add column if not exists submitted_at timestamptz;
alter table payroll_runs add column if not exists approved_by text references employees(id) on delete set null;
alter table payroll_runs add column if not exists approved_at timestamptz;

create table if not exists payroll_payments (
  id text primary key,
  payroll_run_id text not null references payroll_runs(id) on delete restrict,
  employee_id text not null references employees(id) on delete restrict,
  amount numeric not null check (amount > 0),
  payment_date date not null,
  reference text,
  note text,
  created_by text references employees(id) on delete set null default current_employee_id(),
  created_at timestamptz not null default now()
);
create index if not exists idx_payroll_payments_run_staff_date
  on payroll_payments(payroll_run_id, employee_id, payment_date desc);

alter table expenses add column if not exists payroll_payment_id text
  references payroll_payments(id) on delete restrict;
alter table expenses add column if not exists payment_reference text;
create unique index if not exists expense_payroll_payment_once
  on expenses(payroll_payment_id) where payroll_payment_id is not null;

alter table payroll_payments enable row level security;
drop policy if exists payroll_payments_read on payroll_payments;
create policy payroll_payments_read on payroll_payments for select to authenticated
  using (current_employee_tier() in ('Admin','Accounts'));
drop policy if exists payroll_payments_insert on payroll_payments;
create policy payroll_payments_insert on payroll_payments for insert to authenticated
  with check (current_employee_tier() = 'Accounts');
revoke all on payroll_payments from anon, authenticated;
grant select, insert on payroll_payments to authenticated;

drop policy if exists payroll_runs_all on payroll_runs;
drop policy if exists payroll_runs_select on payroll_runs;
drop policy if exists payroll_runs_write on payroll_runs;
create policy payroll_runs_select on payroll_runs for select to authenticated
  using (current_employee_tier() in ('Admin','Accounts'));
create policy payroll_runs_write on payroll_runs for all to authenticated
  using (current_employee_tier() = 'Admin')
  with check (current_employee_tier() = 'Admin');

drop policy if exists payroll_lines_all on payroll_lines;
drop policy if exists payroll_lines_select on payroll_lines;
drop policy if exists payroll_lines_write on payroll_lines;
create policy payroll_lines_select on payroll_lines for select to authenticated
  using (current_employee_tier() in ('Admin','Accounts'));
create policy payroll_lines_write on payroll_lines for all to authenticated
  using (current_employee_tier() = 'Admin')
  with check (current_employee_tier() = 'Admin');

create or replace function is_payroll_ceo() returns boolean
language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from employees e
    where e.auth_user_id = auth.uid() and e.status = 'Active'
      and (lower(coalesce(e.name,'')) like '%gideon%'
        or lower(coalesce(e.role,'')) like '%chief executive%'
        or lower(coalesce(e.role,'')) = 'ceo')
  );
$$;
revoke all on function is_payroll_ceo() from public;
grant execute on function is_payroll_ceo() to authenticated;

create or replace function guard_payroll_run_workflow()
returns trigger language plpgsql security definer set search_path=public as $$
declare tier text := current_employee_tier(); actor text := current_employee_id();
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if tier <> 'Admin' or new.status <> 'Draft' then
      raise exception 'HR must create a payroll as Draft';
    end if;
    return new;
  end if;

  if current_setting('erp.payroll_payment_recalc', true) = new.id then
    if tier <> 'Accounts' then raise exception 'Only Accounts can record payroll payments'; end if;
    return new;
  end if;
  if tier <> 'Admin' then raise exception 'Only HR or the CEO can manage payroll preparation'; end if;

  if old.status = 'Submitted' and new.status in ('Approved','Returned') then
    if not is_payroll_ceo() then raise exception 'Only the CEO can approve or return a submitted payroll'; end if;
    perform set_config('erp.payroll_review_run', new.id, true);
    if new.status = 'Approved' then new.approved_by := actor; new.approved_at := now(); end if;
  elsif old.status = 'Submitted' and new.status = 'Submitted' then
    if not is_payroll_ceo() then raise exception 'Submitted payroll is locked for HR'; end if;
    perform set_config('erp.payroll_review_run', new.id, true);
  elsif old.status = 'Draft' and new.status = 'Submitted' then
    new.submitted_by := actor; new.submitted_at := now();
  elsif old.status = 'Returned' and new.status = 'Submitted' then
    new.submitted_by := actor; new.submitted_at := now();
    perform set_config('erp.payroll_correction_run', new.id, true);
  elsif old.status in ('Approved','PartiallyPaid','Paid') then
    raise exception 'Approved payroll is locked; record payments in Accounts';
  elsif old.status = 'Returned' and new.status = 'Returned' then
    raise exception 'Returned payroll must be corrected and resubmitted';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_payroll_run_workflow on payroll_runs;
create trigger trg_guard_payroll_run_workflow before insert or update on payroll_runs
  for each row execute function guard_payroll_run_workflow();

create or replace function guard_payroll_line_workflow()
returns trigger language plpgsql security definer set search_path=public as $$
declare rid text; run_status text; tier text := current_employee_tier();
begin
  if auth.uid() is null then return coalesce(new,old); end if;
  rid := case when tg_op = 'DELETE' then old.payroll_run_id else new.payroll_run_id end;
  select status into run_status from payroll_runs where id=rid for update;
  if current_setting('erp.payroll_review_run', true) = rid and is_payroll_ceo() then
    return coalesce(new,old);
  end if;
  if current_setting('erp.payroll_correction_run', true) = rid and tier = 'Admin' then
    return coalesce(new,old);
  end if;
  if run_status in ('Draft','Returned') and tier = 'Admin' then return coalesce(new,old); end if;
  raise exception 'Payroll employee amounts are locked after submission';
end $$;
drop trigger if exists trg_guard_payroll_line_workflow on payroll_lines;
create trigger trg_guard_payroll_line_workflow before insert or update or delete on payroll_lines
  for each row execute function guard_payroll_line_workflow();

create or replace function record_payroll_payment()
returns trigger language plpgsql security definer set search_path=public as $$
declare run_row payroll_runs%rowtype; line_row payroll_lines%rowtype; emp employees%rowtype;
  due numeric; paid numeric; complete boolean; any_paid boolean;
begin
  if auth.uid() is not null and current_employee_tier() <> 'Accounts' then
    raise exception 'Only Accounts can record payroll payments';
  end if;
  select * into run_row from payroll_runs where id=new.payroll_run_id for update;
  if run_row.id is null or run_row.status not in ('Approved','PartiallyPaid') then
    raise exception 'Only approved, unpaid payroll can be paid';
  end if;
  select * into line_row from payroll_lines
    where payroll_run_id=new.payroll_run_id and employee_id=new.employee_id for update;
  if line_row.id is null then raise exception 'Staff member is not on this payroll run'; end if;
  due := line_row.base_salary + line_row.bonus - line_row.deductions;
  if new.amount > due - line_row.amount_paid then raise exception 'Payment is above this staff member’s outstanding balance'; end if;
  select * into emp from employees where id=new.employee_id;

  perform set_config('erp.payroll_payment_aggregate', new.payroll_run_id, true);
  update payroll_lines set amount_paid=amount_paid+new.amount where id=line_row.id;

  select bool_and(amount_paid >= base_salary + bonus - deductions),
         bool_or(amount_paid > 0)
    into complete, any_paid
    from payroll_lines where payroll_run_id=new.payroll_run_id;
  perform set_config('erp.payroll_payment_recalc', new.payroll_run_id, true);
  update payroll_runs set status=case when complete then 'Paid'
    when any_paid then 'PartiallyPaid' else 'Approved' end
    where id=new.payroll_run_id;

  insert into expenses(id,date,category,description,amount,payee,paid_by,project,payroll_payment_id,payment_reference)
  values(next_record_id('EXP'),new.payment_date,'Payroll',
    'Payroll payment — '||run_row.month||' — '||coalesce(emp.name,'Staff'),
    new.amount,coalesce(emp.name,'Staff'),'Payroll',null,new.id,nullif(new.reference,''));

  return new;
end $$;
drop trigger if exists trg_record_payroll_payment on payroll_payments;
create trigger trg_record_payroll_payment after insert on payroll_payments
  for each row execute function record_payroll_payment();

create or replace function erp_save_mapping(p_table text) returns jsonb
language sql immutable set search_path=public as $$
  select case p_table
    when 'payroll_payments' then '[]'::jsonb
    else (case p_table
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
      when 'training_programs' then '[]'::jsonb else null end)
  end;
$$;

update payroll_runs r set status='PartiallyPaid'
where r.status='Approved' and exists(select 1 from payroll_lines l where l.payroll_run_id=r.id and l.amount_paid>0)
  and exists(select 1 from payroll_lines l where l.payroll_run_id=r.id and l.amount_paid < l.base_salary+l.bonus-l.deductions);
update payroll_runs r set status='Paid'
where r.status in ('Approved','PartiallyPaid') and not exists(
  select 1 from payroll_lines l where l.payroll_run_id=r.id and l.amount_paid < l.base_salary+l.bonus-l.deductions
);

drop policy if exists personal_pay_read on payroll_runs;
-- Personal pay RPC controls employee-specific disclosure. Only Accounts/Admin
-- can directly inspect the company payroll register.
insert into erp_schema_migrations(version) values('0073') on conflict do nothing;
notify pgrst,'reload schema';

commit;

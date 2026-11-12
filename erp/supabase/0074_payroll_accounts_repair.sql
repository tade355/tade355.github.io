-- Payroll permission repair; preserves all salary and payment records.
begin;
create or replace function is_payroll_accounts() returns boolean
language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from employees e
    where e.auth_user_id = auth.uid() and e.status = 'Active'
      and (e.access_tier = 'Accounts'
        or e.id in ('EMP-27', 'EMP-35'))
  );
$$;
revoke all on function is_payroll_accounts() from public;
grant execute on function is_payroll_accounts() to authenticated;

drop policy if exists payroll_payments_insert on public.payroll_payments;
create policy payroll_payments_insert on public.payroll_payments for insert to authenticated with check (public.is_payroll_accounts());

create or replace function guard_payroll_run_workflow()
returns trigger language plpgsql security definer set search_path=public as $$
declare tier text := current_employee_tier(); actor text := current_employee_id();
begin
  if auth.uid() is null then return coalesce(new,old); end if;
  if tg_op = 'DELETE' then
    if tier = 'Admin' and old.status = 'Draft' then return old; end if;
    raise exception 'Only an unsubmitted draft payroll can be deleted';
  end if;
  if tg_op = 'INSERT' then
    if tier <> 'Admin' or new.status <> 'Draft' then
      raise exception 'HR must create a payroll as Draft';
    end if;
    return new;
  end if;

  if current_setting('erp.payroll_payment_recalc', true) = new.id then
    if not is_payroll_accounts() then raise exception 'Only Accounts can record payroll payments'; end if;
    return new;
  end if;

  if old.status = 'Draft' and new.status in ('Draft','Submitted') then
    if tier <> 'Admin' then raise exception 'Only HR can prepare and submit payroll'; end if;
    if new.status = 'Submitted' then new.submitted_by := actor; new.submitted_at := now(); end if;
  elsif old.status = 'Returned' and new.status = 'Submitted' then
    if tier <> 'Admin' then raise exception 'Only HR can correct and resubmit payroll'; end if;
    new.submitted_by := actor; new.submitted_at := now();
    perform set_config('erp.payroll_correction_run', new.id, true);
  elsif old.status = 'Submitted' and new.status in ('Approved','Returned','Submitted') then
    if not is_payroll_ceo() then raise exception 'Only the CEO can review a submitted payroll'; end if;
    perform set_config('erp.payroll_review_run', new.id, true);
    if new.status = 'Approved' then new.approved_by := actor; new.approved_at := now(); end if;
  else
    raise exception 'Approved payroll is locked; record payments in Accounts';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_payroll_run_workflow on payroll_runs;
create trigger trg_guard_payroll_run_workflow before insert or update or delete on payroll_runs
  for each row execute function guard_payroll_run_workflow();

create or replace function guard_payroll_line_workflow()
returns trigger language plpgsql security definer set search_path=public as $$
declare rid text; run_status text; tier text := current_employee_tier();
begin
  if auth.uid() is null then return coalesce(new,old); end if;
  rid := case when tg_op = 'DELETE' then old.payroll_run_id else new.payroll_run_id end;
  select status into run_status from payroll_runs where id=rid for update;
  if run_status is null and tg_op = 'DELETE' and tier = 'Admin' then return old; end if;
  if current_setting('erp.payroll_payment_aggregate', true) = rid and is_payroll_accounts() then
    return coalesce(new,old);
  end if;
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
  if auth.uid() is not null and not is_payroll_accounts() then
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


-- Restore the ED's HR preparation access without changing other staff tiers.
update public.employees set access_tier='Admin' where id='EMP-27' and name='Atabo Victoria' and access_tier='Accounts';
notify pgrst, 'reload schema';
commit;

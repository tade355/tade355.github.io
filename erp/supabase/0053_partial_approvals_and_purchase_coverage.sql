-- Partial approvals, auditable payments and cross-module purchase coverage.
-- Run after the existing ERP migrations. This migration is additive.

alter table fund_requests add column if not exists approved_amount numeric;
alter table fund_requests add column if not exists remainder_decision text not null default 'None'
  check (remainder_decision in ('None', 'Pending', 'Rejected'));
alter table fund_requests add column if not exists approval_note text;
alter table fund_requests add column if not exists paid_amount numeric;
alter table fund_requests add column if not exists payment_reference text;

create table if not exists fund_request_payments (
  id text primary key,
  request_id text not null references fund_requests(id) on delete cascade,
  date date not null,
  amount numeric not null check (amount > 0),
  reference text,
  receipt_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_fund_request_payments_request on fund_request_payments(request_id, date);
create trigger trg_fund_request_payments_updated_at before update on fund_request_payments
  for each row execute function set_updated_at();
alter table fund_request_payments enable row level security;
drop policy if exists fund_request_payments_auth_all on fund_request_payments;
create policy fund_request_payments_auth_all on fund_request_payments for all to authenticated using (true) with check (true);

create or replace function guard_fund_request_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tier text := current_employee_tier();
  actor text;
  requested numeric := coalesce((select sum(amount) from fund_request_items where fund_request_id = new.id), 0);
  approved numeric := new.approved_amount;
begin
  if auth.uid() is null then return new; end if;
  select id into actor from employees where auth_user_id = auth.uid();
  if tg_op = 'INSERT' then
    if new.status <> 'Pending' then raise exception 'New requests must start Pending'; end if;
    if tier not in ('Admin', 'Accounts') and new.submitted_by is distinct from actor then raise exception 'Submit only your own request'; end if;
    new.approved_by := null; new.paid_at := null; new.approved_amount := null; new.paid_amount := null;
    return new;
  end if;
  if old.status = 'Paid' and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'Paid requests are immutable; use a documented correction';
  end if;
  if old.status in ('Approved', 'Partially Approved') then
    if (to_jsonb(new) - array['updated_at','status','paid_at','paid_amount','payment_reference']) is distinct from (to_jsonb(old) - array['updated_at','status','paid_at','paid_amount','payment_reference']) then
      raise exception 'Approved details are locked. Return to Pending before amending';
    end if;
    if new.status not in ('Approved','Partially Approved','Pending','Paid') then raise exception 'Invalid approved request transition'; end if;
  end if;
  if new.status is distinct from old.status then
    if new.status in ('Approved','Partially Approved') then
      if tier <> 'Admin' then raise exception 'Only Admin can approve a fund request'; end if;
      approved := coalesce(approved, requested);
      if approved <= 0 or approved > requested then raise exception 'Approved amount must be positive and no greater than the request'; end if;
      if new.status = 'Partially Approved' and approved >= requested then raise exception 'Use Approved when the full request is authorized'; end if;
      if new.status = 'Approved' and approved < requested then raise exception 'Use Partially Approved when the approval is below the request'; end if;
      new.approved_amount := approved;
      new.approved_by := actor;
    elsif new.status = 'Paid' then
      if old.status not in ('Approved','Partially Approved') or tier not in ('Admin','Accounts') then raise exception 'Only Admin/Accounts can settle an approved request'; end if;
      if new.paid_at is null then raise exception 'Payment date is required'; end if;
      new.approved_amount := coalesce(old.approved_amount, requested);
      new.paid_amount := coalesce(new.paid_amount, new.approved_amount);
      if new.paid_amount <= 0 or new.paid_amount > new.approved_amount then raise exception 'Payment cannot exceed the approved amount'; end if;
    elsif new.status in ('Rejected','Pending') then
      if tier <> 'Admin' then raise exception 'Only Admin can reject or reopen requests'; end if;
      if new.status = 'Pending' then new.approved_by := null; new.paid_at := null; new.approved_amount := null; new.paid_amount := null; end if;
    end if;
  elsif new.approved_by is distinct from old.approved_by or new.paid_at is distinct from old.paid_at then
    raise exception 'Approval and payment fields require a state transition';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_fund_request_status on fund_requests;
create trigger trg_guard_fund_request_status before insert or update on fund_requests for each row execute function guard_fund_request_status();

insert into erp_schema_migrations(version) values ('0053') on conflict do nothing;
notify pgrst, 'reload schema';


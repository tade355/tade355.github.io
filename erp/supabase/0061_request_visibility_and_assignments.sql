-- Final request visibility: finance sees all requests; other staff see only
-- requests they submitted, were explicitly tagged in, or that uniquely name
-- them. Payment rows remain finance-only.
begin;

alter table public.fund_requests
  add column if not exists concerned_staff text[] not null default '{}';

alter table public.fund_requests
  drop constraint if exists fund_requests_concerned_staff_valid;
alter table public.fund_requests
  add constraint fund_requests_concerned_staff_valid check (
    concerned_staff is not null
    and array_position(concerned_staff, null) is null
  );

create index if not exists fund_requests_concerned_staff_gin
  on public.fund_requests using gin (concerned_staff);

create or replace function public.erp_request_mentions_current_employee(p_request_id text)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with me as (
    select e.id,
      lower(trim(regexp_replace(e.name, '[^[:alnum:]]+', ' ', 'g'))) as normalized_name
    from public.employees e
    where e.id = public.current_employee_id()
      and e.status = 'Active'
      and e.archived_at is null
  ), target as (
    select lower(trim(regexp_replace(concat_ws(' ', r.description,
      (select string_agg(i.description, ' ')
       from public.fund_request_items i where i.fund_request_id = r.id)),
      '[^[:alnum:]]+', ' ', 'g'))) as body
    from public.fund_requests r where r.id = p_request_id
  )
  select coalesce((
    select length(me.normalized_name) >= 5
      and (select count(*) from public.employees e2
           where e2.status = 'Active' and e2.archived_at is null
             and lower(trim(regexp_replace(e2.name, '[^[:alnum:]]+', ' ', 'g'))) = me.normalized_name) = 1
      and position(' ' || me.normalized_name || ' ' in ' ' || target.body || ' ') > 0
    from me cross join target
  ), false)
$$;

revoke all on function public.erp_request_mentions_current_employee(text) from public;
grant execute on function public.erp_request_mentions_current_employee(text) to authenticated;

drop policy if exists request_read on public.fund_requests;
create policy request_read on public.fund_requests
for select to authenticated
using (
  public.current_employee_id() is not null and (
    public.current_employee_tier() in ('Admin', 'Accounts')
    or submitted_by = public.current_employee_id()
    or public.current_employee_id() = any(concerned_staff)
    or public.erp_request_mentions_current_employee(id)
  )
);

drop policy if exists fund_request_payments_auth_all on public.fund_request_payments;
drop policy if exists fund_request_payments_finance_read on public.fund_request_payments;
drop policy if exists fund_request_payments_finance_write on public.fund_request_payments;
create policy fund_request_payments_finance_read on public.fund_request_payments
for select to authenticated
using (public.current_employee_tier() in ('Admin', 'Accounts'));
create policy fund_request_payments_finance_write on public.fund_request_payments
for all to authenticated
using (public.current_employee_tier() in ('Admin', 'Accounts'))
with check (public.current_employee_tier() in ('Admin', 'Accounts'));

insert into public.erp_schema_migrations(version) values ('0061')
on conflict do nothing;
notify pgrst, 'reload schema';
commit;


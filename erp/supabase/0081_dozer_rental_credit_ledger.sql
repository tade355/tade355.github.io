-- Rental credit ledger for hired dozers.
-- A worked calendar date consumes one rental day; hours remain visible as evidence.

create table if not exists public.dozer_rental_credits (
  id text primary key,
  vendor text not null,
  equipment text not null,
  payment_date date not null,
  days_paid numeric(12,2) not null check (days_paid > 0),
  daily_rate numeric(14,2) not null check (daily_rate > 0),
  amount_paid numeric(14,2) not null check (amount_paid > 0),
  fund_request_id text references public.fund_requests(id) on delete set null,
  payment_reference text,
  notes text,
  created_by text references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dozer_rental_transfers (
  id text primary key,
  vendor text not null,
  from_equipment text not null,
  to_equipment text not null,
  transfer_date date not null,
  days_transferred numeric(12,2) not null check (days_transferred > 0),
  reason text not null,
  created_by text references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_equipment <> to_equipment)
);

create index if not exists dozer_rental_credits_equipment_date_idx
  on public.dozer_rental_credits (equipment, payment_date);
create index if not exists dozer_rental_credits_request_idx
  on public.dozer_rental_credits (fund_request_id);
create index if not exists dozer_rental_transfers_from_date_idx
  on public.dozer_rental_transfers (from_equipment, transfer_date);
create index if not exists dozer_rental_transfers_to_date_idx
  on public.dozer_rental_transfers (to_equipment, transfer_date);

alter table public.dozer_rental_credits enable row level security;
alter table public.dozer_rental_transfers enable row level security;

drop policy if exists "authenticated read rental credits" on public.dozer_rental_credits;
create policy "authenticated read rental credits" on public.dozer_rental_credits
  for select to authenticated using (true);
drop policy if exists "authenticated manage rental credits" on public.dozer_rental_credits;
create policy "authenticated manage rental credits" on public.dozer_rental_credits
  for all to authenticated
  using (public.current_employee_tier() in ('Admin', 'Accounts'))
  with check (public.current_employee_tier() in ('Admin', 'Accounts'));

drop policy if exists "authenticated read rental transfers" on public.dozer_rental_transfers;
create policy "authenticated read rental transfers" on public.dozer_rental_transfers
  for select to authenticated using (true);
drop policy if exists "authenticated manage rental transfers" on public.dozer_rental_transfers;
create policy "authenticated manage rental transfers" on public.dozer_rental_transfers
  for all to authenticated
  using (public.current_employee_tier() in ('Admin', 'Accounts'))
  with check (public.current_employee_tier() in ('Admin', 'Accounts'));

grant select, insert, update, delete on public.dozer_rental_credits to authenticated;
grant select, insert, update, delete on public.dozer_rental_transfers to authenticated;


-- Add the two new tables to the central checked-save allowlist without
-- replacing any mappings introduced by earlier or later migrations.
do $do$
declare s text;
begin
  select pg_get_functiondef(p.oid) into s
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'erp_save_mapping';
  if s not like '%dozer_rental_credits%' then
    s := replace(s, 'else null end;',
      'when ''dozer_rental_credits'' then ''[]''::jsonb when ''dozer_rental_transfers'' then ''[]''::jsonb else null end;');
    execute s;
  end if;
end
$do$;

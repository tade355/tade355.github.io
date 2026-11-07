begin;
create table if not exists public.budgets (
 id text primary key,
 period_start date not null,
 period_end date not null,
 project text,
 target_ha numeric not null default 0,
 machines_on_site integer not null default 0,
 machines_extra_hours integer not null default 0,
 machines_sunday integer not null default 0,
 diesel_budget numeric not null default 0,
 pms_budget numeric not null default 0,
 allowances_budget numeric not null default 0,
 logistics_budget numeric not null default 0,
 maintenance_budget numeric not null default 0,
 staff_budget numeric not null default 0,
 other_budget numeric not null default 0,
 status text not null default 'Draft',
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.budgets enable row level security;
drop policy if exists budgets_authenticated on public.budgets;
create policy budgets_authenticated on public.budgets for all to authenticated using (true) with check (true);
insert into public.erp_schema_migrations(version) values ('0063') on conflict do nothing;
notify pgrst,'reload schema';
commit;
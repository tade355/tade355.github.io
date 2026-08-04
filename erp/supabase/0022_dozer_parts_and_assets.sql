-- Bulldozer parts withdrawal/utilization log (parts themselves live in
-- inventory, category = 'Dozer Parts' — no schema change needed there,
-- category has no check constraint) — plus a general movable-assets
-- tracker: items assigned to a Project, a Staff member, or left
-- general-use/unassigned.

create table dozer_part_withdrawals (
  id           text primary key,
  date         date not null,
  part_name    text not null,
  quantity     numeric not null default 0,
  equipment    text,
  withdrawn_by text references employees(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_dozer_part_withdrawals_equipment on dozer_part_withdrawals(equipment, date);
create trigger trg_dozer_part_withdrawals_updated_at before update on dozer_part_withdrawals
  for each row execute function set_updated_at();
alter table dozer_part_withdrawals enable row level security;
create policy dozer_part_withdrawals_auth_all on dozer_part_withdrawals for all to authenticated using (true) with check (true);

create table assets (
  id            text primary key,
  name          text not null,
  category      text,
  serial_number text,
  assigned_type text not null default 'Unassigned' check (assigned_type in ('Project', 'Staff', 'Unassigned')),
  project       text,
  employee_id   text references employees(id) on delete set null,
  date_assigned date,
  status        text not null default 'Deployed' check (status in ('Deployed', 'Returned', 'Damaged', 'Lost')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_assets_updated_at before update on assets
  for each row execute function set_updated_at();
alter table assets enable row level security;
create policy assets_auth_all on assets for all to authenticated using (true) with check (true);

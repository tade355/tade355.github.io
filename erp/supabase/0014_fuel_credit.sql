-- Fuel Credit Tracking — diesel and PMS collected on credit from filling
-- stations (Midejab, SK Gold, Total Enugu, Akuebuolo Ltd, Kabir Ltd, etc.),
-- kept on record until the resulting balance is partly or fully settled.
-- Two tables, mirroring the Diesel Tracking receipts/counts pattern:
-- collections are what was picked up on credit, payments are what's been
-- paid back — the balance per station is derived live from both, never
-- stored, so it's always correct without a separate reconciliation step.

create table fuel_credit_collections (
  id         text primary key,
  date       date not null,
  station    text not null,
  fuel_type  text not null check (fuel_type in ('Diesel', 'PMS')),
  litres     numeric not null default 0,
  unit_price numeric not null default 0,
  reference  text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_fuel_credit_collections_station on fuel_credit_collections(station, date);
create trigger trg_fuel_credit_collections_updated_at before update on fuel_credit_collections
  for each row execute function set_updated_at();

create table fuel_credit_payments (
  id         text primary key,
  date       date not null,
  station    text not null,
  amount     numeric not null default 0,
  reference  text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_fuel_credit_payments_station on fuel_credit_payments(station, date);
create trigger trg_fuel_credit_payments_updated_at before update on fuel_credit_payments
  for each row execute function set_updated_at();

alter table fuel_credit_collections enable row level security;
create policy fuel_credit_collections_anon_all on fuel_credit_collections for all to authenticated using (true) with check (true);
alter table fuel_credit_payments enable row level security;
create policy fuel_credit_payments_anon_all on fuel_credit_payments for all to authenticated using (true) with check (true);

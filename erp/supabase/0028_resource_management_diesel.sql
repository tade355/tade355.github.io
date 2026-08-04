-- Resource Management: Diesel Management (3-level accountability) + moved
-- features. See erp/js/views/resourceManagement.js and dieselManagement.js.
--
-- Level 1 (station): diesel_station_prepayments is the payment side of a
-- prepay-first station relationship (pay up front, station owes back
-- litres/funds). The supply side reuses the EXISTING diesel_receipts table
-- (tagged with the new `station` column below) rather than a parallel
-- ledger, so a receipt logged in Fleet's Diesel Tracking automatically
-- draws down the right station's prepay balance.
--
-- Level 2 (site dump tank): also reuses diesel_receipts (tagged with the
-- new `project` column) for "New Supply" into a site's tank, against
-- diesel_site_distributions for "Distributed" out to an individual dozer.
--
-- Level 3 (per-dozer discrepancy) needs no new table — it's a report
-- derived from operations.opening_diesel / fuel_used / closing_diesel,
-- which already exist.

alter table diesel_receipts add column station text;
alter table diesel_receipts add column project text;

create table diesel_station_prepayments (
  id                text primary key,
  date              date not null,
  station           text not null,
  amount            numeric not null default 0,
  unit_price_agreed numeric not null default 0,
  reference         text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_diesel_station_prepayments_station on diesel_station_prepayments(station, date);
create trigger trg_diesel_station_prepayments_updated_at before update on diesel_station_prepayments
  for each row execute function set_updated_at();

create table diesel_site_distributions (
  id             text primary key,
  date           date not null,
  project        text not null,
  equipment      text not null,
  litres         numeric not null default 0,
  distributed_by text references employees(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_diesel_site_distributions_project on diesel_site_distributions(project, date);
create index idx_diesel_site_distributions_equipment on diesel_site_distributions(equipment, date);
create trigger trg_diesel_site_distributions_updated_at before update on diesel_site_distributions
  for each row execute function set_updated_at();

alter table diesel_station_prepayments enable row level security;
create policy diesel_station_prepayments_anon_all on diesel_station_prepayments for all to authenticated using (true) with check (true);
alter table diesel_site_distributions enable row level security;
create policy diesel_site_distributions_anon_all on diesel_site_distributions for all to authenticated using (true) with check (true);

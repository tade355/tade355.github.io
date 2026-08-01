-- Rate/price history — so profitability and settlement calculations use
-- the rate that was actually in effect on a given day, not whatever the
-- rate happens to be today. Diesel price deliberately has no new table:
-- diesel_receipts already captures {date, unit_cost} for every purchase,
-- which is a better historical record than a separately-maintained price
-- log (it's what was actually paid, entered as a side effect of normal
-- receipt logging) — the app now derives "diesel price as of date X" from
-- the most recent receipt on or before that date.

create table dozer_rate_history (
  id                     text primary key,
  equipment              text not null,
  effective_date         date not null,
  hourly_rate            numeric not null default 0,
  rental_rate_per_day    numeric not null default 0,
  management_fee_per_day numeric not null default 0,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index idx_dozer_rate_history_equipment on dozer_rate_history(equipment, effective_date);
create trigger trg_dozer_rate_history_updated_at before update on dozer_rate_history
  for each row execute function set_updated_at();

create table project_rate_history (
  id             text primary key,
  project        text not null,
  effective_date date not null,
  rate           numeric,
  rate_unit      text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_project_rate_history_project on project_rate_history(project, effective_date);
create trigger trg_project_rate_history_updated_at before update on project_rate_history
  for each row execute function set_updated_at();

-- Backfill one history entry per existing rate so as-of-date lookups for
-- periods before this feature shipped still resolve to the rate that was
-- actually on record, instead of falling through to zero.
insert into dozer_rate_history (id, equipment, effective_date, hourly_rate, rental_rate_per_day, management_fee_per_day, notes)
select next_record_id('DRH'), name, coalesce(created_at::date, current_date),
       coalesce(hourly_rate, 0), coalesce(rental_rate_per_day, 0), coalesce(management_fee_per_day, 0),
       'Backfilled from the rate on file when rate history tracking was introduced'
from inventory
where hourly_rate is not null or rental_rate_per_day is not null or management_fee_per_day is not null;

insert into project_rate_history (id, project, effective_date, rate, rate_unit, notes)
select next_record_id('PRH'), name, coalesce(created_at::date, current_date), rate, rate_unit,
       'Backfilled from the rate on file when rate history tracking was introduced'
from projects
where rate is not null;

alter table dozer_rate_history enable row level security;
create policy dozer_rate_history_anon_all on dozer_rate_history for all to authenticated using (true) with check (true);
alter table project_rate_history enable row level security;
create policy project_rate_history_anon_all on project_rate_history for all to authenticated using (true) with check (true);

-- Widen fleet ownership from a binary Company/3rd-Party split into three
-- categories with real financial implications: Company (company owns and
-- maintains it, pays operators per day worked), Partnership (a 2nd-party
-- owner — company pays a day-rate rental and retains a flat management fee,
-- and still pays the operators directly), and Rented (a 3rd-party owner who
-- pays their own operators — company just pays a day rate). Existing
-- '3rd Party' rows become 'Rented' (the closest prior behavior — no
-- operator/maintenance obligation was modeled for them); reclassify any
-- that are actually Partnership dozers by hand afterwards.
alter table inventory drop constraint inventory_ownership_check;
update inventory set ownership = 'Rented' where ownership = '3rd Party';
alter table inventory add constraint inventory_ownership_check
  check (ownership in ('Company', 'Partnership', 'Rented'));

-- Flat per-day rental rate (Partnership/Rented) and the flat per-day amount
-- the company retains for management (Partnership only). Not DB-constrained
-- to ownership — same soft-field convention as owner_name.
alter table inventory add column rental_rate_per_day numeric;
alter table inventory add column management_fee_per_day numeric;

-- Operators on Company/Partnership dozers are paid per day worked, not a
-- monthly salary — see dozer_payroll_runs/lines below.
alter table employees add column day_rate numeric;

-- Let an expense be tagged to a specific fleet asset (mirrors the existing
-- equipment free-text convention on operations/maintenance_logs/
-- fueling_vouchers) so Mobilization & Demobilization, Equipment Rental, and
-- repair costs can be attributed to a specific dozer.
alter table expenses add column equipment text;

-- Fix a gap from 007_operation_types.sql: Phase 1/Phase 2/Corrections were
-- added to the app's operation type list but the live check constraint was
-- never widened to match, so those types have been silently rejected by the
-- database since they were introduced.
alter table operations drop constraint operations_operation_type_check;
alter table operations add constraint operations_operation_type_check
  check (operation_type in ('Tree Felling', 'Stacking', 'Direct Clearing', 'Phase 1', 'Phase 2', 'Zero Bonding', 'Corrections', 'Road', 'Trekking'));

-- Partnership/Rented dozer days are either normal ("Office" — goes on the
-- formal ledger shared with the equipment owner) or a private "Business"
-- arrangement the owner is never shown. business_amount is the operator's
-- extra earning for a Business day. Both stay null for Company-owned
-- dozers, where the distinction doesn't apply.
alter table operations add column work_type text check (work_type in ('Office', 'Business'));
alter table operations add column business_amount numeric;

-- ---------------------------------------------------------------------
-- Dozer operator day-rate payroll — separate from the existing monthly
-- payroll_runs/payroll_lines (which is salary-based): runs cover an
-- arbitrary date range instead of a calendar month, and lines compute net
-- pay from days worked + overtime + business earnings instead of a base
-- salary.
-- ---------------------------------------------------------------------

create table dozer_payroll_runs (
  id           text primary key,
  period_start date not null,
  period_end   date not null,
  status       text not null default 'Draft' check (status in ('Draft', 'Approved', 'Paid')),
  expense_id   text references expenses(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_dozer_payroll_runs_updated_at before update on dozer_payroll_runs
  for each row execute function set_updated_at();

create table dozer_payroll_lines (
  id                   uuid primary key default gen_random_uuid(),
  dozer_payroll_run_id text not null references dozer_payroll_runs(id) on delete cascade,
  employee_id          text not null references employees(id) on delete cascade,
  equipment            text,
  days_worked          numeric not null default 0,
  day_rate             numeric not null default 0,
  overtime_hours       numeric not null default 0,
  overtime_rate        numeric not null default 10000,
  business_earnings    numeric not null default 0,
  deductions           numeric not null default 0,
  amount_paid          numeric not null default 0,
  sort_order           integer not null default 0
);
create index idx_dozer_payroll_lines_run on dozer_payroll_lines(dozer_payroll_run_id);

-- ---------------------------------------------------------------------
-- Partnership dozer owner settlements — the formal, owner-shareable record
-- of days worked, rental earned, management fee retained, repair costs, and
-- amount paid. Rates are snapshotted at settlement time (like
-- payroll_lines.base_salary snapshots employees.salary) so editing
-- inventory.rental_rate_per_day later doesn't retroactively change a
-- historical settlement. Business-day earnings never appear here — only
-- Office days feed a settlement's days_worked.
-- ---------------------------------------------------------------------

create table dozer_owner_settlements (
  id                     text primary key,
  equipment              text not null,
  period_start           date not null,
  period_end             date not null,
  days_worked            numeric not null default 0,
  rental_rate_per_day    numeric not null default 0,
  management_fee_per_day numeric not null default 0,
  repairs_cost           numeric not null default 0,
  amount_paid_to_owner   numeric not null default 0,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index idx_dozer_owner_settlements_equipment on dozer_owner_settlements(equipment);
create trigger trg_dozer_owner_settlements_updated_at before update on dozer_owner_settlements
  for each row execute function set_updated_at();

alter table dozer_payroll_runs enable row level security;
create policy dozer_payroll_runs_anon_all on dozer_payroll_runs for all to authenticated using (true) with check (true);
alter table dozer_payroll_lines enable row level security;
create policy dozer_payroll_lines_anon_all on dozer_payroll_lines for all to authenticated using (true) with check (true);
alter table dozer_owner_settlements enable row level security;
create policy dozer_owner_settlements_anon_all on dozer_owner_settlements for all to authenticated using (true) with check (true);

-- Emagrims ERP — Supabase schema
--
-- Mirrors the collections currently held in erp/js/store.js (localStorage).
-- Run this once in the Supabase SQL Editor on a fresh project to create
-- every table the app will eventually read/write.
--
-- Design notes:
--  * Primary keys stay as the same human-readable text IDs the app already
--    uses (EMP-1, INV-2024-101, ...) instead of switching to UUIDs, so the
--    IDs printed on invoices/payslips/vouchers don't change and existing
--    localStorage data can be copied across as-is.
--  * next_record_id() replaces store.js's in-memory `meta.counter` with an
--    atomic Postgres counter per prefix, so two people creating a record on
--    two different devices at the same moment can never collide — this is
--    the concurrency bug the current localStorage counter has no way to
--    avoid, and the main reason the app is moving off pure localStorage.
--  * Nested arrays in the old model (invoice items, PO items, fund request
--    items, payroll lines) become real child tables with a foreign key back
--    to the parent, so totals/report queries don't need to unpack JSON.
--  * `equipment` on operations/maintenance_logs/fueling_vouchers stays a
--    plain text column (the fleet asset's display name), matching exactly
--    how the app already stores it — not a foreign key. This was tried as
--    an equipment_id FK first, but the app never treats it as an ID
--    anywhere, so the FK only added conversion risk for no real benefit.
--  * attachments (receipts/photos) stay as JSONB — they're already
--    small base64 data URLs from client-side image compression. Moving
--    them to Supabase Storage buckets is a reasonable future improvement,
--    not required for the first migration pass.

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------

create table if not exists id_counters (
  prefix     text primary key,
  next_value integer not null default 1
);

-- security definer: Supabase enables RLS by default on every new table,
-- including this internal id_counters helper table, and no policy below
-- grants anon/authenticated access to it directly. security definer lets
-- this function (owned by the table-creating role) bypass that RLS check
-- so callers never need direct access to id_counters — only through here.
create or replace function next_record_id(p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v integer;
begin
  insert into id_counters (prefix, next_value) values (p_prefix, 2)
  on conflict (prefix) do update set next_value = id_counters.next_value + 1
  returning next_value - 1 into v;
  return p_prefix || '-' || v;
end;
$$;

grant execute on function next_record_id(text) to anon, authenticated;
revoke all on id_counters from anon, authenticated;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------

create table employees (
  id                text primary key,
  name              text not null,
  role              text,
  department        text,
  phone             text,
  email             text,
  salary            numeric,
  date_hired        date,
  status            text not null default 'Active'
                      check (status in ('Active', 'Suspended', 'Disengaged')),
  access_tier       text not null default 'Staff'
                      check (access_tier in ('Admin', 'Accounts', 'Supervisor', 'Staff')),
  assigned_project  text,
  leave_entitlement integer not null default 21,
  day_rate          numeric, -- for dozer operators paid per day worked instead of a monthly salary
  username          text unique, -- login username; Supabase Auth needs an email, so a synthetic one is built from this (see auth.js)
  auth_user_id      uuid unique, -- links this record to its Supabase Auth account
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_employees_auth_user on employees(auth_user_id);
create trigger trg_employees_updated_at before update on employees
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- inventory (includes fleet items — dozers, vehicles — and consumables)
-- ---------------------------------------------------------------------

create table inventory (
  id                     text primary key,
  name                   text not null,
  category               text not null,
  sku                    text,
  quantity               numeric not null default 0,
  unit                   text,
  unit_cost              numeric,
  reorder_level          numeric,
  location               text,
  current_project        text,
  ownership              text check (ownership in ('Company', 'Partnership', 'Rented')),
  owner_name             text,
  fleet_status           text check (fleet_status in ('Active', 'Idle', 'Under Maintenance', 'Down')),
  hourly_rate            numeric,
  service_interval_hours numeric,
  rental_rate_per_day    numeric, -- Partnership/Rented: flat day rate paid to the owner
  management_fee_per_day numeric, -- Partnership only: flat amount the company retains per day
  -- Diesel consumption specs (Heavy Equipment only) — drive Daily Operations'
  -- Fuel Used auto-calc: rate x hours, tiered around the first 8 hrs/day,
  -- with Trekking using its own flat rate instead of the tiered pair.
  diesel_rate_first8h    numeric,
  diesel_rate_after8h    numeric,
  diesel_rate_trekking   numeric,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger trg_inventory_updated_at before update on inventory
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- customers / suppliers
-- ---------------------------------------------------------------------

create table customers (
  id         text primary key,
  name       text not null,
  contact    text,
  phone      text,
  email      text,
  address    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_customers_updated_at before update on customers
  for each row execute function set_updated_at();

create table suppliers (
  id         text primary key,
  name       text not null,
  contact    text,
  phone      text,
  email      text,
  address    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_suppliers_updated_at before update on suppliers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- projects — a managed entity (not a hardcoded list) since new ones get
-- added over time, each with its own status, contract state, progress,
-- and rate.
-- ---------------------------------------------------------------------

create table projects (
  id               text primary key,
  name             text not null unique,
  status           text not null default 'Active' check (status in ('Active', 'On Hold', 'Completed')),
  contract_status  text check (contract_status in ('Draft', 'Pending Signature', 'Signed', 'Expired')),
  percent_complete numeric check (percent_complete >= 0 and percent_complete <= 100),
  rate             numeric,
  rate_unit        text,
  expected_rate_per_day numeric,
  start_date       date,
  total_area_ha    numeric,
  scope            text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger trg_projects_updated_at before update on projects
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- invoices (+ line items)
-- ---------------------------------------------------------------------

create table invoices (
  id           text primary key,
  customer_id  text references customers(id) on delete set null,
  date         date not null,
  due_date     date,
  -- Computed by the app from invoice_payments vs the invoice total (see
  -- erp/js/invoicePayments.js computeInvoiceStatus), not user-editable.
  status       text not null default 'Unpaid' check (status in ('Unpaid', 'Partially Paid', 'Paid')),
  project      text,
  -- Only meaningful when project is set: the measurement period this
  -- invoice verifies, matched against Daily Operations report dates for
  -- the Revenue Reconciliation report. Null for freeform, non-project
  -- invoices.
  period_start date,
  period_end   date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_invoices_customer on invoices(customer_id);
create trigger trg_invoices_updated_at before update on invoices
  for each row execute function set_updated_at();

create table invoice_items (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     text not null references invoices(id) on delete cascade,
  description    text,
  qty            numeric,
  price          numeric,
  sort_order     integer not null default 0,
  -- Only meaningful when the parent invoice has a project: which Daily
  -- Operations operation type this line verifies. Nullable — existing
  -- items predate this and stay unclassified (excluded from the
  -- Revenue Reconciliation matrix, but still counted in invoice totals
  -- everywhere else).
  operation_type text check (operation_type in (
    'Felling', 'Stacking', 'Direct Stacking', 'Root Picking', 'Bonding', 'Road', 'Trekking',
    'Tree Felling', 'Direct Clearing', 'Phase 1', 'Phase 2', 'Cross Cutting', 'Corrections', 'Zero Bonding'
  ))
);
create index idx_invoice_items_invoice on invoice_items(invoice_id);

create table invoice_payments (
  id         text primary key,
  invoice_id text not null references invoices(id) on delete cascade,
  date       date not null,
  amount     numeric not null default 0,
  method     text,
  reference  text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_invoice_payments_invoice on invoice_payments(invoice_id, date);
create trigger trg_invoice_payments_updated_at before update on invoice_payments
  for each row execute function set_updated_at();
alter table invoice_payments enable row level security;
create policy invoice_payments_anon_all on invoice_payments for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- purchase orders (+ line items)
-- ---------------------------------------------------------------------

create table purchase_orders (
  id          text primary key,
  supplier_id text references suppliers(id) on delete set null,
  date        date not null,
  status      text not null default 'Pending' check (status in ('Pending', 'Received')),
  inventory_item text, -- optional: name of the inventory item this PO restocks — its quantity is added on the Pending->Received transition
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_purchase_orders_supplier on purchase_orders(supplier_id);
create trigger trg_purchase_orders_updated_at before update on purchase_orders
  for each row execute function set_updated_at();

create table purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id text not null references purchase_orders(id) on delete cascade,
  description       text,
  qty               numeric,
  price             numeric,
  sort_order        integer not null default 0
);
create index idx_po_items_po on purchase_order_items(purchase_order_id);

-- ---------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------

create table expenses (
  id          text primary key,
  date        date not null,
  category    text,
  description text,
  amount      numeric not null default 0,
  payee       text, -- who the money went to (vendor/contractor/person) — distinct from paid_by (how/by whom it was disbursed)
  paid_by     text,
  project     text,
  equipment   text, -- optional: attributes an expense to a specific fleet asset
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_expenses_project on expenses(project);
create trigger trg_expenses_updated_at before update on expenses
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- operations (daily land clearing reports)
-- ---------------------------------------------------------------------

create table operations (
  id             text primary key,
  date           date not null,
  site_name      text not null,
  block_number   text, -- Block/Plot No., optional — only some sites have this subdivided
  customer_id    text references customers(id) on delete set null,
  equipment      text,
  operator_id    text references employees(id) on delete set null,
  supervisor_id  text references employees(id) on delete set null,
  hours_worked   numeric,
  time_resumed   text, -- "HH:MM" 24h, optional — for average resumption-time tracking (Fleet Roster)
  time_closed    text, -- "HH:MM" 24h, optional — for average close-time tracking (Fleet Roster)
  -- Downtime is subtracted from hours_worked client-side (see operations.js
  -- recomputeHoursWorked) so it already reduces Operator Allowance pay and
  -- Profitability dozer cost — downtime_reason is an accountability label,
  -- not a separate calculation path.
  downtime_reason  text check (downtime_reason in ('Dozer Breakdown', 'Community Disturbance', 'Operator Delay / Infringement', 'Other')),
  downtime_hours   numeric,
  downtime_minutes numeric,
  -- Old values (Tree Felling, Direct Clearing, Phase 1, Phase 2, Corrections,
  -- Zero Bonding) kept valid alongside the corrected names — see 0015_operation_type_rename.sql.
  operation_type text check (operation_type in (
    'Felling', 'Stacking', 'Direct Stacking', 'Root Picking', 'Bonding', 'Road', 'Trekking',
    'Tree Felling', 'Direct Clearing', 'Phase 1', 'Phase 2', 'Cross Cutting', 'Corrections', 'Zero Bonding'
  )),
  quantity       numeric, -- Ha for the clearing types, KM for Road, hrs for Trekking
  opening_diesel numeric, -- litres in the tank at start of day (optional tank reading)
  diesel_supplied numeric, -- litres added to the tank today (optional tank reading)
  closing_diesel numeric, -- litres left in the tank at end of day — feeds the Diesel Replenishment Request
  fuel_used      numeric, -- auto-computed from opening + supplied - closing when those are given; else entered directly
  status         text check (status in ('Completed', 'Ongoing', 'Halted')),
  notes          text,
  attachments    jsonb not null default '[]'::jsonb,
  work_type      text check (work_type in ('Office', 'Business')), -- Partnership/Rented dozers only; null for Company-owned
  business_amount numeric, -- operator's extra earning for a Business-type day
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_operations_site on operations(site_name);
create trigger trg_operations_updated_at before update on operations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- maintenance logs
-- ---------------------------------------------------------------------

create table maintenance_logs (
  id              text primary key,
  date            date not null,
  equipment       text,
  type            text check (type in ('Repair', 'Service', 'Inspection', 'Breakdown')),
  description     text,
  cost            numeric,
  parts_cost      numeric,
  labor_cost      numeric,
  performed_by    text references employees(id) on delete set null,
  contractor_name text,
  status          text check (status in ('Scheduled', 'In Progress', 'Completed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_maintenance_updated_at before update on maintenance_logs
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- diesel tracking
-- ---------------------------------------------------------------------

create table diesel_receipts (
  id         text primary key,
  date       date not null,
  litres     numeric not null,
  unit_cost  numeric,
  supplier   text,
  -- station: which prepay station (Resource Management -> Diesel
  -- Management -> Station Ledger) this delivery draws down, if any.
  -- project: which site's dump tank this delivery replenishes, if any
  -- (null = the company-wide/HQ pool, the original behavior).
  station    text,
  project    text,
  reference  text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_diesel_receipts_updated_at before update on diesel_receipts
  for each row execute function set_updated_at();

create table diesel_stock_counts (
  id             text primary key,
  date           date not null,
  counted_litres numeric not null,
  counted_by     text references employees(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_diesel_counts_updated_at before update on diesel_stock_counts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- leave & attendance
-- ---------------------------------------------------------------------

create table leave_requests (
  id           text primary key,
  employee_id  text not null references employees(id) on delete cascade,
  leave_type   text,
  start_date   date,
  end_date     date,
  reason       text,
  status       text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  applied_date date,
  approved_by  text references employees(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_leave_employee on leave_requests(employee_id);
create trigger trg_leave_updated_at before update on leave_requests
  for each row execute function set_updated_at();

create table attendance_logs (
  id             text primary key,
  employee_id    text not null references employees(id) on delete cascade,
  date           date not null,
  project        text,
  clock_in       text,
  clock_in_lat   numeric,
  clock_in_lng   numeric,
  clock_out      text,
  clock_out_lat  numeric,
  clock_out_lng  numeric,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (employee_id, date)
);
create trigger trg_attendance_updated_at before update on attendance_logs
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- fueling vouchers
-- ---------------------------------------------------------------------

create table fueling_vouchers (
  id               text primary key,
  date             date not null,
  station          text not null,
  project          text,
  equipment        text,
  litres_requested numeric not null,
  estimated_cost   numeric not null,
  requested_by     text references employees(id) on delete set null,
  status           text not null default 'Pending Approval'
                     check (status in ('Pending Approval', 'Approved', 'Rejected', 'Fulfilled')),
  approved_by      text references employees(id) on delete set null,
  notes            text,
  attachments      jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger trg_vouchers_updated_at before update on fueling_vouchers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- fund requests (+ payee line items — bank details live here)
-- ---------------------------------------------------------------------

create table fund_requests (
  id           text primary key,
  date         date not null,
  project      text,
  submitted_by text references employees(id) on delete set null,
  description  text,
  cost_head    text,
  status       text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Paid')),
  approved_by  text references employees(id) on delete set null,
  attachments  jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_fund_requests_updated_at before update on fund_requests
  for each row execute function set_updated_at();

create table fund_request_items (
  id              uuid primary key default gen_random_uuid(),
  fund_request_id text not null references fund_requests(id) on delete cascade,
  description     text,
  amount          numeric not null default 0,
  account_name    text,
  account_number  text,
  bank_name       text,
  sort_order      integer not null default 0
);
create index idx_fund_request_items_request on fund_request_items(fund_request_id);

-- ---------------------------------------------------------------------
-- financial_entries — manual income/expenditure entries the accountant
-- records directly for cash movements not captured by an Invoice,
-- Expense, or Fund Request. Feeds the Income & Expenditure report
-- alongside those three sources.
-- ---------------------------------------------------------------------

create table financial_entries (
  id          text primary key,
  date        date not null,
  type        text not null check (type in ('Income', 'Expenditure')),
  project     text,
  cost_head   text not null,
  amount      numeric not null check (amount >= 0),
  description text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_financial_entries_updated_at before update on financial_entries
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- payroll (+ per-employee lines)
-- ---------------------------------------------------------------------

create table payroll_runs (
  id         text primary key,
  month      text not null, -- 'YYYY-MM'
  status     text not null default 'Draft' check (status in ('Draft', 'Approved', 'Paid')),
  expense_id text references expenses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_payroll_runs_updated_at before update on payroll_runs
  for each row execute function set_updated_at();

create table payroll_lines (
  id             uuid primary key default gen_random_uuid(),
  payroll_run_id text not null references payroll_runs(id) on delete cascade,
  employee_id    text not null references employees(id) on delete cascade,
  base_salary    numeric not null default 0,
  bonus          numeric not null default 0,
  deductions     numeric not null default 0
);
create index idx_payroll_lines_run on payroll_lines(payroll_run_id);

-- ---------------------------------------------------------------------
-- Dozer operator day-rate payroll — separate from payroll_runs/lines
-- (salary-based): runs cover an arbitrary date range, and lines compute
-- net pay from days worked + overtime + business earnings.
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
-- of days worked, rental earned, management fee retained, repairs, and
-- amount paid. Rates are snapshotted at settlement time (like
-- payroll_lines.base_salary snapshots employees.salary). Business-day
-- earnings never appear here — only Office days feed days_worked.
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

-- ---------------------------------------------------------------------
-- Staff memos & notices — printable internal correspondence addressed to
-- one employee or to all staff (employee_id null).
-- ---------------------------------------------------------------------

create table staff_memos (
  id          text primary key,
  date        date not null,
  type        text not null check (type in ('Memo', 'Notice', 'Warning Letter', 'Query Letter', 'Confirmation Letter', 'Other')),
  employee_id text references employees(id) on delete set null,
  subject     text not null,
  body        text not null,
  issued_by   text references employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_staff_memos_updated_at before update on staff_memos
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Rate/price history — lets profitability and settlement calculations use
-- the rate in effect on a given day rather than today's rate. Diesel price
-- deliberately has no table here — it's derived from diesel_receipts
-- (date + unit_cost already captured on every purchase).
-- ---------------------------------------------------------------------

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
  -- Null = a general/fallback rate for the whole project. Set = this rate
  -- only applies to that operation type — most contracts price each
  -- operation type separately (Felling, Stacking, Bonding, ...).
  operation_type text check (operation_type in (
    'Felling', 'Stacking', 'Direct Stacking', 'Root Picking', 'Bonding', 'Road', 'Trekking',
    'Tree Felling', 'Direct Clearing', 'Phase 1', 'Phase 2', 'Cross Cutting', 'Corrections', 'Zero Bonding'
  )),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_project_rate_history_project on project_rate_history(project, effective_date);
create trigger trg_project_rate_history_updated_at before update on project_rate_history
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Documents and Notices — company-wide announcements, meeting notices/agendas/
-- minutes, policies, SOPs, templates, adverts, flyers, and the organogram,
-- visible to every access tier.
-- ---------------------------------------------------------------------

create table notice_board_posts (
  id          text primary key,
  title       text not null,
  category    text not null default 'Announcement'
              check (category in (
                'Announcement', 'Meeting Notice', 'Agenda', 'Minutes', 'Policy',
                'SOP', 'Template', 'Organogram', 'Advert', 'Flyer', 'Other'
              )),
  body        text,
  attachments jsonb not null default '[]'::jsonb,
  pinned      boolean not null default false,
  date        date not null default current_date,
  posted_by   text references employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_notice_board_posts_date on notice_board_posts(date);
create trigger trg_notice_board_posts_updated_at before update on notice_board_posts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Fuel Credit Tracking — diesel/PMS collected on credit from filling
-- stations, and payments made toward settling the resulting balance.
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- Bulldozer parts withdrawal / utilization log (parts themselves live in
-- inventory, category = 'Dozer Parts' — this is just the consumption record)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Movable assets: deployed/assigned to a Project, a Staff member, or
-- left general-use/unassigned
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- General inventory withdrawals (Tools / Consumables / Safety Gear) —
-- Bulldozer Parts has its own withdrawal tracker under Purchasing &
-- Suppliers; this is the equivalent for everything else that gets used
-- up. Logging one deducts the quantity from the item's stock.
-- ---------------------------------------------------------------------
create table inventory_withdrawals (
  id          text primary key,
  date        date not null,
  item_name   text not null,
  quantity    numeric not null default 0,
  issued_to   text references employees(id) on delete set null,
  equipment   text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_inventory_withdrawals_updated_at before update on inventory_withdrawals
  for each row execute function set_updated_at();
alter table inventory_withdrawals enable row level security;
create policy inventory_withdrawals_auth_all on inventory_withdrawals for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- Resource Management -> Diesel Management: Level 1 (station prepay
-- ledger, paired with diesel_receipts.station above) and Level 2 (site
-- dump-tank distributions, paired with diesel_receipts.project above).
-- Level 3 (per-dozer discrepancy) is a report, not a table — see
-- erp/js/views/dieselManagement.js.
-- ---------------------------------------------------------------------
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
alter table diesel_station_prepayments enable row level security;
create policy diesel_station_prepayments_anon_all on diesel_station_prepayments for all to authenticated using (true) with check (true);

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
alter table diesel_site_distributions enable row level security;
create policy diesel_site_distributions_anon_all on diesel_site_distributions for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
-- The app has no real login system yet (the "user gate" is just a
-- name picker, not a password) — so for this first migration pass every
-- table gets RLS enabled with one permissive policy for the anon key,
-- which matches today's soft, UI-only access-tier model. IMPORTANT: the
-- anon key ships in the page source, so anyone with it can read/write
-- every row here. Do not treat this as secure. Once real Supabase Auth
-- is wired up, these policies should be tightened to check auth.uid()
-- against an access-tier claim instead of allowing anon all-access.

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'employees', 'inventory', 'customers', 'suppliers', 'projects',
      'invoices', 'invoice_items', 'purchase_orders', 'purchase_order_items',
      'expenses', 'operations', 'maintenance_logs',
      'diesel_receipts', 'diesel_stock_counts',
      'leave_requests', 'attendance_logs', 'fueling_vouchers',
      'fund_requests', 'fund_request_items', 'payroll_runs', 'payroll_lines',
      'financial_entries', 'dozer_payroll_runs', 'dozer_payroll_lines',
      'dozer_owner_settlements', 'staff_memos', 'dozer_rate_history',
      'project_rate_history', 'notice_board_posts',
      'fuel_credit_collections', 'fuel_credit_payments'
    ])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy %I on %I for all to anon using (true) with check (true);',
      t || '_anon_all', t
    );
  end loop;
end $$;

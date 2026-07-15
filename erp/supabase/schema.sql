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
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
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
  ownership              text check (ownership in ('Company', '3rd Party')),
  owner_name             text,
  fleet_status           text check (fleet_status in ('Active', 'Idle', 'Under Maintenance', 'Down')),
  hourly_rate            numeric,
  service_interval_hours numeric,
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
  id          text primary key,
  customer_id text references customers(id) on delete set null,
  date        date not null,
  due_date    date,
  status      text not null default 'Unpaid' check (status in ('Paid', 'Unpaid')),
  project     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_invoices_customer on invoices(customer_id);
create trigger trg_invoices_updated_at before update on invoices
  for each row execute function set_updated_at();

create table invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  text not null references invoices(id) on delete cascade,
  description text,
  qty         numeric,
  price       numeric,
  sort_order  integer not null default 0
);
create index idx_invoice_items_invoice on invoice_items(invoice_id);

-- ---------------------------------------------------------------------
-- purchase orders (+ line items)
-- ---------------------------------------------------------------------

create table purchase_orders (
  id          text primary key,
  supplier_id text references suppliers(id) on delete set null,
  date        date not null,
  status      text not null default 'Pending' check (status in ('Pending', 'Received')),
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
  paid_by     text,
  project     text,
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
  customer_id    text references customers(id) on delete set null,
  equipment      text,
  operator_id    text references employees(id) on delete set null,
  supervisor_id  text references employees(id) on delete set null,
  hours_worked   numeric,
  operation_type text check (operation_type in ('Tree Felling', 'Stacking', 'Direct Clearing', 'Zero Bonding', 'Road', 'Trekking')),
  quantity       numeric, -- Ha for the four clearing types, KM for Road, hrs for Trekking
  fuel_used      numeric,
  status         text check (status in ('Completed', 'Ongoing', 'Halted')),
  notes          text,
  attachments    jsonb not null default '[]'::jsonb,
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
  id           text primary key,
  date         date not null,
  equipment    text,
  type         text check (type in ('Repair', 'Service', 'Inspection', 'Breakdown')),
  description  text,
  cost         numeric,
  performed_by text references employees(id) on delete set null,
  status       text check (status in ('Scheduled', 'In Progress', 'Completed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
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
      'fund_requests', 'fund_request_items', 'payroll_runs', 'payroll_lines'
    ])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy %I on %I for all to anon using (true) with check (true);',
      t || '_anon_all', t
    );
  end loop;
end $$;

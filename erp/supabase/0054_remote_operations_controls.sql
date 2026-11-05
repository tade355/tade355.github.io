-- Remote operations controls: governed documents, field/HSE detail, service
-- hour-meter tracking, and fuel/location reconciliation metadata.

alter table notice_board_posts add column if not exists document_version text;
alter table notice_board_posts add column if not exists effective_date date;
alter table notice_board_posts add column if not exists review_date date;
alter table notice_board_posts add column if not exists document_owner text;
alter table notice_board_posts add column if not exists supersedes_id text references notice_board_posts(id) on delete set null;
alter table notice_board_posts add column if not exists acknowledgement_required boolean not null default false;

create table if not exists notice_acknowledgements (
  post_id text not null references notice_board_posts(id) on delete cascade,
  employee_id text not null references employees(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (post_id, employee_id)
);
alter table notice_acknowledgements enable row level security;
create policy notice_ack_own_read on notice_acknowledgements for select to authenticated
  using (employee_id = current_employee_id() or current_employee_tier() in ('Admin','Accounts'));
create policy notice_ack_own_write on notice_acknowledgements for insert to authenticated
  with check (employee_id = current_employee_id());
grant select, insert on notice_acknowledgements to authenticated;

alter table dozer_issues add column if not exists severity text not null default 'Medium';
alter table dozer_issues add column if not exists safety_risk boolean not null default false;
alter table dozer_issues add column if not exists location text;
alter table dozer_issues add column if not exists photo_urls jsonb not null default '[]'::jsonb;
alter table dozer_issues add column if not exists downtime_hours numeric not null default 0;
alter table dozer_issues add column if not exists root_cause text;
alter table dozer_issues add column if not exists corrective_action text;
alter table dozer_issues add column if not exists closed_at timestamptz;
alter table dozer_issues add column if not exists closed_by text references employees(id) on delete set null;
alter table dozer_issues add constraint dozer_issue_severity_check check (severity in ('Low','Medium','High','Critical'));
create index if not exists idx_dozer_issues_open_risk on dozer_issues(status, safety_risk, severity);

alter table maintenance_logs add column if not exists hour_meter numeric;
alter table maintenance_logs add column if not exists next_service_hours numeric;
alter table maintenance_logs add column if not exists vendor_name text;
alter table maintenance_logs add column if not exists work_done text;
alter table maintenance_logs add column if not exists evidence_url text;
create index if not exists idx_maintenance_equipment_date on maintenance_logs(equipment, date desc);

alter table fuel_credit_collections add column if not exists location text;
alter table fuel_credit_collections add column if not exists receipt_reference text;
alter table fuel_credit_collections add column if not exists payment_basis text not null default 'Cash and carry';
alter table diesel_site_distributions add column if not exists location text;
alter table diesel_site_distributions add column if not exists source_collection_id text;
alter table diesel_site_distributions add column if not exists hour_meter numeric;
alter table diesel_receipts add column if not exists location text;
alter table diesel_receipts add column if not exists receipt_reference text;
create index if not exists idx_fuel_collections_location_date on fuel_credit_collections(location, date desc);
create index if not exists idx_diesel_distributions_location_date on diesel_site_distributions(location, date desc);

create table if not exists remote_sync_queue (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  collection_key text not null,
  payload jsonb not null,
  queued_at timestamptz not null default now(),
  synced_at timestamptz,
  error_message text
);
alter table remote_sync_queue enable row level security;
create policy remote_sync_own_admin on remote_sync_queue for all to authenticated using (true) with check (true);
grant select, insert, update on remote_sync_queue to authenticated;


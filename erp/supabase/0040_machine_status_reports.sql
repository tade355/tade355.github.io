-- Daily "General Machine Status Report" the site manager submits (per the
-- WhatsApp pattern: a list of every dozer marked Active / Not Active /
-- Breakdown for that day). This becomes the direct, site-manager-reported
-- signal for the Dashboard's fleet-health KPIs, preferred over inferring
-- status from Operations/Maintenance Logs (erp/js/views/fleet.js,
-- reportedStatusAsOf()) once a report exists for a given day.

create table machine_status_reports (
  id           text primary key,
  date         date not null,
  project      text,
  submitted_by text references employees(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_machine_status_reports_updated_at before update on machine_status_reports
  for each row execute function set_updated_at();

create table machine_status_report_lines (
  id         uuid primary key default gen_random_uuid(),
  report_id  text not null references machine_status_reports(id) on delete cascade,
  equipment  text not null,
  status     text not null check (status in ('Active', 'Not Active', 'Breakdown')),
  notes      text,
  sort_order integer not null default 0
);
create index idx_machine_status_report_lines_report on machine_status_report_lines(report_id);

alter table machine_status_reports enable row level security;
alter table machine_status_report_lines enable row level security;

drop policy if exists machine_status_reports_auth_all on machine_status_reports;
create policy machine_status_reports_auth_all on machine_status_reports for all to authenticated using (true) with check (true);

drop policy if exists machine_status_report_lines_auth_all on machine_status_report_lines;
create policy machine_status_report_lines_auth_all on machine_status_report_lines for all to authenticated using (true) with check (true);

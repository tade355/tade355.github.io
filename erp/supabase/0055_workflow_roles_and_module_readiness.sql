-- Workflow accountability, project delegations, attendance corrections and
-- honest module readiness markers.
create table if not exists erp_role_delegations (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references employees(id) on delete cascade,
  role_key text not null,
  project text,
  starts_on date not null,
  ends_on date,
  approved_by text references employees(id) on delete set null,
  notes text,
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists idx_role_delegations_active on erp_role_delegations(employee_id, starts_on, ends_on);
alter table erp_role_delegations enable row level security;
create policy role_delegations_admin_read on erp_role_delegations for select to authenticated using (current_employee_tier() in ('Admin','Accounts') or employee_id = current_employee_id());
create policy role_delegations_admin_write on erp_role_delegations for all to authenticated using (current_employee_tier() = 'Admin') with check (current_employee_tier() = 'Admin');
grant select, insert, update, delete on erp_role_delegations to authenticated;

create table if not exists fund_request_approval_audit (
  id uuid primary key default gen_random_uuid(), request_id text not null references fund_requests(id) on delete cascade,
  from_status text, to_status text not null, acted_by text references employees(id) on delete set null,
  acted_at timestamptz not null default now(), note text
);
create index if not exists idx_fund_request_audit_request on fund_request_approval_audit(request_id, acted_at desc);
alter table fund_request_approval_audit enable row level security;
create policy fund_request_audit_read on fund_request_approval_audit for select to authenticated using (current_employee_tier() in ('Admin','Accounts') or acted_by = current_employee_id());
grant select on fund_request_approval_audit to authenticated;
create or replace function audit_fund_request_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into fund_request_approval_audit(request_id, from_status, to_status, acted_by)
    values(new.id, case when tg_op = 'INSERT' then null else old.status end, new.status, current_employee_id());
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_fund_request_status on fund_requests;
create trigger trg_audit_fund_request_status after insert or update of status on fund_requests for each row execute function audit_fund_request_status();

create table if not exists attendance_corrections (
  id uuid primary key default gen_random_uuid(), attendance_id text not null references attendance_logs(id) on delete cascade,
  employee_id text not null references employees(id) on delete cascade, changed_by text references employees(id) on delete set null,
  old_values jsonb not null, new_values jsonb not null, reason text, changed_at timestamptz not null default now()
);
alter table attendance_corrections enable row level security;
create policy attendance_corrections_read on attendance_corrections for select to authenticated using (current_employee_tier() in ('Admin','Accounts','Supervisor') or employee_id = current_employee_id());
grant select on attendance_corrections to authenticated;
create or replace function audit_attendance_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.clock_in is distinct from old.clock_in or new.clock_out is distinct from old.clock_out or new.project is distinct from old.project then
    insert into attendance_corrections(attendance_id, employee_id, changed_by, old_values, new_values)
    values(new.id, new.employee_id, current_employee_id(), to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_attendance_change on attendance_logs;
create trigger trg_audit_attendance_change after update on attendance_logs for each row execute function audit_attendance_change();

create table if not exists erp_module_status (
  module_key text primary key, label text not null, status text not null default 'Active' check (status in ('Active','Setup required','Paused')),
  owner_role text, setup_note text, updated_at timestamptz not null default now()
);
alter table erp_module_status enable row level security;
create policy module_status_read on erp_module_status for select to authenticated using (true);
create policy module_status_admin_write on erp_module_status for all to authenticated using (current_employee_tier() = 'Admin') with check (current_employee_tier() = 'Admin');
grant select on erp_module_status to authenticated;
insert into erp_module_status(module_key,label,status,owner_role,setup_note) values
 ('documents','Documents and Notices','Setup required','Admin / Company Secretary','Upload the current organogram and approved SOP versions.'),
 ('requests','Requests and Approvals','Active','CEO / Accounts','Approval and payment audit trail enabled.'),
 ('hr','HR, Leave and Attendance','Active','HRM','Attendance corrections are recorded in an audit trail.'),
 ('operations','Field Operations','Active','COO / Supervisors','Use project-scoped access for site teams.'),
 ('resources','Fleet and Resources','Active','Operations / Accounts','Location-based fuel and service controls enabled.')
on conflict(module_key) do update set label=excluded.label, owner_role=excluded.owner_role, setup_note=excluded.setup_note;


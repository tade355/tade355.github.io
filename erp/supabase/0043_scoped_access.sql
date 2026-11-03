-- Apply after 0042. Pair with the directory-aware application release.
-- Validate with Admin, Accounts, Supervisor and Staff accounts in staging.
create or replace function current_employee_tier() returns text language sql stable
security definer set search_path = public as $$
  select access_tier from employees where auth_user_id = auth.uid() and status = 'Active' limit 1;
$$;
create or replace function current_employee_id() returns text language sql stable
security definer set search_path = public as $$
  select id from employees where auth_user_id = auth.uid() and status = 'Active' limit 1;
$$;
create or replace function erp_project_allowed(p_project text) returns boolean language sql stable
security definer set search_path = public as $$
  select coalesce(exists(select 1 from employees where auth_user_id = auth.uid() and status = 'Active'
    and (access_tier in ('Admin','Accounts') or (access_tier = 'Supervisor' and (can_manage_all_projects or nullif(assigned_project,'') = p_project)))), false);
$$;

-- View owner resolves the directory; expose only these non-private fields.
create or replace view employee_directory with (security_barrier = true) as
select id, name, role, department, status, access_tier, assigned_project
from employees where auth.uid() is not null and current_employee_id() is not null;
revoke all on employee_directory from public;
grant select on employee_directory to anon, authenticated;

-- Drop old permissive policies: PostgreSQL combines permissive policies with OR.
do $$ declare r record; begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public'
    and tablename in ('employees','fund_requests','fund_request_items','operations','maintenance_logs',
      'machine_status_reports','machine_status_report_lines','diesel_site_distributions','diesel_receipts',
      'leave_requests','attendance_logs','payroll_runs','payroll_lines','dozer_payroll_runs','dozer_payroll_lines')
  loop execute format('drop policy %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

create policy employee_private_read on employees for select to authenticated
  using (current_employee_tier() = 'Admin' or (auth_user_id = auth.uid() and current_employee_id() is not null));
create policy employee_admin_write on employees for all to authenticated
  using (current_employee_tier() = 'Admin') with check (current_employee_tier() = 'Admin');

create policy request_read on fund_requests for select to authenticated
  using (current_employee_id() is not null and (erp_project_allowed(project) or submitted_by = current_employee_id()));
create policy request_create on fund_requests for insert to authenticated
  with check (current_employee_id() is not null and status = 'Pending' and
    (current_employee_tier() in ('Admin','Accounts') or submitted_by = current_employee_id()));
create policy request_edit on fund_requests for update to authenticated
  using (current_employee_tier() in ('Admin','Accounts') or (status = 'Pending' and submitted_by = current_employee_id()))
  with check (current_employee_tier() in ('Admin','Accounts') or (status = 'Pending' and submitted_by = current_employee_id()));
-- No DELETE policy: retain financial history and correct records by workflow.
create policy request_items_read on fund_request_items for select to authenticated
  using (exists(select 1 from fund_requests r where r.id = fund_request_id));
create policy request_items_write on fund_request_items for all to authenticated
  using (exists(select 1 from fund_requests r where r.id = fund_request_id and r.status = 'Pending'
    and (current_employee_tier() in ('Admin','Accounts') or r.submitted_by = current_employee_id())))
  with check (exists(select 1 from fund_requests r where r.id = fund_request_id and r.status = 'Pending'
    and (current_employee_tier() in ('Admin','Accounts') or r.submitted_by = current_employee_id())));

create policy operation_read on operations for select to authenticated using (erp_project_allowed(site_name));
create policy operation_write on operations for all to authenticated
  using (current_employee_tier() in ('Admin','Supervisor') and erp_project_allowed(site_name))
  with check (current_employee_tier() in ('Admin','Supervisor') and erp_project_allowed(site_name));
create policy maintenance_read on maintenance_logs for select to authenticated using (erp_project_allowed(project));
create policy maintenance_write on maintenance_logs for all to authenticated
  using (current_employee_tier() in ('Admin','Supervisor') and erp_project_allowed(project))
  with check (current_employee_tier() in ('Admin','Supervisor') and erp_project_allowed(project));
create policy machine_report_read on machine_status_reports for select to authenticated using (erp_project_allowed(project));
create policy machine_report_write on machine_status_reports for all to authenticated
  using (current_employee_tier() in ('Admin','Supervisor') and erp_project_allowed(project))
  with check (current_employee_tier() in ('Admin','Supervisor') and erp_project_allowed(project));
create policy machine_lines_read on machine_status_report_lines for select to authenticated
  using (exists(select 1 from machine_status_reports r where r.id = report_id));
create policy machine_lines_write on machine_status_report_lines for all to authenticated
  using (current_employee_tier() in ('Admin','Supervisor') and exists(select 1 from machine_status_reports r where r.id = report_id))
  with check (current_employee_tier() in ('Admin','Supervisor') and exists(select 1 from machine_status_reports r where r.id = report_id));
create policy distribution_read on diesel_site_distributions for select to authenticated using (erp_project_allowed(project));
create policy receipt_read on diesel_receipts for select to authenticated using (erp_project_allowed(project));
create policy receipt_write on diesel_receipts for all to authenticated
  using (current_employee_tier() in ('Admin','Supervisor') and erp_project_allowed(project))
  with check (current_employee_tier() in ('Admin','Supervisor') and erp_project_allowed(project));
create policy distribution_write on diesel_site_distributions for all to authenticated
  using (current_employee_tier() in ('Admin','Supervisor') and erp_project_allowed(project))
  with check (current_employee_tier() in ('Admin','Supervisor') and erp_project_allowed(project));

create policy leave_read on leave_requests for select to authenticated
  using (current_employee_id() is not null and (current_employee_tier() in ('Admin','Accounts') or employee_id = current_employee_id()));
create policy leave_create on leave_requests for insert to authenticated
  with check (status = 'Pending' and (current_employee_tier() = 'Admin' or employee_id = current_employee_id()));
create policy leave_edit on leave_requests for update to authenticated
  using (current_employee_tier() = 'Admin' or (employee_id = current_employee_id() and status = 'Pending'))
  with check (current_employee_tier() = 'Admin' or (employee_id = current_employee_id() and status = 'Pending'));
create policy attendance_read on attendance_logs for select to authenticated
  using (current_employee_id() is not null and (erp_project_allowed(project) or employee_id = current_employee_id()));
create policy attendance_write on attendance_logs for all to authenticated
  using (current_employee_tier() = 'Admin' or (current_employee_tier() = 'Supervisor' and erp_project_allowed(project)))
  with check (current_employee_tier() = 'Admin' or (current_employee_tier() = 'Supervisor' and erp_project_allowed(project)));

create policy payroll_header_read on payroll_runs for select to authenticated
  using (current_employee_id() is not null and (current_employee_tier() = 'Admin' or status in ('Approved','Paid')));
create policy payroll_header_write on payroll_runs for all to authenticated using (current_employee_tier() = 'Admin') with check (current_employee_tier() = 'Admin');
create policy payroll_line_read on payroll_lines for select to authenticated
  using (current_employee_tier() = 'Admin' or (employee_id = current_employee_id() and exists(select 1 from payroll_runs r where r.id = payroll_run_id and r.status in ('Approved','Paid'))));
create policy payroll_line_write on payroll_lines for all to authenticated using (current_employee_tier() = 'Admin') with check (current_employee_tier() = 'Admin');
create policy dozer_payroll_header_read on dozer_payroll_runs for select to authenticated
  using (current_employee_id() is not null and (current_employee_tier() = 'Admin' or status in ('Approved','Paid')));
create policy dozer_payroll_header_write on dozer_payroll_runs for all to authenticated using (current_employee_tier() = 'Admin') with check (current_employee_tier() = 'Admin');
create policy dozer_payroll_line_read on dozer_payroll_lines for select to authenticated
  using (current_employee_tier() = 'Admin' or (employee_id = current_employee_id() and exists(select 1 from dozer_payroll_runs r where r.id = dozer_payroll_run_id and r.status in ('Approved','Paid'))));
create policy dozer_payroll_line_write on dozer_payroll_lines for all to authenticated using (current_employee_tier() = 'Admin') with check (current_employee_tier() = 'Admin');

insert into erp_schema_migrations(version) values ('0043') on conflict do nothing;
-- Close older blanket-auth policies on payment, advance and finance tables.
do $$ declare t text; r record; begin
  foreach t in array array['invoice_payments','financial_entries','diesel_station_prepayments','fuel_credit_collections','fuel_credit_payments','loans','loan_repayments'] loop
    for r in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I',r.policyname,t);
    end loop;
    execute format('create policy finance_read on public.%I for select to authenticated using (current_employee_tier() in (''Admin'',''Accounts''))',t);
    execute format('create policy finance_write on public.%I for all to authenticated using (current_employee_tier() in (''Admin'',''Accounts'')) with check (current_employee_tier() in (''Admin'',''Accounts''))',t);
  end loop;
end $$;
notify pgrst, 'reload schema';

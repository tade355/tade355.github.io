-- Self-contained after 0043, 0046 and 0054. Does not depend on draft 0057/0058.
-- Operators read an explicit non-financial projection, never whole ERP rows.
begin;
alter table public.employees add column if not exists assigned_dozer text;
alter table public.employees add column if not exists canonical_employee_id text references public.employees(id);

create or replace function public.guard_operator_assignment() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.canonical_employee_id is not null then
    if new.canonical_employee_id = new.id or not exists (
      select 1 from public.employees e where e.id = new.canonical_employee_id and e.canonical_employee_id is null
    ) then raise exception 'Select the primary employee record for this historical alias'; end if;
  end if;
  if new.assigned_dozer is not null and btrim(new.assigned_dozer) <> '' then
    if nullif(btrim(new.assigned_project),'') is null or (select count(*) from public.inventory i
      where i.name = new.assigned_dozer and i.category = 'Heavy Equipment' and i.current_project = new.assigned_project) <> 1 then
      raise exception 'The assigned dozer must belong to the selected project';
    end if;
  elsif new.role ilike '%operator%' and nullif(btrim(new.assigned_project),'') is not null then
    raise exception 'Assign both a project and a dozer to this operator';
  end if;
  return new;
end $$;
drop trigger if exists trg_operator_assignment on public.employees;
create trigger trg_operator_assignment before insert or update of assigned_project, assigned_dozer, canonical_employee_id
on public.employees for each row execute function public.guard_operator_assignment();

create or replace view public.employee_directory with (security_barrier = true) as
select id, name, role, department, status, access_tier, assigned_project,
  assigned_dozer, canonical_employee_id, can_manage_all_projects
from public.employees where auth.uid() is not null and public.current_employee_id() is not null;
revoke all on public.employee_directory from public;
grant select on public.employee_directory to authenticated;

create or replace function public.erp_my_operator_assignment(p_project text, p_equipment text)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select (select count(*) from public.employees e join public.inventory i
    on i.name=e.assigned_dozer and i.current_project=e.assigned_project and i.category='Heavy Equipment'
    where e.auth_user_id=auth.uid() and e.status='Active' and e.canonical_employee_id is null
      and e.assigned_project=p_project and e.assigned_dozer=p_equipment)=1;
$$;
revoke all on function public.erp_my_operator_assignment(text,text) from public;
grant execute on function public.erp_my_operator_assignment(text,text) to authenticated;

-- Restrictive policies are ANDed with existing policies; an old permissive
-- policy cannot re-open whole rows to Staff. Personal payroll/requests remain
-- governed by their existing, separate ownership policies.
do $$ declare t text; begin
  foreach t in array array['projects','inventory','operations','maintenance_logs','machine_status_reports',
    'machine_status_report_lines','expenses','financial_entries','fund_request_payments','dozer_rate_history',
    'project_rate_history','customers','suppliers','invoices','invoice_items','purchase_orders','purchase_order_items',
    'invoice_payments','loans','loan_repayments','fuel_credit_collections','fuel_credit_payments',
    'diesel_station_prepayments','record_supersessions','remote_sync_queue','dozer_owner_settlements'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists operator_private_rows on public.%I',t);
      execute format('create policy operator_private_rows on public.%I as restrictive for all to authenticated using (public.current_employee_tier() <> ''Staff'') with check (public.current_employee_tier() <> ''Staff'')',t);
    end if;
  end loop;
end $$;
drop policy if exists operator_issue_assignment on public.dozer_issues;
create policy operator_issue_assignment on public.dozer_issues as restrictive for all to authenticated
  using (public.current_employee_tier()<>'Staff' or public.erp_my_operator_assignment(project,equipment))
  with check (public.current_employee_tier()<>'Staff' or (public.erp_my_operator_assignment(project,equipment)
    and reported_by=public.current_employee_id() and status='Open'));

create or replace function public.erp_operator_portal() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare e public.employees%rowtype; machine public.inventory%rowtype; last_service date;
  engine_hours numeric; report_rows jsonb; issue_rows jsonb; maintenance_rows jsonb; reported_status text;
begin
  if auth.uid() is null then raise exception 'Sign in to view your records'; end if;
  if (select count(*) from public.employees where auth_user_id=auth.uid() and status='Active' and canonical_employee_id is null)<>1 then
    raise exception 'Your login must be linked to one active employee record';
  end if;
  select * into e from public.employees where auth_user_id=auth.uid() and status='Active' and canonical_employee_id is null;
  if nullif(btrim(e.assigned_project),'') is null or nullif(btrim(e.assigned_dozer),'') is null then
    return jsonb_build_object('employee',jsonb_build_object('id',e.id,'name',e.name),'assignmentStatus','Unassigned','reports','[]'::jsonb,'issues','[]'::jsonb,'maintenance','[]'::jsonb);
  end if;
  if (select count(*) from public.inventory where name=e.assigned_dozer and current_project=e.assigned_project and category='Heavy Equipment')<>1 then
    return jsonb_build_object('employee',jsonb_build_object('id',e.id,'name',e.name),'assignmentStatus','Needs review','reports','[]'::jsonb,'issues','[]'::jsonb,'maintenance','[]'::jsonb);
  end if;
  select * into machine from public.inventory where name=e.assigned_dozer and current_project=e.assigned_project and category='Heavy Equipment';
  select max(m.date) into last_service from public.maintenance_logs m
    where m.equipment=e.assigned_dozer and m.type='Service' and m.status='Completed'
      and m.date<=(now() at time zone 'Africa/Lagos')::date
      and (coalesce(m.description,'') !~* '\m(purchase|purchased|purchases|bought)\M'
        or coalesce(m.description,'') ~* '(last actual engine service|engine service completed|service carried out|machine serviced|dozer serviced)');
  if last_service is not null then select coalesce(sum(o.hours_worked),0) into engine_hours
    from public.operations o where o.equipment=e.assigned_dozer and o.date>last_service and o.date<=(now() at time zone 'Africa/Lagos')::date; end if;
  select l.status into reported_status from public.machine_status_reports r
    join public.machine_status_report_lines l on l.report_id=r.id
    where r.project=e.assigned_project and l.equipment=e.assigned_dozer and r.date<=(now() at time zone 'Africa/Lagos')::date
    order by r.date desc,r.created_at desc,l.sort_order desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'date',o.date,'equipment',o.equipment,
    'milestone',o.operation_type,'hours',o.hours_worked,'quantity',o.quantity,
    'started',o.time_resumed,'stopped',o.time_closed,'dieselUsed',o.fuel_used,
    'supervisor',s.name) order by o.date desc,o.id desc),'[]'::jsonb) into report_rows
    from public.operations o left join public.employees s on s.id=o.supervisor_id
    where o.equipment=e.assigned_dozer and o.site_name=e.assigned_project
      and (o.operator_id=e.id or o.operator_id in (select a.id from public.employees a where a.canonical_employee_id=e.id));
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'createdAt',i.created_at,'priority',i.priority,
    'severity',i.severity,'status',i.status,'description',i.description,'response',i.response) order by i.created_at desc),'[]'::jsonb)
    into issue_rows from public.dozer_issues i where i.equipment=e.assigned_dozer and i.project=e.assigned_project;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'date',m.date,'type',m.type,'status',m.status)
    order by m.date desc,m.id desc),'[]'::jsonb) into maintenance_rows from public.maintenance_logs m
    where m.equipment=e.assigned_dozer and (m.project=e.assigned_project or m.project is null);
  return jsonb_build_object('employee',jsonb_build_object('id',e.id,'name',e.name),'assignmentStatus','Ready',
    'project',e.assigned_project,'dozer',jsonb_build_object('name',machine.name,'status',coalesce(reported_status,machine.fleet_status),
    'lastServiceDate',last_service,'hoursSinceService',engine_hours,'serviceIntervalHours',coalesce(nullif(machine.service_interval_hours,0),250)),
    'reports',report_rows,'issues',issue_rows,'maintenance',maintenance_rows);
end $$;
revoke all on function public.erp_operator_portal() from public;
grant execute on function public.erp_operator_portal() to authenticated;
insert into public.erp_schema_migrations(version) values ('0059') on conflict do nothing;
notify pgrst,'reload schema';
commit;

-- Apply after 0043. In-app alerts and operator-reported dozer concerns.
create table if not exists erp_notification_roles (
  role_key text primary key check (role_key in ('ceo','payer','coo','secretary')),
  employee_id text not null references employees(id)
);
alter table erp_notification_roles enable row level security;
revoke all on erp_notification_roles from anon, authenticated;

-- Review these four assignments after deployment if personnel changes.
insert into erp_notification_roles(role_key, employee_id)
select v.role_key, e.id from (values
  ('ceo','gideon'), ('payer','victoria'), ('coo','olumide'), ('secretary','gladness')
) v(role_key, name_part)
join lateral (select id from employees where status = 'Active' and lower(name) like '%' || v.name_part || '%' order by id limit 1) e on true
on conflict (role_key) do update set employee_id = excluded.employee_id;
do $$ begin
  if (select count(*) from erp_notification_roles) <> 4 then
    raise exception 'Notification routing needs CEO Gideon, payer Victoria, COO Olumide and secretary Gladness employee records';
  end if;
end $$;

create table if not exists erp_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id text not null references employees(id) on delete cascade,
  event_key text not null,
  title text not null,
  message text not null,
  target_path text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(recipient_id, event_key)
);
create index if not exists idx_erp_notifications_recipient on erp_notifications(recipient_id, created_at desc);
alter table erp_notifications enable row level security;
create policy notification_own_read on erp_notifications for select to authenticated using (recipient_id = current_employee_id());
create policy notification_own_update on erp_notifications for update to authenticated using (recipient_id = current_employee_id()) with check (recipient_id = current_employee_id());
grant select on erp_notifications to authenticated;
grant update(read_at) on erp_notifications to authenticated;

create or replace function notify_fund_request_change() returns trigger language plpgsql security definer set search_path = public as $$
declare recipient text; summary text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  summary := coalesce(nullif(left(new.description, 100), ''), new.id);
  for recipient in
    select distinct id from (
      select new.submitted_by as id where new.status in ('Approved','Rejected','Paid')
      union all select employee_id from erp_notification_roles where
        (new.status = 'Pending' and role_key in ('ceo','coo','secretary')) or
        (new.status = 'Approved' and role_key in ('payer','coo','secretary')) or
        (new.status = 'Rejected' and role_key in ('coo','secretary')) or
        (new.status = 'Paid' and role_key in ('ceo','coo','secretary'))
      union all select id from employees where status = 'Active' and access_tier = 'Accounts' and new.status = 'Approved'
    ) recipients where id is not null
  loop
    insert into erp_notifications(recipient_id,event_key,title,message,target_path)
    values(recipient, 'fund:' || new.id || ':' || new.status,
      'Request ' || lower(new.status), summary || ' (' || new.id || ')', '#/fundRequests')
    on conflict(recipient_id,event_key) do nothing;
  end loop;
  return new;
end $$;
drop trigger if exists trg_notify_fund_request on fund_requests;
create trigger trg_notify_fund_request after insert or update of status on fund_requests
  for each row execute function notify_fund_request_change();

create table if not exists dozer_issues (
  id uuid primary key default gen_random_uuid(),
  project text not null,
  equipment text not null,
  reported_by text not null references employees(id),
  priority text not null default 'Normal' check (priority in ('Normal','Urgent')),
  description text not null check (length(trim(description)) between 10 and 2000),
  status text not null default 'Open' check (status in ('Open','Acknowledged','In Progress','Resolved')),
  response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_dozer_issues_project on dozer_issues(project, created_at desc);
create or replace function guard_dozer_issue_update() returns trigger language plpgsql as $$
begin
  if new.project is distinct from old.project or new.equipment is distinct from old.equipment
    or new.reported_by is distinct from old.reported_by or new.priority is distinct from old.priority
    or new.description is distinct from old.description or new.created_at is distinct from old.created_at then
    raise exception 'Only the issue status and response can be changed';
  end if;
  return new;
end $$;
create trigger trg_guard_dozer_issue before update on dozer_issues for each row execute function guard_dozer_issue_update();
create trigger trg_dozer_issues_updated_at before update on dozer_issues for each row execute function set_updated_at();
alter table dozer_issues enable row level security;
create policy dozer_issue_read on dozer_issues for select to authenticated
  using (reported_by = current_employee_id() or erp_project_allowed(project));
create policy dozer_issue_submit on dozer_issues for insert to authenticated
  with check (reported_by = current_employee_id() and status = 'Open' and
    (current_employee_tier() = 'Admin' or
     (current_employee_tier() = 'Supervisor' and erp_project_allowed(project)) or
     (current_employee_tier() = 'Staff' and exists (
        select 1 from employees where id = current_employee_id() and role ilike '%operator%'
          and assigned_project = project))));
create policy dozer_issue_manage on dozer_issues for update to authenticated
  using (current_employee_tier() = 'Admin' or (current_employee_tier() = 'Supervisor' and erp_project_allowed(project)))
  with check (current_employee_tier() = 'Admin' or (current_employee_tier() = 'Supervisor' and erp_project_allowed(project)));
grant select, insert, update on dozer_issues to authenticated;

create or replace function notify_dozer_issue_change() returns trigger language plpgsql security definer set search_path = public as $$
declare recipient text;
begin
  if tg_op = 'INSERT' then
    for recipient in
      select distinct id from (
        select id from employees where status = 'Active' and access_tier = 'Supervisor'
          and (assigned_project = new.project or can_manage_all_projects)
        union all select employee_id from erp_notification_roles where role_key = 'coo'
      ) recipients
    loop
      insert into erp_notifications(recipient_id,event_key,title,message,target_path)
      values(recipient,'issue:' || new.id || ':Open','Dozer issue reported',new.equipment || ': ' || left(new.description,120),'#/dozerIssues')
      on conflict(recipient_id,event_key) do nothing;
    end loop;
  elsif new.status is distinct from old.status then
    insert into erp_notifications(recipient_id,event_key,title,message,target_path)
    values(new.reported_by,'issue:' || new.id || ':' || new.status,'Dozer issue ' || lower(new.status),new.equipment || ': ' || coalesce(nullif(left(new.response,120),''),left(new.description,120)),'#/dozerIssues')
    on conflict(recipient_id,event_key) do nothing;
  end if;
  return new;
end $$;
create trigger trg_notify_dozer_issue after insert or update of status on dozer_issues
  for each row execute function notify_dozer_issue_change();

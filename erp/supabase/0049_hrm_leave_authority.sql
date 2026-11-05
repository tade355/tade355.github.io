-- Run after 0048. HRM Victoria decides leave; applicants receive the decision.
alter table erp_notification_roles drop constraint if exists erp_notification_roles_role_key_check;
alter table erp_notification_roles add constraint erp_notification_roles_role_key_check
  check (role_key in ('ceo','payer','coo','secretary','hrm'));
insert into erp_notification_roles(role_key,employee_id)
select 'hrm', id from employees where id = 'EMP-27' and status = 'Active' and lower(name) like '%victoria%'
on conflict(role_key) do update set employee_id = excluded.employee_id;
do $$ begin
  if not exists(select 1 from erp_notification_roles where role_key = 'hrm') then
    raise exception 'Victoria HRM employee record is missing';
  end if;
end $$;

create or replace function guard_leave_decision() returns trigger language plpgsql security definer set search_path = public as $$
declare hrm_id text;
begin
  if auth.uid() is null then return new; end if;
  select employee_id into hrm_id from erp_notification_roles where role_key='hrm';
  if tg_op = 'INSERT' then
    if new.status <> 'Pending' or new.approved_by is not null then
      raise exception 'New leave requests must be pending';
    end if;
  else
    if new.employee_id is distinct from old.employee_id then
      raise exception 'Leave applicant cannot be changed';
    end if;
    if new.status is distinct from old.status then
      if old.status <> 'Pending' or new.status not in ('Approved','Rejected')
        or current_employee_id() is distinct from hrm_id then
        raise exception 'Only HRM Victoria can decide a pending leave request';
      end if;
      new.approved_by := hrm_id;
    elsif new.approved_by is distinct from old.approved_by then
      raise exception 'Leave approver cannot be changed';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_leave_decision on leave_requests;
create trigger trg_guard_leave_decision before insert or update on leave_requests
  for each row execute function guard_leave_decision();

create or replace function notify_leave_request_change() returns trigger language plpgsql security definer set search_path = public as $$
declare recipient text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  if new.status = 'Pending' then
    select employee_id into recipient from erp_notification_roles where role_key='hrm';
    insert into erp_notifications(recipient_id,event_key,title,message,target_path)
    values(recipient,'leave:' || new.id || ':Pending','Leave request awaiting decision',
      coalesce((select name from employees where id=new.employee_id),'Staff') || ': ' || coalesce(new.leave_type,'Leave') || ' from ' || coalesce(new.start_date::text,'unspecified date'),'#/leave')
    on conflict(recipient_id,event_key) do nothing;
  elsif new.status in ('Approved','Rejected') then
    for recipient in
      select distinct id from (
        select new.employee_id as id
        union all select employee_id from erp_notification_roles where role_key in ('coo','secretary')
      ) recipients where id is not null
    loop
      insert into erp_notifications(recipient_id,event_key,title,message,target_path)
      values(recipient,'leave:' || new.id || ':' || new.status,
        'Leave request ' || lower(new.status),
        coalesce((select name from employees where id=new.employee_id),'Staff') || ': ' || coalesce(new.leave_type,'Leave') || ' starting ' || coalesce(new.start_date::text,'unspecified date'), '#/leave')
      on conflict(recipient_id,event_key) do nothing;
    end loop;
  end if;
  return new;
end $$;

insert into erp_notifications(recipient_id,event_key,title,message,target_path)
select r.employee_id, 'leave:' || l.id || ':Pending', 'Leave request awaiting decision',
  coalesce(e.name,'Staff') || ': ' || coalesce(l.leave_type,'Leave') || ' from ' || coalesce(l.start_date::text,'unspecified date'), '#/leave'
from leave_requests l cross join erp_notification_roles r
left join employees e on e.id=l.employee_id
where l.status='Pending' and r.role_key='hrm'
on conflict(recipient_id,event_key) do nothing;

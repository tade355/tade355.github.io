-- Run after 0046. Notify staff of leave decisions and surface pending fund requests.
create or replace function notify_leave_request_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  if new.status = 'Pending' then
    insert into erp_notifications(recipient_id,event_key,title,message,target_path)
    select distinct recipient_id, 'leave:' || new.id || ':Pending', 'Leave request submitted',
      coalesce(e.name,'Staff') || ': ' || coalesce(new.leave_type,'Leave') || ' from ' || coalesce(new.start_date::text,'unspecified date'), '#/leave'
    from (select id as recipient_id from employees where status = 'Active' and access_tier = 'Admin') recipients
    left join employees e on e.id = new.employee_id
    on conflict(recipient_id,event_key) do nothing;
  elsif new.status in ('Approved','Rejected') then
    insert into erp_notifications(recipient_id,event_key,title,message,target_path)
    values(new.employee_id,'leave:' || new.id || ':' || new.status,
      'Leave request ' || lower(new.status),
      coalesce(new.leave_type,'Leave') || ' starting ' || coalesce(new.start_date::text,'unspecified date'), '#/leave')
    on conflict(recipient_id,event_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_leave_request on leave_requests;
create trigger trg_notify_leave_request after insert or update of status on leave_requests
  for each row execute function notify_leave_request_change();

insert into erp_notifications(recipient_id,event_key,title,message,target_path)
select distinct r.employee_id, 'fund:' || f.id || ':Pending', 'Request pending',
  coalesce(nullif(left(f.description,100),''),f.id) || ' (' || f.id || ')', '#/fundRequests'
from fund_requests f cross join erp_notification_roles r
where f.status = 'Pending' and r.role_key in ('ceo','coo','secretary')
on conflict(recipient_id,event_key) do nothing;

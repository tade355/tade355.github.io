-- New daily work and fleet-status reports alert active Admin and Accounts users.
-- Database triggers also cover reports submitted through the import tool.
create or replace function notify_report_submission() returns trigger
language plpgsql security definer set search_path = public as $$
declare recipient text; heading text; detail text; destination text; event_id text;
begin
  if tg_table_name = 'operations' then
    heading := 'Daily operations report submitted';
    detail := coalesce(new.equipment, 'Machine') || ' · ' || new.site_name || ' · ' || to_char(new.date, 'DD Mon YYYY');
    destination := '#/operations';
    event_id := 'operation:' || new.id || ':submitted';
  else
    heading := 'Daily machine status report submitted';
    detail := coalesce(new.project, 'Project') || ' · ' || to_char(new.date, 'DD Mon YYYY');
    destination := '#/dailyStatus';
    event_id := 'machine-status:' || new.id || ':submitted';
  end if;
  for recipient in
    select id from employees where status = 'Active' and access_tier in ('Admin', 'Accounts')
  loop
    insert into erp_notifications(recipient_id,event_key,title,message,target_path)
    values(recipient,event_id,heading,detail,destination)
    on conflict(recipient_id,event_key) do nothing;
  end loop;
  return new;
end $$;

drop trigger if exists trg_notify_operation_submission on operations;
create trigger trg_notify_operation_submission after insert on operations
  for each row execute function notify_report_submission();
drop trigger if exists trg_notify_machine_status_submission on machine_status_reports;
create trigger trg_notify_machine_status_submission after insert on machine_status_reports
  for each row execute function notify_report_submission();

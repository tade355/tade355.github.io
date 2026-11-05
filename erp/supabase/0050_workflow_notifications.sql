-- Run after 0049. Alerts for operational approvals, payroll, training and notices.
create or replace function notify_fueling_voucher() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient text;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  for recipient in
    select distinct id from (
      select new.requested_by as id where new.status <> 'Pending Approval'
      union all select id from employees where status='Active' and access_tier='Supervisor'
        and (assigned_project=new.project or can_manage_all_projects) and new.status='Pending Approval'
      union all select employee_id from erp_notification_roles where
        (new.status='Pending Approval' and role_key in ('ceo','coo')) or
        (new.status='Approved' and role_key in ('payer','coo','secretary')) or
        (new.status in ('Rejected','Fulfilled') and role_key in ('coo','secretary'))
      union all select id from employees where status='Active' and access_tier='Accounts' and new.status='Approved'
    ) recipients where id is not null
  loop
    insert into erp_notifications(recipient_id,event_key,title,message,target_path)
    values(recipient,'voucher:' || new.id || ':' || new.status,'Fuel voucher ' || lower(new.status),
      coalesce(new.equipment,'Equipment') || ' · ' || coalesce(new.project,'Project not set') || ' (' || new.id || ')','#/fundRequests')
    on conflict(recipient_id,event_key) do nothing;
  end loop;
  return new;
end $$;
drop trigger if exists trg_notify_fueling_voucher on fueling_vouchers;
create trigger trg_notify_fueling_voucher after insert or update of status on fueling_vouchers
  for each row execute function notify_fueling_voucher();

create or replace function notify_training_submission() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient text;
begin
  if tg_op='INSERT' then
    select employee_id into recipient from erp_notification_roles where role_key='hrm';
    insert into erp_notifications(recipient_id,event_key,title,message,target_path)
    values(recipient,'training:' || new.id || ':Submitted','Training submitted',
      coalesce((select name from employees where id=new.employee_id),'Staff') || ': ' || new.name,'#/training')
    on conflict(recipient_id,event_key) do nothing;
  elsif new.outcome is distinct from old.outcome and new.outcome is not null then
    insert into erp_notifications(recipient_id,event_key,title,message,target_path)
    values(new.employee_id,'training:' || new.id || ':' || new.outcome,'Training feedback ready',
      new.name || ' · ' || new.outcome,'#/training')
    on conflict(recipient_id,event_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_training_submission on training_submissions;
create trigger trg_notify_training_submission after insert or update of outcome on training_submissions
  for each row execute function notify_training_submission();

create or replace function notify_payroll_run() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient text; run_id text; run_status text; period text; event_prefix text;
begin
  if tg_table_name='payroll_runs' then
    run_id:=new.id; run_status:=new.status; period:=new.month; event_prefix:='payroll:';
  else
    run_id:=new.id; run_status:=new.status; period:=new.period_start::text || ' to ' || new.period_end::text; event_prefix:='dozer-payroll:';
  end if;
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  if run_status not in ('Approved','Paid') then return new; end if;
  for recipient in
    select distinct employee_id from (
      select employee_id from payroll_lines where tg_table_name='payroll_runs' and payroll_run_id=run_id
      union all select employee_id from dozer_payroll_lines where tg_table_name='dozer_payroll_runs' and dozer_payroll_run_id=run_id
    ) lines
  loop
    insert into erp_notifications(recipient_id,event_key,title,message,target_path)
    values(recipient,event_prefix || run_id || ':' || run_status,
      'Payroll ' || lower(run_status), 'Your payroll for ' || period || ' is ' || lower(run_status),'#/mySalary')
    on conflict(recipient_id,event_key) do nothing;
  end loop;
  if run_status='Approved' then
    for recipient in select distinct id from (
      select id from employees where status='Active' and access_tier='Accounts'
      union all select employee_id from erp_notification_roles where role_key in ('payer','coo')
    ) recipients loop
      insert into erp_notifications(recipient_id,event_key,title,message,target_path)
      values(recipient,event_prefix || run_id || ':Accounts','Payroll approved',period || ' is ready for payment','#/dashboard')
      on conflict(recipient_id,event_key) do nothing;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_payroll_run on payroll_runs;
create trigger trg_notify_payroll_run after insert or update of status on payroll_runs
  for each row execute function notify_payroll_run();
drop trigger if exists trg_notify_dozer_payroll_run on dozer_payroll_runs;
create trigger trg_notify_dozer_payroll_run after insert or update of status on dozer_payroll_runs
  for each row execute function notify_payroll_run();

-- A run can be created with its status before its lines are saved.
create or replace function notify_payroll_line() returns trigger language plpgsql security definer set search_path=public as $$
declare run_status text; period text; event_prefix text; target text;
begin
  if tg_table_name='payroll_lines' then
    select status,month into run_status,period from payroll_runs where id=new.payroll_run_id;
    event_prefix:='payroll:' || new.payroll_run_id;
  else
    select status,period_start::text || ' to ' || period_end::text into run_status,period
      from dozer_payroll_runs where id=new.dozer_payroll_run_id;
    event_prefix:='dozer-payroll:' || new.dozer_payroll_run_id;
  end if;
  if run_status in ('Approved','Paid') then
    insert into erp_notifications(recipient_id,event_key,title,message,target_path)
    values(new.employee_id,event_prefix || ':' || run_status,'Payroll ' || lower(run_status),
      'Your payroll for ' || period || ' is ' || lower(run_status),'#/mySalary')
    on conflict(recipient_id,event_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_payroll_line on payroll_lines;
create trigger trg_notify_payroll_line after insert on payroll_lines for each row execute function notify_payroll_line();
drop trigger if exists trg_notify_dozer_payroll_line on dozer_payroll_lines;
create trigger trg_notify_dozer_payroll_line after insert on dozer_payroll_lines for each row execute function notify_payroll_line();

create or replace function notify_notice_post() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.category in ('Announcement','Meeting Notice','Policy','SOP') then
    insert into erp_notifications(recipient_id,event_key,title,message,target_path)
    select id,'notice:' || new.id,'New ' || new.category,left(new.title,120),'#/noticeBoard'
    from employees where status='Active' and auth_user_id is not null and id is distinct from new.posted_by
    on conflict(recipient_id,event_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_notice_post on notice_board_posts;
create trigger trg_notify_notice_post after insert on notice_board_posts for each row execute function notify_notice_post();

create or replace function notify_maintenance_change() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient text;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  if new.status not in ('In Progress','Completed') then return new; end if;
  for recipient in select distinct id from (
    select id from employees where status='Active' and access_tier='Supervisor'
      and (assigned_project=new.project or can_manage_all_projects)
    union all select employee_id from erp_notification_roles where role_key='coo'
  ) recipients loop
    insert into erp_notifications(recipient_id,event_key,title,message,target_path)
    values(recipient,'maintenance:' || new.id || ':' || new.status,
      'Maintenance ' || lower(new.status),coalesce(new.equipment,'Equipment') || ' · ' || coalesce(new.project,'Project not set'),'#/dailyStatus')
    on conflict(recipient_id,event_key) do nothing;
  end loop;
  return new;
end $$;
drop trigger if exists trg_notify_maintenance_change on maintenance_logs;
create trigger trg_notify_maintenance_change after insert or update of status on maintenance_logs
  for each row execute function notify_maintenance_change();

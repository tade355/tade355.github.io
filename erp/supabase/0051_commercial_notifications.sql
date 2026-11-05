-- Run after 0050. Notify accountable staff of key commercial milestones.
create or replace function notify_commercial_status() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient text; recipients text[]; event_id text; heading text; detail text; target text;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  if tg_table_name='invoices' then
    if new.status not in ('Partially Paid','Paid') then return new; end if;
    recipients:=array['ceo','coo','secretary'];
    event_id:='invoice:' || new.id || ':' || new.status;
    heading:='Invoice ' || lower(new.status);
    detail:='Invoice ' || new.id || ' · ' || coalesce(new.project,'No project');
    target:='#/sales';
  elsif tg_table_name='purchase_orders' then
    if new.status <> 'Received' then return new; end if;
    recipients:=array['coo','secretary'];
    event_id:='purchase:' || new.id || ':Received';
    heading:='Purchase order received';
    detail:='Purchase order ' || new.id || ' · ' || coalesce(new.inventory_item,'Stock');
    target:='#/purchasing';
  else
    if new.status not in ('Defaulted','Written Off') then return new; end if;
    recipients:=array['ceo','coo'];
    event_id:='loan:' || new.id || ':' || new.status;
    heading:='Loan ' || lower(new.status);
    detail:='Loan ' || new.id || ' · ' || new.lender;
    target:='#/accounting';
  end if;
  for recipient in
    select distinct id from (
      select employee_id as id from erp_notification_roles where role_key=any(recipients)
      union all select id from employees where status='Active' and access_tier='Accounts'
    ) people where id is not null
  loop
    insert into erp_notifications(recipient_id,event_key,title,message,target_path)
    values(recipient,event_id,heading,detail,target)
    on conflict(recipient_id,event_key) do nothing;
  end loop;
  return new;
end $$;
drop trigger if exists trg_notify_invoice_status on invoices;
create trigger trg_notify_invoice_status after insert or update of status on invoices
  for each row execute function notify_commercial_status();
drop trigger if exists trg_notify_purchase_status on purchase_orders;
create trigger trg_notify_purchase_status after insert or update of status on purchase_orders
  for each row execute function notify_commercial_status();
drop trigger if exists trg_notify_loan_status on loans;
create trigger trg_notify_loan_status after insert or update of status on loans
  for each row execute function notify_commercial_status();

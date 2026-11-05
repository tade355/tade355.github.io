-- Operating responsibility matrix: the person entering a record is distinct
-- from the person approving or paying it.
create table if not exists erp_operating_roles (
  role_key text primary key,
  employee_id text references employees(id) on delete set null,
  scope text not null,
  can_submit boolean not null default false,
  can_review boolean not null default false,
  can_approve boolean not null default false,
  can_pay boolean not null default false,
  notes text
);
alter table erp_operating_roles enable row level security;
create policy operating_roles_read on erp_operating_roles for select to authenticated using (true);
create policy operating_roles_admin_write on erp_operating_roles for all to authenticated using (current_employee_tier() = 'Admin') with check (current_employee_tier() = 'Admin');
grant select on erp_operating_roles to authenticated;
insert into erp_operating_roles(role_key, employee_id, scope, can_submit, can_review, can_approve, can_pay, notes)
select v.role_key, e.id, v.scope, v.can_submit, v.can_review, v.can_approve, v.can_pay, v.notes
from (values
 ('coo','olumide','Operations, maintenance and diesel oversight',false,true,true,false,'COO oversees field operations and maintenance decisions.'),
 ('hrm_accounts','victoria','HR, leave and payments',true,true,true,true,'HRM also pays approved requests and records transfer evidence.'),
 ('company_secretary','gladness','High-value/sensitive requests and documents',true,true,false,false,'Submits bulk diesel, rentals, loan repayments and administrative requests.'),
 ('site_manager','', 'Assigned project operations and diesel',true,true,false,false,'Site managers submit daily operations, diesel requests and site management records.'),
 ('maintenance_manager','', 'Bulldozer maintenance and servicing',true,true,false,false,'Maintenance manager submits bulldozer maintenance reports and requests.')
) v(role_key, name_part, scope, can_submit, can_review, can_approve, can_pay, notes)
left join lateral (select id from employees where status='Active' and v.name_part <> '' and lower(name) like '%' || v.name_part || '%' order by id limit 1) e on true
on conflict(role_key) do update set employee_id=excluded.employee_id, scope=excluded.scope, can_submit=excluded.can_submit, can_review=excluded.can_review, can_approve=excluded.can_approve, can_pay=excluded.can_pay, notes=excluded.notes;

create or replace function is_sensitive_fund_request(p_description text, p_cost_head text) returns boolean language sql immutable as $$
  select lower(coalesce(p_description,'') || ' ' || coalesce(p_cost_head,'')) ~ '(bulk|diesel|rental|rent|loan|repay|repayment|administrative|admin)';
$$;
create or replace function notify_sensitive_fund_request() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient text;
begin
  if (tg_op='INSERT' or new.status is distinct from old.status) and is_sensitive_fund_request(new.description, new.cost_head) then
    for recipient in select employee_id from erp_operating_roles where role_key in ('coo','company_secretary','hrm_accounts') and employee_id is not null loop
      insert into erp_notifications(recipient_id,event_key,title,message,target_path)
      values(recipient,'sensitive-request:'||new.id||':'||new.status,'Sensitive request '||lower(new.status),left(new.description,120)||' ('||new.id||')','#/fundRequests')
      on conflict(recipient_id,event_key) do nothing;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_sensitive_fund_request on fund_requests;
create trigger trg_notify_sensitive_fund_request after insert or update of status on fund_requests for each row execute function notify_sensitive_fund_request();


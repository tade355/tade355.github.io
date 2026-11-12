begin;
create table if not exists public.fuel_workflows (
 id text primary key,
 kind text not null check(kind in ('Fuel','Cost')),
 project text not null,
 requested_by text not null references public.employees(id),
 status text not null default 'Submitted' check(status in ('Submitted','Reviewed','Approved','Rejected','Partially Collected','Collected','Partially Paid','Paid')),
 data jsonb not null,
 events jsonb not null default '[]',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.fuel_workflows enable row level security;
drop policy if exists fuel_workflows_read on public.fuel_workflows;
create policy fuel_workflows_read on public.fuel_workflows for select to authenticated using (
 exists(select 1 from public.employees e where e.auth_user_id=auth.uid()
 and (e.access_tier in ('Admin','Accounts') or e.id=requested_by or e.assigned_project=project))
);
-- Only the command function writes. Clients cannot bypass transitions.
revoke all on public.fuel_workflows from anon,authenticated;
grant select on public.fuel_workflows to authenticated;
drop trigger if exists fuel_workflows_audit on public.fuel_workflows;
create trigger fuel_workflows_audit after insert or update or delete on public.fuel_workflows for each row execute function public.audit_row();
alter table public.fuel_credit_collections add column if not exists project text;
alter table public.fuel_credit_collections add column if not exists workflow_id text;
alter table public.fuel_credit_collections add column if not exists delivered_litres numeric;
alter table public.fuel_credit_collections drop constraint if exists fuel_credit_collections_fuel_type_check;
alter table public.fuel_credit_collections add constraint fuel_credit_collections_fuel_type_check check(fuel_type in ('Diesel','PMS','Oil'));
create or replace function public.fuel_workflow_command(p_id text,p_action text,p_payload jsonb,p_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fuel$
declare
 actor public.employees%rowtype; r public.fuel_workflows%rowtype;
 line jsonb; lines jsonb; evt jsonb; q numeric; delivered numeric; price numeric;
 approved numeric; collected numeric; issued numeric; stocked numeric; paid numeric; due numeric;
 collection_date date; event_date date; vref text; role_ceo boolean; role_review boolean; role_accounts boolean;
begin
 select * into actor from public.employees where auth_user_id=auth.uid() limit 1;
 if actor.id is null or actor.status is distinct from 'Active' then raise exception 'An active staff login is required'; end if;
 if nullif(p_token,'') is null then raise exception 'Missing command reference'; end if;
 role_ceo := actor.id='EMP-28';
 role_review := actor.id in ('EMP-28','EMP-26');
 role_accounts := actor.access_tier in ('Admin','Accounts');
 if p_action='submit' then
   select * into r from public.fuel_workflows where id=p_id;
   if found then
     if r.requested_by<>actor.id then raise exception 'Reference is already used'; end if;
     return to_jsonb(r);
   end if;
   if coalesce(actor.access_tier,'') not in ('Admin','Accounts','Supervisor') then raise exception 'Only managers may submit fuel plans or cost reports'; end if;
   if actor.access_tier='Supervisor' and p_payload->>'project' is distinct from actor.assigned_project then raise exception 'Choose your assigned project'; end if;
   if not exists(select 1 from public.projects where name=p_payload->>'project') then raise exception 'Choose a valid project'; end if;
   if p_payload->>'kind' not in ('Fuel','Cost') then raise exception 'Invalid request type'; end if;
   if p_payload->>'kind'='Fuel' then
     if coalesce(jsonb_typeof(p_payload->'lines'),'null') <> 'array' or jsonb_array_length(p_payload->'lines')=0 then raise exception 'Add fuel lines'; end if;
     if nullif(p_payload->>'station','') is null or nullif(p_payload->>'collector','') is null
       or p_payload->>'supplyMethod' not in ('Station credit','Immediate payment','Site stock') then raise exception 'Station, collector and supply method are required'; end if;
     if (p_payload->>'supplyDate')::date is null or (p_payload->>'expiresOn')::date < (p_payload->>'supplyDate')::date then raise exception 'Set a valid supply and expiry date'; end if;
     if (select count(*) from jsonb_array_elements(p_payload->'lines')) <> (select count(distinct l->>'id') from jsonb_array_elements(p_payload->'lines') l) then raise exception 'Duplicate fuel line'; end if;
     for line in select value from jsonb_array_elements(p_payload->'lines') loop
       if nullif(line->>'id','') is null or line->>'product' not in ('Diesel','PMS','Oil')
         or coalesce((line->>'quantity')::numeric,0)<=0 or coalesce((line->>'unitPrice')::numeric,0)<=0
         or line->>'purpose' not in ('Production','Trekking','Repairs','Maintenance','Burning debris','Vehicles / bikes','Generator')
         then raise exception 'Each fuel line needs product, purpose, positive quantity and unit price'; end if;
       if line->>'product' in ('PMS','Oil') and nullif(line->>'reason','') is null then raise exception 'Explain the PMS movement or oil requirement'; end if;
     end loop;
     if exists(select 1 from public.fuel_workflows f where f.kind='Fuel' and f.project=p_payload->>'project' and f.data->>'supplyDate'=p_payload->>'supplyDate' and f.data->>'station'=p_payload->>'station' and f.status<>'Rejected') then
       if nullif(p_payload->>'duplicateReason','') is null then raise exception 'A fuel request already exists for this station, project and date; explain why another is needed'; end if;
     end if;
     p_payload := p_payload - 'approvedAmount';
     select jsonb_agg(l - 'approvedQuantity') into lines from jsonb_array_elements(p_payload->'lines') l;
     p_payload := jsonb_set(p_payload,'{lines}',lines);
   else
     if coalesce((p_payload->>'amount')::numeric,0)<=0 or nullif(p_payload->>'description','') is null or nullif(p_payload->>'payee','') is null then raise exception 'Enter amount, description and person or vendor owed'; end if;
     if (p_payload->>'incurredDate')::date is null or (p_payload->>'incurredDate')::date > current_date then raise exception 'Use the actual date the cost occurred'; end if;
     if p_payload->>'category' not in ('Diesel transport','Worker transport','Maintenance','Other') then raise exception 'Invalid cost category'; end if;
     if (p_payload->>'incurredDate')::date < current_date and nullif(p_payload->>'lateReason','') is null then raise exception 'Explain the late submission'; end if;
     if nullif(p_payload->>'linkedFundRequestId','') is not null and not exists(select 1 from public.fund_requests f where f.id=p_payload->>'linkedFundRequestId' and f.project=p_payload->>'project') then raise exception 'Linked fund request must belong to this project'; end if;
     p_payload := p_payload - 'approvedAmount';
   end if;
   insert into public.fuel_workflows(id,kind,project,requested_by,data,events)
   values(p_id,p_payload->>'kind',p_payload->>'project',actor.id,p_payload,
     jsonb_build_array(jsonb_build_object('type','submit','token',p_token,'at',now(),'actor',actor.id))) returning * into r;
   return to_jsonb(r);
 end if;
 select * into r from public.fuel_workflows where id=p_id for update;
 if not found then raise exception 'Request not found'; end if;
 if not (role_accounts or r.requested_by=actor.id or actor.assigned_project=r.project) then raise exception 'Request is outside your project'; end if;
 if exists(select 1 from jsonb_array_elements(r.events) e where e->>'token'=p_token) then return to_jsonb(r); end if;
 evt := p_payload || jsonb_build_object('type',p_action,'token',p_token,'at',now(),'actor',actor.id);
 if p_action='review' then
   if not role_review or r.status<>'Submitted' then raise exception 'Operations review is unavailable'; end if;
   r.status := 'Reviewed';
 elsif p_action in ('approve','reject') then
   if not role_ceo or r.status not in ('Submitted','Reviewed') then raise exception 'Only the CEO may decide a submitted request'; end if;
   if p_action='reject' then
     if nullif(p_payload->>'note','') is null then raise exception 'Enter a reason for rejection'; end if;
     r.status := 'Rejected';
   else
     if r.kind='Fuel' then
       lines := '[]';
       for line in select value from jsonb_array_elements(r.data->'lines') loop
         q := coalesce((p_payload->'quantities'->>(line->>'id'))::numeric,(line->>'quantity')::numeric);
         if q<0 or q>(line->>'quantity')::numeric then raise exception 'Approved litres cannot exceed requested litres'; end if;
         lines := lines || jsonb_build_array(line || jsonb_build_object('approvedQuantity',q));
       end loop;
       if not exists(select 1 from jsonb_array_elements(lines) l where (l->>'approvedQuantity')::numeric>0) then raise exception 'Approve at least one positive quantity'; end if;
       r.data := jsonb_set(r.data,'{lines}',lines);
     else
       q:=coalesce((p_payload->>'amount')::numeric,(r.data->>'amount')::numeric);
       if q<=0 or q>(r.data->>'amount')::numeric then raise exception 'Approved amount must be positive and at most the requested amount'; end if;
       r.data:=r.data || jsonb_build_object('approvedAmount',q);
     end if;
     r.status:='Approved';
   end if;
 elsif p_action='message' then
   if r.kind<>'Fuel' or r.status not in ('Approved','Partially Collected','Collected') then raise exception 'Fuel must be approved first'; end if;
   if nullif(p_payload->>'recipient','') is null then raise exception 'Record who received the instruction'; end if;
 elsif p_action in ('collection','issue') then
   if r.kind<>'Fuel' or r.status not in ('Approved','Partially Collected','Collected') then raise exception 'Approve the fuel request first'; end if;
   select l into line from jsonb_array_elements(r.data->'lines') l where l->>'id'=p_payload->>'lineId';
   if line is null then raise exception 'Invalid fuel line'; end if;
   q:=coalesce((p_payload->>'quantity')::numeric,0);
   event_date:=(p_payload->>'date')::date;
   if q<=0 or event_date is null or event_date>current_date then raise exception 'Enter a positive quantity and a valid actual date'; end if;
   select coalesce(sum((e->>'quantity')::numeric),0),coalesce(sum((e->>'delivered')::numeric),0)
    into collected,stocked from jsonb_array_elements(r.events) e where e->>'type'='collection' and e->>'lineId'=line->>'id';
   approved:=(line->>'approvedQuantity')::numeric;
   vref:='FUEL-WF:'||r.id||':'||p_token;
   if p_action='collection' then
     if event_date<(r.data->>'supplyDate')::date or event_date>(r.data->>'expiresOn')::date then raise exception 'Collection must be within the approved release dates'; end if;
     if q+collected>approved then raise exception 'Collection exceeds remaining approved quantity'; end if;
     delivered:=coalesce((p_payload->>'delivered')::numeric,0); price:=coalesce((p_payload->>'unitPrice')::numeric,0);
     if delivered<0 or delivered>q or price<=0 then raise exception 'Check delivered litres and price'; end if;
     if nullif(p_payload->>'reference','') is null then raise exception 'Enter the station receipt or waybill reference'; end if;
     if (delivered<>q or price<>(line->>'unitPrice')::numeric) and nullif(p_payload->>'note','') is null then raise exception 'Explain the quantity or price variance'; end if;
     if r.data->>'supplyMethod'<>'Site stock' then
       insert into public.fuel_credit_collections(id,date,station,fuel_type,litres,unit_price,reference,notes,project,workflow_id,delivered_litres)
       values(vref,event_date,r.data->>'station',line->>'product',q,price,p_payload->>'reference',
        vref||' | '||coalesce(line->>'purpose','')||' | '||coalesce(p_payload->>'note',''),r.project,r.id,delivered);
     else
       if nullif(p_payload->>'note','') is null then raise exception 'Record the counted site stock used for this allocation'; end if;
     end if;
     r.status:='Partially Collected';
   else
     select coalesce(sum((e->>'quantity')::numeric),0) into issued from jsonb_array_elements(r.events) e where e->>'type'='issue' and e->>'lineId'=line->>'id';
     if q+issued>stocked then raise exception 'Issue exceeds delivered stock remaining for this request'; end if;
     if p_payload->>'purpose' is distinct from line->>'purpose' then raise exception 'Issue must match the approved purpose'; end if;
     if nullif(p_payload->>'equipment','') is null then raise exception 'Identify the machine, vehicle or use'; end if;
     select (e->>'date')::date into collection_date from jsonb_array_elements(r.events) e where e->>'type'='collection' and e->>'lineId'=line->>'id' order by e->>'date' limit 1;
     if event_date<collection_date then raise exception 'Issue cannot predate receipt'; end if;
     select sum((e->>'quantity')::numeric*(e->>'unitPrice')::numeric)/nullif(sum((e->>'quantity')::numeric),0)
      into price from jsonb_array_elements(r.events) e where e->>'type'='collection' and e->>'lineId'=line->>'id';
     evt:=evt||jsonb_build_object('unitPrice',price);
     if line->>'product'='Diesel' then
       insert into public.diesel_site_distributions(id,date,project,equipment,litres,notes)
       values(vref,event_date,r.project,p_payload->>'equipment',q,
         case when p_payload->>'purpose' in ('Production','Trekking') then '' else 'not tank fuel; ' end
          ||vref||' | '||(p_payload->>'purpose')||' | '||coalesce(p_payload->>'note',''));
     end if;
   end if;
 elsif p_action='payment' then
   if not role_accounts or r.status in ('Submitted','Reviewed','Rejected') then raise exception 'Accounts may pay approved requests only'; end if;
   if nullif(r.data->>'linkedFundRequestId','') is not null then raise exception 'Record payment on the linked fund request; do not pay the same cost twice'; end if;
   q:=coalesce((p_payload->>'amount')::numeric,0); event_date:=(p_payload->>'date')::date;
   if q<=0 or event_date is null or event_date>current_date or nullif(p_payload->>'reference','') is null then raise exception 'Enter positive payment, actual date and bank reference'; end if;
   if r.kind='Fuel' then
     if r.data->>'supplyMethod'='Site stock' then raise exception 'Site stock allocations do not create a station payable'; end if;
     select coalesce(sum((e->>'quantity')::numeric*(e->>'unitPrice')::numeric),0) into due from jsonb_array_elements(r.events) e where e->>'type'='collection';
   else due:=(r.data->>'approvedAmount')::numeric; end if;
   select coalesce(sum((e->>'amount')::numeric),0) into paid from jsonb_array_elements(r.events) e where e->>'type'='payment';
   if q+paid>due then raise exception 'Payment exceeds outstanding balance'; end if;
   vref:='FUEL-WF:'||r.id||':'||p_token;
   if r.kind='Fuel' then
     insert into public.fuel_credit_payments(id,date,station,amount,reference,notes)
      values(vref,event_date,r.data->>'station',q,p_payload->>'reference',vref||' | '||coalesce(p_payload->>'note',''));
   else
     insert into public.expenses(id,date,category,description,amount,payee,paid_by,project)
      values(vref,event_date,'Logistics',vref||' | '||(r.data->>'description'),q,r.data->>'payee',actor.name,r.project);
     r.status:=case when q+paid=due then 'Paid' else 'Partially Paid' end;
   end if;
 else raise exception 'Unknown workflow command'; end if;
 r.events:=r.events||jsonb_build_array(evt);
 if r.kind='Fuel' and p_action='collection' and not exists(
   select 1 from jsonb_array_elements(r.data->'lines') l where (l->>'approvedQuantity')::numeric >
     (select coalesce(sum((e->>'quantity')::numeric),0) from jsonb_array_elements(r.events) e where e->>'type'='collection' and e->>'lineId'=l->>'id')
 ) then r.status:='Collected'; end if;
 update public.fuel_workflows set status=r.status,data=r.data,events=r.events,updated_at=now() where id=r.id returning * into r;
 return to_jsonb(r);
end $fuel$;
revoke all on function public.fuel_workflow_command(text,text,jsonb,text) from public,anon;
grant execute on function public.fuel_workflow_command(text,text,jsonb,text) to authenticated;
commit;

begin;

create or replace function public.update_earlier_cost_request(p_id text,p_payload jsonb,p_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $edit$
declare
 actor public.employees%rowtype;
 r public.fuel_workflows%rowtype;
 business_today date := (now() at time zone 'Africa/Lagos')::date;
begin
 select * into actor from public.employees where auth_user_id=auth.uid() limit 1;
 if actor.id is null or actor.status is distinct from 'Active' then raise exception 'An active staff login is required'; end if;
 if nullif(p_token,'') is null then raise exception 'Missing update reference'; end if;

 select * into r from public.fuel_workflows where id=p_id for update;
 if not found then raise exception 'Reimbursement request not found'; end if;
 if r.kind<>'Cost' then raise exception 'Only earlier cost or reimbursement requests can be edited here'; end if;
 if r.requested_by<>actor.id then raise exception 'Only the original submitter may update this request'; end if;
 if r.status not in ('Submitted','Reviewed') or exists(select 1 from jsonb_array_elements(r.events) e where e->>'type'='payment') then
   raise exception 'This request is already approved or paid. Submit a new reimbursement request for additional costs';
 end if;
 if exists(select 1 from jsonb_array_elements(r.events) e where e->>'token'=p_token) then return to_jsonb(r); end if;

 p_payload:=jsonb_set(p_payload,'{incurredTo}',to_jsonb(coalesce(nullif(p_payload->>'incurredTo',''),p_payload->>'incurredDate')));
 if not exists(select 1 from public.projects where name=p_payload->>'project') then raise exception 'Choose a valid project'; end if;
 if actor.access_tier='Supervisor' and p_payload->>'project' is distinct from actor.assigned_project then raise exception 'Choose your assigned project'; end if;
 if coalesce((p_payload->>'amount')::numeric,0)<=0 or nullif(p_payload->>'description','') is null or nullif(p_payload->>'payee','') is null then
   raise exception 'Enter amount, description and person or vendor owed';
 end if;
 if (p_payload->>'incurredDate')::date is null or (p_payload->>'incurredDate')::date>business_today
   or (p_payload->>'incurredTo')::date<(p_payload->>'incurredDate')::date or (p_payload->>'incurredTo')::date>business_today then
   raise exception 'Use a valid cost period that does not extend beyond today'; end if;
 if p_payload->>'category' not in ('Diesel transport','Worker transport','Maintenance','Other') then raise exception 'Invalid cost category'; end if;
 if p_payload->>'category'='Maintenance' and nullif(p_payload->>'equipment','') is null then raise exception 'Select the dozer code for a maintenance reimbursement'; end if;
 if p_payload->>'category'<>'Maintenance' then p_payload:=p_payload-'equipment'; end if;
 if (p_payload->>'incurredDate')::date<business_today and nullif(p_payload->>'lateReason','') is null then raise exception 'Explain the late submission'; end if;
 if nullif(p_payload->>'linkedFundRequestId','') is not null and not exists(
   select 1 from public.fund_requests f where f.id=p_payload->>'linkedFundRequestId' and f.project=p_payload->>'project'
 ) then raise exception 'Linked fund request must belong to this project'; end if;
 if exists(select 1 from public.fuel_workflows f where f.id<>r.id and f.kind='Cost' and f.status<>'Rejected'
   and f.project=p_payload->>'project' and f.data->>'incurredDate'=p_payload->>'incurredDate'
   and coalesce(f.data->>'incurredTo',f.data->>'incurredDate')=p_payload->>'incurredTo'
   and f.data->>'description'=p_payload->>'description' and f.data->>'amount'=p_payload->>'amount') then
   raise exception 'This cost has already been reported; open its existing record';
 end if;

 r.project:=p_payload->>'project';
 r.data:=p_payload-'approvedAmount';
 r.status:='Submitted';
 r.events:=r.events||jsonb_build_array(jsonb_build_object('type','update','token',p_token,'at',now(),'actor',actor.id,'amount',p_payload->>'amount'));
 update public.fuel_workflows set project=r.project,status=r.status,data=r.data,events=r.events,updated_at=now() where id=r.id returning * into r;
 return to_jsonb(r);
end $edit$;

revoke all on function public.update_earlier_cost_request(text,jsonb,text) from public,anon;
grant execute on function public.update_earlier_cost_request(text,jsonb,text) to authenticated;

commit;

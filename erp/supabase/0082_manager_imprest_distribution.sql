begin;

-- A provider payout retires cash already sent to the manager. It is an audit
-- event on the cost batch, not a second expense or a change to profitability.
create or replace function public.record_manager_imprest_distribution(
  p_id text, p_provider text, p_amount numeric, p_date date, p_reference text, p_token text
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $imprest$
declare
  actor public.employees%rowtype;
  r public.fuel_workflows%rowtype;
  already_paid numeric;
  already_distributed numeric;
  business_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  select * into actor from public.employees where auth_user_id=auth.uid() limit 1;
  if actor.id is null or actor.status is distinct from 'Active' then raise exception 'An active staff login is required'; end if;
  select * into r from public.fuel_workflows where id=p_id for update;
  if not found or r.kind<>'Cost' then raise exception 'Earlier-cost request not found'; end if;
  if actor.id<>r.requested_by and coalesce(actor.access_tier,'') not in ('Admin','Accounts') then raise exception 'Only the submitter or Accounts may record provider payouts'; end if;
  if r.status not in ('Partially Paid','Paid') then raise exception 'Record payment to the manager before a provider payout'; end if;
  if nullif(p_token,'') is null or nullif(trim(p_provider),'') is null or nullif(trim(p_reference),'') is null
    or p_amount is null or p_amount<=0 or p_date is null or p_date>business_today then
    raise exception 'Enter provider, positive amount, actual date and reference';
  end if;
  if exists(select 1 from jsonb_array_elements(r.events) e where e->>'token'=p_token) then return to_jsonb(r); end if;
  select coalesce(sum((e->>'amount')::numeric),0) into already_paid from jsonb_array_elements(r.events) e where e->>'type'='payment';
  select coalesce(sum((e->>'amount')::numeric),0) into already_distributed from jsonb_array_elements(r.events) e where e->>'type'='distribution';
  if already_distributed+p_amount>already_paid then raise exception 'Provider payouts cannot exceed money received by the manager'; end if;
  r.events:=r.events||jsonb_build_array(jsonb_build_object(
    'type','distribution','token',p_token,'at',now(),'actor',actor.id,
    'provider',trim(p_provider),'amount',p_amount,'date',p_date,'reference',trim(p_reference)
  ));
  update public.fuel_workflows set events=r.events,updated_at=now() where id=r.id returning * into r;
  return to_jsonb(r);
end $imprest$;

revoke all on function public.record_manager_imprest_distribution(text,text,numeric,date,text,text) from public,anon;
grant execute on function public.record_manager_imprest_distribution(text,text,numeric,date,text,text) to authenticated;

commit;


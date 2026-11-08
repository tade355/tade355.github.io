begin;
create table if not exists public.erp_usage_events (
 id uuid primary key, actor_id text not null references public.employees(id),
 auth_user_id uuid not null, visit_id uuid not null,
 received_at timestamptz not null default now(), occurred_at timestamptz not null,
 event_type text not null check(event_type in ('visit','module','active','action','leave','location')),
 module text not null default '', section text not null default '', action text not null default '',
 active_seconds integer not null default 0 check(active_seconds between 0 and 30),
 device text not null default '', browser text not null default '',
 location_status text not null default 'not_shared',
 latitude numeric, longitude numeric
);
create index if not exists erp_usage_actor_time on public.erp_usage_events(actor_id,occurred_at desc);
create index if not exists erp_usage_received on public.erp_usage_events(received_at desc);
alter table public.erp_usage_events enable row level security;
revoke all on public.erp_usage_events from anon, authenticated;
grant select on public.erp_usage_events to authenticated;
drop policy if exists owner_read_usage on public.erp_usage_events;
create policy owner_read_usage on public.erp_usage_events for select to authenticated using (
 exists(select 1 from public.employees e where e.auth_user_id=auth.uid() and e.id='EMP-26')
);
create or replace function public.record_erp_usage(p_events jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare actor text; ev jsonb; n integer:=0; added integer;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select id into actor from public.employees where auth_user_id=auth.uid();
 if actor is null then raise exception 'Staff account required'; end if;
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>50 then raise exception 'Invalid event batch'; end if;
 for ev in select value from jsonb_array_elements(p_events) loop
  insert into public.erp_usage_events(id,actor_id,auth_user_id,visit_id,occurred_at,event_type,module,section,action,active_seconds,device,browser,location_status,latitude,longitude)
  values((ev->>'id')::uuid,actor,auth.uid(),(ev->>'visit_id')::uuid,
   least(now(),greatest(now()-interval '7 days',(ev->>'occurred_at')::timestamptz)),
   ev->>'event_type',left(coalesce(ev->>'module',''),80),left(coalesce(ev->>'section',''),80),
   left(coalesce(ev->>'action',''),80),least(30,greatest(0,coalesce((ev->>'active_seconds')::integer,0))),
   left(coalesce(ev->>'device',''),30),left(coalesce(ev->>'browser',''),30),
   left(coalesce(ev->>'location_status','not_shared'),30),
   case when (ev->>'latitude')::numeric between -90 and 90 then round((ev->>'latitude')::numeric,1) end,
   case when (ev->>'longitude')::numeric between -180 and 180 then round((ev->>'longitude')::numeric,1) end)
  on conflict(id) do nothing;
  get diagnostics added = row_count; n:=n+added;
 end loop;
 return n;
end $$;
revoke all on function public.record_erp_usage(jsonb) from public;
grant execute on function public.record_erp_usage(jsonb) to authenticated;
commit;
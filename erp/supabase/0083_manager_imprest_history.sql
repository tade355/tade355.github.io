begin;

-- Historical workbook transactions are a separate audit ledger. Importing them
-- does not create a second expense or change dated project profitability.
create table if not exists public.manager_imprest_entries (
  id text primary key,
  manager_id text not null references public.employees(id),
  entry_date date not null,
  project text,
  purpose text not null,
  site text,
  category text,
  source_of_credit text,
  debit numeric not null default 0 check (debit >= 0),
  credit numeric not null default 0 check (credit >= 0),
  category_amounts jsonb not null default '{}'::jsonb,
  source_file text not null,
  source_sheet text not null,
  source_row integer not null,
  imported_by text not null references public.employees(id),
  imported_at timestamptz not null default now(),
  check (debit > 0 or credit > 0),
  check (jsonb_typeof(category_amounts) = 'object')
);
create index if not exists manager_imprest_entries_manager_date on public.manager_imprest_entries(manager_id,entry_date,id);
alter table public.manager_imprest_entries enable row level security;
drop policy if exists manager_imprest_entries_read on public.manager_imprest_entries;
create policy manager_imprest_entries_read on public.manager_imprest_entries for select to authenticated using (
  exists (select 1 from public.employees actor where actor.auth_user_id = auth.uid()
    and actor.status = 'Active' and (actor.access_tier in ('Admin','Accounts') or actor.id = manager_id))
);
revoke all on public.manager_imprest_entries from anon,authenticated;
grant select on public.manager_imprest_entries to authenticated;
drop trigger if exists manager_imprest_entries_audit on public.manager_imprest_entries;
create trigger manager_imprest_entries_audit after insert or update or delete on public.manager_imprest_entries
  for each row execute function public.audit_row();

-- A cost request can only open an imprest for a currently assigned manager.
-- Existing requests without a manager ID remain payable and auditable.
create or replace function public.validate_imprest_manager() returns trigger
language plpgsql set search_path=public,pg_temp as $guard$
declare manager public.employees%rowtype;
begin
  if new.kind <> 'Cost' then return new; end if;
  if tg_op = 'UPDATE' and old.data->>'payee' is not distinct from new.data->>'payee'
    and old.data->>'imprestManagerId' is not distinct from new.data->>'imprestManagerId' then return new; end if;
  select * into manager from public.employees where id = new.data->>'imprestManagerId';
  if manager.id is null or manager.status is distinct from 'Active' or
    coalesce(manager.role,'') !~* '(site|maintenance)[[:space:]]*manager' or
    lower(trim(manager.name)) <> lower(trim(coalesce(new.data->>'payee',''))) then
    raise exception 'Select an active site or maintenance manager for this imprest';
  end if;
  return new;
end $guard$;
drop trigger if exists validate_imprest_manager on public.fuel_workflows;
create trigger validate_imprest_manager before insert or update of data on public.fuel_workflows
  for each row execute function public.validate_imprest_manager();

drop policy if exists fuel_workflows_imprest_manager_read on public.fuel_workflows;
create policy fuel_workflows_imprest_manager_read on public.fuel_workflows for select to authenticated using (
  exists(select 1 from public.employees actor where actor.auth_user_id=auth.uid()
    and actor.status='Active' and kind='Cost' and actor.id=data->>'imprestManagerId')
);

create or replace function public.import_manager_imprest_entries(p_entries jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $import$
declare actor public.employees%rowtype; manager public.employees%rowtype; item jsonb;
  n integer := 0; saved integer := 0; d numeric; c numeric; entry_id text;
begin
  select * into actor from public.employees where auth_user_id=auth.uid() limit 1;
  if actor.id is null or actor.status is distinct from 'Active' or actor.access_tier not in ('Admin','Accounts') then
    raise exception 'Only active Admin or Accounts staff may import imprest history';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 or jsonb_array_length(p_entries) > 100 then
    raise exception 'Import between 1 and 100 rows at a time';
  end if;
  for item in select value from jsonb_array_elements(p_entries) loop
    n := n + 1;
    select * into manager from public.employees where id=item->>'managerId';
    if manager.id is null or manager.status is distinct from 'Active' or
      coalesce(manager.role,'') !~* '(site|maintenance)[[:space:]]*manager' then
      raise exception 'Row % has no eligible site or maintenance manager', n;
    end if;
    entry_id := item->>'id';
    d := (item->>'debit')::numeric; c := (item->>'credit')::numeric;
    if entry_id !~ '^IMP-[a-f0-9]{48}$' or d < 0 or c < 0 or d+c <= 0 or
      nullif(trim(coalesce(item->>'purpose','')),'') is null or
      nullif(trim(coalesce(item->>'sourceFile','')),'') is null or
      nullif(trim(coalesce(item->>'sourceSheet','')),'') is null or
      (item->>'sourceRow')::integer < 1 or
      (item->>'date')::date > (now() at time zone 'Africa/Lagos')::date then
      raise exception 'Invalid imprest row %', n;
    end if;
    insert into public.manager_imprest_entries(id,manager_id,entry_date,project,purpose,site,category,
      source_of_credit,debit,credit,category_amounts,source_file,source_sheet,source_row,imported_by)
    values(entry_id,manager.id,(item->>'date')::date,nullif(trim(item->>'project'),''),
      trim(item->>'purpose'),nullif(trim(item->>'site'),''),nullif(trim(item->>'category'),''),
      nullif(trim(item->>'sourceOfCredit'),''),d,c,coalesce(item->'categoryAmounts','{}'::jsonb),
      item->>'sourceFile',item->>'sourceSheet',(item->>'sourceRow')::integer,actor.id)
    on conflict(id) do nothing;
    if found then saved := saved + 1; end if;
  end loop;
  return jsonb_build_object('received',n,'saved',saved,'alreadyImported',n-saved);
end $import$;
revoke all on function public.import_manager_imprest_entries(jsonb) from public,anon;
grant execute on function public.import_manager_imprest_entries(jsonb) to authenticated;

commit;


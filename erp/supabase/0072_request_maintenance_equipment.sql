-- Structured dozer linkage without reclassifying historical requests.
alter table public.fund_requests add column if not exists equipment text;
create index if not exists fund_requests_equipment_idx on public.fund_requests(equipment);

create or replace function public.guard_maintenance_request_equipment()
returns trigger language plpgsql set search_path = public as $$
declare validate_link boolean;
begin
  if tg_op = 'INSERT' then
    validate_link := true;
  else
    validate_link := new.cost_head is distinct from old.cost_head or new.equipment is distinct from old.equipment;
  end if;
  if validate_link and new.cost_head = 'Maintenance' then
    if nullif(trim(new.equipment), '') is null then
      raise exception 'Select the dozer code for this bulldozer maintenance request';
    end if;
    if not exists(select 1 from public.inventory where name=new.equipment and category='Heavy Equipment') then
      raise exception 'Select a valid dozer from the fleet register';
    end if;
  end if;
  return new;
end $$;

create trigger trg_maintenance_request_equipment
before insert or update of cost_head,equipment on public.fund_requests
for each row execute function public.guard_maintenance_request_equipment();
notify pgrst, 'reload schema';

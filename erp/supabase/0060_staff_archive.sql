-- Archive staff without deleting the employee IDs used by historical records.
begin;
alter table public.employees add column if not exists archived_at timestamptz;
create or replace function public.guard_staff_archive() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.archived_at is not null and new.status <> 'Disengaged' then
    raise exception 'Only disengaged staff can be archived. Restore the employee before changing their status.';
  end if;
  return new;
end $$;
drop trigger if exists trg_staff_archive on public.employees;
create trigger trg_staff_archive before insert or update of archived_at, status
on public.employees for each row execute function public.guard_staff_archive();
create or replace view public.employee_directory with (security_barrier = true) as
select id, name, role, department, status, access_tier, assigned_project,
  assigned_dozer, canonical_employee_id, can_manage_all_projects, archived_at
from public.employees where auth.uid() is not null and public.current_employee_id() is not null;
revoke all on public.employee_directory from public;
grant select on public.employee_directory to authenticated;
insert into public.erp_schema_migrations(version) values ('0060') on conflict do nothing;
notify pgrst,'reload schema';
commit;

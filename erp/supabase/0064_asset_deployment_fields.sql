begin;
alter table public.inventory add column if not exists assigned_staff_id text;
alter table public.inventory add column if not exists deployment_from text;
alter table public.inventory add column if not exists deployed_to text;
insert into public.erp_schema_migrations(version) values ('0064') on conflict do nothing;
notify pgrst,'reload schema';
commit;
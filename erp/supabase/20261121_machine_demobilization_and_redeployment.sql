-- Run after the application release. Preserve historical reports under Pastor.
alter table public.inventory add column if not exists demobilized_at date;
alter table public.inventory add column if not exists current_project_since date;

update public.inventory
set demobilized_at = '2026-11-21',
    fleet_status = 'Idle',
    current_project = null
where name = 'Pastor (Osaro)' and demobilized_at is null;

update public.inventory
set owner_name = coalesce(owner_name, (select owner_name from public.inventory where name = 'Pastor (Osaro)' limit 1))
where name = 'Emma (Osaro)' and owner_name is null;

update public.inventory
set current_project = 'Blue Sky Project - Ajue-Ore',
    current_project_since = '2026-11-20'
where name = 'EMG-004';

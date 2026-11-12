-- Date from which the inventory row's current project assignment applies.
-- Earlier dashboards fall back to the latest operation recorded on or before the viewed date.
alter table public.inventory
  add column if not exists current_project_since date;

update public.inventory
set current_project = 'Blue Sky Project - Ajue-Ore',
    current_project_since = date '2026-11-12'
where name in ('EMG-007', 'EMG-008');

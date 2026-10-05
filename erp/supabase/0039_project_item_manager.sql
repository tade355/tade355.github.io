-- Bikes and other vehicles are moving out of the dozer-focused Fleet
-- Roster into a "Project Items" tracker under Resource Management, where
-- each one is assigned to a project and the manager responsible for it,
-- rather than being tracked alongside the heavy-equipment fleet.
-- current_project already covers the project side; this adds the manager.

alter table inventory add column if not exists assigned_manager_id text references employees(id);

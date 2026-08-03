-- Adds a Parts/Labor cost split and external-contractor support to
-- Maintenance Log, matching the real maintenance tracking log's cost
-- breakdown. performed_by stays FK'd to employees and nullable — an
-- external contractor (not on staff) goes in the new contractor_name
-- column instead, so a non-staff repair doesn't need a fake employee
-- record. `cost` is kept as-is (now a derived total of parts + labor,
-- computed client-side) so every existing reader of it keeps working.

alter table maintenance_logs add column if not exists parts_cost numeric;
alter table maintenance_logs add column if not exists labor_cost numeric;
alter table maintenance_logs add column if not exists contractor_name text;

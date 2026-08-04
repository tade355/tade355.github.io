-- Adds a start date and total contract area to Projects, needed for the
-- Milestone Tracker report (Days on Project, Project Speed Ha/Day,
-- Remaining Job to Complete Project). Both optional — a project without
-- these set just shows "—" for the fields that need them.

alter table projects add column if not exists start_date date;
alter table projects add column if not exists total_area_ha numeric;

-- Run this once in the SQL Editor. Two fixes found while migrating the
-- rest of the app to Supabase:
--
-- 1. equipment_id was designed as a foreign key into inventory, but the
--    app never treats "equipment" as an ID anywhere — it stores and reads
--    the fleet asset's display name directly (e.g. "Bulldozer - EMG 003").
--    Keeping the FK would mean converting names to IDs on every save and
--    back to names on every read, for no real benefit. Switching to a
--    plain text column matches the app exactly and removes that risk.
--    Safe to run: operations, maintenance_logs, and fueling_vouchers are
--    all still empty on the live project (0 rows each).
--
-- 2. maintenance_logs.type had a check constraint missing 'Breakdown',
--    which the Fleet Management form actually offers as an option —
--    saving a Breakdown entry would have failed.

alter table operations drop column equipment_id;
alter table operations add column equipment text;

alter table maintenance_logs drop column equipment_id;
alter table maintenance_logs add column equipment text;
alter table maintenance_logs drop constraint maintenance_logs_type_check;
alter table maintenance_logs add constraint maintenance_logs_type_check
  check (type in ('Repair', 'Service', 'Inspection', 'Breakdown'));

alter table fueling_vouchers drop column equipment_id;
alter table fueling_vouchers add column equipment text;

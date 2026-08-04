-- Catch-up migration: 0023 and 0027 were never applied to the live
-- database, so six columns the app writes were missing from it.
--
-- The symptom was Daily Operations refusing to save at all: "Could not
-- find the 'closing_diesel' column of 'operations' in the schema cache."
-- The Daily Operations form has posted opening_diesel / diesel_supplied /
-- closing_diesel since 0023, and the Dozer Discrepancy Report (Resource
-- Management -> Diesel Management) reads those same three, so Level 3 of
-- the diesel chain was silently blank as well.
--
-- Written with `if not exists` so it is safe to run whatever state a given
-- database is in — a database that already ran 0023/0027 is unaffected,
-- and this can be re-run without error. Prefer running THIS file over
-- re-running 0023/0027, which use bare `add column` and would fail on a
-- database where the columns are already present.

-- From 0023_operation_diesel_tank_readings.sql — real per-day tank
-- readings on Daily Operations, matching the field's End of Day Report.
alter table operations add column if not exists opening_diesel numeric;
alter table operations add column if not exists diesel_supplied numeric;
alter table operations add column if not exists closing_diesel numeric;

-- From 0027_diesel_consumption_rates.sql — per-dozer consumption specs
-- that drive the Fuel Used auto-calc on Daily Operations.
alter table inventory add column if not exists diesel_rate_first8h numeric;
alter table inventory add column if not exists diesel_rate_after8h numeric;
alter table inventory add column if not exists diesel_rate_trekking numeric;

-- Per-dozer diesel consumption specs, set as basic info when adding/editing
-- a Fleet Asset (Fleet Management -> Fleet Roster). Drive Daily Operations'
-- Fuel Used auto-calc: rate x hours worked, tiered around the first 8
-- hrs/day (most dozers burn less once past that), with Trekking using its
-- own flat rate instead of the tiered pair. Null on assets that haven't
-- had a rate configured yet — the Daily Operations form simply leaves
-- Fuel Used as a manual entry in that case.
alter table inventory add column diesel_rate_first8h numeric;
alter table inventory add column diesel_rate_after8h numeric;
alter table inventory add column diesel_rate_trekking numeric;

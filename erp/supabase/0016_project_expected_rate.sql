-- Adds a per-project productivity target (Ha/day) so weekly actual area
-- cleared can be compared against an expected pace, matching the real
-- weekly productivity tracking used in the field. Optional — projects
-- without a target set just don't show a Weekly Productivity table on
-- Operation Profitability.

alter table projects add column if not exists expected_rate_per_day numeric;

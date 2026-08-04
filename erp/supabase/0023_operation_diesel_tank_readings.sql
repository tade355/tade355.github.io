-- Real per-day diesel tank readings on Daily Operations, matching the
-- field's actual End of the Day Report (Opening Diesel / Diesel Supplied /
-- Closing Diesel), instead of relying only on a hand-estimated fuel_used
-- figure. fuel_used is now auto-computed from these three when they're
-- filled in (opening + supplied - closing), and closing_diesel is what
-- feeds the Diesel Replenishment Request in Fleet Management.
alter table operations add column opening_diesel numeric;
alter table operations add column diesel_supplied numeric;
alter table operations add column closing_diesel numeric;

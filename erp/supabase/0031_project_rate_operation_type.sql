-- Contract rates on most projects aren't one blanket ₦/Ha figure — they're
-- broken down per Operation Type (Felling, Stacking, Root Picking, Bonding,
-- etc.), since a hectare's contract value isn't earned until every
-- operation type contracted for it has been done, each at its own rate.
-- project_rate_history can now optionally carry an Operation Type; a row
-- with none set is a general/fallback rate for the whole project (today's
-- exact behavior, unchanged for every existing entry). See
-- erp/js/rateHistory.js projectRateAsOf() for the lookup/fallback order.

alter table project_rate_history add column if not exists operation_type text check (operation_type in (
  'Felling', 'Stacking', 'Direct Stacking', 'Root Picking', 'Bonding', 'Road', 'Trekking',
  'Tree Felling', 'Direct Clearing', 'Phase 1', 'Phase 2', 'Cross Cutting', 'Corrections', 'Zero Bonding'
));

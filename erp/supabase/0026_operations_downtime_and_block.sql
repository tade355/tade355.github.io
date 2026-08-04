-- Daily Operations: Block/Plot No. and downtime tracking (dozer breakdown,
-- community disturbance, or an operator's own delay/infringement), plus
-- Cross Cutting as a new Operation Type (Phase 1/Phase 2 were already
-- accepted by the existing constraint from 0015_operation_type_rename.sql).
-- Downtime is subtracted from hours_worked client-side (see operations.js
-- recomputeHoursWorked) so it already reduces Operator Allowance pay and
-- Profitability dozer cost — downtime_reason is only an accountability
-- label, not a separate calculation path.

alter table operations add column block_number text;
alter table operations add column downtime_reason text
  check (downtime_reason in ('Dozer Breakdown', 'Community Disturbance', 'Operator Delay / Infringement', 'Other'));
alter table operations add column downtime_hours numeric;
alter table operations add column downtime_minutes numeric;

alter table operations drop constraint if exists operations_operation_type_check;
alter table operations add constraint operations_operation_type_check
  check (operation_type in (
    'Felling', 'Stacking', 'Direct Stacking', 'Root Picking', 'Bonding', 'Road', 'Trekking',
    'Tree Felling', 'Direct Clearing', 'Phase 1', 'Phase 2', 'Cross Cutting', 'Corrections', 'Zero Bonding'
  ));

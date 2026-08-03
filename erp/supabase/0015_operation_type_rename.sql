-- Corrects Daily Operations' operation-type list to match real field
-- terminology (Felling, Direct Stacking, Root Picking, Bonding) instead of
-- the placeholder names this app originally shipped with (Tree Felling,
-- Direct Clearing, Phase 1, Phase 2, Corrections, Zero Bonding). The
-- constraint is widened to accept BOTH old and new values rather than
-- replaced outright — if any real Daily Operations report was already
-- logged under an old name, this keeps it valid instead of breaking on
-- the next edit. The app itself (erp/js/constants.js) only offers the
-- corrected names in the dropdown going forward, and still resolves old
-- names to the correct unit ("Ha") so historical totals and Profitability
-- stay accurate.

alter table operations drop constraint if exists operations_operation_type_check;
alter table operations add constraint operations_operation_type_check
  check (operation_type in (
    'Felling', 'Stacking', 'Direct Stacking', 'Root Picking', 'Bonding', 'Road', 'Trekking',
    'Tree Felling', 'Direct Clearing', 'Phase 1', 'Phase 2', 'Corrections', 'Zero Bonding'
  ));

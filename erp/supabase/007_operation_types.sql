-- Daily Operations reporting now distinguishes between operation types
-- with different units, instead of one "hectares cleared" field for
-- everything: Tree Felling / Stacking / Direct Clearing / Zero Bonding
-- (Ha), Road (KM), Trekking (hrs). Safe to run: operations is still empty
-- on the live project.

alter table operations rename column area_cleared to quantity;

alter table operations add column operation_type text
  check (operation_type in ('Tree Felling', 'Stacking', 'Direct Clearing', 'Zero Bonding', 'Road', 'Trekking'));

alter table operations add column attachments jsonb not null default '[]'::jsonb;

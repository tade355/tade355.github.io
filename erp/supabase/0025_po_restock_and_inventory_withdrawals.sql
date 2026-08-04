-- Two related additions, both closing "not automated yet" gaps flagged
-- while reviewing how connected the app's data really is:
--
-- 1. Purchase Orders can now optionally link to a specific Inventory
--    item. Marking a linked PO "Received" adds its quantity to that
--    item's stock automatically (and reversing back out of Received
--    subtracts it again) — see purchasing.js's applyInventoryStockChange.
--    Unlinked POs (services, one-off spend) behave exactly as before.
--
-- 2. inventory_withdrawals — the same auto-deducting withdrawal log
--    Bulldozer Parts already has, generalized to Tools, Consumables, and
--    Safety Gear (the categories that actually get used up).
--
-- NOTE: this migration references current_employee_tier(), defined in
-- 0024_tier_based_rls.sql — run 0024 before this one.

alter table purchase_orders add column inventory_item text;

create table inventory_withdrawals (
  id          text primary key,
  date        date not null,
  item_name   text not null,
  quantity    numeric not null default 0,
  issued_to   text references employees(id) on delete set null,
  equipment   text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_inventory_withdrawals_updated_at before update on inventory_withdrawals
  for each row execute function set_updated_at();
alter table inventory_withdrawals enable row level security;
create policy inventory_withdrawals_all on inventory_withdrawals for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts', 'Supervisor'))
  with check (current_employee_tier() in ('Admin', 'Accounts', 'Supervisor'));

-- Beneficiary values and business balances belong only in the private database.
alter table public.dozer_owner_settlements
  add column if not exists is_opening_balance boolean not null default false,
  add column if not exists account_name text,
  add column if not exists account_number text,
  add column if not exists bank_name text;

-- Fund Requests get a Cost Head (same categories as Expenses) so
-- Approved/Paid requests can be grouped into the new Income & Expenditure
-- report alongside Expenses entries.
alter table fund_requests add column cost_head text;

-- Manual income/expenditure entries the accountant records directly for
-- cash movements not captured by an Invoice, Expense, or Fund Request
-- (e.g. a loan, an equity injection, or a cash receipt).
create table financial_entries (
  id          text primary key,
  date        date not null,
  type        text not null check (type in ('Income', 'Expenditure')),
  project     text,
  cost_head   text not null,
  amount      numeric not null check (amount >= 0),
  description text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_financial_entries_updated_at before update on financial_entries
  for each row execute function set_updated_at();

alter table financial_entries enable row level security;
create policy financial_entries_anon_all on financial_entries for all to authenticated using (true) with check (true);

-- Loan Portfolio: tracks borrowing from banks, directors, investors, and
-- cooperatives. Two interest models, both settled through one shared
-- repayment ledger (loan_repayments) — see erp/js/loanPayments.js and
-- erp/js/loanInterest.js.
--
-- Fixed loans are a tracker, not an amortization calculator: real loan
-- agreements already state Principal, Rate, and a Total Repayable figure,
-- so those are captured as given (interest_rate/interest_rate_basis are
-- informational) rather than the app deriving compounding/day-count math
-- it could get wrong.
--
-- Turnover-Based / Profit-Based loans (money channeled into operations,
-- repaid as a % of what it helped generate) have no fixed number upfront —
-- interest is computed from the linked project's (or company-wide, if
-- linked_project is null) revenue/profit over the evaluation period, the
-- same figures Profitability already produces. manual_interest_override,
-- when set, replaces the computed figure entirely.
--
-- status is a plain manually-set field (Active/Partially Repaid/Repaid/
-- Restructured/Defaulted/Written Off) rather than computed like invoice
-- status — default/write-off/restructure are judgment calls no formula
-- can make. Amount Repaid/Outstanding (derived from loan_repayments) are
-- always accurate regardless of what status label is chosen.

create table loans (
  id                        text primary key,
  category                  text not null check (category in (
    'Bank Loan', 'Director/Personal Loan', 'Investor Loan', 'Cooperative/Society Loan', 'Other'
  )),
  lender                    text not null,
  date_taken                date not null,
  principal                 numeric not null default 0,
  interest_type             text not null check (interest_type in ('Fixed', 'Turnover-Based', 'Profit-Based')),

  -- Fixed only
  interest_rate             numeric,
  interest_rate_basis       text check (interest_rate_basis in ('Flat', 'Per Annum', 'Per Month')),
  total_repayable           numeric,

  -- Turnover-Based / Profit-Based only
  linked_project            text,
  interest_percentage       numeric,
  evaluation_period_start   date,
  evaluation_period_end     date,
  manual_interest_override  numeric,

  due_date                  date,
  status                    text not null default 'Active' check (status in (
    'Active', 'Partially Repaid', 'Repaid', 'Restructured', 'Defaulted', 'Written Off'
  )),
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index idx_loans_due_date on loans(due_date);
create trigger trg_loans_updated_at before update on loans
  for each row execute function set_updated_at();

create table loan_repayments (
  id         text primary key,
  loan_id    text not null references loans(id) on delete cascade,
  date       date not null,
  amount     numeric not null default 0,
  method     text,
  reference  text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_loan_repayments_loan on loan_repayments(loan_id, date);
create trigger trg_loan_repayments_updated_at before update on loan_repayments
  for each row execute function set_updated_at();

alter table loans enable row level security;
create policy loans_all on loans for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

alter table loan_repayments enable row level security;
create policy loan_repayments_all on loan_repayments for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

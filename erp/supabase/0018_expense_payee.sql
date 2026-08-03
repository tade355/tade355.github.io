-- Adds a recipient/payee field to Expenses — who the money actually went
-- to (a vendor, contractor, or person), which is distinct from the
-- existing paid_by field (how/by whom it was disbursed, e.g. "Cash",
-- "Payroll", "Bank Transfer - GTB"). Matches the real Project Expenditure
-- ledger's payee column. Optional — auto-generated Payroll expenses have
-- no single external payee, so they leave it blank.

alter table expenses add column if not exists payee text;

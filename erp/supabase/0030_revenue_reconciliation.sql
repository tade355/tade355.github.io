-- Provisional (Daily Operations report) vs Verified (invoice) revenue
-- reconciliation, invoice payment tracking, and invoice periods. See
-- erp/js/revenueReconciliation.js, erp/js/invoicePayments.js, and the new
-- Revenue Reconciliation tab in erp/js/views/projects.js.
--
-- operation_type on invoice_items and period_start/period_end on invoices
-- are what let a report row (operations.operation_type, operations.date)
-- be matched automatically against the invoice line that verifies it.
-- Both are nullable: existing invoices/items predate this feature and stay
-- that way forever unless someone edits them — the reconciliation report
-- treats null operation_type as "not classifiable," not an error.

alter table invoice_items add column if not exists operation_type text check (operation_type in (
  'Felling', 'Stacking', 'Direct Stacking', 'Root Picking', 'Bonding', 'Road', 'Trekking',
  'Tree Felling', 'Direct Clearing', 'Phase 1', 'Phase 2', 'Cross Cutting', 'Corrections', 'Zero Bonding'
));

alter table invoices add column if not exists period_start date;
alter table invoices add column if not exists period_end date;

-- Status becomes app-computed (Unpaid / Partially Paid / Paid) from
-- invoice_payments vs the invoice total, instead of a manually-set flag.
alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status in ('Unpaid', 'Partially Paid', 'Paid'));

create table invoice_payments (
  id         text primary key,
  invoice_id text not null references invoices(id) on delete cascade,
  date       date not null,
  amount     numeric not null default 0,
  method     text,
  reference  text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_invoice_payments_invoice on invoice_payments(invoice_id, date);
create trigger trg_invoice_payments_updated_at before update on invoice_payments
  for each row execute function set_updated_at();

alter table invoice_payments enable row level security;
create policy invoice_payments_select on invoice_payments for select to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts', 'Supervisor'));
create policy invoice_payments_write on invoice_payments for all to authenticated
  using (current_employee_tier() in ('Admin', 'Accounts'))
  with check (current_employee_tier() in ('Admin', 'Accounts'));

-- Backfill: every invoice already marked Paid today was hand-set, and no
-- invoice_payments exist yet, so computeInvoiceStatus() would derive every
-- one of them as Unpaid the moment this ships. Seed one payment per
-- currently-Paid invoice, for its full total, dated at the invoice's own
-- date, so status recomputes to the same value it already had.
insert into invoice_payments (id, invoice_id, date, amount, notes)
select next_record_id('IVP'), i.id, i.date,
       coalesce((select sum(qty * price) from invoice_items where invoice_id = i.id), 0),
       'Backfilled: this invoice was already marked Paid when payment tracking shipped'
from invoices i
where i.status = 'Paid';

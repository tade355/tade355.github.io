-- Staff Memos & Notices — printable internal correspondence (memo, notice,
-- warning letter, query letter, etc.) addressed to one employee or to all
-- staff (employee_id null). Kept as its own record so there's a searchable
-- history of what's been issued, mirroring how every other formal document
-- in this app (invoices, fund requests, payslips) is a persisted, editable,
-- reprintable record rather than a one-off generated file.

create table staff_memos (
  id          text primary key,
  date        date not null,
  type        text not null check (type in ('Memo', 'Notice', 'Warning Letter', 'Query Letter', 'Confirmation Letter', 'Other')),
  employee_id text references employees(id) on delete set null, -- null = addressed to all staff
  subject     text not null,
  body        text not null,
  issued_by   text references employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_staff_memos_updated_at before update on staff_memos
  for each row execute function set_updated_at();

alter table staff_memos enable row level security;
create policy staff_memos_anon_all on staff_memos for all to authenticated using (true) with check (true);
